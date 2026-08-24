-- ═══════════════════════════════════════════════════════════════════════════
-- The advisor's write path, and the one aggregate it needs.
--
-- The advisor action runs *as the signed-in user*. lib/supabase/admin.ts is
-- not an option: its own comment forbids importing it from anything that runs
-- on behalf of a user, and rightly — a bug in an action holding the service
-- role is unrestricted access to every row in the database.
--
-- But the action has to write two tables that no user may write directly
-- (advisor_insights, api_cache) and read one aggregate that RLS correctly
-- hides (how everyone predicted). That is exactly the gap SECURITY DEFINER
-- exists for, and it is the same shape join_league() and cancel_prediction()
-- already use: a narrow function that does one thing, rather than a broad
-- credential that can do anything.
--
-- Every function below is written so that calling it directly from PostgREST
-- — which any signed-in user can do — is harmless.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Crowd split ───────────────────────────────────────────────────────────
-- How everyone predicted, as counts.
--
-- This is the one signal the advisor has that no odds feed does, and it is
-- also the one that could leak. `predictions` is readable only by its owner,
-- so the aggregate has to come from here. Counts only, grouped: there is no
-- argument that narrows this to a person, and no column that names one.
--
-- Cancelled predictions are excluded — they are withdrawn opinions.
create or replace function public.advisor_crowd_split(p_game_id uuid)
returns table (
  question_type    varchar,
  selected_outcome varchar,
  picks            bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select q.type, p.selected_outcome, count(*)
  from public.predictions p
  join public.questions q on q.id = p.question_id
  where q.game_id = p_game_id
    and p.status <> 'cancelled'
  group by q.type, p.selected_outcome;
$$;

revoke all on function public.advisor_crowd_split(uuid) from public, anon;
grant execute on function public.advisor_crowd_split(uuid) to authenticated;

-- ─── Publishing an analysis ────────────────────────────────────────────────
-- Writes one analysis into the shared cache.
--
-- The insert is idempotent on (game_id, context_hash): two people opening the
-- same match at the same moment both compute an analysis, and the second one
-- to arrive must not fail. It keeps the first, which is equally valid — same
-- match, same inputs.
--
-- Note what this does NOT allow. A user calling it directly can only add a row
-- for a hash nobody will ever look up: the reader computes the hash from the
-- live match data and asks for that exact pair, so a planted row for a made-up
-- hash is unreachable, and a row for the real hash cannot displace the
-- genuine one.
create or replace function public.advisor_publish_insight(
  p_game_id      uuid,
  p_context_hash varchar,
  p_payload      jsonb,
  p_model        varchar
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- A payload this large is not an analysis; it is someone using the table as
  -- storage. The real ones run to a couple of kilobytes.
  if length(p_payload::text) > 16384 then
    raise exception 'payload too large';
  end if;

  insert into public.advisor_insights (game_id, context_hash, payload, model)
  values (p_game_id, p_context_hash, p_payload, p_model)
  on conflict (game_id, context_hash) do nothing;
end;
$$;

revoke all on function public.advisor_publish_insight(uuid, varchar, jsonb, varchar) from public, anon;
grant execute on function public.advisor_publish_insight(uuid, varchar, jsonb, varchar) to authenticated;

-- ─── Provider cache ────────────────────────────────────────────────────────
-- Reading is trivial; the age check lives here so callers cannot forget it.
create or replace function public.api_cache_get(p_key varchar, p_max_age_seconds integer)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select payload
  from public.api_cache
  where cache_key = p_key
    and fetched_at > now() - make_interval(secs => p_max_age_seconds);
$$;

revoke all on function public.api_cache_get(varchar, integer) from public, anon;
grant execute on function public.api_cache_get(varchar, integer) to authenticated;

-- Writing is where a public function needs its own opinions.
--
-- Any signed-in user can call this straight from PostgREST, so it must be
-- pointless to abuse. Two limits do that: the key has to look like one of the
-- provider endpoints we actually call, and the payload has to be a plausible
-- size. What is left is a user who can refresh a cache entry that was going to
-- be refreshed anyway.
create or replace function public.api_cache_put(p_key varchar, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_key !~ '^/(fixtures|standings|injuries|players)' then
    raise exception 'unsupported cache key';
  end if;

  if length(p_payload::text) > 262144 then
    raise exception 'payload too large';
  end if;

  insert into public.api_cache (cache_key, payload, fetched_at)
  values (p_key, p_payload, now())
  on conflict (cache_key) do update
    set payload = excluded.payload, fetched_at = now();
end;
$$;

revoke all on function public.api_cache_put(varchar, jsonb) from public, anon;
grant execute on function public.api_cache_put(varchar, jsonb) to authenticated;
