/**
 * Layer 1 of the advisor's two-layer guard: pure, deterministic, free.
 *
 * Everything here can be decided without a network call, which is the point —
 * a message that fails one of these checks must never reach a paid model, and
 * every rule below is directly unit-testable.
 *
 * Layer 1b (`classifier.ts`) decides whether an *allowed-looking* question is
 * actually about football. This file only decides whether the input is a
 * well-formed question at all.
 */

export const MIN_QUESTION_LENGTH = 3;
export const MAX_QUESTION_LENGTH = 300;

export type GuardCode =
  | "EMPTY"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "CONTROL_CHARS"
  | "CONTAINS_URL"
  | "INJECTION";

export type GuardVerdict =
  | { ok: true; question: string }
  | { ok: false; code: GuardCode; message: string };

const MESSAGES: Record<GuardCode, string> = {
  EMPTY: "לא הוקלדה שאלה",
  TOO_SHORT: "השאלה קצרה מדי",
  TOO_LONG: `השאלה ארוכה מדי — עד ${MAX_QUESTION_LENGTH} תווים`,
  CONTROL_CHARS: "השאלה מכילה תווים לא חוקיים",
  CONTAINS_URL: "לא ניתן לשלוח קישורים ליועץ",
  INJECTION: "נראה שהשאלה מנסה לשנות את ההוראות של היועץ",
};

/**
 * Attempts to talk to the *system* rather than to the advisor. The list is
 * bilingual because the product is Hebrew but models are steered in English,
 * and an attacker reaches for whichever language works.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|the\s+|your\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+|the\s+|your\s+)?(previous|prior|above)/i,
  /(you\s+are|act\s+as|pretend\s+to\s+be|roleplay\s+as)\s+(now\s+)?(a|an|my)\s/i,
  /\b(system|assistant|developer)\s*:/i,
  /<\s*\/?\s*(system|instructions?|prompt)\s*>/i,
  /(reveal|show|print|repeat|output)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /התעלם\s+מ(כל\s+)?(ה)?(הוראות|הנחיות|כללים)/,
  /(שכח|התעלם)\s+(מ)?(כל\s+)?(מה\s+ש)?(אמרו|נאמר|כתוב)/,
  /(מעכשיו|עכשיו)\s+אתה\s/,
  /(הצג|תראה|תדפיס|חשוף)\s+(לי\s+)?את\s+(ה)?(הוראות|פרומפט|prompt)/,
];

/** Anything that would turn the advisor into a fetcher of someone else's text. */
const URL_PATTERN = /(https?:\/\/|www\.)/i;

/** Tabs and newlines are fine in a typed question; the rest are not. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function fail(code: GuardCode): GuardVerdict {
  return { ok: false, code, message: MESSAGES[code] };
}

export function guardQuestion(raw: unknown): GuardVerdict {
  if (typeof raw !== "string") return fail("EMPTY");

  // Collapse whitespace first: "   \n  " is an empty question, and one padded
  // with a thousand spaces is not a long one.
  const question = raw.replace(/\s+/g, " ").trim();

  if (CONTROL_CHARS.test(raw)) return fail("CONTROL_CHARS");
  if (!question) return fail("EMPTY");
  if (question.length < MIN_QUESTION_LENGTH) return fail("TOO_SHORT");
  if (question.length > MAX_QUESTION_LENGTH) return fail("TOO_LONG");
  if (URL_PATTERN.test(question)) return fail("CONTAINS_URL");
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(question))) {
    return fail("INJECTION");
  }

  return { ok: true, question };
}
