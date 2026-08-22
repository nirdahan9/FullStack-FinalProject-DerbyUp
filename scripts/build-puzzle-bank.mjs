/**
 * Builds the Football Bridge puzzle bank offline.
 *
 * The DerbyUp version queries player_club_history at generation time and falls
 * back to an LLM when that table is missing or returns nothing
 * (backend/src/jobs/generateMiniGames.js). Here the whole bank is computed once
 * from the Transfermarkt appearance data and written to the database, so
 * publishing a puzzle costs no model call, no external request, and no join at
 * runtime — the answers are already on the row.
 *
 * Source: backend/dataset/ in the DerbyUp repo (appearances.csv, clubs.csv).
 *
 *   node scripts/build-puzzle-bank.mjs [--dry]
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const DATASET = '/Users/nirdahan/Documents/Projects/bet-joy-league-hub/backend/dataset ';
const DRY = process.argv.includes('--dry');

/**
 * The clubs puzzles are drawn from — the same curated pool the DerbyUp
 * generator uses, keyed to the names this dataset actually carries. A pool of
 * well-known clubs is the point: "name someone who played for both" only works
 * if the solver has heard of both.
 */
const CLUBS = {
  'Manchester United Football Club': 'מנצ׳סטר יונייטד',
  'Manchester City Football Club': 'מנצ׳סטר סיטי',
  'Liverpool Football Club': 'ליברפול',
  'Chelsea Football Club': 'צ׳לסי',
  'Arsenal Football Club': 'ארסנל',
  'Tottenham Hotspur Football Club': 'טוטנהאם',
  'Real Madrid Club de Fútbol': 'ריאל מדריד',
  'Futbol Club Barcelona': 'ברצלונה',
  'Club Atlético de Madrid S.A.D.': 'אתלטיקו מדריד',
  'Sevilla Fútbol Club S.A.D.': 'סביליה',
  'FC Bayern München': 'באיירן מינכן',
  'Borussia Dortmund': 'בורוסיה דורטמונד',
  'Bayer 04 Leverkusen Fußball': 'באייר לברקוזן',
  'Juventus Football Club': 'יובנטוס',
  'Associazione Calcio Milan': 'מילאן',
  'Football Club Internazionale Milano S.p.A.': 'אינטר',
  'Società Sportiva Calcio Napoli': 'נאפולי',
  'Associazione Sportiva Roma': 'רומא',
  'Paris Saint-Germain Football Club': 'פ.ס.ז׳',
  'Olympique de Marseille': 'מארסיי',
};

/** Puzzles need enough answers to be fair, few enough to be a puzzle. */
const MIN_ANSWERS = 3;
const MAX_ANSWERS = 25;
const TARGET_PUZZLES = 150;

function normalize(raw) {
  return raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'`’\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log('קורא clubs.csv…');
const clubIdToName = new Map();
const wantedIds = new Map();
{
  const text = fs.readFileSync(`${DATASET}/clubs.csv`, 'utf8');
  const [header, ...lines] = text.split('\n');
  const cols = header.split(',');
  const idIdx = cols.indexOf('club_id');
  const nameIdx = cols.indexOf('name');
  for (const line of lines) {
    if (!line.trim()) continue;
    // name is quoted only when it contains a comma; these rows do not.
    const parts = line.split(',');
    const id = parts[idIdx];
    const name = parts[nameIdx];
    clubIdToName.set(id, name);
    if (CLUBS[name]) wantedIds.set(id, name);
  }
}
console.log(`  ${clubIdToName.size} מועדונים · ${wantedIds.size}/${Object.keys(CLUBS).length} מהמאגר נמצאו`);

const missing = Object.keys(CLUBS).filter((n) => ![...wantedIds.values()].includes(n));
if (missing.length) console.log('  ⚠️ לא נמצאו:', missing.join(', '));

console.log('סורק appearances.csv (1.8M שורות)…');
/** club name → Map<normalized player name, display name> */
const playersByClub = new Map();
for (const name of wantedIds.values()) playersByClub.set(name, new Map());
const allPlayers = new Map();

{
  const stream = fs.createReadStream(`${DATASET}/appearances.csv`, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let first = true, clubIdx = -1, nameIdx = -1, rows = 0;

  for await (const line of rl) {
    if (first) {
      const cols = line.split(',');
      clubIdx = cols.indexOf('player_club_id');
      nameIdx = cols.indexOf('player_name');
      first = false;
      continue;
    }
    if (!line) continue;
    rows++;

    const parts = line.split(',');
    const playerName = parts[nameIdx];
    if (!playerName) continue;

    const key = normalize(playerName);
    if (key) allPlayers.set(key, playerName);

    const club = wantedIds.get(parts[clubIdx]);
    if (club) playersByClub.get(club).set(key, playerName);
  }
  console.log(`  ${rows.toLocaleString()} הופעות · ${allPlayers.size.toLocaleString()} שחקנים ייחודיים`);
}

console.log('מחשב זוגות…');
const names = [...wantedIds.values()];
const puzzles = [];

for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = playersByClub.get(names[i]);
    const b = playersByClub.get(names[j]);
    const shared = [...a.keys()].filter((k) => b.has(k));

    if (shared.length < MIN_ANSWERS || shared.length > MAX_ANSWERS) continue;

    puzzles.push({
      clubA: CLUBS[names[i]],
      clubB: CLUBS[names[j]],
      answers: shared.map((k) => a.get(k)).sort(),
      count: shared.length,
    });
  }
}

