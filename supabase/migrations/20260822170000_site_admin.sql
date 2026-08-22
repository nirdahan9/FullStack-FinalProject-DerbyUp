-- ═══════════════════════════════════════════════════════════════════════════
-- Site administration — the operator's view of the whole product.
--
-- League admin (20260822090000) is a *tenant* role: the creator of one private
-- league, acting inside it. This is the other kind — the people who run the
-- site and need to see every user, every fixture and every league at once.
--
-- The data an operator needs is exactly the data RLS is written to hide:
-- profiles are visible only to yourself and to people you share a private
-- league with, predictions only to their owner. Two ways to get past that:
--
--   1. read with the service role from the admin pages, or
--   2. expose named SECURITY DEFINER functions that check the role themselves.
--
-- (2) is what this file does. The service-role key bypasses RLS on everything
-- and docs/06-security.md §9 commits to it being imported in exactly one file,
-- reachable only from cron. A function, by contrast, states its own contract:
-- these columns, for a caller who passes public.is_site_admin(), and nothing
-- else. If the gate in the layout is ever wrong, Postgres still says no.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── The role ──────────────────────────────────────────────────────────────
-- A column rather than a table: there is one flag, it belongs to the profile,
-- and a join table for a boolean would earn nothing. The partial index keeps
-- "who are the admins" a handful of rows rather than a scan of every profile.
alter table public.profiles
  add column if not exists is_site_admin boolean not null default false;

create index if not exists idx_profiles_site_admin
  on public.profiles (is_site_admin) where is_site_admin;

-- ─── Escalation guard ──────────────────────────────────────────────────────
-- profiles_update_own lets a user write their own row so they can change their
-- name and avatar. Without the clause added here, that same policy would let
-- any user set is_site_admin = true on themselves and take over the site — the
-- column is on the row they are allowed to update.
--
-- So the flag is frozen exactly like the score columns are, and the one
-- function permitted to move it (admin_set_site_admin) unlocks it for the
-- duration of its own transaction through a local GUC.
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

  if new.is_site_admin is distinct from old.is_site_admin
     and coalesce(current_setting('app.grant_site_admin', true), 'off') <> 'on' then
    raise exception 'site admin cannot be granted directly';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_score_tampering() from public, anon, authenticated;

