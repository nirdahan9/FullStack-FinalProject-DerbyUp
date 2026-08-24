/**
 * USD per million tokens, for the cost readout in the lab.
 *
 * Google publishes these per model and changes them; the numbers below are the
 * public rates as of August 2026 and are an *estimate* in the UI, never a bill.
 * gemini-3.7-flash is on introductory pricing through 31.12.2026 ($0.75 in /
 * $3.75 out); it doubles on 1.1.2027, which is worth remembering before this
 * feature is costed for a real deployment.
 *
 * Anything not listed falls back to the flash rate, which over-reports rather
 * than under-reports for the cheaper models — the safer direction for a number
 * that ends up in a scale document.
 */
type Rate = { inPerM: number; outPerM: number };

const RATES: Record<string, Rate> = {
  "gemini-3.7-flash": { inPerM: 0.75, outPerM: 3.75 },
  "gemini-3.6-flash": { inPerM: 0.5, outPerM: 3.0 },
  "gemini-3.5-flash": { inPerM: 0.3, outPerM: 2.5 },
  "gemini-3.5-flash-lite": { inPerM: 0.1, outPerM: 0.4 },
  "gemini-3.1-flash-lite": { inPerM: 0.1, outPerM: 0.4 },
  "gemini-2.5-flash": { inPerM: 0.3, outPerM: 2.5 },
  "gemini-2.5-flash-lite": { inPerM: 0.1, outPerM: 0.4 },
  "gemini-2.5-pro": { inPerM: 1.25, outPerM: 10.0 },
};

const FALLBACK: Rate = { inPerM: 0.75, outPerM: 3.75 };

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = RATES[model] ?? FALLBACK;
  return (inputTokens / 1_000_000) * rate.inPerM + (outputTokens / 1_000_000) * rate.outPerM;
}

/** Fractions of a cent are the norm here, so the usual 2 decimals show $0.00. */
export function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(5)}`;
  return `$${value.toFixed(4)}`;
}
