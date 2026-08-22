import fs from "node:fs";
import path from "node:path";

/**
 * Integration tests talk to the real Supabase project, so they need the same
 * credentials `next dev` uses. Next loads .env.local itself; Vitest does not,
 * so it is read here rather than duplicating the values into a second file
 * that could drift.
 */
const file = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(file)) {
  throw new Error(".env.local נדרש כדי להריץ בדיקות אינטגרציה");
}

for (const line of fs.readFileSync(file, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq);
  if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1);
}

for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  if (!process.env[key]) throw new Error(`חסר משתנה סביבה: ${key}`);
}
