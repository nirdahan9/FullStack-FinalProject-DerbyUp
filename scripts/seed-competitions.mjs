/**
 * Seeds the seven supported tournaments.
 *
 * Ids are API-Football league ids and are used directly as the primary key,
 * so no translation table is needed anywhere in the product.
 *
 *   node scripts/seed-competitions.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const COMPETITIONS = [
  { id: 383, name: "ליגת העל", country: "ישראל" },
  { id: 39, name: "פרמייר ליג", country: "אנגליה" },
  { id: 140, name: "לה ליגה", country: "ספרד" },
  { id: 135, name: "סרייה A", country: "איטליה" },
  { id: 78, name: "בונדסליגה", country: "גרמניה" },
  { id: 61, name: "ליג 1", country: "צרפת" },
  { id: 2, name: "ליגת האלופות", country: "אירופה" },
];

const season = new Date().getUTCFullYear();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { error } = await supabase.from("competitions").upsert(
  COMPETITIONS.map((c) => ({
    ...c,
    season,
    logo_url: `https://media.api-sports.io/football/leagues/${c.id}.png`,
    is_active: true,
  })),
  { onConflict: "id" },
);

if (error) {
  console.error("נכשל:", error.message);
  process.exit(1);
}

const { data } = await supabase.from("competitions").select("id, name, country, season").order("id");
console.log(`✓ ${data.length} תחרויות (עונה ${season}):`);
for (const c of data) console.log(`   ${String(c.id).padStart(3)}  ${c.name} — ${c.country}`);
