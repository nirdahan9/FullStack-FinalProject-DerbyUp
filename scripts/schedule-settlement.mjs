/**
 * Loads the cron secret and site URL into Supabase Vault, then applies the
 * settlement schedule.
 *
 * Kept out of the migration so no secret is committed: the migration defines
 * the job, this supplies the values it reads at run time.
 *
 *   node scripts/schedule-settlement.mjs
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const SITE_URL = process.env.SITE_URL ?? 'https://derbyup-runi-fullstack.vercel.app';

async function run(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${body}`);
  return body;
}

const escape = (v) => String(v).replace(/'/g, "''");

// vault.create_secret() rather than an insert: writing to vault.secrets
// directly needs a role the Management API does not run as, because the
// encryption function is owned by supabase_admin.
async function putSecret(name, value, description) {
  await run(`
    do $do$
    declare v_id uuid;
    begin
      select id into v_id from vault.secrets where name = '${escape(name)}';
      if v_id is null then
        perform vault.create_secret('${escape(value)}', '${escape(name)}', '${escape(description)}');
      else
        perform vault.update_secret(v_id, '${escape(value)}', '${escape(name)}', '${escape(description)}');
      end if;
    end
    $do$;
  `);
}

await putSecret('derbyup_cron_secret', env.CRON_SECRET, 'Bearer token for the settlement cron');
await putSecret('derbyup_site_url', SITE_URL, 'Base URL the settlement cron calls');
console.log('✓ secrets stored in vault');

await run(fs.readFileSync('supabase/migrations/20260821200518_schedule_settlement.sql', 'utf8'));
console.log('✓ schedule applied');

const jobs = await run(`select jobname, schedule, active from cron.job order by jobname;`);
console.log('  ', jobs);
