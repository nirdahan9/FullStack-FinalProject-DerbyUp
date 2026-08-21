import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFixtures, fetchOdds } from "@/lib/football-api/client";
import { buildQuestions, DEFAULT_ODDS } from "@/lib/football-api/mapping";
import { COMPETITIONS } from "@/lib/football-api/types";

/**
 * How far ahead odds are fetched, and therefore how far ahead a fixture can
 * be predicted.
 *
 * Fixtures themselves are pulled for the whole season, so a league shows its
 * full calendar. Odds are a different matter: bookmakers do not price a match
 * three months out, so asking for them would spend requests on empty
 * responses — and a prediction made against invented default odds would
 * freeze a number that was never a real price.
 */
const ODDS_WINDOW_DAYS = 14;

export type SyncReport = {
  competitions: number;
  fixtures: number;
  questions: number;
  oddsFetched: number;
  defaultsUsed: number;
  apiCalls: number;
  errors: string[];
};

/**
 * Pulls the full season for every competition, prices the fixtures inside the
 * odds window, and writes the three questions for each of those.
 *
 * Runs once a day rather than per request. Users never trigger an upstream
 * call, so the cost is fixed no matter how many people are playing — roughly
 * thirty requests a day against a 75,000 allowance.
 *
 * An earlier version priced only competitions that already had an active
 * league, to save calls. That saved nothing worth having and introduced a
 * gap: a league created today would have no questions until tomorrow's run,
 * so its members could not predict anything on day one. Every competition is
 * priced regardless.
 */
export async function syncFixtures(now = new Date()): Promise<SyncReport> {
  const supabase = createAdminClient();
  const report: SyncReport = {
    competitions: 0,
    fixtures: 0,
    questions: 0,
    oddsFetched: 0,
    defaultsUsed: 0,
    apiCalls: 0,
    errors: [],
  };

  const season = now.getUTCFullYear();
  const oddsUntil = new Date(now.getTime() + ODDS_WINDOW_DAYS * 86_400_000);

  for (const competition of COMPETITIONS) {
    try {
      // Whole season, one request.
      const fixtures = await fetchFixtures(competition.id, season);
      report.apiCalls += 1;
      report.competitions += 1;
      if (!fixtures.length) continue;

      const { data: games, error } = await supabase
        .from("games")
        .upsert(
          fixtures.map((f) => ({
            fixture_id: f.fixtureId,
            competition_id: f.competitionId,
            home_team: f.homeTeam,
            away_team: f.awayTeam,
            home_logo: f.homeLogo,
            away_logo: f.awayLogo,
            kickoff_at: f.kickoffAt,
            status: f.status,
            score_home: f.scoreHome,
            score_away: f.scoreAway,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "fixture_id" },
        )
        .select("id, fixture_id, home_team, away_team");

      if (error) {
        report.errors.push(`${competition.name}: ${error.message}`);
        continue;
      }
      report.fixtures += games?.length ?? 0;

      // Odds are queried per date, so only dates that actually have fixtures
      // inside the pricing window are requested.
      const pricedFixtures = fixtures.filter((f) => {
        const kickoff = new Date(f.kickoffAt);
        return kickoff >= now && kickoff <= oddsUntil;
      });
      const dates = [...new Set(pricedFixtures.map((f) => f.kickoffAt.slice(0, 10)))];
      const oddsByFixture = new Map<number, Awaited<ReturnType<typeof fetchOdds>> extends Map<number, infer V> ? V : never>();

      for (const date of dates) {
        const priced = await fetchOdds(competition.id, season, date);
        report.apiCalls += 1;
        report.oddsFetched += priced.size;
        for (const [id, value] of priced) oddsByFixture.set(id, value);
      }

      // Every fixture gets questions, so the whole season is predictable.
      // Those without a real price carry defaults and are marked provisional;
      // settlement scores them at the price on the day instead.
      type Row = {
        game_id: string;
        type: string;
        outcomes: ReturnType<typeof buildQuestions>[number]["outcomes"];
        odds_provisional: boolean;
      };
      const priced: Row[] = [];
      const provisional: Row[] = [];

      for (const game of games ?? []) {
        const quote = oddsByFixture.get(game.fixture_id);
        const isPriced = Boolean(quote?.complete);
        if (!isPriced) report.defaultsUsed += 1;

        const questions = buildQuestions(
          quote?.odds ?? DEFAULT_ODDS,
          { home: game.home_team, away: game.away_team },
        );

        for (const q of questions) {
          (isPriced ? priced : provisional).push({
            game_id: game.id,
            type: q.type,
            outcomes: q.outcomes,
            odds_provisional: !isPriced,
          });
        }
      }

      // Real prices overwrite whatever is there, so a fixture that has just
      // been priced stops being provisional.
      if (priced.length) {
        const { error: e } = await supabase
          .from("questions")
          .upsert(priced, { onConflict: "game_id,type" });
        if (e) report.errors.push(`${competition.name} questions: ${e.message}`);
        else report.questions += priced.length;
      }

      // Placeholders are only inserted where nothing exists yet. Upserting them
      // would overwrite a real price with a default on the next run.
      if (provisional.length) {
        const { error: e } = await supabase
          .from("questions")
          .upsert(provisional, { onConflict: "game_id,type", ignoreDuplicates: true });
        if (e) report.errors.push(`${competition.name} placeholders: ${e.message}`);
        else report.questions += provisional.length;
      }
    } catch (error) {
      // One competition failing must not abandon the rest — a bad response for
      // Ligue 1 should not cost us the Premier League.
      report.errors.push(
        `${competition.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return report;
}
