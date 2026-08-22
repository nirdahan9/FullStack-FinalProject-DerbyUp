import { describe, expect, it } from "vitest";
import {
  EXACT_SCORE_MULTIPLIER,
  exactScoreMultiplier,
  formatExactScore,
  isExactScoreHit,
  parseExactScore,
  validateExactScore,
} from "@/lib/domain/exact-score";
import { settlePrediction } from "@/lib/domain/settlement";
import { pointsForCorrectPrediction, round2 } from "@/lib/domain/scoring";

/**
 * The exact-score bonus.
 *
 * The rule in one line: a correct winner call, plus the right score, is worth
 * three times the odds — and getting the score wrong costs nothing. Most of
 * what is asserted below is that second half, because it is the part a scoring
 * bug would silently break.
 */
describe("תוצאה מדויקת — פרסור וולידציה", () => {
  it("פורמט תקין מתפרסר", () => {
    expect(parseExactScore("2-1")).toEqual({ home: 2, away: 1 });
    expect(parseExactScore("0-0")).toEqual({ home: 0, away: 0 });
    expect(parseExactScore("9-9")).toEqual({ home: 9, away: 9 });
  });

  const INVALID: [string | null | undefined, string][] = [
    ["", "ריק"],
    [null, "null"],
    [undefined, "undefined"],
    ["2:1", "נקודתיים במקום מקף"],
    ["2-", "חסר צד"],
    ["-1", "חסר צד"],
    ["12-1", "יותר מספרה"],
    ["2 - 1", "רווחים"],
    ["a-b", "אותיות"],
  ];
  it.each(INVALID)("פורמט לא תקין נדחה: %s (%s)", (value) => {
    expect(parseExactScore(value)).toBeNull();
  });

  it("`formatExactScore` מייצר את מה ש-`parseExactScore` קורא", () => {
    for (let h = 0; h <= 9; h++) {
      for (let a = 0; a <= 9; a++) {
        expect(parseExactScore(formatExactScore(h, a))).toEqual({ home: h, away: a });
      }
    }
  });

  it.each([
    ["home", "2-1", null],
    ["home", "1-0", null],
    ["home", "0-1", "HOME_MUST_LEAD"],
    ["home", "1-1", "NOT_A_DRAW"],
    ["away", "1-2", null],
    ["away", "2-1", "AWAY_MUST_LEAD"],
    ["away", "1-1", "NOT_A_DRAW"],
    ["draw", "1-1", null],
    ["draw", "0-0", null],
    ["draw", "2-1", "DRAW_NEEDS_EQUAL"],
  ])("בחירה %s עם תוצאה %s", (outcome, score, expected) => {
    expect(validateExactScore(score, outcome)).toBe(expected);
  });

  it("שוק שאינו מנצחת נדחה — תוצאה מדויקת שייכת רק לו", () => {
    expect(validateExactScore("2-1", "over")).toBe("INVALID_FORMAT");
    expect(validateExactScore("2-1", "yes")).toBe("INVALID_FORMAT");
  });
});

describe("תוצאה מדויקת — פגיעה", () => {
  it("פגיעה מדויקת", () => {
    expect(isExactScoreHit("2-1", 2, 1)).toBe(true);
  });

  const MISSES: [string | null, number | null, number | null, string][] = [
    ["2-1", 1, 2, "התוצאה ההפוכה"],
    ["2-1", 2, 0, "מנצחת נכונה, תוצאה שגויה"],
    ["2-1", 3, 1, "שער אחד יותר"],
    [null, 2, 1, "לא נוחשה תוצאה"],
    ["2-1", null, 1, "אין תוצאה למשחק"],
    ["2-1", 2, null, "אין תוצאה למשחק"],
  ];
  it.each(MISSES)("לא פגיעה: %s מול %s-%s (%s)", (score, home, away) => {
    expect(isExactScoreHit(score, home, away)).toBe(false);
  });

  it("מכפיל 3 רק כשהניחוש נכון וגם התוצאה", () => {
    expect(exactScoreMultiplier(true, "2-1", 2, 1)).toBe(EXACT_SCORE_MULTIPLIER);
    expect(exactScoreMultiplier(true, "2-1", 3, 1)).toBe(1);
    expect(exactScoreMultiplier(true, null, 2, 1)).toBe(1);
    // The gate that matters: a losing call cannot be rescued by the score.
    expect(exactScoreMultiplier(false, "2-1", 2, 1)).toBe(1);
  });
});

describe("תוצאה מדויקת — עיבוד", () => {
  const winner = { selectedOutcome: "home", odds: 2.1 };

  it("מנצחת נכונה + תוצאה מדויקת = פי 3", () => {
    const result = settlePrediction({ ...winner, exactScore: "2-1" }, "home", {
      home: 2,
      away: 1,
    });
    expect(result).toEqual({ status: "correct", pointsEarned: 6.3 });
  });

  it("מנצחת נכונה + תוצאה שגויה = הניקוד הרגיל, בלי עונש", () => {
    const result = settlePrediction({ ...winner, exactScore: "2-1" }, "home", {
      home: 3,
      away: 0,
    });
    expect(result).toEqual({ status: "correct", pointsEarned: 2.1 });
  });

  it("בלי תוצאה מדויקת — כלום לא משתנה", () => {
    expect(settlePrediction(winner, "home", { home: 2, away: 1 })).toEqual({
      status: "correct",
      pointsEarned: 2.1,
    });
    expect(settlePrediction(winner, "home")).toEqual({
      status: "correct",
      pointsEarned: 2.1,
    });
  });

  it("מנצחת שגויה — התוצאה המדויקת לא מצילה", () => {
    const result = settlePrediction({ ...winner, exactScore: "0-1" }, "away", {
      home: 0,
      away: 1,
    });
    expect(result).toEqual({ status: "incorrect", pointsEarned: 0 });
  });

  it("בונוס בחירת העורך והתוצאה המדויקת מוכפלים יחד", () => {
    // 2.10 × 1.5 = 3.15, ×3 = 9.45
    const result = settlePrediction(
      { ...winner, bonusPct: 50, exactScore: "2-1" },
      "home",
      { home: 2, away: 1 },
    );
    expect(result.pointsEarned).toBe(9.45);
  });

  it("מוכפל על הבסיס המעוגל — מה שהוצג למשתמש", () => {
    // 7.15 at a 50% bonus is shown on the tile as 10.73, and 10.73 × 3 is
    // 32.19. Tripling the unrounded 10.724999… would pay 32.18 — a hundredth
    // less than the number the user was promised.
    const result = settlePrediction(
      { selectedOutcome: "home", odds: 7.15, bonusPct: 50, exactScore: "1-0" },
      "home",
      { home: 1, away: 0 },
    );
    expect(result.pointsEarned).toBe(32.19);
    expect(result.pointsEarned).toBe(round2(pointsForCorrectPrediction(7.15, 50) * 3));
  });
});
