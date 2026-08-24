import { describe, expect, it } from "vitest";
import { pickMostUncertain } from "@/lib/cron/advisor-pick";
import type { Outcome } from "@/lib/football-api/types";

/**
 * Which match the nightly job spends its one call on.
 *
 * Worth testing precisely because it is arithmetic rather than a model: the
 * whole point of choosing in code is that the choice is predictable, and a
 * quiet bug here would waste every night's budget on the dullest fixture in
 * each competition.
 */

const winner = (home: number, draw: number, away: number): Outcome[] => [
  { key: "home", label: "home", odds: home },
  { key: "draw", label: "draw", odds: draw },
  { key: "away", label: "away", odds: away },
];

const game = (
  id: string,
  competitionId: number,
  outcomes: Outcome[] | null,
) => ({
  id,
  competition_id: competitionId,
  questions: outcomes ? [{ type: "match_result", outcomes }] : [],
});

describe("pickMostUncertain", () => {
  it("prefers the tightest market over the biggest mismatch", () => {
    const picks = pickMostUncertain([
      game("formality", 39, winner(1.2, 7.0, 15.0)),
      game("real-question", 39, winner(2.4, 3.3, 2.9)),
    ]);

    expect(picks).toHaveLength(1);
    expect(picks[0].gameId).toBe("real-question");
  });

  it("returns exactly one match per competition", () => {
    const picks = pickMostUncertain([
      game("a", 39, winner(2.4, 3.3, 2.9)),
      game("b", 39, winner(1.2, 7.0, 15.0)),
      game("c", 140, winner(1.9, 3.5, 4.2)),
      game("d", 140, winner(1.1, 9.0, 20.0)),
    ]);

    expect(picks).toHaveLength(2);
    expect(picks.map((p) => p.gameId).sort()).toEqual(["a", "c"]);
  });

  it("skips a match with no winner market", () => {
    const picks = pickMostUncertain([game("no-questions", 39, null)]);
    expect(picks).toEqual([]);
  });

  it("skips a market missing a leg", () => {
    // A two-way winner market is a data fault, not a tight match, and treating
    // its small spread as uncertainty would pick it every single night.
    const picks = pickMostUncertain([
      game("incomplete", 39, [
        { key: "home", label: "home", odds: 2.0 },
        { key: "draw", label: "draw", odds: 2.1 },
      ]),
      game("complete", 39, winner(2.4, 3.3, 2.9)),
    ]);

    expect(picks).toHaveLength(1);
    expect(picks[0].gameId).toBe("complete");
  });

  it("ignores a zero price rather than treating it as the shortest", () => {
    const picks = pickMostUncertain([
      game("bad-odds", 39, winner(0, 3.3, 2.9)),
      game("good-odds", 39, winner(2.4, 3.3, 2.9)),
    ]);

    expect(picks).toHaveLength(1);
    expect(picks[0].gameId).toBe("good-odds");
  });

  it("reports the spread it measured", () => {
    const [pick] = pickMostUncertain([game("a", 39, winner(2.4, 3.3, 2.9))]);
    expect(pick.spread).toBeCloseTo(0.9, 5);
  });

  it("returns nothing when there is nothing to pick", () => {
    expect(pickMostUncertain([])).toEqual([]);
  });
});
