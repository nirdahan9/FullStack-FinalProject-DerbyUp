import { TEAM_NAMES_HE } from "./team-names";

/**
 * Suffixes clubs carry in the provider's data but nobody says out loud.
 * Ported from the DerbyUp app (src/lib/teamNames.ts), so "Liverpool FC" finds
 * the entry stored under "Liverpool".
 */
const CLUB_SUFFIXES = [" FC", " AFC", " SC", " CF", " AC", " FK", " CD", " BK"];

/** Drops accents so "Bayern München" can match an entry spelled "Munchen". */
function deaccent(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function stripSuffix(name: string): string | null {
  for (const suffix of CLUB_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length).trim();
  }
  return null;
}

/**
 * Hebrew name for a team, falling back to the English one.
 *
 * The lookup widens in steps — exact, case-insensitive, without the club
 * suffix, then ignoring accents — because the provider is not consistent
 * about any of them: the same club arrives as "Bayern Munich" one week and
 * "Bayern München" the next.
 *
 * Falling back to the English name rather than throwing matters: a club we
 * have never seen should appear untranslated, not break the fixture list.
 */
export function translateTeam(name: string): string {
  if (!name) return name;

  const direct = TEAM_NAMES_HE[name];
  if (direct) return direct;

  const target = name.toLowerCase();
  const caseInsensitive = Object.keys(TEAM_NAMES_HE).find(
    (key) => key.toLowerCase() === target,
  );
  if (caseInsensitive) return TEAM_NAMES_HE[caseInsensitive];

  const withoutSuffix = stripSuffix(name);
  if (withoutSuffix) {
    const found = TEAM_NAMES_HE[withoutSuffix];
    if (found) return found;
  }

  const flattened = deaccent(name).toLowerCase();
  const byAccent = Object.keys(TEAM_NAMES_HE).find(
    (key) => deaccent(key).toLowerCase() === flattened,
  );
  if (byAccent) return TEAM_NAMES_HE[byAccent];

  return name;
}
