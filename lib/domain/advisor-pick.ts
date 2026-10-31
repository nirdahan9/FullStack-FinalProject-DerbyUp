import type { Outcome } from "@/lib/football-api/types";

/**
 * Choosing which fixture is worth analysing.
 *
 * This lived in lib/cron/advisor-pick.ts, next to the nightly job that used it.
 * The job is gone — the demo has no scheduler and no model to call — but the
 * rule is pure arithmetic over a market, it has its own tests, and it belongs
 * with the other domain rules rather than disappearing with its caller.
 */

export type Candidate = {
  gameId: string;
  competitionId: number;
  spread: number;
};

/**
 * The most interesting match is the least predictable one.
 *
 * Measured as the spread between the shortest and longest price on the winner
 * market: a fixture quoted 1.20 / 7.00 / 15.00 is a formality, and one quoted
 * 2.40 / 3.30 / 2.90 is a real question. That is the fixture worth a card.
 *
 * Deliberately arithmetic rather than a model call — asking the model which
 * match to analyse would double the nightly cost to choose the input to the
 * thing we were going to pay for anyway.
 */
export function pickMostUncertain(
  games: { id: string; competition_id: number; questions: { type: string; outcomes: Outcome[] }[] }[],
): Candidate[] {
  const byCompetition = new Map<number, Candidate>();

  for (const game of games) {
    const winner = game.questions?.find((q) => q.type === "match_result");
    const odds = (winner?.outcomes ?? []).map((o) => Number(o.odds)).filter((n) => n > 0);
    // A market with a leg missing is not one we can compare.
    if (odds.length < 3) continue;

    const spread = Math.max(...odds) - Math.min(...odds);
    const current = byCompetition.get(game.competition_id);
    if (!current || spread < current.spread) {
      byCompetition.set(game.competition_id, {
        gameId: game.id,
        competitionId: game.competition_id,
        spread,
      });
    }
  }

  return [...byCompetition.values()];
}
