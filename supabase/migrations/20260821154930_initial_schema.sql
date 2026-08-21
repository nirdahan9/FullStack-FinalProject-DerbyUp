-- ═══════════════════════════════════════════════════════════════════════════
-- DerbyUp — initial schema (12 tables)
-- Mirrors docs/03-technical-design.md §2.1.
--
-- Scoring model, which explains most of what is absent here: a user predicts,
-- and a correct prediction awards the odds as points. Nothing is staked, so
-- there is no balance, no stake column and no ledger table — points only ever
-- accrue, and every accrual is recorded by the table that caused it.
-- ═══════════════════════════════════════════════════════════════════════════

-- Trigram matching backs the player autocomplete in the daily challenge.
-- Installed into the dedicated `extensions` schema rather than `public`, so
-- extension objects do not sit in the namespace the API exposes.
create extension if not exists pg_trgm with schema extensions;

-- ─── 1. profiles ───────────────────────────────────────────────────────────
-- One row per auth user, created by a trigger (see the functions migration).
-- total_* are caches maintained during settlement; league standings are
-- computed from predictions and never read these.
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  username          varchar(30) unique not null,
  display_name      varchar(60),
  avatar_url        text,
  total_points      numeric(10,2) not null default 0,
  total_predictions integer not null default 0,
  total_correct     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── 2. competitions ───────────────────────────────────────────────────────
-- id is the API-Football league id, so no translation table is needed.
create table public.competitions (
  id        integer primary key,
  name      varchar(80) not null,
  country   varchar(60) not null,
  logo_url  text,
  season    integer not null,
  is_active boolean not null default true
);

-- ─── 3. games ──────────────────────────────────────────────────────────────
create table public.games (
  id             uuid primary key default gen_random_uuid(),
  fixture_id     integer unique not null,
  competition_id integer not null references public.competitions(id),
  home_team      varchar(80) not null,
  away_team      varchar(80) not null,
  home_logo      text,
  away_logo      text,
  kickoff_at     timestamptz not null,
  status         varchar(20) not null default 'scheduled'
                 check (status in ('scheduled','live','finished','postponed','cancelled')),
  score_home     smallint,
  score_away     smallint,
  settled_at     timestamptz,
  updated_at     timestamptz not null default now()
);

-- ─── 4. questions ──────────────────────────────────────────────────────────
-- Three per game. outcomes is [{key,label,odds}]; the odds a user sees here
-- are copied onto their prediction so later movement cannot change a score.
create table public.questions (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references public.games(id) on delete cascade,
  type            varchar(20) not null
                  check (type in ('match_result','over_under_2_5','btts')),
  outcomes        jsonb not null,
  correct_outcome varchar(20),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (game_id, type)
);

-- ─── 5. predictions ────────────────────────────────────────────────────────
-- Global, not per league: one prediction per question, and every league the
-- user belongs to reads it through its own filters.
create table public.predictions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  question_id      uuid not null references public.questions(id) on delete cascade,
  selected_outcome varchar(20) not null,
  odds             numeric(6,2) not null check (odds >= 1),
  bonus_pct        smallint not null default 0 check (bonus_pct between 0 and 100),
  points_earned    numeric(10,2),
  status           varchar(16) not null default 'pending'
                   check (status in ('pending','correct','incorrect','void','cancelled')),
  predicted_at     timestamptz not null default now(),
  settled_at       timestamptz,
  cancelled_at     timestamptz,
  unique (user_id, question_id)
);

-- ─── 6. leagues ────────────────────────────────────────────────────────────
-- Bound to exactly one competition: members predict that tournament, and the
-- table counts only it. prizes is [{place,prize}] handed out by the org itself.
create table public.leagues (
  id                 uuid primary key default gen_random_uuid(),
  name               varchar(60) not null,
  description        text,
  creator_id         uuid not null references public.profiles(id) on delete cascade,
  competition_id     integer not null references public.competitions(id),
  invite_code        varchar(8) unique not null,
  prizes             jsonb,
  prize_note         text,
  featured_game_id   uuid references public.games(id) on delete set null,
  featured_bonus_pct smallint not null default 0
                     check (featured_bonus_pct between 0 and 100),
  status             varchar(16) not null default 'active'
                     check (status in ('active','archived')),
  created_at         timestamptz not null default now()
);

-- ─── 7. league_members ─────────────────────────────────────────────────────
-- Membership only. There is deliberately no points column: standings are
-- computed, so a stored score can never drift from the predictions.
-- joined_at is part of the scoring rule, not just metadata.
create table public.league_members (
  id        uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

-- ─── 8. notifications ──────────────────────────────────────────────────────
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       varchar(24) not null
             check (type in ('prediction_settled','league_joined','achievement','puzzle_available')),
  title      varchar(120) not null,
  body       text,
  link_url   text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ─── 9. user_achievements ──────────────────────────────────────────────────
-- Definitions live in lib/domain/achievements.ts; only what was earned is
-- stored, so adding an achievement needs no migration.
create table public.user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  achievement_key varchar(40) not null,
  earned_at       timestamptz not null default now(),
  unique (user_id, achievement_key)
);

-- ─── 10. daily_puzzles ─────────────────────────────────────────────────────
-- Football Bridge: two clubs, name a player who appeared for both.
-- valid_answers holds normalised names, built offline from the Transfermarkt
-- dataset so publishing a puzzle needs no external call.
create table public.daily_puzzles (
  id            uuid primary key default gen_random_uuid(),
  play_date     date unique not null,
  club_a        varchar(80) not null,
  club_b        varchar(80) not null,
  valid_answers jsonb not null,
  created_at    timestamptz not null default now()
);

-- ─── 11. puzzle_attempts ───────────────────────────────────────────────────
-- Up to three tries, worth 5/3/1 points. These count towards the site-wide
-- leaderboard only, never towards a league table.
create table public.puzzle_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  puzzle_id      uuid not null references public.daily_puzzles(id) on delete cascade,
  answer         varchar(80) not null,
  is_correct     boolean not null,
  attempt_number smallint not null check (attempt_number between 1 and 3),
  points_earned  numeric(10,2) not null default 0,
  created_at     timestamptz not null default now(),
  unique (user_id, puzzle_id, attempt_number)
);

-- ─── 12. bridge_players ────────────────────────────────────────────────────
create table public.bridge_players (
  id              uuid primary key default gen_random_uuid(),
  name            varchar(80) not null,
  normalized_name varchar(80) not null unique
);

-- ─── Role grants ───────────────────────────────────────────────────────────
-- Supabase normally maintains these on the public schema, but they are owned by
-- the schema itself: recreating it drops them, and every role then loses table
-- access regardless of RLS. Declaring them here makes the migration set able to
-- rebuild the database from nothing — which the integration tests rely on.
--
-- The broad table grants are the intended Supabase model: PostgREST reaches
-- tables through these roles, and RLS is what narrows access per row. Function
-- privileges are handled separately, and deliberately tightly, in the functions
-- migration.
grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on all tables    in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
