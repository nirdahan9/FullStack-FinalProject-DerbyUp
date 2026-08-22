import { createClient } from "@/lib/supabase/server";
import type { Outcome } from "@/lib/football-api/types";

export type LandingGame = {
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffAt: string;
  competitionName: string;
  outcomes: Outcome[];
  /** The price is a placeholder; the card labels it as an estimate. */
  provisional: boolean;
};

/**
 * The three fixtures the landing page shows an anonymous visitor.
 *
 * Read through `landing_upcoming_games()` rather than the tables: the RLS
 * policies on `games`, `competitions` and `questions` admit `authenticated`
 * only, and the function is the narrow opening that lets `anon` see this one
 * shape without widening any of them. See the migration for why.
 *
 * Returns an empty array on any failure rather than throwing. A landing page
 * is the first thing a visitor sees and the one page that must render when the
 * database does not answer — before the seed has run, on a fresh clone, or
 * during an outage. The caller draws an illustrative fixture instead.
 */
export async function getUpcomingGames(): Promise<LandingGame[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("landing_upcoming_games");

    if (error || !data) return [];

    return data.map((row) => ({
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      homeLogo: row.home_logo,
      awayLogo: row.away_logo,
      kickoffAt: row.kickoff_at,
      competitionName: row.competition_name,
      outcomes: (row.outcomes as Outcome[]) ?? [],
      provisional: row.odds_provisional,
    }));
  } catch {
    return [];
  }
}
