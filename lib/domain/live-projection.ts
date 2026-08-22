import { round2 } from "./scoring";
import { effectiveOdds, resolveOutcome, settlePrediction } from "./settlement";
import type { QuestionType } from "./types";

/**
 * What a prediction is earning right now, with the match still being played.
 *
 * The whole file is a thin shell over settlement, and that is the point. The
 * DerbyUp app computes the same thing in
 * backend/src/services/projectedStandings.js, where `projectedBet()` rebuilds
 * the payout by hand and carries a comment promising it "משכפל ב-100% את
 * נוסחת ה-payout" — it reproduces the payout formula exactly. A promise like
 * that is a maintenance debt: the two copies agree until someone changes one.
 *
 * Here there is nothing to keep in step. `resolveOutcome` and
 * `settlePrediction` are the functions settlement itself calls, given the
 * score as it stands instead of the final one. If the scoring rule changes,
 * the live number changes with it, in the same commit, or neither does.
 *
 * Nothing here writes. A projection is a number on a screen that can go down
 * again — an equaliser in the 88th minute takes it away — and it becomes real
 * only when settlement runs against the final score.
 */

export type LivePrediction = {
  selectedOutcome: string;
  odds: number;
  currentOdds?: number | null;
  oddsProvisional?: boolean;
  bonusPct?: number;
  exactScore?: string | null;
};

export type LiveProjection = {
  /** Points this prediction would be credited if the match ended right now. */
  points: number;
  /** Whether it is currently on the winning side of the question. */
  winningNow: boolean;
};

export function projectPrediction(
  prediction: LivePrediction,
  questionType: QuestionType,
  score: { home: number; away: number },
): LiveProjection {
  const correct = resolveOutcome(questionType, score.home, score.away);

  const result = settlePrediction(
    {
      selectedOutcome: prediction.selectedOutcome,
      odds: effectiveOdds(prediction),
      bonusPct: prediction.bonusPct,
      exactScore: prediction.exactScore,
    },
    correct,
    { home: score.home, away: score.away },
  );

  return {
    points: result.pointsEarned,
    winningNow: result.status === "correct",
  };
}

export type LiveRow = LivePrediction & {
  userId: string;
  questionType: QuestionType;
  scoreHome: number;
  scoreAway: number;
};

/**
 * Per-user totals of everything in progress, for the league table.
 *
 * A member with nothing running is absent from the map rather than present at
 * zero: the caller adds this to a settled total, and "no live points" and
 * "live points of zero" produce the same table either way.
 *
 * Summed with round2 because the parts are already rounded to two decimals and
 * adding binary floats drifts off that grid — three predictions at 7.15 come
 * to 21.450000000000003, which would render as a number nobody was promised.
 */
export function sumLiveByUser(rows: readonly LiveRow[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const { points } = projectPrediction(row, row.questionType, {
      home: row.scoreHome,
      away: row.scoreAway,
    });
    if (points === 0) continue;
    totals.set(row.userId, round2((totals.get(row.userId) ?? 0) + points));
  }

  return totals;
}
