import { describe, expect, it } from "vitest";
import {
  chatAnswerSchema,
  classificationSchema,
  decorate,
  insightSchema,
  InsightRejected,
  type RawInsight,
} from "@/lib/advisor/schema";
import type { AdvisorQuestion } from "@/lib/advisor/types";

/**
 * Layer 2 of the guard: what the model returns, checked against what we asked
 * for and against what actually exists.
 *
 * Gemini's `responseSchema` constrains decoding, so the *shape* is close to
 * guaranteed. These tests are about the two things it cannot guarantee — that
 * the values are sane, and that the outcome named is one this match offers.
 */

const questions: AdvisorQuestion[] = [
  {
    type: "match_result",
    outcomes: [
      { key: "home", label: "בולוניה", odds: 2.2 },
      { key: "draw", label: "תיקו", odds: 3.4 },
      { key: "away", label: "לאציו", odds: 3.1 },
    ],
  },
  {
    type: "btts",
    outcomes: [
      { key: "yes", label: "כן", odds: 1.57 },
      { key: "no", label: "לא", odds: 2.3 },
    ],
  },
];

const raw = (over: Partial<RawInsight> = {}): RawInsight => ({
  headline: "בולוניה בבית חזקה מספיק",
  recommendation: { question_type: "match_result", outcome_key: "home" },
  reasons: ["הכושר הביתי שלה טוב", "לאציו במשבר"],
  ...over,
});

describe("insightSchema", () => {
  it("accepts a well-formed analysis", () => {
    expect(insightSchema.safeParse(raw()).success).toBe(true);
  });

  it.each([
    ["an unknown question type", { recommendation: { question_type: "corners", outcome_key: "over" } }],
    ["an empty headline", { headline: "" }],
    ["no reasons at all", { reasons: [] }],
    ["more reasons than we would ever render", { reasons: Array(9).fill("a") }],
  ])("rejects %s", (_label, over) => {
    expect(insightSchema.safeParse({ ...raw(), ...over }).success).toBe(false);
  });

  it("rejects a truncated response", () => {
    // What a cut-off generation actually looks like once JSON.parse succeeds
    // on the fragment: fields simply missing.
    expect(insightSchema.safeParse({ headline: "בולוניה" }).success).toBe(false);
  });
});

describe("decorate", () => {
  it("fills the label and odds from our own row", () => {
    const insight = decorate(raw(), questions);
    expect(insight.recommendation.outcomeLabel).toBe("בולוניה");
    expect(insight.recommendation.odds).toBe(2.2);
  });

  it("carries the opinion through untouched", () => {
    const insight = decorate(raw(), questions);
    expect(insight.headline).toBe("בולוניה בבית חזקה מספיק");
    expect(insight.reasons).toHaveLength(2);
  });

  it("resolves an outcome on a non-winner market", () => {
    const insight = decorate(
      raw({ recommendation: { question_type: "btts", outcome_key: "yes" } }),
      questions,
    );
    expect(insight.recommendation.odds).toBe(1.57);
    expect(insight.recommendation.outcomeLabel).toBe("כן");
  });

  it("refuses an outcome this match does not offer", () => {
    // The failure that matters: a plausible-looking recommendation a user
    // would act on, naming a bet that does not exist. Constrained decoding
    // cannot catch it — the schema knows the field is a string, not which
    // strings are real.
    expect(() =>
      decorate(raw({ recommendation: { question_type: "match_result", outcome_key: "over" } }), questions),
    ).toThrow(InsightRejected);
  });

  it("refuses a question type this match does not have", () => {
    expect(() =>
      decorate(
        raw({ recommendation: { question_type: "over_under_2_5", outcome_key: "over" } }),
        questions,
      ),
    ).toThrow(InsightRejected);
  });

  it("prefers our label over anything the model might have invented", () => {
    // The model is not asked for a label at all any more, but the guarantee is
    // worth pinning: what a user reads comes from our row.
    const insight = decorate(raw(), questions);
    expect(insight.recommendation.outcomeLabel).toBe(questions[0].outcomes[0].label);
  });
});

describe("chatAnswerSchema", () => {
  it("accepts an answer and a refusal alike", () => {
    expect(chatAnswerSchema.safeParse({ refused: false, answer: "כי הכושר שלה טוב" }).success).toBe(true);
    expect(chatAnswerSchema.safeParse({ refused: true, answer: "אני עונה רק על המשחק" }).success).toBe(true);
  });

  it("rejects an empty answer", () => {
    expect(chatAnswerSchema.safeParse({ refused: false, answer: "" }).success).toBe(false);
  });
});

describe("classificationSchema", () => {
  it("defaults `needs` when the model omits it", () => {
    const parsed = classificationSchema.safeParse({ category: "this_match", allowed: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.needs).toEqual([]);
  });

  it("rejects a category outside the enum", () => {
    expect(
      classificationSchema.safeParse({ category: "sports_betting", allowed: true, needs: [] }).success,
    ).toBe(false);
  });
});
