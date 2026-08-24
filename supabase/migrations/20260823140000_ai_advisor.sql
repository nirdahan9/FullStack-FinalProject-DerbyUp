-- ═══════════════════════════════════════════════════════════════════════════
-- The AI advisor.
--
-- Six tables, and the split between them is the whole design:
--
--   Shared and impersonal — advisor_insights, advisor_daily_pick, api_cache.
--   One analysis of a match serves everyone who opens it, so the expensive
--   call happens once and the hundredth reader costs nothing. Nothing in these
--   tables identifies a person, which is what makes sharing them safe.
--
--   Personal — advisor_conversations, advisor_messages, advisor_usage. What
--   someone asked is theirs, and RLS here is the same shape as predictions:
--   your own rows, nobody else's, no exceptions.
--
-- The model itself is never trusted with anything that matters. It cannot
-- write here; every row is inserted by our own code after validation.
--
-- Mirrors docs/03-technical-design.md §9 and docs/06-security.md §7.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Shared analysis cache ─────────────────────────────────────────────────
-- Keyed by the match *and* a hash of everything the analysis was based on, so
-- a changed price produces a new row rather than silently serving advice about
-- odds that no longer exist. That is also why there is no TTL: staleness here
-- is not a function of time, it is a function of whether the inputs moved.
create table public.advisor_insights (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games(id) on delete cascade,
  context_hash varchar(64) not null,
  payload      jsonb not null,
  model        varchar(60) not null,
  created_at   timestamptz not null default now(),
  unique (game_id, context_hash)
);

-- ─── The daily pick ────────────────────────────────────────────────────────
-- One match per competition per day, chosen by cron and reused by both the
-- dashboard and the landing page. Neither of those surfaces may cost a model
-- call at request time: the dashboard is the first screen after sign-in, and
-- the landing page is served to people who have not signed in at all.
create table public.advisor_daily_pick (
  id             uuid primary key default gen_random_uuid(),
  pick_date      date not null,
  competition_id integer not null references public.competitions(id) on delete cascade,
  game_id        uuid not null references public.games(id) on delete cascade,
  payload        jsonb not null,
  created_at     timestamptz not null default now(),
  unique (pick_date, competition_id)
);

-- ─── Conversations ─────────────────────────────────────────────────────────
-- One thread per person per match. A second thread on the same match would be
-- a second context the advisor has to reconcile, and there is no product
-- reason for it.
create table public.advisor_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game_id    uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create table public.advisor_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.advisor_conversations(id) on delete cascade,
  role            varchar(10) not null check (role in ('user', 'assistant')),
  content         text not null,
  -- Set when a guard layer answered instead of the model. Kept because "the
  -- advisor refused" and "the advisor answered" look identical in the
  -- transcript otherwise, and the difference is the one worth auditing.
  blocked         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ─── Quota ─────────────────────────────────────────────────────────────────
-- A row per person per day. The primary key is the pair, which is what lets
-- the consume function upsert atomically.
create table public.advisor_usage (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  usage_date     date not null,
  question_count smallint not null default 0,
  primary key (user_id, usage_date)
);

