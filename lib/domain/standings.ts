export type ScoreRow = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  points: number;
  correctCount: number;
  /** Tie-break of last resort: whoever has been around longer ranks higher. */
  joinedAt: Date;
};

export type RankedRow = ScoreRow & { rank: number };

/**
 * Ranks score rows. Used for both boards — the league table and the site-wide
 * leaderboard differ in *what is counted*, not in how it is ordered, so the
 * ordering lives in one place.
 *
 * Competition ranking: equal scores share a rank and the next row skips.
 * 100 / 100 / 90 gives 1, 1, 3 — not 1, 1, 2. Two people genuinely tied for
 * first means nobody came second.
 */
export function rankRows(rows: readonly ScoreRow[]): RankedRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.correctCount - a.correctCount ||
      a.joinedAt.getTime() - b.joinedAt.getTime(),
  );

  const ranked: RankedRow[] = [];
  let rank = 0;
  let previous: ScoreRow | undefined;

  sorted.forEach((row, index) => {
    // Only the scoring fields decide a tie; joinedAt orders them but does not
    // separate them, or nobody would ever share a rank.
    const tied =
      previous !== undefined &&
      previous.points === row.points &&
      previous.correctCount === row.correctCount;

    rank = tied ? rank : index + 1;
    ranked.push({ ...row, rank });
    previous = row;
  });

  return ranked;
}
