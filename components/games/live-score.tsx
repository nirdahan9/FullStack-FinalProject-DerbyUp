/**
 * The score of a match being played, with the minute it has reached.
 *
 * Presentational only, and rendered on the server like everything else on
 * these pages. What makes it move is <LiveRefresher>, which re-requests the
 * page; the score itself is read from `games` by whichever page draws it.
 *
 * The dot is the whole point of the component. A score with no dot is a
 * result — something that already happened. A pulsing dot next to it is the
 * difference between reading a table and watching a match.
 */
export function LiveScore({
  scoreHome,
  scoreAway,
  minute,
  className = "",
}: {
  scoreHome: number | null;
  scoreAway: number | null;
  minute: number | null;
  className?: string;
}) {
  return (
    <span className={`flex shrink-0 items-center gap-1.5 ${className}`}>
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
      </span>

      {/* Home on the right, the side the fixture itself puts it on. The
          isolates are load-bearing: "2-1" is a single number sequence to the
          bidi algorithm and would otherwise always read left to right. */}
      <span dir="rtl" className="text-sm font-black tabular-nums">
        <bdi>{scoreHome ?? 0}</bdi>-<bdi>{scoreAway ?? 0}</bdi>
      </span>

      {minute !== null && (
        <span dir="ltr" className="text-[11px] font-bold text-destructive tabular-nums">
          {minute}&apos;
        </span>
      )}

      <span className="sr-only">משחק חי</span>
    </span>
  );
}
