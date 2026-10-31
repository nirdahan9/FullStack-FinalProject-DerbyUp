/**
 * Static demo: this was a Server Action.
 *
 * `"use server"` is gone because a static export has no server to run it on,
 * and the revalidate calls are gone with it - nothing is written, so there is
 * nothing to invalidate. The functions are otherwise untouched: they still
 * validate their input with the same schemas and still return the same
 * ActionResult, so every caller and every error message is unchanged. They now
 * run in the browser against the frozen snapshot, and succeed without
 * persisting anything.
 */

import { createClient } from "@/lib/demo/client";
import { adminSettleSchema, adminUserSchema } from "@/lib/validation/schemas";
import { actionError, type ActionResult } from "./types";

/**
 * The operator's actions.
 *
 * None of them check whether the caller is a site admin, and that is
 * deliberate: every one goes through a SECURITY DEFINER function that checks
 * it next to the write. A guard here as well would be a second copy of the
 * rule that can fall out of step with the first — and the one that matters is
 * the one Postgres runs.
 */
const ADMIN_ERRORS: Record<string, string> = {
  NOT_SITE_ADMIN: "הפעולה מותרת למנהלי האתר בלבד",
  NOT_AUTHENTICATED: "יש להתחבר תחילה",
  NOT_FOUND: "הרשומה לא נמצאה",
  ALREADY_SETTLED: "המשחק כבר עבר עיבוד",
  GAME_NOT_STARTED: "לא ניתן להזין תוצאה למשחק שטרם התחיל",
  INVALID_SCORE: "התוצאה שהוזנה אינה תקינה",
  CANNOT_CHANGE_SELF: "אי אפשר לשנות את ההרשאות של עצמך",
  CANNOT_DELETE_SELF: "אי אפשר למחוק את המשתמש שלך",
  CANNOT_DELETE_ADMIN: "יש להסיר קודם את הרשאת הניהול",
};

function adminError(message: string): string {
  const key = Object.keys(ADMIN_ERRORS).find((k) => message.includes(k));
  return key ? ADMIN_ERRORS[key] : "אירעה שגיאה. נסה שוב";
}

/**
 * Records a result for any fixture in the product.
 *
 * The league-scoped twin of this lives in lib/actions/admin.ts and stops at
 * the creator's own competition. Both only write the score: the scheduled job
 * settles it, so an operator cannot produce a result the automatic path would
 * not have produced.
 */
export async function settleGameSiteWide(input: {
  gameId: string;
  scoreHome: number;
  scoreAway: number;
}): Promise<ActionResult> {
  const parsed = adminSettleSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "קלט לא תקין");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_settle_game", {
    p_game_id: parsed.data.gameId,
    p_score_home: parsed.data.scoreHome,
    p_score_away: parsed.data.scoreAway,
  });

  if (error) return actionError(adminError(error.message));
  return { ok: true, data: undefined };
}

export async function setSiteAdmin(input: {
  userId: string;
  value: boolean;
}): Promise<ActionResult> {
  const parsed = adminUserSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "קלט לא תקין");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_site_admin", {
    p_user_id: parsed.data.userId,
    p_value: input.value,
  });

  if (error) return actionError(adminError(error.message));
  return { ok: true, data: undefined };
}

/**
 * Irreversible: the auth user goes, and predictions, memberships, achievements
 * and notifications follow it by cascade. The confirmation is in the UI; the
 * two refusals that matter — yourself, another admin — are in the function.
 */
export async function deleteUser(input: { userId: string }): Promise<ActionResult> {
  const parsed = adminUserSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "קלט לא תקין");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_user", {
    p_user_id: parsed.data.userId,
  });

  if (error) return actionError(adminError(error.message));
  return { ok: true, data: undefined };
}