-- ─── Provider cache ────────────────────────────────────────────────────────
-- API-Football responses. In the lab this was a Map in module scope, which
-- dies with the serverless instance holding it and is therefore empty most of
-- the time in production.
create table public.api_cache (
  cache_key  varchar(200) primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────
-- The lookup on every advisor open: this match, this hash.
-- (The unique constraint above already indexes the pair; this one serves the
-- cleanup query that drops superseded analyses for a match.)
create index idx_advisor_insights_game on public.advisor_insights (game_id, created_at desc);

-- The dashboard reads today's picks for the competitions a user's leagues use.
create index idx_advisor_pick_date on public.advisor_daily_pick (pick_date desc, competition_id);

-- Replaying a thread, oldest first.
create index idx_advisor_messages_thread on public.advisor_messages (conversation_id, created_at);

-- Sweeping expired provider entries.
create index idx_api_cache_fetched on public.api_cache (fetched_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.advisor_insights      enable row level security;
alter table public.advisor_daily_pick    enable row level security;
alter table public.advisor_conversations enable row level security;
alter table public.advisor_messages      enable row level security;
alter table public.advisor_usage         enable row level security;
alter table public.api_cache             enable row level security;

-- Shared analysis carries no user data, so any signed-in user may read it.
-- There is deliberately no INSERT or UPDATE policy on either table: both are
-- written by cron and by the advisor action through the service role, which
-- bypasses RLS. Without a write policy, a user who found the table cannot
-- plant an "analysis" that everyone else would then be served.
create policy "advisor_insights_select" on public.advisor_insights
  for select to authenticated
  using (true);

create policy "advisor_pick_select" on public.advisor_daily_pick
  for select to authenticated
  using (true);

-- api_cache gets no policy at all. RLS is enabled and nothing is granted, so
-- the table is invisible to `anon` and `authenticated` alike; only the service
-- role touches it.

-- ─── Personal tables ───────────────────────────────────────────────────────
-- Same shape as predictions: read and create your own, and nothing else.
-- No UPDATE and no DELETE anywhere below — an advisor transcript that a user
-- can rewrite is not a transcript.
create policy "advisor_conversations_select_own" on public.advisor_conversations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "advisor_conversations_insert_own" on public.advisor_conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Messages are reached through their conversation. The EXISTS is wrapped in a
-- SECURITY DEFINER helper for the same reason is_league_member() is: a plain
-- subquery would be re-filtered by the conversation's own policy on every row.
create or replace function public.owns_advisor_conversation(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.advisor_conversations
    where id = p_conversation_id and user_id = auth.uid()
  );
$$;

revoke all on function public.owns_advisor_conversation(uuid) from public, anon;
grant execute on function public.owns_advisor_conversation(uuid) to authenticated;

create policy "advisor_messages_select_own" on public.advisor_messages
  for select to authenticated
  using (public.owns_advisor_conversation(conversation_id));

create policy "advisor_messages_insert_own" on public.advisor_messages
  for insert to authenticated
  with check (public.owns_advisor_conversation(conversation_id));

-- Usage is readable so the UI can show "N questions left", and writable only
-- through the function below — a user who could UPDATE this row could reset
-- their own quota.
create policy "advisor_usage_select_own" on public.advisor_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Quota
-- ═══════════════════════════════════════════════════════════════════════════

-- Claims one unit of today's allowance and reports what is left, or -1 when
-- the allowance is already spent.
--
-- The whole thing is one INSERT ... ON CONFLICT because two tabs asking at the
-- same moment must not both be told they have the last question. Read-then-
-- write in application code has exactly that race, and the window is wide
-- enough to hit by accident: the advisor is slow, so a person who clicks twice
-- is genuinely concurrent.
--
-- `p_limit` comes from the server, never from the browser.
create or replace function public.advisor_consume_quota(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if p_limit <= 0 then
    return -1;
  end if;

  insert into public.advisor_usage (user_id, usage_date, question_count)
  values (v_user, current_date, 1)
  on conflict (user_id, usage_date) do update
    -- The WHERE is the lock: once the stored count has reached the limit the
    -- UPDATE matches no row, RETURNING yields nothing, and v_count stays null.
    set question_count = public.advisor_usage.question_count + 1
    where public.advisor_usage.question_count < p_limit
  returning question_count into v_count;

  if v_count is null then
    return -1;
  end if;

  return p_limit - v_count;
end;
$$;

revoke all on function public.advisor_consume_quota(integer) from public, anon;
grant execute on function public.advisor_consume_quota(integer) to authenticated;

-- How much is left without spending any of it, for rendering the counter.
create or replace function public.advisor_quota_remaining(p_limit integer)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select greatest(
    0,
    p_limit - coalesce(
      (select question_count
         from public.advisor_usage
        where user_id = auth.uid() and usage_date = current_date),
      0
    )
  );
$$;

revoke all on function public.advisor_quota_remaining(integer) from public, anon;
grant execute on function public.advisor_quota_remaining(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- The landing page's opening
-- ═══════════════════════════════════════════════════════════════════════════

-- One advisor card for an anonymous visitor, in the same shape as
-- landing_fixtures(): no arguments, at most one row, and nothing that
-- identifies anybody. The policies on advisor_daily_pick, games and
-- competitions stay shut to `anon`; this function is the only way through.
--
-- Restricted to today's pick on purpose. A card that quietly falls back to
-- last week's analysis of a match already played is worse than no card.
create or replace function public.landing_advisor_card()
returns table (
  home_team        varchar,
  away_team        varchar,
  home_logo        text,
  away_logo        text,
  kickoff_at       timestamptz,
  competition_name varchar,
  payload          jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    g.home_team,
    g.away_team,
    g.home_logo,
    g.away_logo,
    g.kickoff_at,
    c.name,
    p.payload
  from public.advisor_daily_pick p
  join public.games g        on g.id = p.game_id
  join public.competitions c on c.id = p.competition_id
  where p.pick_date = current_date
    and g.status = 'scheduled'
    and g.kickoff_at > now()
  order by g.kickoff_at asc
  limit 1;
$$;

revoke all on function public.landing_advisor_card() from public;
grant execute on function public.landing_advisor_card() to anon, authenticated;
