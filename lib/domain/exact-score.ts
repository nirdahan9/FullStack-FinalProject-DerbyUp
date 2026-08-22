/**
 * The optional exact-score call that rides along with a winner prediction.
 *
 * Ported from the DerbyUp app, where it works exactly this way
 * (`backend/src/jobs/settleBets.js`):
 *
 *   const exactScoreHit = won && bet.exact_score_prediction &&
 *     bet.exact_score_prediction === `${game.score_home}-${game.score_away}`;
 *   const payoutMultiplier = exactScoreHit ? 3 : 1;
 *
 * Two properties follow from that shape, and both matter:
 *
 *   1. It is a **multiplier on an existing prediction**, not a prediction of
 *      its own. Getting the winner right and the score wrong still scores the
 *      full odds — the exact call can only ever add.
 *   2. `won` is checked first. A score that contradicts the chosen outcome
 *      cannot pay, which is why the form refuses to submit one.
 */

/** What a hit is worth, relative to the plain winner call. */
export const EXACT_SCORE_MULTIPLIER = 3;

/** Highest goal count the picker offers per side, matching the app's drums. */
export const MAX_GOALS = 9;

/** Stored as "home-away", e.g. "2-1" — the format the DerbyUp app uses. */
const FORMAT = /^\d-\d$/;

export type ExactScore = { home: number; away: number };

export function formatExactScore(home: number, away: number): string {
  return `${home}-${away}`;
}

export function parseExactScore(value: string | null | undefined): ExactScore | null {
  if (!value || !FORMAT.test(value)) return null;
  const [home, away] = value.split("-").map(Number);
  if (home > MAX_GOALS || away > MAX_GOALS) return null;
  return { home, away };
}

export type ExactScoreRejection =
  | "INVALID_FORMAT"
  | "DRAW_NEEDS_EQUAL"
  | "HOME_MUST_LEAD"
  | "AWAY_MUST_LEAD"
  | "NOT_A_DRAW";

/**
 * Checks the score against the outcome it accompanies.
 *
 * A user who picks "home" and then enters 1-2 has contradicted themselves, and
 * the settlement rule means such a prediction could never earn the bonus. It
 * is rejected at the door rather than accepted and quietly made worthless —
 * the same five checks the app makes in `getExactScoreError`.
 */
export function validateExactScore(
  value: string,
  selectedOutcome: string,
): ExactScoreRejection | null {
  const parsed = parseExactScore(value);
  if (!parsed) return "INVALID_FORMAT";

  const { home, away } = parsed;
  switch (selectedOutcome) {
    case "draw":
      return home === away ? null : "DRAW_NEEDS_EQUAL";
    case "home":
      if (home === away) return "NOT_A_DRAW";
      return home > away ? null : "HOME_MUST_LEAD";
    case "away":
      if (home === away) return "NOT_A_DRAW";
      return away > home ? null : "AWAY_MUST_LEAD";
    default:
      // Only the winner market takes an exact score; anything else is a bug
      // upstream rather than bad user input.
      return "INVALID_FORMAT";
  }
}

/** Did the call land? Compared as numbers, so "2-1" and 2-1 cannot disagree. */
export function isExactScoreHit(
  value: string | null | undefined,
  scoreHome: number | null,
  scoreAway: number | null,
): boolean {
  const parsed = parseExactScore(value);
  if (!parsed || scoreHome === null || scoreAway === null) return false;
  return parsed.home === scoreHome && parsed.away === scoreAway;
}

/**
 * The multiplier a settled prediction earns.
 *
 * `isCorrect` gates it: the bonus rides on a winning call and never rescues a
 * losing one. A user who somehow stored 3-0 against an "away" pick and then
 * watched a 3-0 home win gets nothing — they predicted the wrong team.
 */
export function exactScoreMultiplier(
  isCorrect: boolean,
  value: string | null | undefined,
  scoreHome: number | null,
  scoreAway: number | null,
): number {
  return isCorrect && isExactScoreHit(value, scoreHome, scoreAway)
    ? EXACT_SCORE_MULTIPLIER
    : 1;
}
