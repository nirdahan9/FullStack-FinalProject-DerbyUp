import { Trophy } from "lucide-react";

export type Prize = { place: number; prize: string };

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * Prizes are free text set by the league admin and handed out by the
 * organisation itself — the product tracks the standings, not the reward.
 */
export function PrizeList({ prizes, note }: { prizes: Prize[]; note?: string | null }) {
  if (!prizes.length && !note) return null;

  return (
    <section className="card-kickoff flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" />
        <h2 className="font-bold">פרסים</h2>
      </div>

      {prizes.length > 0 && (
        <ol className="flex flex-col gap-2">
          {[...prizes]
            .sort((a, b) => a.place - b.place)
            .map((p) => (
              <li key={p.place} className="flex items-center gap-3 text-sm">
                <span className="w-6 shrink-0 text-center">
                  {MEDALS[p.place] ?? `${p.place}.`}
                </span>
                <span className="font-medium" dir="auto">{p.prize}</span>
              </li>
            ))}
        </ol>
      )}

      {note && <p className="text-sm text-muted-foreground" dir="auto">{note}</p>}
    </section>
  );
}
