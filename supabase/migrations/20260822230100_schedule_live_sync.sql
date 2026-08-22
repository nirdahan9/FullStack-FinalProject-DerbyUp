-- ═══════════════════════════════════════════════════════════════════════════
-- Scheduled live-score sync.
--
-- Same reasoning as 20260821200518: Vercel's Hobby plan allows one cron run a
-- day, so the schedule lives in the database. Settlement runs every ten
-- minutes; a running score has to be quicker than that or the feature has no
-- point, so this one runs every minute.
--
-- Every minute is not every minute of work. The job carries its own guard:
-- net.http_post fires only when something is actually in progress or about to
-- kick off. On a Tuesday morning the whole run is one index probe against
-- idx_games_status_kickoff that returns nothing — no HTTP request, no API
-- call, no function invocation.
--
-- That guard is a change from the DerbyUp app, which makes the same check in
-- backend/src/jobs/syncLiveTournaments.js — that is, in Node, after the
-- process has already been woken and the request already paid for. It can
-- afford to: it is a long-running server that is up regardless. Here the call
-- is the expensive part, so the check belongs in front of it.
--
-- pg_cron's finest granularity is one minute, so a goal appears within ~60s
-- rather than the app's ~15s. That is the one thing this port gives up, and it
-- buys not running a server.
--
-- Secrets come from Vault by name, inserted by scripts/schedule-settlement.mjs
-- and shared with the settlement job. Nothing secret is committed here.
-- ═══════════════════════════════════════════════════════════════════════════

select cron.unschedule('sync-live-scores')
where exists (select 1 from cron.job where jobname = 'sync-live-scores');

select cron.schedule(
  'sync-live-scores',
  '* * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'derbyup_site_url') || '/api/cron/sync-live',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'derbyup_cron_secret')
    ),
    timeout_milliseconds := 30000
  )
  -- Two EXISTS rather than one OR across the predicate, so each half is a
  -- plain index lookup on (status, kickoff_at) and neither can degrade into a
  -- scan as the games table grows past its current 2,024 rows.
  where exists (
          select 1 from public.games where status = 'live'
        )
     or exists (
          -- The kick-off window. Without it nothing would ever reach 'live':
          -- the row sits at 'scheduled' until a sync moves it, and only this
          -- job does that between the daily fixture syncs. Five minutes before
          -- covers an early start; four hours after covers a match that ran
          -- long, and bounds the window so a postponed fixture cannot keep the
          -- job awake for the rest of the season.
          select 1 from public.games
           where status = 'scheduled'
             and kickoff_at >  now() - interval '4 hours'
             and kickoff_at <= now() + interval '5 minutes'
        );
  $job$
);
