import { describe, expect, it } from "vitest";
import {
  resolveOutcome,
  settlePrediction,
  voidPrediction,
} from "@/lib/domain/settlement";
import type { QuestionType } from "@/lib/domain/types";

/** docs/04-test-spec.md §2.2 */
describe("resolveOutcome", () => {
  it.each<[QuestionType, number, number, string]>([
    ["match_result", 2, 1, "home"],
    ["match_result", 0, 3, "away"],
    ["match_result", 1, 1, "draw"],
    ["over_under_2_5", 2, 1, "over"],
    ["over_under_2_5", 1, 1, "under"],
    ["over_under_2_5", 0, 0, "under"],
    ["btts", 2, 1, "yes"],
    ["btts", 3, 0, "no"],
    ["btts", 0, 0, "no"],
  ])("%s %i-%i → %s", (type, home, away, expected) => {
    expect(resolveOutcome(type, home, away)).toBe(expected);
  });

  it("treats exactly three goals as over, not a push", () => {
    // The line is 2.5 precisely so a total can never tie it.
    expect(resolveOutcome("over_under_2_5", 3, 0)).toBe("over");
    expect(resolveOutcome("over_under_2_5", 2, 0)).toBe("under");
  });
});

/** docs/04-test-spec.md §2.3 */
describe("settlePrediction", () => {
  it("awards the odds when the prediction is right", () => {
    const result = settlePrediction(
      { selectedOutcome: "home", odds: 7.15 },
      "home",
    );
    expect(result).toEqual({ status: "correct", pointsEarned: 7.15 });
  });

  it("awards zero when it is wrong", () => {
    const result = settlePrediction(
      { selectedOutcome: "away", odds: 7.15 },
      "home",
    );
    expect(result).toEqual({ status: "incorrect", pointsEarned: 0 });
  });

  it("applies the featured-game bonus", () => {
    const result = settlePrediction(
      { selectedOutcome: "home", odds: 2.0, bonusPct: 50 },
      "home",
    );
    expect(result.pointsEarned).toBe(3);
  });

  it("scores from the frozen odds, not from odds that moved later", () => {
    // The prediction carries the odds it was made at. If settlement read the
    // question's current odds instead, a line move after kickoff would
    // rewrite what somebody already scored.
    const frozen = settlePrediction(
      { selectedOutcome: "home", odds: 3.0 },
      "home",
    );
    const drifted = settlePrediction(
      { selectedOutcome: "home", odds: 9.0 },
      "home",
    );
    expect(frozen.pointsEarned).toBe(3);
    expect(drifted.pointsEarned).toBe(9);
  });

  it("voids without rewarding or punishing", () => {
    expect(voidPrediction()).toEqual({ status: "void", pointsEarned: 0 });
  });
});
