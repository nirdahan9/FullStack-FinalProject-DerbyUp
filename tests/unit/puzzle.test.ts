import { describe, expect, it } from "vitest";
import {
  checkAnswer,
  MAX_ATTEMPTS,
  normalizeName,
  pointsForAttempt,
  PUZZLE_POINTS,
} from "@/lib/domain/puzzle";

const VALID = ["Mesut Özil", "Ashley Cole"];

/** docs/04-test-spec.md §2.6 */
describe("checkAnswer", () => {
  it("accepts an exact match", () => {
    expect(checkAnswer("Ashley Cole", VALID)).toBe(true);
  });

  it("ignores case", () => {
    expect(checkAnswer("ASHLEY COLE", VALID)).toBe(true);
    expect(checkAnswer("ashley cole", VALID)).toBe(true);
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(checkAnswer("  Ashley   Cole  ", VALID)).toBe(true);
  });

  it("accepts a name typed without its accents", () => {
    // Nobody on a Hebrew keyboard can type Özil. Requiring it would make the
    // puzzle unwinnable rather than difficult.
    expect(checkAnswer("Mesut Ozil", VALID)).toBe(true);
    expect(checkAnswer("mesut ozil", VALID)).toBe(true);
  });

  it("accepts the accented spelling too", () => {
    expect(checkAnswer("Mesut Özil", VALID)).toBe(true);
  });

  it("rejects a wrong name", () => {
    expect(checkAnswer("Lionel Messi", VALID)).toBe(false);
  });

  it("rejects an empty answer", () => {
    expect(checkAnswer("", VALID)).toBe(false);
    expect(checkAnswer("   ", VALID)).toBe(false);
  });

  it("rejects against an empty answer set", () => {
    expect(checkAnswer("Anyone", [])).toBe(false);
  });

  it("treats apostrophes and hyphens as separators", () => {
    expect(checkAnswer("N Golo Kante", ["N'Golo Kanté"])).toBe(true);
    expect(checkAnswer("Alexander Arnold", ["Alexander-Arnold"])).toBe(true);
  });
});

describe("normalizeName", () => {
  it.each([
    ["Özil", "ozil"],
    ["Håland", "haland"],
    ["  MESSI  ", "messi"],
    ["de Bruyne", "de bruyne"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});

describe("pointsForAttempt", () => {
  it.each([
    [1, 5],
    [2, 3],
    [3, 1],
  ])("attempt %i is worth %i", (attempt, expected) => {
    expect(pointsForAttempt(attempt)).toBe(expected);
  });

  it("awards nothing beyond the last attempt", () => {
    expect(pointsForAttempt(MAX_ATTEMPTS + 1)).toBe(0);
    expect(pointsForAttempt(0)).toBe(0);
    expect(pointsForAttempt(-1)).toBe(0);
  });

  it("keeps the reward on the same scale as a good prediction", () => {
    // A solved puzzle should be worth about one strong result, not ten.
    // Odds sit roughly between 1.2 and 10, so 5 is a good match.
    expect(PUZZLE_POINTS[0]).toBeLessThanOrEqual(10);
    expect(PUZZLE_POINTS).toEqual([...PUZZLE_POINTS].sort((a, b) => b - a));
  });
});
