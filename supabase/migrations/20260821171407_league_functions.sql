-- ═══════════════════════════════════════════════════════════════════════════
-- League creation, joining, and the computed standings.
--
-- All three are SECURITY DEFINER for the same underlying reason: the RLS
-- policy on `leagues` grants read access to members only, which is correct,
-- but it means neither creating a league nor resolving an invite code can be
-- done through ordinary queries — in both cases the caller is not a member yet.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Invite codes ──────────────────────────────────────────────────────────
-- Eight characters from a 32-symbol alphabet with 0/O/1/I removed, so a code
-- read aloud or copied off a slide cannot be mistyped into a different valid
-- league. That is 32^8 ≈ 1.1e12 combinations.
create or replace function public.generate_invite_code()
returns varchar(8)
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate varchar(8);
  attempt int := 0;
begin
  loop
    candidate := '';
    for _ in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.leagues where invite_code = candidate);

    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'COULD_NOT_GENERATE_CODE';
    end if;
  end loop;

  return candidate;
end;
$$;

revoke all on function public.generate_invite_code() from public, anon, authenticated;

-- ─── Creating a league ─────────────────────────────────────────────────────
-- The league row and the creator's membership are written together. Splitting
-- them would allow a league whose admin is not a member of it — an admin
-- missing from their own standings.
create or replace function public.create_league(
  p_name           varchar,
  p_competition_id integer,
  p_description    text default null
)
-- Output columns are prefixed. With RETURNS TABLE the names become PL/pgSQL
-- variables, so calling them `id` and `invite_code` makes every reference to
-- the league table's own columns ambiguous inside the body.
returns table (league_id uuid, league_code varchar)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_code   varchar(8);
  v_league uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_name is null or length(trim(p_name)) < 3 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  -- Fails loudly rather than creating a league bound to a tournament that
  -- carries no fixtures, which would look like a broken product to its members.
  if not exists (select 1 from public.competitions where id = p_competition_id and is_active) then
    raise exception 'INVALID_COMPETITION' using errcode = 'P0001';
  end if;

  v_code := public.generate_invite_code();

  insert into public.leagues (name, description, creator_id, competition_id, invite_code)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_user, p_competition_id, v_code)
  returning leagues.id into v_league;


  insert into public.league_members (league_id, user_id)
  values (v_league, v_user);

  return query select v_league, v_code;
end;
$$;

revoke all on function public.create_league(varchar, integer, text) from public, anon;
grant execute on function public.create_league(varchar, integer, text) to authenticated;

-- ─── Joining a league ──────────────────────────────────────────────────────
-- Resolving a code has to bypass the read policy, so this function is the only
-- way to do it. It returns the league id and nothing else: a wrong code must
-- not reveal whether a league exists, or anything about it.
create or replace function public.join_league(p_invite_code varchar)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_league public.leagues%rowtype;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  select * into v_league
  from public.leagues
  where invite_code = upper(trim(p_invite_code));

  -- An archived league is reported the same as a missing one, so the code
  -- cannot be used to probe which leagues exist.
  if not found or v_league.status <> 'active' then
    raise exception 'INVALID_CODE' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = v_league.id and user_id = v_user
  ) then
    raise exception 'ALREADY_MEMBER' using errcode = 'P0001';
  end if;

  insert into public.league_members (league_id, user_id)
  values (v_league.id, v_user);

  return v_league.id;
end;
$$;

revoke all on function public.join_league(varchar) from public, anon;
grant execute on function public.join_league(varchar) to authenticated;

-- ─── Standings ─────────────────────────────────────────────────────────────
-- The league table, computed rather than stored. Three filters, each of which
-- changes the result and is covered by a test:
--
--   1. only match_result predictions — the corporate competition stays legible
--      to everyone; Over/Under and BTTS score on the site-wide board instead
--   2. only the league's own competition
--   3. only predictions made at or after that member's joined_at, or a veteran
--      joining a fresh league would arrive with months of points and win on
--      day one
--
-- SECURITY DEFINER because it reads other members' predictions, which the
-- predictions policy rightly forbids. It returns aggregates only: a score and
-- a count, never what anybody predicted.
create or replace function public.league_standings(
  p_league_id uuid,
  p_limit     int default 20,
  p_offset    int default 0
)
returns table (
  user_id       uuid,
  display_name  varchar,
  avatar_url    text,
  points        numeric,
  correct_count bigint,
  joined_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition integer;
begin
  -- Membership is checked explicitly: SECURITY DEFINER has switched RLS off,
  -- so without this any signed-in user could read any league's table.
  if not public.is_league_member(p_league_id) then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  select competition_id into v_competition from public.leagues where id = p_league_id;

  return query
  select
    lm.user_id,
    p.display_name,
    p.avatar_url,
    coalesce(agg.points, 0)::numeric        as points,
    coalesce(agg.correct_count, 0)::bigint  as correct_count,
    lm.joined_at
  from public.league_members lm
  join public.profiles p on p.id = lm.user_id
  left join lateral (
    select
      sum(pr.points_earned)  as points,
      count(*)               as correct_count
    from public.predictions pr
    join public.questions q on q.id = pr.question_id
    join public.games    g on g.id = q.game_id
    where pr.user_id = lm.user_id
      and pr.status = 'correct'
      and q.type = 'match_result'
      and g.competition_id = v_competition
      and pr.predicted_at >= lm.joined_at
  ) agg on true
  where lm.league_id = p_league_id
  order by points desc, correct_count desc, lm.joined_at asc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.league_standings(uuid, int, int) from public, anon;
grant execute on function public.league_standings(uuid, int, int) to authenticated;
