-- ═══════════════════════════════════════════════════════════════════════════
-- Live scores — the display layer for a match that is currently being played.
--
-- Ported from the DerbyUp app, which runs it as three pieces on a long-lived
-- Node process: backend/src/jobs/syncLiveTournaments.js polls the provider
-- every ~15s, backend/src/services/projectedStandings.js turns the running
-- score into the points each bet is *currently* earning, and an SSE stream
-- pushes the result to the client.
--
-- The one rule that file states about itself is the rule kept here:
--
--     "שכבה תצוגתית בלבד: לעולם לא כותב נקודות."
--     A display layer. It never writes points.
--
-- Nothing in this migration touches predictions.points_earned, and the live
-- sync only ever updates the three columns below. Settlement (20260821200518)
-- is unchanged and remains the only thing that awards a point.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── What the provider tells us about a match in progress ──────────────────
-- `minute` is API-Football's `fixture.status.elapsed`. Nullable and stays null
-- for a fixture that has not kicked off, which is also what the provider sends
-- back: there is no minute 0 to record.
--
-- `live_updated_at` is separate from `updated_at` on purpose. `updated_at`
-- moves for any write, including settlement; this column answers a narrower
-- question the UI actually asks — how stale is the score on screen — and lets
-- a stalled sync be visible rather than silent.
alter table public.games
  add column if not exists minute smallint
    check (minute is null or (minute >= 0 and minute <= 130));

alter table public.games
  add column if not exists live_updated_at timestamptz;

comment on column public.games.minute is
  'Elapsed minutes, from API-Football fixture.status.elapsed. Display only.';
comment on column public.games.live_updated_at is
  'When the live sync last wrote a score to this row. Null until kick-off.';

-- No new index. The guard the schedule runs — "is anything live or about to
-- kick off" — filters on (status, kickoff_at), which idx_games_status_kickoff
-- from 20260821154931 already serves. An index per feature is how a write path
-- gets quietly expensive; this one earns nothing the existing one does not.

-- ─── The rows the live standings layer needs ───────────────────────────────
-- league_standings() sums points_earned, which is null until settlement runs.
-- A match in progress has none, so the live table cannot come from there: it
-- needs the *pending* predictions plus the score as it stands right now.
--
-- Those predictions belong to other members, and predictions_select_own quite
-- rightly forbids reading them — so this is SECURITY DEFINER with its own
-- membership check, exactly like league_standings.
--
-- It returns rows and not a total, and that is the deliberate part. Scoring a
-- prediction is settlePrediction() in lib/domain/settlement.ts: a pure
-- function, covered to 100%, and the single place the product decides what a
-- correct call is worth. Summing here would mean writing that formula a second
-- time in PL/pgSQL — including the exact-score triple and the featured-game
-- bonus — and two copies of a scoring rule drift. The projection is computed
-- in lib/domain/live-projection.ts from the same function settlement uses, so
-- the number on screen during the match is the number credited after it.
--
-- The rows are read in a Server Component and never serialised to the browser;
-- what reaches the client is the per-member total, the same shape
-- league_standings already returns.
create or replace function public.league_live_predictions(p_league_id uuid)
returns table (
  user_id          uuid,
  question_type    varchar,
  selected_outcome varchar,
  odds             numeric,
  current_odds     numeric,
  odds_provisional boolean,
  bonus_pct        smallint,
  exact_score      varchar,
  score_home       smallint,
  score_away       smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition integer;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  select competition_id into v_competition from public.leagues where id = p_league_id;

  return query
  select
    pr.user_id,
    q.type,
    pr.selected_outcome,
    pr.odds,
    -- The price the question carries now, for a prediction placed before the
    -- fixture was priced. Extracting it is a lookup, not a rule: which of the
    -- two applies is settlement's decision and stays in TypeScript.
    (
      select (o->>'odds')::numeric
      from jsonb_array_elements(q.outcomes) o
      where o->>'key' = pr.selected_outcome
    ) as current_odds,
    pr.odds_provisional,
    pr.bonus_pct,
    pr.exact_score,
    g.score_home,
    g.score_away
  from public.league_members lm
  join public.predictions pr on pr.user_id = lm.user_id
  join public.questions    q on q.id = pr.question_id
  join public.games        g on g.id = q.game_id
  where lm.league_id = p_league_id
    and pr.status = 'pending'
    -- The same three filters league_standings applies, and for the same
    -- reasons. If they diverged the live number would not land on the settled
    -- one when the whistle goes, and the table would appear to lose points.
    and q.type = 'match_result'
    and g.competition_id = v_competition
    and pr.predicted_at >= lm.joined_at
    -- Scope. 'live' is obvious; 'finished' with settled_at still null is the
    -- subtle half. Settlement runs on a ten-minute schedule, so a match ends
    -- and stays unsettled for up to ten minutes — and a live layer that
    -- stopped at the whistle would drop every member's points to zero for that
    -- window and then hand them back. The DerbyUp app documents the same rule.
    -- The predictions are still pending here, so nothing is counted twice:
    -- settlement flips them out of 'pending' in the same statement that awards
    -- the points, and this function stops seeing them at that instant.
    and (g.status = 'live' or (g.status = 'finished' and g.settled_at is null))
    and g.score_home is not null
    and g.score_away is not null;
end;
$$;

revoke all on function public.league_live_predictions(uuid) from public, anon;
grant execute on function public.league_live_predictions(uuid) to authenticated;

comment on function public.league_live_predictions(uuid) is
  'Pending match_result predictions of a league''s members on fixtures that are '
  'in progress or finished but not yet settled, with the running score. Scored '
  'by lib/domain/live-projection.ts. Display only — awards nothing.';
