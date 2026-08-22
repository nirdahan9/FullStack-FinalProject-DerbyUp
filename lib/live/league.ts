import type { SupabaseClient } from "@supabase/supabase-js";
import { sumLiveByUser, type LiveRow } from "@/lib/domain/live-projection";
import type { QuestionType } from "@/lib/domain/types";
import type { Database } from "@/types/database";

export type LeagueLive = {
  /** Points each member is currently earning. Absent means none. */
  deltas: Map<string, number>;
  /** Whether anything in this league is in progress at all. */
  hasLive: boolean;
};

const EMPTY: LeagueLive = { deltas: new Map(), hasLive: false };

/**
 * The live half of a league table.
 *
 * `league_standings` sums `points_earned`, which stays null until settlement
 * runs — so during a match every member's row is frozen at what they had
 * before kick-off. This supplies the other half: the pending predictions on
 * fixtures in progress, scored against the running score.
 *
 * The caller adds the two and ranks the sum, which is why the DerbyUp app
 * describes the same layer as producing an "effective" total: existing tables
 * sort correctly without knowing the live layer exists. And because the parts
 * are added rather than written, there is no moment where the two disagree —
 * settlement moves a prediction out of `pending` and into `points_earned` in
 * the same statement, so a point leaves this map exactly when it arrives in
 * the other.
 *
 * Failure is silent by design. A live delta is a decoration on a table that is
 * correct without it; taking the league page down because a projection could
 * not be computed would trade something that matters for something that does
 * not.
 */
export async function getLeagueLive(
  supabase: SupabaseClient<Database>,
  leagueId: string,
): Promise<LeagueLive> {
  const { data, error } = await supabase.rpc("league_live_predictions", {
    p_league_id: leagueId,
  });

  if (error || !data?.length) return EMPTY;

  const rows: LiveRow[] = data.map((r) => ({
    userId: r.user_id,
    questionType: r.question_type as QuestionType,
    selectedOutcome: r.selected_outcome,
    // numeric arrives as a string over PostgREST often enough to be worth
    // never trusting: Number() here rather than a cast that would quietly
    // multiply "7.15" and produce NaN points.
    odds: Number(r.odds),
    currentOdds: r.current_odds === null ? null : Number(r.current_odds),
    oddsProvisional: r.odds_provisional,
    bonusPct: Number(r.bonus_pct),
    exactScore: r.exact_score,
    scoreHome: Number(r.score_home),
    scoreAway: Number(r.score_away),
  }));

  // hasLive comes from there being pending predictions at all, not from the
  // deltas: a member losing every call is still watching a live match, and the
  // table should say so.
  return { deltas: sumLiveByUser(rows), hasLive: true };
}
