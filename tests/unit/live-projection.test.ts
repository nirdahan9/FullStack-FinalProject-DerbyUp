import { describe, expect, it } from "vitest";
import {
  projectPrediction,
  sumLiveByUser,
  type LiveRow,
} from "@/lib/domain/live-projection";
import { resolveOutcome, settlePrediction } from "@/lib/domain/settlement";
import type { QuestionType } from "@/lib/domain/types";

/** docs/04-test-spec.md §2.7 */
describe("projectPrediction", () => {
  it.each<[QuestionType, string, number, number, boolean]>([
    ["match_result", "home", 1, 0, true],
    ["match_result", "home", 0, 1, false],
    ["match_result", "draw", 0, 0, true],
    ["over_under_2_5", "over", 2, 1, true],
    ["over_under_2_5", "over", 1, 1, false],
    ["btts", "yes", 1, 1, true],
    ["btts", "yes", 2, 0, false],
  ])("%s / %s at %i-%i → winning: %s", (type, outcome, home, away, winning) => {
    const result = projectPrediction(
      { selectedOutcome: outcome, odds: 2.5 },
      type,
      { home, away },
    );

    expect(result.winningNow).toBe(winning);
    expect(result.points).toBe(winning ? 2.5 : 0);
  });

  it("scores nothing at 0-0 for a side that has not scored", () => {
    // The state every match starts in, and the one most often on screen.
    const result = projectPrediction(
      { selectedOutcome: "home", odds: 3.1 },
      "match_result",
      { home: 0, away: 0 },
    );
    expect(result).toEqual({ points: 0, winningNow: false });
  });

  it("triples when the score on the board is the score that was called", () => {
    const result = projectPrediction(
      { selectedOutcome: "home", odds: 2.0, exactScore: "2-1" },
      "match_result",
      { home: 2, away: 1 },
    );
    expect(result.points).toBe(6);
  });

  it("drops the triple the moment the score moves past it", () => {
    // The point of showing this live: it is a number that can be taken away.
    // 2-1 with the exact call is worth 6; the equaliser leaves nothing at all.
    const called = { selectedOutcome: "home", odds: 2.0, exactScore: "2-1" };

    expect(projectPrediction(called, "match_result", { home: 2, away: 1 }).points).toBe(6);
    expect(projectPrediction(called, "match_result", { home: 2, away: 2 }).points).toBe(0);
  });

  it("still pays the plain odds when the winner is right and the score is not", () => {
    const result = projectPrediction(
      { selectedOutcome: "home", odds: 2.0, exactScore: "2-1" },
      "match_result",
      { home: 3, away: 1 },
    );
    expect(result.points).toBe(2);
  });

  it("applies the featured-game bonus", () => {
    const result = projectPrediction(
      { selectedOutcome: "home", odds: 2.0, bonusPct: 50 },
      "match_result",
      { home: 1, away: 0 },
    );
    expect(result.points).toBe(3);
  });

  it("prices a provisional prediction from the question, not from its placeholder", () => {
    const result = projectPrediction(
      { selectedOutcome: "home", odds: 2.5, currentOdds: 7.15, oddsProvisional: true },
      "match_result",
      { home: 1, away: 0 },
    );
    expect(result.points).toBe(7.15);
  });

  it("keeps the frozen price for a prediction that was not provisional", () => {
    const result = projectPrediction(
      { selectedOutcome: "home", odds: 2.5, currentOdds: 7.15, oddsProvisional: false },
      "match_result",
      { home: 1, away: 0 },
    );
    expect(result.points).toBe(2.5);
  });

  it("falls back to the frozen price when the question never got one", () => {
    const result = projectPrediction(
      { selectedOutcome: "home", odds: 2.5, currentOdds: null, oddsProvisional: true },
      "match_result",
      { home: 1, away: 0 },
    );
    expect(result.points).toBe(2.5);
  });
});

