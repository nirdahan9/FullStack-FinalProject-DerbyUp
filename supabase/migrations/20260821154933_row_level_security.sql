-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security. Mirrors docs/06-security.md §3.3.
--
-- This is the real authorisation boundary. middleware and the Server Actions
-- check permissions too, but only for the user experience: if a bug there ever
-- skips a check, Postgres still refuses to return the rows.
--
-- Reference tables (competitions, games, questions, daily_puzzles,
-- bridge_players) carry no user data and are readable by any signed-in user;
-- they are written only by cron through the service role, which bypasses RLS.
--
-- Every auth.uid() below is written as (select auth.uid()). Postgres treats the
-- bare call as volatile and re-evaluates it once per row; wrapping it in a
-- scalar subquery lets the planner hoist it into an InitPlan and run it once
-- per statement. On the standings query, which touches a row per member, that
-- is the difference between one call and hundreds.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles          enable row level security;
alter table public.predictions       enable row level security;
alter table public.leagues           enable row level security;
alter table public.league_members    enable row level security;
alter table public.notifications     enable row level security;
alter table public.user_achievements enable row level security;
alter table public.puzzle_attempts   enable row level security;
alter table public.competitions      enable row level security;
alter table public.games             enable row level security;
alter table public.questions         enable row level security;
alter table public.daily_puzzles     enable row level security;
alter table public.bridge_players    enable row level security;

-- ─── Helper ────────────────────────────────────────────────────────────────
-- Membership is asked repeatedly and by policies on league_members itself.
-- SECURITY DEFINER breaks that recursion: the lookup runs as the owner and so
-- is not re-filtered by the very policy that is calling it.
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_league_member(uuid) from public, anon;
grant execute on function public.is_league_member(uuid) to authenticated;

-- Same reasoning for "do we share any league". A plain subquery inside the
-- profiles policy would be re-filtered by league_members' own policy, which is
-- both slower and harder to reason about; SECURITY DEFINER reads the table once.
create or replace function public.shares_league_with(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.league_members mine
    join public.league_members theirs on theirs.league_id = mine.league_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

revoke all on function public.shares_league_with(uuid) from public, anon;
grant execute on function public.shares_league_with(uuid) to authenticated;

-- ─── profiles ──────────────────────────────────────────────────────────────
-- Yourself, plus anyone you share a league with — that is what a standings
-- table needs and nothing more. The site-wide board does not read this table;
-- it goes through get_global_leaderboard, which returns three columns.
create policy "profiles_select_visible" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or public.shares_league_with(id));

-- Name and avatar only; the score columns are frozen by profiles_protect_score.
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ─── predictions ───────────────────────────────────────────────────────────
-- Read and create your own. No UPDATE and no DELETE policy on purpose:
-- settlement runs as the service role, and cancelling goes through
-- cancel_prediction(). Without this, a user could edit selected_outcome after
-- the final whistle or write their own points_earned.
create policy "predictions_select_own" on public.predictions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "predictions_insert_own" on public.predictions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ─── leagues ───────────────────────────────────────────────────────────────
-- Members only. Note this deliberately does NOT let an invite code be resolved
-- to a league: a policy wide enough to allow that would let anyone enumerate
-- every league. Joining therefore goes through a SECURITY DEFINER join_league()
-- function, added with the league feature, which resolves the code and inserts
-- the membership in one step.
create policy "leagues_select_member" on public.leagues
  for select to authenticated
  using (public.is_league_member(id));

-- Inserting is allowed, but note what this does NOT give you: the SELECT policy
-- above requires membership, and the creator is not a member yet at the moment
-- of insert. A plain `insert(...).select()` therefore fails on the RETURNING
-- clause, which PostgREST reports — confusingly — as an INSERT policy violation.
--
-- League creation consequently goes through a SECURITY DEFINER create_league()
-- function, added with the league feature, which writes the league and the
-- creator's membership in one transaction and returns the row. That is the
-- correct shape anyway: a creator without a membership row would be an admin
-- who does not appear in their own standings.
create policy "leagues_insert_own" on public.leagues
  for insert to authenticated
  with check ((select auth.uid()) = creator_id);

-- The creator is the permanent admin — there is no role table and no handover.
create policy "leagues_update_creator" on public.leagues
  for update to authenticated
  using ((select auth.uid()) = creator_id)
  with check ((select auth.uid()) = creator_id);

-- ─── league_members ────────────────────────────────────────────────────────
-- Members of a league see each other. This is the policy that makes a
-- standings table possible while keeping other organisations invisible.
create policy "members_select_shared_league" on public.league_members
  for select to authenticated
  using (public.is_league_member(league_id));

create policy "members_insert_self" on public.league_members
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "members_delete_self" on public.league_members
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ─── notifications ─────────────────────────────────────────────────────────
-- Created by settlement under the service role; users may read and mark read.
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ─── user_achievements ─────────────────────────────────────────────────────
-- Read-only to users; awarded during settlement.
create policy "achievements_select_own" on public.user_achievements
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ─── puzzle_attempts ───────────────────────────────────────────────────────
-- No INSERT policy: the answer is checked on the server and the row is written
-- there. If users could insert, they would set their own points_earned.
create policy "attempts_select_own" on public.puzzle_attempts
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ─── Reference data ────────────────────────────────────────────────────────
-- Readable by signed-in users, written only by cron via the service role.
create policy "competitions_select_all" on public.competitions
  for select to authenticated using (true);

create policy "games_select_all" on public.games
  for select to authenticated using (true);

create policy "questions_select_all" on public.questions
  for select to authenticated using (true);

create policy "players_select_all" on public.bridge_players
  for select to authenticated using (true);

-- Only puzzles already published are visible: valid_answers lives on this row,
-- so exposing a future puzzle would hand out tomorrow's answers.
create policy "puzzles_select_published" on public.daily_puzzles
  for select to authenticated
  using (play_date <= (now() at time zone 'Asia/Jerusalem')::date);
