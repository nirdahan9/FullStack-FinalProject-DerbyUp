import { Crown } from "lucide-react";
import { rankRows, type ScoreRow } from "@/lib/domain/standings";

/**
 * Ranked table, styled as the DerbyUp app styles it: a card-kickoff row per
 * member, medal for the top three and #N below that, avatar, name, score.
 * Your own row is outlined.
 *
 * Used by both boards — the league table and the site-wide leaderboard differ
 * in what gets counted, not in how it is drawn.
 */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>;
}

export function LeaderboardTable({
  rows,
  currentUserId,
  creatorId,
  emptyLabel = "אין עדיין נקודות",
  showCorrectCount = true,
  liveDeltas,
}: {
  rows: ScoreRow[];
  currentUserId?: string;
  creatorId?: string | null;
  emptyLabel?: string;
  /** The site-wide board has no per-question breakdown to show. */
  showCorrectCount?: boolean;
  /**
   * Points each member is earning from matches still being played, for
   * display. `rows` already carries them inside `points` so the ranking sorts
   * on the running total; this only says how much of that total is not final
   * yet. A member absent from the map has nothing in progress.
   */
  liveDeltas?: Map<string, number>;
}) {
  if (!rows.length) {
    return (
      <p className="card-kickoff text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rankRows(rows).map((row) => {
        const isMe = row.userId === currentUserId;
        const live = liveDeltas?.get(row.userId) ?? 0;

        return (
          <div
            key={row.userId}
            className={`card-kickoff flex items-center gap-3 py-3 ${
              isMe ? "border border-primary/30 bg-primary/5" : ""
            }`}
          >
            <div className="w-7 shrink-0 text-center">
              <RankBadge rank={row.rank} />
            </div>

            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm">
              {row.avatarUrl ? (
                // Avatars can come from any host a user pastes in; see top-bar.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                "👤"
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-sm font-bold" dir="auto">
                <span className="truncate">{row.displayName}</span>
                {creatorId === row.userId && (
                  <Crown size={11} className="shrink-0 text-amber-500" />
                )}
                {isMe && <span className="text-[10px] font-normal text-primary">(אתה)</span>}
              </p>
              {showCorrectCount && (
                <p className="text-[10px] text-muted-foreground">
                  {row.correctCount} פגיעות
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end">
              <span className="text-sm font-black text-primary">
                {row.points.toLocaleString("he-IL", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                נק׳
              </span>
              {live > 0 && (
                // Shown as an addition rather than folded silently into the
                // total, because it can be taken away again: an equaliser
                // removes it. A member who saw 21.45 and later sees 14.30
                // deserves to have been told which part was provisional.
                <span
                  dir="ltr"
                  className="text-[10px] font-bold text-emerald-600 tabular-nums dark:text-emerald-400"
                >
                  +
                  {live.toLocaleString("he-IL", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
