import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { translateTeam } from "@/lib/i18n/teams";
import { FixtureScore } from "@/components/shared/fixture";

export type LeagueGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffAt: string;
  status: string;
  scoreHome: number | null;
  scoreAway: number | null;
  predictedCount: number;
  /** False for fixtures beyond the odds window — no questions written yet. */
  isOpen: boolean;
};

/**
 * The league's fixtures, split the way the DerbyUp app splits them: three
 * counters on top, then a future/finished toggle, then the rows.
 *
 * "פספסתי" counts fixtures that kicked off without a prediction — the number
 * that tells a member they are falling behind, which a plain fixture list
 * never surfaces. Fixtures that were never open for predictions are excluded
 * from it, so a full-season calendar does not report months of phantom misses.
 */
export function LeagueGames({
  games,
  showFinished,
  baseUrl,
}: {
  games: LeagueGame[];
  showFinished: boolean;
  baseUrl: string;
}) {
  const upcoming = games.filter((g) => g.status === "scheduled");
  const finished = games.filter((g) => g.status !== "scheduled");

  const waiting = upcoming.filter((g) => g.predictedCount === 0 && g.isOpen).length;
  const missed = finished.filter((g) => g.predictedCount === 0 && g.isOpen).length;
  const played = games.filter((g) => g.predictedCount > 0).length;

  const visible = showFinished ? finished : upcoming;

  return (
    <section className="flex flex-col gap-3">
      <span className="section-label">משחקי הטורניר</span>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "ממתין", value: waiting, tone: "bg-secondary text-foreground" },
          { label: "פספסתי", value: missed, tone: "bg-destructive/10 text-destructive" },
          { label: "ניחשתי", value: played, tone: "bg-primary/10 text-primary" },
        ].map((tile) => (
          <div
            key={tile.label}
            className={`flex flex-col items-center gap-0.5 rounded-2xl py-3 ${tile.tone}`}
          >
            <span className="text-xl font-black">{tile.value}</span>
            <span className="text-[11px] font-medium opacity-80">{tile.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
        {[
          { label: "עתידיים", active: !showFinished, href: baseUrl },
          { label: "שהסתיימו", active: showFinished, href: `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}finished=1` },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            scroll={false}
            className={`rounded-xl py-2 text-center text-sm font-bold transition-colors ${
              tab.active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="card-kickoff text-center text-sm text-muted-foreground">
          {showFinished ? "עדיין אין משחקים שהסתיימו" : "אין משחקים קרובים בטורניר הזה"}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((game) => {
            const kickoff = new Date(game.kickoffAt);
            const when = kickoff.toLocaleString("he-IL", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Jerusalem",
            });

            return (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="card-kickoff flex items-center gap-3 py-3 transition-colors hover:bg-secondary/60"
              >
                {/* Filled when this member has predicted the fixture. */}
                <span
                  className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                    game.predictedCount > 0
                      ? "border-primary bg-primary"
                      : game.isOpen
                        ? "border-muted-foreground/40"
                        : "border-dashed border-muted-foreground/30"
                  }`}
                />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {/* dir="rtl" rather than "auto": the crests make this a flex
                      row, so the direction decides which club sits on the
                      right, and "auto" would decide it from the first letter
                      of whichever club happens to be at home. */}
                  <span dir="rtl" className="flex items-center gap-1.5 truncate text-sm font-bold">
                    {game.homeLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={game.homeLogo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                    )}
                    <bdi className="truncate">{translateTeam(game.homeTeam)}</bdi>
                    <span className="shrink-0 text-muted-foreground">נגד</span>
                    {game.awayLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={game.awayLogo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                    )}
                    <bdi className="truncate">{translateTeam(game.awayTeam)}</bdi>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {game.status === "finished" && game.scoreHome !== null ? (
                      <>
                        הסתיים{" "}
                        <FixtureScore home={game.scoreHome} away={game.scoreAway} separator="-" />
                      </>
                    ) : (
                      when
                    )}
                  </span>
                </div>

                {game.status === "scheduled" &&
                  (game.isOpen ? (
                    <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-primary">
                      {game.predictedCount > 0 ? "ערוך" : "שחק"}
                      <ChevronLeft className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      ייפתח בקרוב
                    </span>
                  ))}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
