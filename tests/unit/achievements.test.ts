import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  newlyEarned,
  type AchievementStats,
} from "@/lib/domain/achievements";

const stats = (over: Partial<AchievementStats> = {}): AchievementStats => ({
  totalPredictions: 0,
  totalCorrect: 0,
  currentStreak: 0,
  bestOdds: 0,
  puzzlesSolved: 0,
  leaguesJoined: 0,
  bestRank: null,
  ...over,
});

const keys = (s: AchievementStats, earned: string[] = []) =>
  newlyEarned(s, earned).map((a) => a.key);

/** docs/04-test-spec.md §2.5 */
describe("newlyEarned", () => {
  it("awards nothing to a brand-new account", () => {
    expect(keys(stats())).toEqual([]);
  });

  it("awards the first prediction", () => {
    expect(keys(stats({ totalPredictions: 1 }))).toContain("first_prediction");
  });

  it("withholds ten_predictions at nine", () => {
    expect(keys(stats({ totalPredictions: 9 }))).not.toContain("ten_predictions");
  });

  it("awards ten_predictions at ten", () => {
    expect(keys(stats({ totalPredictions: 10 }))).toContain("ten_predictions");
  });

  it("never awards the same achievement twice", () => {
    const s = stats({ totalPredictions: 10 });
    expect(keys(s, ["first_prediction", "ten_predictions"])).toEqual([]);
  });

  it("awards a three-correct streak", () => {
    expect(keys(stats({ currentStreak: 3 }))).toContain("streak_three");
  });

  it("withholds it once the streak breaks", () => {
    expect(keys(stats({ currentStreak: 0, totalCorrect: 9 }))).not.toContain(
      "streak_three",
    );
  });

  it("awards underdog at odds of exactly 5.0", () => {
    expect(keys(stats({ bestOdds: 5 }))).toContain("underdog");
  });

  it("withholds underdog at 4.99", () => {
    expect(keys(stats({ bestOdds: 4.99 }))).not.toContain("underdog");
  });

  it("awards league_leader only for first place", () => {
    expect(keys(stats({ bestRank: 1 }))).toContain("league_leader");
    expect(keys(stats({ bestRank: 2 }))).not.toContain("league_leader");
  });

  it("awards several at once when they are all met", () => {
    const earned = keys(
      stats({ totalPredictions: 10, totalCorrect: 4, currentStreak: 3, bestOdds: 6 }),
    );
    expect(earned).toEqual(
      expect.arrayContaining([
        "first_prediction",
        "ten_predictions",
        "first_correct",
        "streak_three",
        "underdog",
      ]),
    );
  });

  it("has unique keys", () => {
    const all = ACHIEVEMENTS.map((a) => a.key);
    expect(new Set(all).size).toBe(all.length);
  });

  it("gives every achievement a title and description", () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });
});
