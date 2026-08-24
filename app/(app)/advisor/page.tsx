import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import {
  isRangeKey,
  listCompetitions,
  listUpcomingGames,
  type RangeKey,
} from "@/lib/advisor/context";
import { AdvisorFilters } from "@/components/advisor/advisor-filters";
import { AdvisorPanel } from "@/components/advisor/advisor-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { FixtureLabel } from "@/components/shared/fixture";

const LIST_LIMIT = 40;

/**
 * The advisor's own tab.
 *
 * The match page answers "should I guess this one?"; this page answers "which
 * one should I look at?" — so it leads with the picker and the filters, and
 * the analysis appears in place once a fixture is chosen rather than on a
 * separate screen.
 *
 * Deliberately not restricted to the competitions a user has a league in. The
 * fixture list is, because you can only predict where you are a member; advice
 * is information, and a tab that is empty for someone in one league is a tab
 * nobody opens twice.
 */
export default async function AdvisorPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; range?: string; game?: string }>;
}) {
  const params = await searchParams;
  const competition = Number(params.competition) || null;
  const range: RangeKey = isRangeKey(params.range ?? null) ? (params.range as RangeKey) : "week";
  const selectedId = params.game ?? null;

  const [competitions, page] = await Promise.all([
    listCompetitions(),
    listUpcomingGames({ competitionId: competition, range, limit: LIST_LIMIT }),
  ]);

  const selected = selectedId ? page.games.find((game) => game.id === selectedId) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">✨ יועץ AI</span>
        <h1 className="text-2xl font-black leading-tight">על איזה משחק נדבר?</h1>
        <p className="text-sm text-muted-foreground">
          בחר משחק ואומר לך מה אני חושב עליו — ואפשר גם לשאול אותי עליו.
        </p>
      </div>

      <AdvisorFilters
        competitions={competitions}
        competition={competition}
        range={range}
      />

      {selected && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="section-label">{selected.competition}</span>
              <FixtureLabel
                home={selected.homeTeam}
                away={selected.awayTeam}
                homeLogo={selected.homeLogo}
                awayLogo={selected.awayLogo}
                crestClassName="h-6 w-6"
                className="block text-lg font-black"
              />
              <p className="text-xs text-muted-foreground">{selected.kickoffLabel}</p>
            </div>
            <Link
              href={`/games/${selected.id}`}
              className="shrink-0 text-xs font-bold text-primary hover:underline"
            >
              לניחוש
            </Link>
          </div>

          {/* Keyed by the match so switching fixtures remounts the panel:
              without it the previous analysis and thread would linger while
              the new ones load. */}
          <AdvisorPanel key={selected.id} gameId={selected.id} />
        </div>
      )}

      {!page.games.length ? (
        <EmptyState
          icon={Sparkles}
          title="אין משחקים בטווח הזה"
          body="נסה טווח רחב יותר או ליגה אחרת."
        />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="section-label">
            📅 {page.total} משחקים {page.total > page.games.length && `(מוצגים ${page.games.length})`}
          </span>

          {page.games.map((game) => {
            const isSelected = game.id === selectedId;
            const search = new URLSearchParams();
            if (competition !== null) search.set("competition", String(competition));
            if (range !== "week") search.set("range", range);
            search.set("game", game.id);

            return (
              <Link
                key={game.id}
                href={`/advisor?${search.toString()}`}
                scroll={false}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {[
                    { name: game.homeTeam, logo: game.homeLogo },
                    { name: game.awayTeam, logo: game.awayLogo },
                  ].map((team) => (
                    <span key={team.name} className="flex items-center gap-2">
                      {/* Provider-CDN crests at 16px; same call as GameRow —
                          next/image buys nothing at this size. */}
                      {team.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={team.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      )}
                      <span className="truncate text-sm font-bold" dir="auto">
                        {team.name}
                      </span>
                    </span>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {game.competition} · {game.kickoffLabel}
                  </p>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
