-- ═══════════════════════════════════════════════════════════════════════════
-- Scheduled settlement, run by the database itself.
--
-- The DerbyUp backend settles every five minutes (settleBets in
-- backend/src/jobs/cronScheduler.js), which it can do because it is a
-- long-running Node process on Railway with node-cron. This project deploys to
-- Vercel, whose Hobby plan allows one cron run a day — and daily is not good
-- enough: a match finishing on Saturday afternoon would leave its predictions
-- pending and every league table stale until the next morning.
--
-- pg_cron solves it without adding a service. The schedule lives in the same
-- database as the data, needs no third-party account, and supports any
-- interval. Ten minutes costs one API request per run — the pending fixtures
-- are fetched in a single batch — so about 144 a day against a 75,000 quota.
--
-- The Vercel daily cron stays as a fallback. Settlement is idempotent: a
-- fixture with settled_at already set is not selected again, so both firing is
-- harmless.
--
-- The bearer token is kept in Vault rather than inline in the job command,
-- which is readable from cron.job. Vault stores it encrypted and the job reads
-- it by name at run time. The values are inserted by
-- scripts/schedule-settlement.mjs, which reads them from .env.local, so no
-- secret is committed here.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Replacing rather than adding, so re-running this does not leave two
-- schedules firing against the same endpoint.
select cron.unschedule('settle-predictions')
where exists (select 1 from cron.job where jobname = 'settle-predictions');

select cron.schedule(
  'settle-predictions',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'derbyup_site_url') || '/api/cron/settle',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'derbyup_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $job$
);