/**
 * The property the whole feature rests on: what the table shows during the
 * match is what settlement credits after it.
 *
 * The two are not compared by reading one implementation against the other —
 * they are the same implementation. This asserts that they have not been
 * allowed to drift apart, which is the failure the DerbyUp app's duplicated
 * payout formula is permanently one edit away from.
 *
 * docs/04-test-spec.md §2.7
 */
describe("the live number does not jump at settlement", () => {
  const TYPES: QuestionType[] = ["match_result", "over_under_2_5", "btts"];
  const OUTCOMES: Record<QuestionType, string[]> = {
    match_result: ["home", "draw", "away"],
    over_under_2_5: ["over", "under"],
    btts: ["yes", "no"],
  };

  const cases = TYPES.flatMap((type) =>
    OUTCOMES[type].flatMap((outcome) =>
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 2],
      ].flatMap(([home, away]) =>
        [
          { odds: 2.1, bonusPct: 0, exactScore: null },
          { odds: 7.15, bonusPct: 50, exactScore: null },
          { odds: 2.0, bonusPct: 0, exactScore: "2-1" },
          { odds: 3.33, bonusPct: 25, exactScore: "1-1" },
        ].map((prediction) => ({ type, outcome, home, away, ...prediction })),
      ),
    ),
  );

  // One test rather than one per combination: this is a single property, and
  // reporting it as a hundred and forty-four passing tests would overstate
  // what has been checked. The label carries the case that failed.
  it(`holds for all ${cases.length} combinations of type, pick, score and price`, () => {
    for (const { type, outcome, home, away, odds, bonusPct, exactScore } of cases) {
      const prediction = { selectedOutcome: outcome, odds, bonusPct, exactScore };
      const where = `${type}/${outcome} at ${home}-${away}, odds ${odds}, bonus ${bonusPct}%, called ${exactScore}`;

      const live = projectPrediction(prediction, type, { home, away });
      const settled = settlePrediction(
        prediction,
        resolveOutcome(type, home, away),
        { home, away },
      );

      expect(live.points, where).toBe(settled.pointsEarned);
      expect(live.winningNow, where).toBe(settled.status === "correct");
    }
  });
});

/** docs/04-test-spec.md §2.7 */
describe("sumLiveByUser", () => {
  const row = (over: Partial<LiveRow>): LiveRow => ({
    userId: "u1",
    questionType: "match_result",
    selectedOutcome: "home",
    odds: 2.1,
    scoreHome: 1,
    scoreAway: 0,
    ...over,
  });

  it("adds every winning prediction a member has running", () => {
    const totals = sumLiveByUser([
      row({}),
      row({ odds: 3.4, selectedOutcome: "home" }),
    ]);
    expect(totals.get("u1")).toBe(5.5);
  });

  it("keeps each member separate", () => {
    const totals = sumLiveByUser([
      row({ userId: "u1" }),
      row({ userId: "u2", odds: 4.0 }),
    ]);
    expect(totals.get("u1")).toBe(2.1);
    expect(totals.get("u2")).toBe(4);
  });

  it("leaves a member with nothing winning out of the map entirely", () => {
    // Not present at zero: the caller adds this to a settled total, and an
    // absent member and a member at zero must produce the same table.
    const totals = sumLiveByUser([row({ selectedOutcome: "away" })]);
    expect(totals.has("u1")).toBe(false);
  });

  it("returns an empty map for no rows", () => {
    expect(sumLiveByUser([]).size).toBe(0);
  });

  it("rounds the running total rather than letting float error show", () => {
    // Three at 7.15 is 21.450000000000003 in binary floating point, and a
    // table is not the place to explain that.
    const totals = sumLiveByUser([
      row({ odds: 7.15 }),
      row({ odds: 7.15 }),
      row({ odds: 7.15 }),
    ]);
    expect(totals.get("u1")).toBe(21.45);
  });

  it("sums across question types", () => {
    const totals = sumLiveByUser([
      row({ questionType: "match_result", selectedOutcome: "home", odds: 2.1 }),
      row({ questionType: "btts", selectedOutcome: "no", odds: 1.95 }),
    ]);
    // 1-0: home wins, and only one side has scored.
    expect(totals.get("u1")).toBe(4.05);
  });
});
