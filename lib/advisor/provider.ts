import { estimateCostUsd } from "./pricing";

/**
 * The only place in the codebase that talks to Gemini.
 *
 * Plain `fetch` rather than `@google/genai`: the REST surface we need is one
 * POST, keeping it inline means one less dependency to justify and one less
 * thing to mock in tests, and every field sent is visible right here — which
 * is what the lab's raw-context panel is for.
 */

const BASE_URL =
  process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";

export type Usage = {
  inputTokens: number;
  /** Gemini 3 bills reasoning separately from the visible answer. */
  thoughtTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type GeminiCall = {
  text: string;
  usage: Usage;
  model: string;
  latencyMs: number;
};

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Seconds the provider asked us to wait, when it said so. */
    readonly retryAfterMs?: number,
    /** True for a quota ceiling, which no amount of retrying will clear. */
    readonly quotaExhausted = false,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/**
 * Google answers a 429 with a RetryInfo detail carrying its own delay, e.g.
 * `"retryDelay": "2.95s"`. Honouring it beats guessing: our own backoff of a
 * few hundred milliseconds retried straight back into the same ceiling.
 */
function parseRetryDelay(json: GeminiResponse | null): number | undefined {
  const detail = json?.error?.details?.find((d) => d["@type"]?.endsWith("RetryInfo"));
  const raw = detail?.retryDelay;
  if (!raw) return undefined;
  const seconds = Number.parseFloat(raw.replace(/s$/, ""));
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : undefined;
}

type GeminiPart = { text?: string; thought?: boolean; thoughtSignature?: string };

type GeminiResponse = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
  error?: {
    message?: string;
    status?: string;
    details?: { "@type"?: string; retryDelay?: string }[];
  };
};

export type GenerateArgs = {
  model: string;
  systemInstruction: string;
  prompt: string;
  /** OpenAPI-subset schema. Constrains decoding, so the reply parses. */
  responseSchema: unknown;
  temperature?: number;
  maxOutputTokens?: number;
  /** Gemini 3 reasoning depth. "low" keeps the advisor under a few seconds. */
  thinkingLevel?: "low" | "high";
};

/**
 * Statuses worth trying again.
 *
 * 429 is our own rate, 500/503 are capacity. Gemini reports the last of these
 * as "This model is currently experiencing high demand" — seen once inside the
 * first ten calls of this lab, which is often enough that surfacing it to a
 * user as a failed analysis would be the wrong call.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
/** Ceiling on any single wait, so one call cannot sit out a whole request. */
const MAX_BACKOFF_MS = 6_000;

function backoffMs(attempt: number, suggested?: number): number {
  // A little padding on the provider's own figure: retrying at the exact
  // instant it named lands back on the boundary often enough to matter.
  if (suggested !== undefined) return Math.min(suggested + 250, MAX_BACKOFF_MS);
  return Math.min(600 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

export async function generateJson(args: GenerateArgs): Promise<GeminiCall> {
  let lastError: GeminiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await attemptGenerate(args);
    } catch (cause) {
      const error = cause instanceof GeminiError ? cause : null;
      // Anything that is not a transient upstream condition is a real answer
      // about this request, and repeating it just costs time.
      if (!error || error.status === undefined || !RETRYABLE.has(error.status)) throw cause;
      // A daily or per-minute ceiling is not a blip. Waiting on it inside a
      // user's request just turns a clear message into a slow one.
      if (error.quotaExhausted) throw error;
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt, error.retryAfterMs)));
      }
    }
  }

  throw lastError ?? new GeminiError("Gemini call failed");
}

async function attemptGenerate({
  model,
  systemInstruction,
  prompt,
  responseSchema,
  temperature = 0.3,
  maxOutputTokens = 2048,
  thinkingLevel,
}: GenerateArgs): Promise<GeminiCall> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set");

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature,
      maxOutputTokens,
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
    },
  };

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      // A hung upstream call must not hold a serverless function open until
      // the platform kills it — the user gets a retry sooner this way.
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new GeminiError(timedOut ? "היועץ לא הספיק להשיב, נסה שוב" : "שגיאת רשת מול Gemini");
  }
  const latencyMs = Math.round(performance.now() - startedAt);

  const json = (await response.json().catch(() => null)) as GeminiResponse | null;

  if (!response.ok) {
    const retryAfterMs = parseRetryDelay(json);
    const exhausted =
      response.status === 429 && /quota|RESOURCE_EXHAUSTED/i.test(
        `${json?.error?.status ?? ""} ${json?.error?.message ?? ""}`,
      );
    throw new GeminiError(
      exhausted
        ? "נגמרה המכסה של מפתח ה-Gemini. המפתח הנוכחי הוא free tier — 20 בקשות לדקה."
        : (json?.error?.message ?? `Gemini responded ${response.status}`),
      response.status,
      retryAfterMs,
      exhausted,
    );
  }
  if (!json) throw new GeminiError("Gemini returned a body that is not JSON");

  if (json.promptFeedback?.blockReason) {
    throw new GeminiError(`Gemini blocked the prompt: ${json.promptFeedback.blockReason}`);
  }

  const candidate = json.candidates?.[0];
  // MAX_TOKENS means the JSON was cut mid-object. Failing loudly here beats
  // handing zod a truncated string and reporting it as a schema problem.
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new GeminiError("התשובה נקטעה — הגדל את maxOutputTokens");
  }

  // Reasoning arrives as parts flagged `thought`. Only the unflagged text is
  // the answer; concatenating both would feed the model's scratchpad to zod.
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => part.thought !== true && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();

  if (!text) {
    throw new GeminiError(
      `Gemini returned no text (finishReason=${candidate?.finishReason ?? "unknown"})`,
    );
  }

  const meta = json.usageMetadata ?? {};
  const inputTokens = meta.promptTokenCount ?? 0;
  const thoughtTokens = meta.thoughtsTokenCount ?? 0;
  const outputTokens = meta.candidatesTokenCount ?? 0;

  return {
    text,
    model,
    latencyMs,
    usage: {
      inputTokens,
      thoughtTokens,
      outputTokens,
      totalTokens: meta.totalTokenCount ?? inputTokens + thoughtTokens + outputTokens,
      // Thinking tokens bill at the output rate, so they belong on that side
      // of the sum even though the user never sees them.
      costUsd: estimateCostUsd(model, inputTokens, thoughtTokens + outputTokens),
    },
  };
}

/** Sums the per-call usage of a request that made more than one model call. */
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    thoughtTokens: a.thoughtTokens + b.thoughtTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

export const ZERO_USAGE: Usage = {
  inputTokens: 0,
  thoughtTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: 0,
};
