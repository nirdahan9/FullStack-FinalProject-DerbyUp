"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { featuredGameSchema, prizesSchema } from "@/lib/validation/schemas";
import { actionError, type ActionResult } from "./types";

const ADMIN_ERRORS: Record<string, string> = {
  NOT_LEAGUE_ADMIN: "רק מנהל הליגה יכול לעשות זאת",
  ALREADY_SETTLED: "המשחק כבר יושב",
  GAME_NOT_STARTED: "לא ניתן להזין תוצאה למשחק שטרם התחיל",
  INVALID_SCORE: "התוצאה שהוזנה אינה תקינה",
  NOT_AUTHENTICATED: "יש להתחבר תחילה",
};

function adminError(message: string): string {
  const key = Object.keys(ADMIN_ERRORS).find((k) => message.includes(k));
  return key ? ADMIN_ERRORS[key] : "אירעה שגיאה. נסה שוב";
}

/**
 * Confirms the caller runs this league.
 *
 * The RLS update policy already restricts writes to the creator, so this does
 * not add protection — it turns a silently empty result into a message the
 * admin can act on.
 */
async function assertAdmin(leagueId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "יש להתחבר תחילה" as const };

  const { data: league } = await supabase
    .from("leagues")
    .select("creator_id, is_public, competition_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (!league || league.is_public || league.creator_id !== user.id) {
    return { supabase, error: "רק מנהל הליגה יכול לעשות זאת" as const };
  }
  return { supabase, league, error: null };
}

export async function updatePrizes(
  input: { leagueId: string; prizes: { place: number; prize: string }[]; note?: string },
): Promise<ActionResult> {
  const parsed = prizesSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "קלט לא תקין");
  }

  const { supabase, error } = await assertAdmin(parsed.data.leagueId);
  if (error) return actionError(error);

  const { error: dbError } = await supabase
    .from("leagues")
    .update({
      prizes: parsed.data.prizes,
      prize_note: parsed.data.note?.trim() || null,
    })
    .eq("id", parsed.data.leagueId);

  if (dbError) return actionError("אירעה שגיאה. נסה שוב");

  revalidatePath(`/leagues/${parsed.data.leagueId}`);
  return { ok: true, data: undefined };
}

export async function setFeaturedGame(
  input: { leagueId: string; gameId: string | null; bonusPct: number },
): Promise<ActionResult> {
  // Clearing the featured game is a valid action, so the schema only applies
  // when one is being set.
  if (input.gameId !== null) {
    const parsed = featuredGameSchema.safeParse(input);
    if (!parsed.success) {
      return actionError(parsed.error.issues[0]?.message ?? "קלט לא תקין");
    }
  }

  const { supabase, league, error } = await assertAdmin(input.leagueId);
  if (error) return actionError(error);

  // A featured game from another tournament would pay a bonus on a fixture the
  // league does not even count.
  if (input.gameId) {
    const { data: game } = await supabase
      .from("games")
      .select("competition_id")
      .eq("id", input.gameId)
      .maybeSingle();

    if (!game || game.competition_id !== league!.competition_id) {
      return actionError("המשחק אינו שייך לטורניר של הליגה");
    }
  }

  const { error: dbError } = await supabase
    .from("leagues")
    .update({
      featured_game_id: input.gameId,
      featured_bonus_pct: input.gameId ? input.bonusPct : 0,
    })
    .eq("id", input.leagueId);

  if (dbError) return actionError("אירעה שגיאה. נסה שוב");

  revalidatePath(`/leagues/${input.leagueId}`);
  revalidatePath("/games");
  return { ok: true, data: undefined };
}

export async function settleGameManually(
  input: { leagueId: string; gameId: string; scoreHome: number; scoreAway: number },
): Promise<ActionResult> {
  const supabase = await createClient();

  // Ownership, timing and score range are all enforced inside the function:
  // this writes to tables no user may write to, so the checks sit next to the
  // write rather than in the caller.
  const { error } = await supabase.rpc("settle_game_manually", {
    p_league_id: input.leagueId,
    p_game_id: input.gameId,
    p_score_home: input.scoreHome,
    p_score_away: input.scoreAway,
  });

  if (error) return actionError(adminError(error.message));

  revalidatePath(`/leagues/${input.leagueId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true, data: undefined };
}
