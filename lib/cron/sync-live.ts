import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLiveFixtures } from "@/lib/football-api/client";
import { COMPETITIONS } from "@/lib/football-api/types";

/**
 * How far either side of kick-off a fixture is worth polling for.
 *
 * Five minutes before, because a match can start early and nothing else moves
 * a row out of 'scheduled' between the daily fixture syncs. Four hours after,
 * because that is longer than any match plus extra time and penalties — and it
 * bounds the window, so a fixture the provider never reports on cannot keep
 * the schedule awake for the rest of the season.
 */
const KICKOFF_WINDOW_BEFORE_MS = 5 * 60_000;
const KICKOFF_WINDOW_AFTER_MS = 4 * 60 * 60_000;

export type LiveSyncReport = {
  /** Fixtures in the kick-off window — what the schedule's guard also counts. */
  candidates: number;
  fixturesReturned: number;
  gamesUpdated: number;
  /** Updates that moved a score or a status, rather than only the minute. */
  scoreChanges: number;
  apiCalls: number;
  /** True when nothing was in progress, or the kill switch is off. */
  skipped: boolean;
  errors: string[];
};

/**
 * Refreshes the score, minute and status of matches being played right now.
 *
 * Scheduled every minute by pg_cron (20260822230100_schedule_live_sync.sql),
 * which will not even issue the request unless a fixture is in progress or
 * about to kick off — so an ordinary weekday costs nothing.
 *
 * A port of backend/src/jobs/syncLiveTournaments.js from the DerbyUp app, and
 * it keeps that file's one commitment: a display layer that never writes
 * points. It touches four columns on `games` and nothing else. Settlement
 * stays the only thing that awards a point, reads the score from the provider
 * itself rather than from what this wrote, and is unchanged by this feature.
 *
 * It also never creates a fixture. Rows come from the daily sync, which has
 * the odds and builds the questions; a match appearing here that we have no
 * row for would be a match nobody could have predicted on.
 *
 * There is deliberately no final-whistle handling. `live=` returns matches in
 * progress, so a finished one simply stops being returned and its row stays at
 * 'live' with the last score seen. Settlement picks it up within ten minutes,
 * refetches it by id, and writes the real final score. Until then the live
 * layer still counts those predictions — its scope covers a finished-unsettled
 * fixture for exactly this reason — so nothing on screen drops to zero while
 * we wait.
 */
export async function syncLiveScores(now = new Date()): Promise<LiveSyncReport> {
  const report: LiveSyncReport = {
    candidates: 0,
    fixturesReturned: 0,
    gamesUpdated: 0,
    scoreChanges: 0,
    apiCalls: 0,
    skipped: false,
    errors: [],
  };

  // Kill switch, mirroring LIVE_PROJECTION_ENABLED in the DerbyUp app. A
  // feature that polls a paid provider on a schedule should be switchable off
  // from the environment without a deploy.
  if (process.env.LIVE_SCORES_ENABLED === "false") {
    report.skipped = true;
    return report;
  }

  const supabase = createAdminClient();

  // The same guard the pg_cron job runs, repeated here because the endpoint is
  // also reachable from the Vercel daily cron and by hand. Cheap either way:
  // an index probe on (status, kickoff_at).
  const { data: candidates, error: candidateError } = await supabase
    .from("games")
    .select("fixture_id")
    .or(
      [
        "status.eq.live",
        `and(status.eq.scheduled,kickoff_at.gt.${new Date(now.getTime() - KICKOFF_WINDOW_AFTER_MS).toISOString()},kickoff_at.lte.${new Date(now.getTime() + KICKOFF_WINDOW_BEFORE_MS).toISOString()})`,
      ].join(","),
    )
    .limit(100);

  if (candidateError) {
    report.errors.push(`candidates: ${candidateError.message}`);
    return report;
  }

  report.candidates = candidates?.length ?? 0;
  if (!report.candidates) {
    report.skipped = true;
    return report;
  }

  let fixtures;
  try {
    // One request for all seven competitions.
    fixtures = await fetchLiveFixtures(COMPETITIONS.map((c) => c.id));
    report.apiCalls += 1;
  } catch (e) {
    report.errors.push(`api: ${e instanceof Error ? e.message : String(e)}`);
    return report;
  }

  report.fixturesReturned = fixtures.length;
  if (!fixtures.length) return report;

  // Matched on what the provider actually returned rather than on the window
  // above: a match that kicked off outside it is still a match being played,
  // and the row we hold for it should not be left stale because our arithmetic
  // about kick-off times was optimistic.
  const { data: rows, error: rowsError } = await supabase
    .from("games")
    .select("id, fixture_id, status, score_home, score_away, minute")
    .in(
      "fixture_id",
      fixtures.map((f) => f.fixtureId),
    );

  if (rowsError) {
    report.errors.push(`games: ${rowsError.message}`);
    return report;
  }

  const byFixture = new Map((rows ?? []).map((r) => [r.fixture_id, r]));
  const timestamp = new Date().toISOString();

  const writes = fixtures.flatMap((fixture) => {
    const row = byFixture.get(fixture.fixtureId);
    // Not ours, or not synced yet. The daily sync creates it; this one does not.
    if (!row) return [];

    // A settled fixture is finished business. The provider occasionally keeps
    // reporting one as live for a few minutes after the whistle, and letting
    // that write back would move a score that predictions have already been
    // scored against.
    if (row.status === "finished" || row.status === "cancelled") return [];

    const scoreMoved =
      row.score_home !== fixture.scoreHome ||
      row.score_away !== fixture.scoreAway ||
      row.status !== fixture.status;

    // The minute advances every poll, so most runs write only that. It is
    // still a write worth making: "34'" next to the score is the difference
    // between a result and a match you are watching.
    if (!scoreMoved && row.minute === fixture.minute) return [];
    if (scoreMoved) report.scoreChanges += 1;

    return [
      {
        id: row.id,
        status: fixture.status,
        score_home: fixture.scoreHome,
        score_away: fixture.scoreAway,
        minute: fixture.minute,
        live_updated_at: timestamp,
        updated_at: timestamp,
      },
    ];
  });

  // A handful of rows at a time — ten simultaneous matches is a busy Saturday
  // — so an update each is honest. Nothing here sets settled_at or touches
  // predictions.
  const results = await Promise.all(
    writes.map(({ id, ...values }) =>
      supabase.from("games").update(values).eq("id", id),
    ),
  );

  for (const [i, result] of results.entries()) {
    if (result.error) {
      report.errors.push(`${writes[i].id}: ${result.error.message}`);
      continue;
    }
    report.gamesUpdated += 1;
  }

  return report;
}
