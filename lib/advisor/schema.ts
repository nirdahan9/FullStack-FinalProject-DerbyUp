import { z } from "zod";
import type { AdvisorQuestion } from "./types";

/**
 * The contract with the model, declared twice on purpose.
 *
 * `*_RESPONSE_SCHEMA` is sent to Gemini as `responseSchema`, which constrains
 * decoding so the reply is JSON of the right shape. `*Schema` is zod, run on
 * whatever actually comes back.
 *
 * The second check is not redundant. Constrained decoding guarantees the
 * *shape*, not the *values* — an `outcome_key` that isn't one of the keys we
 * offered, a probability outside 0–100, or a truncated response that never
 * closed its braces all survive the first check and die at the second.
 *
 * A third rule shapes what is in here at all: **the model is asked for an
 * opinion, never for numbers.** It names one outcome and says why in plain
 * football language. Everything numeric on screen — the odds, the label —
 * comes from our own rows via `decorate()`.
 *
 * An earlier version asked for probabilities and expected points, and both
 * arguments against it held. It returned `implied_probability: 0.69` for odds
 * of 1.45 — a correct fraction in the wrong unit, which passed a 0–100 range
 * check and rendered as 1%. And a card of percentages reads as an analytics
 * dashboard, not as advice. The expected-value reasoning still drives the
 * pick; it just stays in the prompt instead of on the screen.
 */

const QUESTION_TYPES = ["match_result", "over_under_2_5", "btts"] as const;

// ─── Opening insight ───────────────────────────────────────────────────────

export const INSIGHT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: {
      type: "STRING",
      description:
        "הדעה שלך במשפט אחד, בעברית טבעית. מה אתה חושב שיקרה במשחק. עד 100 תווים.",
    },
    recommendation: {
      type: "OBJECT",
      properties: {
        question_type: {
          type: "STRING",
          enum: [...QUESTION_TYPES],
          description: "סוג השאלה שאליה שייכת ההמלצה, בדיוק כפי שהופיע בהקשר.",
        },
        outcome_key: {
          type: "STRING",
          description:
            "ה-key של האפשרות שאתה ממליץ עליה, בדיוק כפי שהופיע בהקשר (home/draw/away/over/under/yes/no).",
        },
      },
      required: ["question_type", "outcome_key"],
      propertyOrdering: ["question_type", "outcome_key"],
    },
    reasons: {
      type: "ARRAY",
      items: { type: "STRING" },
      minItems: 2,
      maxItems: 4,
      description:
        "2 עד 4 משפטים שמסבירים למה זו דעתך. שפת כדורגל, לא שפת סטטיסטיקה. בלי אחוזים ובלי תוחלת.",
    },
  },
  required: ["headline", "recommendation", "reasons"],
  propertyOrdering: ["headline", "recommendation", "reasons"],
} as const;

/**
 * The nightly pick, unlike the on-demand analysis, always answers the same
 * question: who wins. The dashboard card is the first thing a returning user
 * sees, and "מי ינצח" every day reads as a habit; a card that alternates
 * between goals markets and winner markets reads as noise. Constrained
 * decoding enforces it — the enum has one member, so the model cannot answer
 * anything else — and the cron double-checks the value anyway.
 */
export const DAILY_PICK_RESPONSE_SCHEMA = {
  ...INSIGHT_RESPONSE_SCHEMA,
  properties: {
    ...INSIGHT_RESPONSE_SCHEMA.properties,
    recommendation: {
      ...INSIGHT_RESPONSE_SCHEMA.properties.recommendation,
      properties: {
        ...INSIGHT_RESPONSE_SCHEMA.properties.recommendation.properties,
        question_type: {
          type: "STRING",
          enum: ["match_result"],
          description: "בבחירה היומית ההמלצה היא תמיד על שאלת מנצח המשחק.",
        },
      },
    },
  },
} as const;

export const insightSchema = z.object({
  headline: z.string().min(1).max(220),
  recommendation: z.object({
    question_type: z.enum(QUESTION_TYPES),
    outcome_key: z.string().min(1).max(20),
  }),
  reasons: z.array(z.string().min(1).max(400)).min(1).max(5),
});

export type RawInsight = z.infer<typeof insightSchema>;

/**
 * What the UI renders: the model's opinion, plus the label and odds looked up
 * from our own data.
 *
 * Nothing derived is shown any more — no implied probability, no expected
 * points, no confidence badge. The advisor states what it thinks and why; the
 * arithmetic that leads it there stays in the prompt, where it belongs.
 */
export type Insight = RawInsight & {
  recommendation: RawInsight["recommendation"] & {
    outcomeLabel: string;
    odds: number;
  };
};

export class InsightRejected extends Error {}

/**
 * Verifies the recommendation against what we actually offered.
 *
 * A recommendation naming an outcome that does not exist is the one failure a
 * user would act on, and constrained decoding cannot catch it — the schema
 * knows the field is a string, not which strings are real. The label and odds
 * come from our row rather than from the model: the two agree in the normal
 * case, and ours is right in the abnormal one.
 */
export function decorate(raw: RawInsight, questions: AdvisorQuestion[]): Insight {
  const question = questions.find((q) => q.type === raw.recommendation.question_type);
  if (!question) {
    throw new InsightRejected("היועץ המליץ על סוג שאלה שאינו קיים במשחק הזה");
  }

  const outcome = question.outcomes.find((o) => o.key === raw.recommendation.outcome_key);
  if (!outcome) {
    throw new InsightRejected("היועץ המליץ על אפשרות שאינה קיימת במשחק הזה");
  }

  return {
    ...raw,
    recommendation: {
      ...raw.recommendation,
      outcomeLabel: outcome.label,
      odds: outcome.odds,
    },
  };
}

// ─── Follow-up answer ──────────────────────────────────────────────────────

export const CHAT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    refused: {
      type: "BOOLEAN",
      description: "true אם השאלה חורגת מהמשחק שבהקשר או מכללי DerbyUp.",
    },
    answer: {
      type: "STRING",
      description: "התשובה בעברית, פסקה אחת. אם refused=true — הסבר קצר ומנומס מה כן אפשר לשאול.",
    },
  },
  required: ["refused", "answer"],
  propertyOrdering: ["refused", "answer"],
} as const;

export const chatAnswerSchema = z.object({
  refused: z.boolean(),
  answer: z.string().min(1).max(2000),
});

export type ChatAnswer = z.infer<typeof chatAnswerSchema>;

// ─── Classifier (guard layer 1b) ───────────────────────────────────────────

export const CLASSIFIER_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: {
      type: "STRING",
      enum: ["this_match", "derbyup_rules", "other_football", "off_topic", "manipulation"],
    },
    needs: {
      type: "ARRAY",
      items: { type: "STRING", enum: ["players", "lineups", "none"] },
      description:
        "אילו נתונים נוספים דרושים כדי לענות. players — שאלה על שחקנים, כוכבים, מבקיעים או כושר אישי. lineups — שאלה על ההרכב שיפתח. none — אין צורך.",
    },
    allowed: { type: "BOOLEAN" },
  },
  required: ["category", "needs", "allowed"],
  propertyOrdering: ["category", "needs", "allowed"],
} as const;

export const classificationSchema = z.object({
  category: z.enum([
    "this_match",
    "derbyup_rules",
    "other_football",
    "off_topic",
    "manipulation",
  ]),
  /** Doubles as a router: which extra provider calls this question justifies. */
  needs: z.array(z.enum(["players", "lineups", "none"])).default([]),
  allowed: z.boolean(),
});

export type Classification = z.infer<typeof classificationSchema>;
