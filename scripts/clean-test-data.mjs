/**
 * Removes anything the test suites left behind.
 *
 * The suites clean up after themselves, but a run that is interrupted — a
 * killed process, a failed `beforeAll` — can leave rows in the one Supabase
 * project the product also runs on. Those rows are recognisable: test accounts
 * use a reserved email prefix, test tournaments sit above id 900000 and test
 * fixtures above 90,000,000, all far outside anything API-Football issues.
 *
 *   node scripts/clean-test-data.mjs          # report only
 *   node scripts/clean-test-data.mjs --delete # actually remove
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DELETE = process.argv.includes('--delete');
const EMAIL_PREFIX = /^(it|e2e|pz|rls|conc)-/;
const MIN_COMPETITION_ID = 900_000;
const MIN_FIXTURE_ID = 90_000_000;

const { data: competitions } = await admin
  .from('competitions').select('id, name').gte('id', MIN_COMPETITION_ID);

const { data: games } = await admin
  .from('games').select('id, fixture_id').gte('fixture_id', MIN_FIXTURE_ID);

const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const testUsers = users.filter((u) => EMAIL_PREFIX.test(u.email ?? ''));

console.log(`תחרויות בדיקה: ${competitions?.length ?? 0}`);
console.log(`משחקי בדיקה:   ${games?.length ?? 0}`);
console.log(`משתמשי בדיקה:  ${testUsers.length}`);

if (!DELETE) {
  console.log('\nדוח בלבד. להרצה אמיתית: node scripts/clean-test-data.mjs --delete');
  process.exit(0);
}

// Children first, so no delete is silently refused by a foreign key — the
// failure mode that once left a renamed production competition behind.
for (const game of games ?? []) await admin.from('games').delete().eq('id', game.id);
for (const user of testUsers) await admin.auth.admin.deleteUser(user.id);
for (const c of competitions ?? []) await admin.from('competitions').delete().eq('id', c.id);

const { data: leftCompetitions } = await admin
  .from('competitions').select('id').gte('id', MIN_COMPETITION_ID);
const { data: { users: after } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const leftUsers = after.filter((u) => EMAIL_PREFIX.test(u.email ?? ''));

console.log(`\nנשארו — תחרויות: ${leftCompetitions?.length ?? 0} · משתמשים: ${leftUsers.length}`);
process.exit(leftCompetitions?.length || leftUsers.length ? 1 : 0);
