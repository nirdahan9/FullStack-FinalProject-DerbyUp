-- ═══════════════════════════════════════════════════════════════════════════
-- Functions and triggers. Mirrors docs/03-technical-design.md §2.5, §6.3 and
-- docs/06-security.md §3.4–3.5.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Profile creation ──────────────────────────────────────────────────────
-- In a trigger rather than in application code so a verified auth user can
-- never exist without a profile, even if signup fails midway. Users start at
-- zero points: nothing is staked in this product, so there is no opening grant.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base     varchar(30);
  v_username varchar(30);
begin
  -- The email local-part is not unique across providers, so a short slice of
  -- the uuid is appended. Trimmed to fit the column before concatenating.
  v_base := left(split_part(new.email, '@', 1), 24);
  v_username := v_base || '_' || substr(new.id::text, 1, 4);

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    v_username,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── updated_at ────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─── Score tamper protection ───────────────────────────────────────────────
-- profiles has an UPDATE policy so users can edit their own name and avatar,
-- which would otherwise let them write their own score. The score columns are
-- frozen for everyone except the service role used by settlement.
--
-- Defence in depth rather than the only defence: these columns are a cache.
-- League standings are computed from predictions, so forging total_points
-- would not move a user up any league table.
create or replace function public.prevent_score_tampering()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  if new.total_points      is distinct from old.total_points
  or new.total_predictions is distinct from old.total_predictions
  or new.total_correct     is distinct from old.total_correct then
    raise exception 'score columns cannot be modified directly';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_score
  before update on public.profiles
  for each row execute function public.prevent_score_tampering();

-- ─── Cancelling a prediction ───────────────────────────────────────────────
-- Cancellation is a function rather than an UPDATE policy on purpose. A policy
-- broad enough to allow it would also let a user rewrite selected_outcome or
-- points_earned after a match had finished — and in this product the points
-- are the prize. This exposes exactly one state change, under three checks.
--
-- The ten-minute cutoff sits before kickoff because line-ups and injuries
-- surface in the final minutes; cancelling on that information would turn
-- cancellation into a move in the game rather than a correction.
create or replace function public.cancel_prediction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pred    public.predictions%rowtype;
  v_kickoff timestamptz;
begin
  -- FOR UPDATE serialises two concurrent cancels of the same row.
  select * into v_pred from public.predictions where id = p_id for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_pred.user_id <> auth.uid() then
    raise exception 'NOT_OWNER' using errcode = 'P0001';
  end if;
  if v_pred.status <> 'pending' then
    raise exception 'ALREADY_SETTLED' using errcode = 'P0001';
  end if;

  select g.kickoff_at into v_kickoff
  from public.questions q
  join public.games g on g.id = q.game_id
  where q.id = v_pred.question_id;

  if v_kickoff <= now() + interval '10 minutes' then
    raise exception 'CANCEL_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  update public.predictions
  set status = 'cancelled', cancelled_at = now()
  where id = p_id;
end;
$$;

-- Supabase applies default privileges granting EXECUTE to anon and
-- authenticated, so revoking from PUBLIC is not enough — anon must be named.
revoke all on function public.cancel_prediction(uuid) from public, anon;
grant execute on function public.cancel_prediction(uuid) to authenticated;

-- ─── Site-wide leaderboard ─────────────────────────────────────────────────
-- The board spans every organisation, which the profiles RLS policy correctly
-- forbids. Loosening that policy would expose whole rows including username,
-- which is derived from the email. Instead this returns three columns and
-- nothing else: no id, no username, no way back to an identity.
create or replace function public.get_global_leaderboard(p_limit int, p_offset int)
returns table (
  display_name varchar,
  avatar_url   text,
  total_points numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select p.display_name, p.avatar_url, p.total_points
  from public.profiles p
  order by p.total_points desc, p.created_at asc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_global_leaderboard(int, int) from public, anon;
grant execute on function public.get_global_leaderboard(int, int) to authenticated;

-- Trigger functions are never called directly; nobody needs EXECUTE on them,
-- and leaving the default grant would expose them as REST endpoints.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_score_tampering() from public, anon, authenticated;
