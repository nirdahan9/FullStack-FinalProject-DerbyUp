import { createAdminClient } from "@/lib/supabase/admin";
import { newlyEarned, type AchievementStats } from "@/lib/domain/achievements";

/**
 * Grants whatever achievements a user has newly earned, and notifies them.
 *
 * One implementation, three callers. Settlement used to be the only one, which
 * meant a user could solve the daily challenge or join a league and not see the
 * badge until some unrelated prediction happened to settle — sometimes days
 * later, sometimes never. Now the moment that earns a badge is the moment that
 * awards it.
 *
 * Written with the service role because `user_achievements` has no INSERT
 * policy, for the same reason `puzzle_attempts` has none: a user must not be
 * able to hand themselves a badge.
 *
 * Safe to call more than once. Which achievements the user already holds is
 * read first, and the unique index on (user_id, achievement_key) is the
 * backstop if two calls race.
 */
export async function awardAchievements(userId: string): Promise<number> {
  const supabase = createAdminClient();

  const [{ data: preds }, { data: puzzles }, { data: earned }, { data: memberships }] =
    await Promise.all([
      supabase
        .from("predictions")
        .select("status, points_earned, odds, settled_at")
        .eq("user_id", userId)
        .in("status", ["correct", "incorrect", "void"])
        .order("settled_at", { ascending: false }),
      supabase
        .from("puzzle_attempts")
        .select("points_earned, is_correct")
        .eq("user_id", userId)
        .eq("is_correct", true),
      supabase.from("user_achievements").select("achievement_key").eq("user_id", userId),
      supabase
        .from("league_members")
        .select("league_id, leagues(is_public)")
        .eq("user_id", userId),
    ]);

  const held = (earned ?? []).map((a) => a.achievement_key);
  const settled = preds ?? [];
  const correct = settled.filter((p) => p.status === "correct");

  // Streak reads back from the most recent settled prediction and stops at the
  // first miss. Voids are skipped rather than counted as either.
  let streak = 0;
  for (const p of settled) {
    if (p.status === "void") continue;
    if (p.status !== "correct") break;
    streak += 1;
  }

  // Only asked for when it can change the answer: the rank query aggregates
  // every member of every league the user belongs to, and once the badge is
  // held the result is thrown away.
  let bestRank: number | null = null;
  if (!held.includes("league_leader")) {
    const { data } = await supabase.rpc("best_league_rank", { p_user: userId });
    bestRank = data === null || data === undefined ? null : Number(data);
  }

  const stats: AchievementStats = {
    totalPredictions: settled.length,
    totalCorrect: correct.length,
    currentStreak: streak,
    bestOdds: correct.reduce((best, p) => Math.max(best, Number(p.odds)), 0),
    puzzlesSolved: (puzzles ?? []).length,
    // Public leagues everyone is auto-joined to do not count as joining one.
    leaguesJoined: (memberships ?? []).filter((m) => !m.leagues?.is_public).length,
    bestRank,
  };

  const fresh = newlyEarned(stats, held);
  if (!fresh.length) return 0;

  const { error } = await supabase
    .from("user_achievements")
    .insert(fresh.map((a) => ({ user_id: userId, achievement_key: a.key })));

  // A duplicate means a concurrent call won the race and the badge is already
  // granted — nothing to report and nothing to fix.
  if (error) return 0;

  await supabase.from("notifications").insert(
    fresh.map((a) => ({
      user_id: userId,
      type: "achievement" as const,
      title: `הישג חדש: ${a.title}`,
      body: a.description,
      link_url: "/profile",
    })),
  );

  return fresh.length;
}
