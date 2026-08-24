import { createClient } from "@/lib/supabase/server";
import { translateTeam } from "@/lib/i18n/teams";
import type { Insight } from "./schema";

/**
 * Readers for what the nightly job wrote.
 *
 * Both are pure reads of `advisor_daily_pick` — no model call, no provider
 * call, nothing that can be slow or billable. That is the whole reason the
 * cron exists: the dashboard is the first screen after sign-in and the landing
 * page is served to strangers, and neither can afford to wait on Gemini.
 */

export type DailyPick = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffAt: string;
  competitionName: string;
  insight: Insight;
};

/**
 * Today's pick for one user, from a competition they actually play in.
 *
 * Restricted to their leagues on purpose — unlike the advisor tab. A dashboard
 * card is a prompt to go and guess, so recommending a match the reader cannot
 * enter would be an invitation to a locked door.
 *
 * Returns null rather than throwing. A dashboard that fails to render because
 * an optional card could not load is a worse outcome than a dashboard without
 * the card.
 */
export async function getDailyPickForUser(userId: string): Promise<DailyPick | null> {
  try {
    const supabase = await createClient();

    const { data: memberships } = await supabase
      .from("league_members")
      .select("leagues(competition_id)")
      .eq("user_id", userId);

    const competitionIds = [
      ...new Set(
        (memberships ?? [])
          .flatMap((row) => (row.leagues ? [row.leagues] : []))
          .map((league) => league.competition_id),
      ),
    ];

    if (!competitionIds.length) return null;

    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("advisor_daily_pick")
      .select(
        "game_id, payload, games(home_team, away_team, home_logo, away_logo, kickoff_at, status), competitions(name)",
      )
      .eq("pick_date", today)
      .in("competition_id", competitionIds);

    const rows = (data ?? []) as unknown as {
      game_id: string;
      payload: Insight;
      games: {
        home_team: string;
        away_team: string;
        home_logo: string | null;
        away_logo: string | null;
        kickoff_at: string;
        status: string;
      } | null;
      competitions: { name: string } | null;
    }[];

    const now = Date.now();
    const usable = rows
      // A pick whose match has kicked off is no longer advice.
      .filter((row) => row.games && row.games.status === "scheduled")
      .filter((row) => Date.parse(row.games!.kickoff_at) > now)
      .sort((a, b) => Date.parse(a.games!.kickoff_at) - Date.parse(b.games!.kickoff_at));

    const chosen = usable[0];
    if (!chosen?.games) return null;

    return {
      gameId: chosen.game_id,
      homeTeam: translateTeam(chosen.games.home_team),
      awayTeam: translateTeam(chosen.games.away_team),
      homeLogo: chosen.games.home_logo,
      awayLogo: chosen.games.away_logo,
      kickoffAt: chosen.games.kickoff_at,
      competitionName: chosen.competitions?.name ?? "—",
      insight: chosen.payload,
    };
  } catch {
    return null;
  }
}

export type LandingAdvisorCard = {
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  competitionName: string;
  insight: Insight;
};

/**
 * The card an anonymous visitor sees.
 *
 * Through `landing_advisor_card()` rather than the table, for the same reason
 * the fixture strip goes through `landing_fixtures()`: the policies on
 * `advisor_daily_pick`, `games` and `competitions` admit `authenticated` only,
 * and the function is the narrow opening that lets `anon` see this one shape
 * without widening any of them.
 */
export async function getLandingAdvisorCard(): Promise<LandingAdvisorCard | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("landing_advisor_card");
    if (error) return null;

    // `payload` is jsonb, so the generated type is `Json`. It was written by
    // insightSchema on the way in and is re-read here, not re-validated: the
    // only writer is the cron, and a shape check on every dashboard render
    // would be paying for a guarantee we already have.
    const row = (data ?? [])[0] as unknown as
      | {
          home_team: string;
          away_team: string;
          home_logo: string | null;
          away_logo: string | null;
          competition_name: string;
          payload: Insight;
        }
      | undefined;

    if (!row) return null;

    return {
      homeTeam: translateTeam(row.home_team),
      awayTeam: translateTeam(row.away_team),
      homeLogo: row.home_logo,
      awayLogo: row.away_logo,
      competitionName: row.competition_name,
      insight: row.payload,
    };
  } catch {
    return null;
  }
}
