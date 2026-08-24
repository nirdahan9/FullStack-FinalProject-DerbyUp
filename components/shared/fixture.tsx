import { translateTeam } from "@/lib/i18n/teams";
import { parseExactScore } from "@/lib/domain/exact-score";

/**
 * A fixture, and its goals, in one fixed order: **home on the right.**
 *
 * They live together because the bug they fix is the relationship between
 * them. A pair of team names was written as text under `dir="auto"` and the
 * score beside it under `dir="ltr"`, which put the home club on the right and
 * its own goals on the left — and `auto` made it worse than merely wrong, by
 * flipping per row: it resolves from the first strong character, so
 * "ריאל מדריד — ברצלונה" became RTL while "Genoa — Napoli" became LTR. Which
 * side meant "home" changed as the reader scrolled.
 *
 * Right-to-left with home first is the direction the rest of the product
 * already reads: the three outcome tiles under a fixture are laid out by the
 * page, so the home tile is on the right, and so is the home drum in the
 * exact-score picker. The score now agrees with both.
 *
 * `<bdi>` is what makes it hold. Without isolation the bidi algorithm merges
 * two adjacent Hebrew names — and the separator between them — into a single
 * right-to-left run that no `dir` on the parent can reorder; two digits either
 * side of a hyphen fuse into one left-to-right number for the same reason.
 * Isolating each side leaves the parent free to place them.
 */
export function FixtureLabel({
  home,
  away,
  homeLogo,
  awayLogo,
  separator = "—",
  className = "",
  crestClassName = "h-5 w-5",
}: {
  home: string;
  away: string;
  /** Crests flank the pair when given — home's on the outside of its name. */
  homeLogo?: string | null;
  awayLogo?: string | null;
  separator?: string;
  className?: string;
  crestClassName?: string;
}) {
  // The no-crest markup is kept verbatim rather than unified: six pages
  // render through this branch, and none of them should change because two
  // optional props were added for the advisor.
  if (!homeLogo && !awayLogo) {
    return (
      <span dir="rtl" className={className}>
        <bdi>{translateTeam(home)}</bdi> {separator} <bdi>{translateTeam(away)}</bdi>
      </span>
    );
  }

  // Each crest is grouped with its own name in an inline-flex island, so a
  // long pair can still wrap between the teams — never between a club and its
  // badge. The outer span stays inline for exactly that reason: making it a
  // flex row would trade wrapping for overflow on narrow screens.
  return (
    <span dir="rtl" className={className}>
      <span className="inline-flex items-center gap-2 align-middle">
        {homeLogo && (
          // Provider-CDN crests at icon size; same reasoning as GameRow —
          // next/image would mean allow-listing a remote host for no gain.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={homeLogo} alt="" className={`shrink-0 object-contain ${crestClassName}`} />
        )}
        <bdi>{translateTeam(home)}</bdi>
      </span>{" "}
      {separator}{" "}
      <span className="inline-flex items-center gap-2 align-middle">
        <bdi>{translateTeam(away)}</bdi>
        {awayLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={awayLogo} alt="" className={`shrink-0 object-contain ${crestClassName}`} />
        )}
      </span>
    </span>
  );
}

/** The goals, on the same side as the club that scored them. */
export function FixtureScore({
  home,
  away,
  separator = ":",
  className = "",
}: {
  home: number | null;
  away: number | null;
  separator?: string;
  className?: string;
}) {
  if (home === null || away === null) {
    return <span className={className}>—</span>;
  }

  return (
    <span dir="rtl" className={`tabular-nums ${className}`}>
      <bdi>{home}</bdi>
      {separator}
      <bdi>{away}</bdi>
    </span>
  );
}

/**
 * An exact-score call, stored as "home-away".
 *
 * Rendered through the same component as a real score rather than printed as
 * the stored string: "2-1" is one number sequence to the bidi algorithm and
 * always reads left to right, which would put the home goals on the opposite
 * side from the home drum the user picked them on.
 */
export function ExactScore({ value, className = "" }: { value: string; className?: string }) {
  const parsed = parseExactScore(value);
  if (!parsed) return <span className={className}>{value}</span>;

  return (
    <FixtureScore home={parsed.home} away={parsed.away} separator="-" className={className} />
  );
}
