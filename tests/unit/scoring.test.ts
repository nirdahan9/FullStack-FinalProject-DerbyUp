import { describe, expect, it } from "vitest";
import { pointsForCorrectPrediction, round2 } from "@/lib/domain/scoring";

/** docs/04-test-spec.md §2.1 — the most important function in the system. */
describe("pointsForCorrectPrediction", () => {
  it.each([
    ["ניחוש נכון, בלי בונוס", 7.15, 0, 7.15],
    ["יחס נמוך", 1.2, 0, 1.2],
    ["יחס מינימלי", 1.0, 0, 1.0],
    ["בחירת עורך 50%", 7.15, 50, 10.73],
    ["בחירת עורך 100%", 2.0, 100, 4.0],
    ["עיגול לשתי ספרות", 3.333, 0, 3.33],
    ["עיגול עם בונוס", 2.15, 33, 2.86],
  ])("%s: %f @ %i%% → %f", (_label, odds, bonus, expected) => {
    expect(pointsForCorrectPrediction(odds, bonus)).toBe(expected);
  });

  it("defaults to no bonus", () => {
    expect(pointsForCorrectPrediction(3.4)).toBe(3.4);
  });

  it("never returns more precision than the numeric(10,2) column holds", () => {
    const result = pointsForCorrectPrediction(1.777, 17);
    expect(result).toBe(round2(result));
    expect(String(result).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("rounds the .005 boundary up rather than down", () => {
    // 7.15 * 1.5 is 10.724999… in binary floating point. Rounding that
    // naively yields 10.72 and underpays every bonus by a cent.
    expect(pointsForCorrectPrediction(7.15, 50)).toBe(10.73);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});
