import {
  allow,
  deny,
  OUTCOME_KEYS,
  type CancelRejection,
  type GameStatus,
  type PredictionRejection,
  type PredictionStatus,
  type QuestionType,
  type RuleResult,
} from "./types";

/**
 * How long before kickoff a prediction stops being cancellable.
 *
 * The window closes early on purpose. Line-ups, injuries and team news land in
 * the final minutes, and a cancel available until kickoff would be a way to
 * act on that information — a move in the game rather than a correction to a
 * mistake.
 */
export const CANCEL_WINDOW_MINUTES = 10;

export function validatePrediction(ctx: {
  game: { kickoffAt: Date; status: GameStatus; competitionId: number };
  questionType: QuestionType;
  selectedOutcome: string;
  hasExisting: boolean;
  /** Competitions of the leagues the user belongs to. */
  userCompetitions: readonly number[];
  now: Date;
}): RuleResult<PredictionRejection> {
  // Checked before kickoff time so a finished or abandoned match reports why
  // it is closed rather than the generic "already started".
  if (ctx.game.status !== "scheduled") return deny("GAME_NOT_OPEN");

  // Inclusive: at exactly kickoff the match is closed.
  if (ctx.now.getTime() >= ctx.game.kickoffAt.getTime()) {
    return deny("GAME_STARTED");
  }

  if (ctx.hasExisting) return deny("ALREADY_PREDICTED");

  // Ties the product together: you predict because you are in a league for
  // that tournament. Without a league the fixtures are not even listed.
  if (!ctx.userCompetitions.includes(ctx.game.competitionId)) {
    return deny("NO_LEAGUE_FOR_COMPETITION");
  }

  // Zod proves the outcome is a short string; only the domain knows which
  // strings are legal for this question type. Skipping it would let a crafted
  // request store an outcome that can never match, or one that always does.
  const legal: readonly string[] = OUTCOME_KEYS[ctx.questionType];
  if (!legal.includes(ctx.selectedOutcome)) return deny("INVALID_OUTCOME");

  return allow();
}

export function validateCancellation(ctx: {
  prediction: { userId: string; status: PredictionStatus };
  game: { kickoffAt: Date };
  requesterId: string;
  now: Date;
}): RuleResult<CancelRejection> {
  if (ctx.prediction.userId !== ctx.requesterId) return deny("NOT_OWNER");
  if (ctx.prediction.status !== "pending") return deny("ALREADY_SETTLED");

  const cutoff =
    ctx.game.kickoffAt.getTime() - CANCEL_WINDOW_MINUTES * 60 * 1000;

  // Inclusive: exactly ten minutes out is already closed.
  if (ctx.now.getTime() >= cutoff) return deny("CANCEL_WINDOW_CLOSED");

  return allow();
}
