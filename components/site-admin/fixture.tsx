import { translateTeam } from "@/lib/i18n/teams";

/**
 * A fixture and its score, in one fixed order: **home on the right.**
 *
 * Both halves are here together because the bug they fix is the relationship
 * between them. The pair used to be written as plain text under `dir="auto"`,
 * and the score beside it as plain text under `dir="ltr"` — which put the home
 * team on the right and its own goals on the left. Worse, it was not even
 * consistent per row: `dir="auto"` reads the first strong character, so
 * "ריאל מדריד — ברצלונה" resolved to RTL while "Genoa — Napoli" resolved to
 * LTR, and the same column changed which side meant "home" from row to row.
 *
 * `<bdi>` is what makes the order fixed. Without it the bidi algorithm merges
 * two adjacent Hebrew names and the neutral dash between them into a single
 * right-to-left run, so no `dir` on the parent can separate them; isolating
 * each name leaves the parent free to place them. Hence RTL and home first:
 * the dashboard is a Hebrew page, and a Hebrew reader starts on the right.
 */
export function FixtureLabel({
  home,
  away,
  className = "",
}: {
  home: string;
  away: string;
  className?: string;
}) {
  return (
    <span dir="rtl" className={className}>
      <bdi>{translateTeam(home)}</bdi>
      {" — "}
      <bdi>{translateTeam(away)}</bdi>
    </span>
  );
}

/** The goals, in the same order and on the same side as `FixtureLabel`. */
export function FixtureScore({
  home,
  away,
  className = "",
}: {
  home: number | null;
  away: number | null;
  className?: string;
}) {
  if (home === null || away === null) {
    return <span className={className}>—</span>;
  }

  return (
    <span dir="rtl" className={`tabular-nums ${className}`}>
      <bdi>{home}</bdi>
      {" : "}
      <bdi>{away}</bdi>
    </span>
  );
}
