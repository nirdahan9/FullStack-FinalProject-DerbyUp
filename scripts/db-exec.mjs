/**
 * Runs a SQL file against the linked Supabase project through the Management
 * API. `supabase db query` routes through a slower path that has been timing
 * out on this project; this hits the same database directly.
 *
 *   node scripts/db-exec.mjs path/to/file.sql
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/db-exec.mjs <file.sql>'); process.exit(1); }

const res = await fetch(
  `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: fs.readFileSync(file, 'utf8') }),
  },
);

const body = await res.text();
if (!res.ok) { console.error(`✗ ${res.status}: ${body}`); process.exit(1); }
console.log(body.length > 2 ? body : '✓');