-- ─── The check ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER for the same reason is_league_member() is: the profiles
-- policy would otherwise re-filter the lookup that the policies themselves
-- depend on. STABLE so it is evaluated once per statement, not once per row.
create or replace function public.is_site_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.is_site_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reads
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Overview ──────────────────────────────────────────────────────────────
-- One row of counters for the landing screen. Written as scalar subqueries
-- rather than one grouped query on purpose: they hit different tables, each
-- uses its own index, and the shape stays readable as counters are added.
--
-- "Today" is Asia/Jerusalem, matching the daily puzzle: a signup at 01:00
-- local time belongs to the day the operator is looking at, not to yesterday
-- in UTC.
create or replace function public.admin_overview()
returns table (
  users_total           bigint,
  users_new_today       bigint,
  users_new_30d         bigint,
  predictions_total     bigint,
  predictions_pending   bigint,
  predictions_correct   bigint,
  predictions_incorrect bigint,
  points_awarded        numeric,
  leagues_total         bigint,
  leagues_private       bigint,
  leagues_archived      bigint,
  members_private       bigint,
  games_total           bigint,
  games_live            bigint,
  games_upcoming        bigint,
  games_awaiting        bigint,
  puzzle_attempts_today bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles pr
      where (pr.created_at at time zone 'Asia/Jerusalem')::date = v_today),
    (select count(*) from public.profiles pr
      where pr.created_at > now() - interval '30 days'),
    (select count(*) from public.predictions),
    (select count(*) from public.predictions pr where pr.status = 'pending'),
    (select count(*) from public.predictions pr where pr.status = 'correct'),
    (select count(*) from public.predictions pr where pr.status = 'incorrect'),
    (select coalesce(sum(pr.points_earned), 0) from public.predictions pr
      where pr.status = 'correct'),
    (select count(*) from public.leagues),
    (select count(*) from public.leagues l where not l.is_public),
    (select count(*) from public.leagues l where l.status = 'archived'),
    -- Public-league membership is automatic and would only count the user
    -- base twice; the number worth watching is how many people an
    -- organisation actually brought in.
    (select count(*) from public.league_members m
       join public.leagues l on l.id = m.league_id
      where not l.is_public),
    (select count(*) from public.games),
    (select count(*) from public.games g where g.status = 'live'),
    (select count(*) from public.games g
      where g.status = 'scheduled' and g.kickoff_at > now()),
    -- The operational number: kicked off, still unsettled. A rising figure
    -- here means the provider or the scheduled job has stopped.
    (select count(*) from public.games g
      where g.settled_at is null
        and g.kickoff_at < now()
        and g.status <> 'cancelled'),
    (select count(*) from public.puzzle_attempts a
       join public.daily_puzzles d on d.id = a.puzzle_id
      where d.play_date = v_today);
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- ─── Users ─────────────────────────────────────────────────────────────────
-- The email comes from auth.users, which no policy exposes and no other
-- function returns. It is here because it is the identifier an operator is
-- given when a user writes in for help — the username is derived from it and
-- the display name is not unique.
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id                 uuid,
  username           varchar,
  display_name       varchar,
  email              varchar,
  avatar_url         text,
  total_points       numeric,
  total_predictions  integer,
  total_correct      integer,
  leagues_count      bigint,
  last_prediction_at timestamptz,
  is_site_admin      boolean,
  created_at         timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    p.username,
    p.display_name,
    u.email,
    p.avatar_url,
    p.total_points,
    p.total_predictions,
    p.total_correct,
    (select count(*) from public.league_members m
       join public.leagues l on l.id = m.league_id
      where m.user_id = p.id and not l.is_public),
    (select max(pr.predicted_at) from public.predictions pr where pr.user_id = p.id),
    p.is_site_admin,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p_search is null
     or btrim(p_search) = ''
     or p.username ilike '%' || btrim(p_search) || '%'
     or coalesce(p.display_name, '') ilike '%' || btrim(p_search) || '%'
     or u.email ilike '%' || btrim(p_search) || '%'
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.admin_list_users(text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, int, int) to authenticated;

