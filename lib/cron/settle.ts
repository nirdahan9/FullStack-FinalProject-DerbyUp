import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFixturesByIds } from "@/lib/football-api/client";
import { effectiveOdds, resolveOutcome, settlePrediction } from "@/lib/domain/settlement";
import { awardAchievements } from "@/lib/achievements/award";
import { translateTeam } from "@/lib/i18n/teams";
import type { QuestionType } from "@/lib/domain/types";

/**
 * How far back to look for fixtures still awaiting a result. Wide enough that
 * a postponed match or a failed run is picked up later rather than stranded.
 */
const LOOKBACK_DAYS = 3;

export type SettleReport = {
  gamesChecked: number;
  gamesSettled: number;
  predictionsSettled: number;
  voided: number;
  notifications: number;
  achievements: number;
  apiCalls: number;
  errors: string[];
};

/**
 * Settles finished fixtures.
 *
 * Scheduled every ten minutes by pg_cron inside Supabase, because Vercel's
 * Hobby plan caps cron at once a day and a match finishing on Saturday should
 * not leave a league table stale until Sunday. The DerbyUp backend settles
 * every five minutes for the same reason, which it can do as a long-running
 * Node process. vercel.json keeps a daily run as a fallback; this function is
 * idempotent, so both firing is harmless.
 *
 * Everything is read in bulk and written in bulk. The obvious shape — loop the
 * predictions, query per row — is the N+1 the scale document calls out: a
 * weekend round with a few hundred predictions would become a few hundred
 * round trips inside a function with a timeout.
 */
