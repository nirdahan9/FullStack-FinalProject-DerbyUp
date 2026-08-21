import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFixtures, fetchOdds } from "@/lib/football-api/client";
import { buildQuestions } from "@/lib/football-api/mapping";
import { COMPETITIONS } from "@/lib/football-api/types";

/** How far ahead fixtures are pulled. */
const WINDOW_DAYS = 7;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

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
 * Pulls the next week of fixtures for every competition, prices them, and
 * writes the three questions per match.
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

  const from = isoDate(now);
  const to = isoDate(new Date(now.getTime() + WINDOW_DAYS * 86_400_000));
  const season = now.getUTCFullYear();

  for (const competition of COMPETITIONS) {
    try {
      const fixtures = await fetchFixtures(competition.id, season, from, to);
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

      // Odds are queried per date, so only the dates that actually have
      // fixtures are requested.
      const dates = [...new Set(fixtures.map((f) => f.kickoffAt.slice(0, 10)))];
      const oddsByFixture = new Map<number, Awaited<ReturnType<typeof fetchOdds>> extends Map<number, infer V> ? V : never>();

      for (const date of dates) {
        const priced = await fetchOdds(competition.id, season, date);
        report.apiCalls += 1;
        report.oddsFetched += priced.size;
        for (const [id, value] of priced) oddsByFixture.set(id, value);
      }

      const rows = (games ?? []).flatMap((game) => {
        const priced = oddsByFixture.get(game.fixture_id);
        if (!priced?.complete) report.defaultsUsed += 1;

        const questions = buildQuestions(
          priced?.odds ?? {
            home: 2.5, draw: 3.2, away: 2.8,
            over: 1.9, under: 1.9, yes: 1.85, no: 1.95,
          },
          { home: game.home_team, away: game.away_team },
        );

        return questions.map((q) => ({
          game_id: game.id,
          type: q.type,
          outcomes: q.outcomes,
        }));
      });

      if (rows.length) {
        // onConflict on (game_id, type) so a re-run refreshes prices for
        // fixtures that have not started, and never creates duplicates.
        const { error: qError } = await supabase
          .from("questions")
          .upsert(rows, { onConflict: "game_id,type" });

        if (qError) report.errors.push(`${competition.name} questions: ${qError.message}`);
        else report.questions += rows.length;
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
