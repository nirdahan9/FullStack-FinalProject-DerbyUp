import { exactScoreMultiplier } from "./exact-score";
import { pointsForCorrectPrediction, round2 } from "./scoring";
import type { PredictionStatus, QuestionType } from "./types";

/**
 * The correct answer for a question, given a final score.
 *
 * Returns an outcome key rather than a label. The DerbyUp app matched on the
 * displayed team name and had to fall back through Hebrew translations to do
 * it (backend/src/services/betResolution.js); keys make that whole class of
 * mismatch impossible.
 */
export function resolveOutcome(
  type: QuestionType,
  scoreHome: number,
  scoreAway: number,
): string {
  switch (type) {
    case "match_result":
      if (scoreHome > scoreAway) return "home";
      if (scoreHome < scoreAway) return "away";
      return "draw";
    case "over_under_2_5":
      // The .5 line exists so a draw on goals is impossible.
      return scoreHome + scoreAway > 2.5 ? "over" : "under";
    case "btts":
      return scoreHome > 0 && scoreAway > 0 ? "yes" : "no";
  }
}

export type SettlementResult = {
  status: Extract<PredictionStatus, "correct" | "incorrect">;
  pointsEarned: number;
};

/**
 * Settle one prediction against the correct outcome.
 *
 * `odds` and `bonusPct` must be the values stored on the prediction when it
 * was made. Reading them from the question at settlement time would let odds
 * that moved after kickoff change what a user scored.
 *
 * `exactScore` is the optional call that came with a winner prediction. It can
 * only multiply a win — a missed score costs nothing, which is the whole point
 * of offering it. The final score is passed separately because the prediction
 * never stores it.
 */
export function settlePrediction(
  prediction: {
    selectedOutcome: string;
    odds: number;
    bonusPct?: number;
    exactScore?: string | null;
  },
  correctOutcome: string,
  finalScore?: { home: number | null; away: number | null },
): SettlementResult {
  const isCorrect = prediction.selectedOutcome === correctOutcome;
  if (!isCorrect) return { status: "incorrect", pointsEarned: 0 };

  const base = pointsForCorrectPrediction(prediction.odds, prediction.bonusPct ?? 0);
  const multiplier = exactScoreMultiplier(
    true,
    prediction.exactScore,
    finalScore?.home ?? null,
    finalScore?.away ?? null,
  );

  // The base is rounded before it is multiplied, deliberately. It is the
  // number the user was shown on the tile — 7.15 at a 50% bonus reads as
  // 10.73 — and tripling what they were shown is the answer they expect.
  // Multiplying the unrounded 10.724999… would pay 32.18 against a promised
  // 32.19, and being a hundredth short of the advertised figure is worse than
  // being a hundredth generous. The DerbyUp app rounds in the same order.
  return {
    status: "correct",
    pointsEarned: multiplier === 1 ? base : round2(base * multiplier),
  };
}

/**
 * A postponed or cancelled fixture voids its predictions: no points either
 * way. The user is neither rewarded nor punished for something outside the
 * game.
 */
export function voidPrediction(): { status: "void"; pointsEarned: 0 } {
  return { status: "void", pointsEarned: 0 };
}