export async function settleFinishedGames(now = new Date()): Promise<SettleReport> {
  const supabase = createAdminClient();
  const report: SettleReport = {
    gamesChecked: 0,
    gamesSettled: 0,
    predictionsSettled: 0,
    voided: 0,
    notifications: 0,
    achievements: 0,
    apiCalls: 0,
    errors: [],
  };

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

  // Kicked off, not settled yet. `settled_at is null` is what makes a repeat
  // run harmless: a fixture already processed is simply not selected again.
  const { data: pending, error } = await supabase
    .from("games")
    .select("id, fixture_id, home_team, away_team, status, score_home, score_away")
    .is("settled_at", null)
    .lt("kickoff_at", now.toISOString())
    .gt("kickoff_at", since.toISOString())
    .limit(100);

  if (error) {
    report.errors.push(`games: ${error.message}`);
    return report;
  }
  if (!pending?.length) return report;

  report.gamesChecked = pending.length;

  let fixtures;
  try {
    fixtures = await fetchFixturesByIds(pending.map((g) => g.fixture_id));
    report.apiCalls += 1;
  } catch (e) {
    report.errors.push(`api: ${e instanceof Error ? e.message : String(e)}`);
    return report;
  }

  const byFixture = new Map(fixtures.map((f) => [f.fixtureId, f]));
  const touchedUsers = new Set<string>();

  for (const game of pending) {
    // Prefer the provider's view; fall back to whatever is already on the row.
    // That fallback is the manual settlement path from the technical design:
    // an admin fixes a score by hand and the next run settles against it.
    const live = byFixture.get(game.fixture_id) ?? {
      status: game.status,
      scoreHome: game.score_home,
      scoreAway: game.score_away,
    };

    const isFinished = live.status === "finished";
    const isAbandoned = live.status === "cancelled" || live.status === "postponed";

    // A fixture that is finished but has no score is left alone rather than
    // settled as 0-0. It stays pending and the next run picks it up.
    if (isFinished && (live.scoreHome === null || live.scoreAway === null)) {
      report.errors.push(`${game.fixture_id}: finished without a score`);
      continue;
    }
    if (!isFinished && !isAbandoned) continue;

    try {
      const settled = isAbandoned
        ? await voidGame(supabase, game, report)
        : await settleGame(supabase, game, live.scoreHome!, live.scoreAway!, report);

      settled.forEach((u) => touchedUsers.add(u));
      report.gamesSettled += 1;

      await supabase
        .from("games")
        .update({
          status: isAbandoned ? live.status : "finished",
          score_home: live.scoreHome,
          score_away: live.scoreAway,
          // The last minute the live sync saw. Nothing renders it once the
          // fixture is settled, but leaving "55'" on a finished match is
          // residue that would eventually be read as fact by something.
          minute: null,
          settled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", game.id);
    } catch (e) {
      // One fixture failing must not abandon the rest of the round.
      report.errors.push(
        `${game.fixture_id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (touchedUsers.size) {
    await refreshUserTotals(supabase, [...touchedUsers], report);
  }

  return report;
}

type Client = ReturnType<typeof createAdminClient>;
type Game = { id: string; home_team: string; away_team: string };

/** Marks every pending prediction on an abandoned fixture as void, worth nothing. */
async function voidGame(supabase: Client, game: Game, report: SettleReport) {
  const { data: questions } = await supabase
    .from("questions")
    .select("id")
    .eq("game_id", game.id);

  const ids = (questions ?? []).map((q) => q.id);
  if (!ids.length) return [];

  const { data: voided } = await supabase
    .from("predictions")
    .update({ status: "void", points_earned: 0, settled_at: new Date().toISOString() })
    .in("question_id", ids)
    .eq("status", "pending")
    .select("user_id");

  report.voided += voided?.length ?? 0;
  return (voided ?? []).map((p) => p.user_id);
}

async function settleGame(
  supabase: Client,
  game: Game,
  scoreHome: number,
  scoreAway: number,
  report: SettleReport,
): Promise<string[]> {
  const { data: questions } = await supabase
    .from("questions")
    .select("id, type, outcomes")
    .eq("game_id", game.id);

  if (!questions?.length) return [];

  // Prices as they stand at settlement. A prediction made before the fixture
  // was priced is scored from these rather than from the placeholder it froze,
  // so predicting early is never worth more than predicting late.
  const priceByQuestion = new Map(
    questions.map((q) => [
      q.id,
      new Map(
        (q.outcomes as unknown as { key: string; odds: number }[]).map((o) => [
          o.key,
          Number(o.odds),
        ]),
      ),
    ]),
  );

  const correctByQuestion = new Map(
    questions.map((q) => [q.id, resolveOutcome(q.type as QuestionType, scoreHome, scoreAway)]),
  );

  const now = new Date().toISOString();

  // A plain update per question. An upsert would have to supply `outcomes`,
  // which is NOT NULL — the earlier attempt passed undefined to skip it and
  // silently wrote nothing, leaving correct_outcome null and every prediction
  // scored against it wrong. Three rows per fixture; a loop is honest here.
  await Promise.all(
    questions.map((q) =>
      supabase
        .from("questions")
        .update({ correct_outcome: correctByQuestion.get(q.id)!, resolved_at: now })
        .eq("id", q.id),
    ),
  );

  const { data: predictions } = await supabase
    .from("predictions")
    .select("id, user_id, selected_outcome, odds, bonus_pct, question_id, odds_provisional, exact_score")
    .in("question_id", [...correctByQuestion.keys()])
    .eq("status", "pending");

  if (!predictions?.length) return [];

  const label = `${translateTeam(game.home_team)} — ${translateTeam(game.away_team)}`;
  const users = new Set<string>();
  const notifications: {
    user_id: string;
    type: "prediction_settled";
    title: string;
    body: string;
    link_url: string;
  }[] = [];

  // Each row carries its own outcome, so they cannot be written in one
  // statement — but they are computed first and sent as a batch of updates
  // rather than a query per prediction.
  const updates = predictions.map((p) => {
    const odds = effectiveOdds({
      odds: Number(p.odds),
      currentOdds: priceByQuestion.get(p.question_id)?.get(p.selected_outcome) ?? null,
      oddsProvisional: p.odds_provisional,
    });

    const result = settlePrediction(
      {
        selectedOutcome: p.selected_outcome,
        odds,
        bonusPct: p.bonus_pct,
        exactScore: p.exact_score,
      },
      correctByQuestion.get(p.question_id)!,
      { home: scoreHome, away: scoreAway },
    );
    users.add(p.user_id);
    return { id: p.id, ...result, odds };
  });

  await Promise.all(
    updates.map((u) =>
      supabase
        .from("predictions")
        // The odds are written back too, so the history shows what a
        // provisional prediction was actually scored at.
        .update({
          status: u.status,
          points_earned: u.pointsEarned,
          odds: u.odds,
          odds_provisional: false,
          settled_at: now,
        })
        .eq("id", u.id),
    ),
  );
  report.predictionsSettled += updates.length;

  // One notification per user per fixture, not per question: three separate
  // messages about the same match would be noise.
  const byUser = new Map<string, { correct: number; points: number }>();
  for (const [i, u] of updates.entries()) {
    const userId = predictions[i].user_id;
    const acc = byUser.get(userId) ?? { correct: 0, points: 0 };
    if (u.status === "correct") acc.correct += 1;
    acc.points += u.pointsEarned;
    byUser.set(userId, acc);
  }

  for (const [userId, acc] of byUser) {
    notifications.push({
      user_id: userId,
      type: "prediction_settled",
      title: acc.correct > 0 ? "צדקת! 🎯" : "המשחק הסתיים",
      body:
        acc.correct > 0
          ? `${label} — ${acc.correct} ${acc.correct === 1 ? "פגיעה" : "פגיעות"}, ${Math.round(acc.points * 100) / 100} נקודות`
          : `${label} — לא פגעת הפעם`,
      link_url: `/games/${game.id}`,
    });
  }

  if (notifications.length) {
    await supabase.from("notifications").insert(notifications);
    report.notifications += notifications.length;
  }

  return [...users];
}

/**
 * Recomputes the cached totals on profiles, then awards achievements.
 *
 * The totals are derived from the predictions rather than incremented, so a
 * re-run cannot double-count and a cache that has drifted repairs itself.
 */
async function refreshUserTotals(
  supabase: Client,
  userIds: string[],
  report: SettleReport,
) {
  for (const userId of userIds) {
    const [{ data: preds }, { data: puzzles }] = await Promise.all([
      supabase
        .from("predictions")
        .select("status, points_earned")
        .eq("user_id", userId)
        .in("status", ["correct", "incorrect", "void"]),
      supabase
        .from("puzzle_attempts")
        .select("points_earned")
        .eq("user_id", userId)
        .eq("is_correct", true),
    ]);

    const settled = preds ?? [];
    const correct = settled.filter((p) => p.status === "correct");

    const predictionPoints = correct.reduce((sum, p) => sum + Number(p.points_earned ?? 0), 0);
    const puzzlePoints = (puzzles ?? []).reduce((sum, a) => sum + Number(a.points_earned ?? 0), 0);

    // Recomputed from the rows rather than incremented, so a repeated run
    // cannot double-count and a total that has drifted repairs itself.
    await supabase
      .from("profiles")
      .update({
        total_points: Math.round((predictionPoints + puzzlePoints) * 100) / 100,
        total_predictions: settled.length,
        total_correct: correct.length,
      })
      .eq("id", userId);

    // Achievements live in one shared place: the daily challenge and joining a
    // league award them too, and three copies of this would drift.
    const granted = await awardAchievements(userId);
    report.achievements += granted;
    report.notifications += granted;
  }
}
