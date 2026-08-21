import { pointsForCorrectPrediction } from "./scoring";
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
 */
export function settlePrediction(
  prediction: { selectedOutcome: string; odds: number; bonusPct?: number },
  correctOutcome: string,
): SettlementResult {
  const isCorrect = prediction.selectedOutcome === correctOutcome;

  return {
    status: isCorrect ? "correct" : "incorrect",
    pointsEarned: isCorrect
      ? pointsForCorrectPrediction(prediction.odds, prediction.bonusPct ?? 0)
      : 0,
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