-- ─── One user ──────────────────────────────────────────────────────────────
-- The same row admin_list_users returns, for a single id. A separate function
-- rather than another parameter on the list, so the list keeps one meaning and
-- one signature — and so the detail page cannot accidentally page through
-- everybody to find one person.
create or replace function public.admin_user_detail(p_user_id uuid)
returns table (
  id                 uuid,
  username           varchar,
  display_name       varchar,
  email              varchar,
  avatar_url         text,
  total_points       numeric,
  total_predictions  integer,
  total_correct      integer,
  leagues_count      bigint,
  last_prediction_at timestamptz,
  is_site_admin      boolean,
  created_at         timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    p.username,
    p.display_name,
    u.email,
    p.avatar_url,
    p.total_points,
    p.total_predictions,
    p.total_correct,
    (select count(*) from public.league_members m
       join public.leagues l on l.id = m.league_id
      where m.user_id = p.id and not l.is_public),
    (select max(pr.predicted_at) from public.predictions pr where pr.user_id = p.id),
    p.is_site_admin,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id;
end;
$$;

revoke all on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;

-- ─── One user's predictions ────────────────────────────────────────────────
-- The support question is almost always "why did I not get the points" — so
-- the row shows what was picked, at what odds, and what it paid.
create or replace function public.admin_user_predictions(
  p_user_id uuid,
  p_limit   int default 50
)
returns table (
  id               uuid,
  game_id          uuid,
  home_team        varchar,
  away_team        varchar,
  kickoff_at       timestamptz,
  question_type    varchar,
  selected_outcome varchar,
  correct_outcome  varchar,
  odds             numeric,
  bonus_pct        smallint,
  exact_score      varchar,
  status           varchar,
  points_earned    numeric,
  predicted_at     timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  return query
  select
    pr.id,
    g.id,
    g.home_team,
    g.away_team,
    g.kickoff_at,
    q.type,
    pr.selected_outcome,
    q.correct_outcome,
    pr.odds,
    pr.bonus_pct,
    pr.exact_score,
    pr.status,
    pr.points_earned,
    pr.predicted_at
  from public.predictions pr
  join public.questions q on q.id = pr.question_id
  join public.games     g on g.id = q.game_id
  where pr.user_id = p_user_id
  order by pr.predicted_at desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke all on function public.admin_user_predictions(uuid, int) from public, anon;
grant execute on function public.admin_user_predictions(uuid, int) to authenticated;

-- ─── One user's leagues ────────────────────────────────────────────────────
create or replace function public.admin_user_leagues(p_user_id uuid)
returns table (
  id         uuid,
  name       varchar,
  is_public  boolean,
  status     varchar,
  is_creator boolean,
  joined_at  timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  return query
  select
    l.id,
    l.name,
    l.is_public,
    l.status,
    (l.creator_id = p_user_id),
    m.joined_at
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  where m.user_id = p_user_id
  order by l.is_public asc, m.joined_at desc;
end;
$$;

revoke all on function public.admin_user_leagues(uuid) from public, anon;
grant execute on function public.admin_user_leagues(uuid) to authenticated;

-- ─── Games ─────────────────────────────────────────────────────────────────
-- p_status takes the five stored statuses, plus two views that are questions
-- about time rather than columns:
--   'upcoming'  — scheduled and still ahead of us
--   'unsettled' — kicked off, no settlement yet. The queue to act on.
create or replace function public.admin_list_games(
  p_search      text default null,
  p_status      text default 'all',
  p_competition int  default null,
  p_limit       int  default 50,
  p_offset      int  default 0
)
returns table (
  id               uuid,
  fixture_id       integer,
  competition_id   integer,
  competition_name varchar,
  home_team        varchar,
  away_team        varchar,
  kickoff_at       timestamptz,
  status           varchar,
  score_home       smallint,
  score_away       smallint,
  settled_at       timestamptz,
  question_count   bigint,
  prediction_count bigint,
  player_count     bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  return query
  select
    g.id,
    g.fixture_id,
    g.competition_id,
    c.name,
    g.home_team,
    g.away_team,
    g.kickoff_at,
    g.status,
    g.score_home,
    g.score_away,
    g.settled_at,
    (select count(*) from public.questions q where q.game_id = g.id),
    (select count(*) from public.predictions pr
       join public.questions q on q.id = pr.question_id
      where q.game_id = g.id and pr.status <> 'cancelled'),
    (select count(distinct pr.user_id) from public.predictions pr
       join public.questions q on q.id = pr.question_id
      where q.game_id = g.id and pr.status <> 'cancelled')
  from public.games g
  join public.competitions c on c.id = g.competition_id
  where (p_competition is null or g.competition_id = p_competition)
    and (
      p_search is null or btrim(p_search) = ''
      or g.home_team ilike '%' || btrim(p_search) || '%'
      or g.away_team ilike '%' || btrim(p_search) || '%'
    )
    and (
      coalesce(p_status, 'all') = 'all'
      or (p_status = 'upcoming'  and g.status = 'scheduled' and g.kickoff_at > now())
      or (p_status = 'unsettled' and g.settled_at is null and g.kickoff_at < now()
                                 and g.status <> 'cancelled')
      or g.status = p_status
    )
  -- Fixtures still to come read forwards, everything else backwards, so the
  -- most relevant row is first under either filter.
  order by
    case when g.kickoff_at > now() then 0 else 1 end,
    case when g.kickoff_at > now() then g.kickoff_at end asc nulls last,
    case when g.kickoff_at <= now() then g.kickoff_at end desc nulls last
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.admin_list_games(text, text, int, int, int) from public, anon;
grant execute on function public.admin_list_games(text, text, int, int, int) to authenticated;

-- ─── Leagues ───────────────────────────────────────────────────────────────
create or replace function public.admin_list_leagues(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id               uuid,
  name             varchar,
  is_public        boolean,
  status           varchar,
  invite_code      varchar,
  competition_name varchar,
  creator_id       uuid,
  creator_name     varchar,
  member_count     bigint,
  created_at       timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  return query
  select
    l.id,
    l.name,
    l.is_public,
    l.status,
    l.invite_code,
    c.name,
    l.creator_id,
    p.display_name,
    (select count(*) from public.league_members m where m.league_id = l.id),
    l.created_at
  from public.leagues l
  join public.competitions c on c.id = l.competition_id
  left join public.profiles p on p.id = l.creator_id
  where p_search is null
     or btrim(p_search) = ''
     or l.name ilike '%' || btrim(p_search) || '%'
     or coalesce(p.display_name, '') ilike '%' || btrim(p_search) || '%'
  order by l.is_public asc, l.created_at desc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.admin_list_leagues(text, int, int) from public, anon;
grant execute on function public.admin_list_leagues(text, int, int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Writes
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Settling a fixture site-wide ──────────────────────────────────────────
-- settle_game_manually() is scoped to one league's competition, which is right
-- for a league admin and useless for an operator: the fixture the provider got
-- wrong affects every league that counts it. Same checks, same handover to the
-- scheduled job — only the ownership test differs.
create or replace function public.admin_settle_game(
  p_game_id    uuid,
  p_score_home smallint,
  p_score_away smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  select * into v_game from public.games where id = p_game_id;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_game.settled_at is not null then
    raise exception 'ALREADY_SETTLED' using errcode = 'P0001';
  end if;
  if v_game.kickoff_at > now() then
    raise exception 'GAME_NOT_STARTED' using errcode = 'P0001';
  end if;
  if p_score_home < 0 or p_score_away < 0 or p_score_home > 99 or p_score_away > 99 then
    raise exception 'INVALID_SCORE' using errcode = 'P0001';
  end if;

  -- settled_at is deliberately left null: the score is recorded and the
  -- scheduled job settles it with the same code every other fixture goes
  -- through, so there is no second implementation of scoring to drift.
  update public.games
  set status     = 'finished',
      score_home = p_score_home,
      score_away = p_score_away,
      updated_at = now()
  where id = p_game_id;
end;
$$;

revoke all on function public.admin_settle_game(uuid, smallint, smallint) from public, anon;
grant execute on function public.admin_settle_game(uuid, smallint, smallint) to authenticated;

-- ─── Granting the role ─────────────────────────────────────────────────────
-- Only an admin makes an admin, and never themselves: the self-check is what
-- stops one compromised session from quietly removing every other operator, and
-- it means the first admin has to come from the seed below or from SQL.
create or replace function public.admin_set_site_admin(
  p_user_id uuid,
  p_value   boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Unlocks the column for this transaction only; prevent_score_tampering
  -- refuses the write otherwise. `true` is the is_local flag, so it is undone
  -- at commit and cannot leak into the next statement on this connection.
  perform set_config('app.grant_site_admin', 'on', true);
  update public.profiles set is_site_admin = p_value where id = p_user_id;
  perform set_config('app.grant_site_admin', 'off', true);
end;
$$;

revoke all on function public.admin_set_site_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_site_admin(uuid, boolean) to authenticated;

-- ─── Deleting a user ───────────────────────────────────────────────────────
-- The row goes from auth.users, not from profiles: deleting the profile alone
-- would leave an account that can still sign in and whose profile trigger will
-- never fire again. Everything the user owns is reachable by cascade from
-- there — predictions, memberships, achievements, notifications.
--
-- Irreversible, so two things it refuses: yourself, and another admin. Both are
-- accident guards rather than security — an operator who wants either can go to
-- the database.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_DELETE_SELF' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and is_site_admin) then
    raise exception 'CANNOT_DELETE_ADMIN' using errcode = 'P0001';
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ─── The first admin ───────────────────────────────────────────────────────
-- Seeded by email so a fresh database comes up with somebody able to sign in
-- and grant the rest. No-op if that account does not exist yet, in which case
-- the flag is set once by hand:
--
--   select set_config('app.grant_site_admin', 'on', false);
--   update public.profiles set is_site_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
do $$
begin
  perform set_config('app.grant_site_admin', 'on', true);

  update public.profiles p
  set is_site_admin = true
  from auth.users u
  where u.id = p.id
    and lower(u.email) = 'nir.dahan2001@gmail.com';

  perform set_config('app.grant_site_admin', 'off', true);
end;
$$;
