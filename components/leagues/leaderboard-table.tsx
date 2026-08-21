import { rankRows, type ScoreRow } from "@/lib/domain/standings";

/**
 * Renders a ranked table. Used by both boards — the league table and the
 * site-wide leaderboard differ in what is counted, not in how it is shown.
 */
export function LeaderboardTable({
  rows,
  currentUserId,
  emptyLabel = "אין עדיין נקודות",
}: {
  rows: ScoreRow[];
  currentUserId?: string;
  emptyLabel?: string;
}) {
  if (!rows.length) {
    return (
      <p className="card-kickoff text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  const ranked = rankRows(rows);

  return (
    <div className="flex flex-col gap-2">
      {ranked.map((row) => {
        const isMe = row.userId === currentUserId;

        return (
          <div
            key={row.userId}
            className={`card-kickoff flex items-center gap-3 py-3 ${
              isMe ? "ring-2 ring-primary/40" : ""
            }`}
          >
            <span
              className={`w-7 shrink-0 text-center text-sm font-black ${
                row.rank <= 3 ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {row.rank}
            </span>

            <span className="min-w-0 flex-1 truncate font-bold" dir="auto">
              {row.displayName}
              {isMe && <span className="ms-2 text-xs text-muted-foreground">(אתה)</span>}
            </span>

            <div className="flex shrink-0 flex-col items-end">
              <span className="font-black text-primary">
                {row.points.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {row.correctCount} פגיעות
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
