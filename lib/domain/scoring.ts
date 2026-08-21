/**
 * The one rule the whole product derives from:
 *
 *   a correct prediction awards the odds as points; a wrong one awards zero.
 *
 * Odds of 7.15 are worth 7.15 points. Nothing is staked, so there is no payout
 * to compute, no balance to debit and no loss to record — which is why this
 * file is nine lines rather than a betting engine.
 */

/**
 * Two decimals, matching numeric(10,2) in the database.
 *
 * EPSILON is added before rounding because binary floats land just under the
 * .005 boundary often enough to matter: 7.15 * 1.5 evaluates to 10.724999…,
 * which would round down to 10.72 and quietly underpay every bonus.
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Points for a correct prediction.
 *
 * `bonusPct` comes from the league's featured game and multiplies the odds:
 * 7.15 at a 50% bonus is 10.73. The odds passed in are the ones frozen on the
 * prediction, never the question's current odds — otherwise a late line move
 * would silently rescore a settled match.
 */
export function pointsForCorrectPrediction(odds: number, bonusPct = 0): number {
  return round2(odds * (1 + bonusPct / 100));
}