// Fewer shared players makes a harder, more interesting puzzle, but the very
// smallest sets are often data artefacts. Sorting by size and taking from the
// middle outwards gives a usable spread.
puzzles.sort((x, y) => x.count - y.count);
const chosen = puzzles.slice(0, TARGET_PUZZLES);

console.log(`  ${puzzles.length} זוגות מתאימים · נבחרו ${chosen.length}`);
console.log(`  טווח תשובות: ${chosen[0]?.count}–${chosen[chosen.length - 1]?.count}`);
console.log('\nדוגמאות:');
for (const p of chosen.slice(0, 5)) {
  console.log(`  ${p.clubA} + ${p.clubB} → ${p.count}: ${p.answers.slice(0, 3).join(', ')}…`);
}

if (DRY) {
  fs.writeFileSync('/tmp/puzzles.json', JSON.stringify({ puzzles: chosen, players: allPlayers.size }, null, 2));
  console.log('\n(dry run — נכתב ל-/tmp/puzzles.json)');
  process.exit(0);
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Only players who appear in some puzzle. The autocomplete exists to help
// someone type a name they already have in mind, not to browse 30,000 people —
// and a smaller table keeps the trigram index small.
const needed = new Map();
for (const p of chosen) {
  for (const answer of p.answers) needed.set(normalize(answer), answer);
}
// Plus a decoy pool, so the suggestions do not give the answer away by only
// ever offering correct ones.
const decoys = [...allPlayers.entries()].slice(0, 4000);
for (const [key, name] of decoys) if (!needed.has(key)) needed.set(key, name);

console.log(`\nכותב ${needed.size} שחקנים ל-bridge_players…`);
const playerRows = [...needed.entries()].map(([normalized_name, name]) => ({ name, normalized_name }));
for (let i = 0; i < playerRows.length; i += 1000) {
  const { error } = await supabase
    .from('bridge_players')
    .upsert(playerRows.slice(i, i + 1000), { onConflict: 'normalized_name' });
  if (error) { console.error('  ✗', error.message); process.exit(1); }
}

// One puzzle a day from today.
//
// valid_answers holds display names, not normalised ones. checkAnswer
// normalises both sides anyway, so matching still ignores case and accents —
// and the same list can be shown to the user when the puzzle ends, instead of
// revealing "gabriel paulista".
console.log(`כותב ${chosen.length} אתגרים ל-daily_puzzles…`);
const today = new Date();
const puzzleRows = chosen.map((p, index) => {
  const date = new Date(today.getTime() + index * 86_400_000);
  return {
    play_date: date.toISOString().slice(0, 10),
    club_a: p.clubA,
    club_b: p.clubB,
    valid_answers: p.answers,
  };
});
for (let i = 0; i < puzzleRows.length; i += 100) {
  const { error } = await supabase
    .from('daily_puzzles')
    .upsert(puzzleRows.slice(i, i + 100), { onConflict: 'play_date' });
  if (error) { console.error('  ✗', error.message); process.exit(1); }
}

console.log(`\n✓ ${chosen.length} אתגרים — עד ${puzzleRows[puzzleRows.length - 1].play_date}`);
console.log(`✓ ${needed.size} שחקנים ל-autocomplete`);
