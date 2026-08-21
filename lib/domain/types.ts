/**
 * Domain vocabulary. These types describe the game, not the database rows —
 * everything here is plain data so the rules can be tested without a client,
 * a network, or a schema.
 */

export type QuestionType = "match_result" | "over_under_2_5" | "btts";

export type PredictionStatus =
  | "pending"
  | "correct"
  | "incorrect"
  | "void"
  | "cancelled";

export type GameStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

/** Stable keys, never display labels — a label is language-dependent. */
export const OUTCOME_KEYS = {
  match_result: ["home", "draw", "away"],
  over_under_2_5: ["over", "under"],
  btts: ["yes", "no"],
} as const satisfies Record<QuestionType, readonly string[]>;

export type PredictionRejection =
  | "GAME_STARTED"
  | "GAME_NOT_OPEN"
  | "ALREADY_PREDICTED"
  | "NO_LEAGUE_FOR_COMPETITION"
  | "INVALID_OUTCOME";

export type CancelRejection =
  | "NOT_OWNER"
  | "ALREADY_SETTLED"
  | "CANCEL_WINDOW_CLOSED";

export type RuleResult<R extends string> =
  | { ok: true }
  | { ok: false; reason: R };

export const allow = (): { ok: true } => ({ ok: true });
export const deny = <R extends string>(reason: R): { ok: false; reason: R } => ({
  ok: false,
  reason,
});
