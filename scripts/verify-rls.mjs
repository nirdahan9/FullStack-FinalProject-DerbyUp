import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const users = [
  { email: `rls-a-${Date.now()}@example.com`, password: 'TestPass123!' },
  { email: `rls-b-${Date.now()}@example.com`, password: 'TestPass123!' },
];
const created = [];

console.log('\n── יצירת שני משתמשים ──');
for (const u of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true,
  });
  if (error) { console.log('  שגיאה:', error.message); process.exit(1); }
  created.push(data.user.id);
  u.id = data.user.id;
}
ok('שני משתמשים נוצרו', created.length === 2);

console.log('\n── טריגר יצירת פרופיל ──');
const { data: profs } = await admin.from('profiles').select('*').in('id', created);
ok('נוצר פרופיל לכל משתמש', profs?.length === 2, `(נמצאו ${profs?.length})`);
ok('מתחילים ב-0 נקודות', profs?.every(p => Number(p.total_points) === 0));
ok('username ייחודי נוצר', new Set(profs?.map(p => p.username)).size === 2);
ok('username בתוך 30 תווים', profs?.every(p => p.username.length <= 30));

const sign = async (u) => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(error.message);
  return c;
};
const A = await sign(users[0]);
const B = await sign(users[1]);

console.log('\n── בידוד נתונים: א׳ מול ב׳ ──');
const { data: aSeesProfiles } = await A.from('profiles').select('id');
ok('א׳ רואה רק את הפרופיל של עצמו', aSeesProfiles?.length === 1 && aSeesProfiles[0].id === users[0].id,
   `(רואה ${aSeesProfiles?.length})`);

await A.from('profiles')
  .update({ display_name: 'hacked' }).eq('id', users[1].id).select();
const { data: bName } = await admin.from('profiles').select('display_name').eq('id', users[1].id).single();
ok('א׳ לא יכול לשנות את הפרופיל של ב׳', bName.display_name !== 'hacked');

console.log('\n── הגנה על עמודות הניקוד ──');
const { error: scoreErr } = await A.from('profiles')
  .update({ total_points: 999999 }).eq('id', users[0].id).select();
const { data: aPts } = await admin.from('profiles').select('total_points').eq('id', users[0].id).single();
ok('א׳ לא יכול לכתוב לעצמו נקודות', Number(aPts.total_points) === 0, `(יתרה: ${aPts.total_points})`);
ok('הטריגר החזיר שגיאה מפורשת', !!scoreErr, `(${scoreErr?.message ?? 'ללא שגיאה'})`);

const { error: nameErr } = await A.from('profiles')
  .update({ display_name: 'שם חדש' }).eq('id', users[0].id).select();
ok('א׳ כן יכול לשנות את השם שלו', !nameErr, `(${nameErr?.message ?? ''})`);

console.log('\n── ליגות ──');
// competitions are seeded in a later stage; one row is enough to satisfy the FK
await admin.from('competitions').upsert({ id: 39, name: 'Premier League', country: 'England', season: 2026 });
// created via admin: an authenticated insert cannot use RETURNING here, since
// the SELECT policy needs a membership that does not exist yet. See the RLS
// migration — real creation goes through a SECURITY DEFINER create_league().
const { data: leagueRows, error: lErr } = await admin.from('leagues').insert({
  name: 'ליגת בדיקה', creator_id: users[0].id, competition_id: 39, invite_code: 'RLSTEST1',
}).select();
ok('ליגה נוצרה (דרך admin — ראה הערה)', !lErr && leagueRows?.length === 1, `(${lErr?.message ?? ''})`);
const leagueId = leagueRows?.[0]?.id;

if (leagueId) {
  await admin.from('league_members').insert({ league_id: leagueId, user_id: users[0].id });
  const { data: bSeesLeague } = await B.from('leagues').select('id').eq('id', leagueId);
  ok('ב׳ לא רואה ליגה שאינו חבר בה', bSeesLeague?.length === 0, `(רואה ${bSeesLeague?.length})`);

  const { data: aSeesLeague } = await A.from('leagues').select('id').eq('id', leagueId);
  ok('א׳ כן רואה את הליגה שלו', aSeesLeague?.length === 1);

  const { data: bSeesMembers } = await B.from('league_members').select('id').eq('league_id', leagueId);
  ok('ב׳ לא רואה את חברי הליגה', bSeesMembers?.length === 0);

  // now put B in the same league — the standings case
  await admin.from('league_members').insert({ league_id: leagueId, user_id: users[1].id });
  const { data: bNowSees } = await B.from('league_members').select('user_id').eq('league_id', leagueId);
  ok('אחרי הצטרפות ב׳ רואה את שני החברים', bNowSees?.length === 2, `(רואה ${bNowSees?.length})`);

  const { data: bSeesProfiles } = await B.from('profiles').select('id');
  ok('ב׳ רואה את הפרופיל של א׳ (חברי ליגה משותפת)', bSeesProfiles?.length === 2, `(רואה ${bSeesProfiles?.length})`);
}

console.log('\n── לידרבורד כללי ──');
const { data: lb, error: lbErr } = await A.rpc('get_global_leaderboard', { p_limit: 10, p_offset: 0 });
ok('א׳ יכול לקרוא ללידרבורד', !lbErr, `(${lbErr?.message ?? ''})`);
ok('הלידרבורד מחזיר את שני המשתמשים', lb?.length >= 2, `(${lb?.length})`);
ok('הלידרבורד לא חושף id או username',
   lb?.length ? !('id' in lb[0]) && !('username' in lb[0]) : false,
   lb?.length ? `(עמודות: ${Object.keys(lb[0]).join(', ')})` : '');

const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: anonErr } = await anonClient.rpc('get_global_leaderboard', { p_limit: 10, p_offset: 0 });
ok('אורח לא יכול לקרוא ללידרבורד', !!anonErr, `(${anonErr?.message ?? 'הצליח!'})`);

console.log('\n── אורח לא רואה כלום ──');
const { data: anonProfiles } = await anonClient.from('profiles').select('id');
ok('אורח לא רואה פרופילים', !anonProfiles || anonProfiles.length === 0, `(רואה ${anonProfiles?.length})`);

console.log('\n── ניקוי ──');
if (leagueId) await admin.from('leagues').delete().eq('id', leagueId);
await admin.from('competitions').delete().eq('id', 39);
for (const id of created) await admin.auth.admin.deleteUser(id);
const { data: leftover } = await admin.from('profiles').select('id').in('id', created);
ok('מחיקת משתמש מוחקת את הפרופיל (cascade)', leftover?.length === 0, `(נשארו ${leftover?.length})`);

console.log(`\n${'─'.repeat(46)}`);
console.log(`עברו: ${pass}  |  נכשלו: ${fail}`);
process.exit(fail ? 1 : 0);
