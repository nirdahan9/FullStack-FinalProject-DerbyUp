"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createLeagueSchema, joinLeagueSchema } from "@/lib/validation/schemas";
import { actionError, type ActionResult } from "./types";

/**
 * Postgres raises named exceptions from the league functions; this turns them
 * into something a user can act on. Anything unrecognised becomes a generic
 * message rather than leaking a database error into the interface.
 */
function leagueError(message: string): string {
  if (message.includes("INVALID_CODE")) return "קוד הזמנה לא תקין";
  if (message.includes("ALREADY_MEMBER")) return "כבר הצטרפת לליגה הזו";
  if (message.includes("INVALID_COMPETITION")) return "הטורניר שנבחר אינו זמין";
  if (message.includes("INVALID_NAME")) return "שם הליגה קצר מדי";
  if (message.includes("NOT_AUTHENTICATED")) return "יש להתחבר תחילה";
  if (message.includes("NOT_A_MEMBER")) return "אינך חבר בליגה הזו";
  return "אירעה שגיאה. נסה שוב";
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0]);
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

export async function createLeague(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createLeagueSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    competitionId: Number(formData.get("competitionId")),
  });

  if (!parsed.success) {
    return actionError("יש לתקן את הפרטים", fieldErrorsOf(parsed.error.issues));
  }

  const supabase = await createClient();

  // A function rather than an insert: the league row and the creator's
  // membership have to be written together, and the SELECT policy on leagues
  // would reject the RETURNING clause of a plain insert — the creator is not
  // a member until that second row exists.
  const { data, error } = await supabase.rpc("create_league", {
    p_name: parsed.data.name,
    p_competition_id: parsed.data.competitionId,
    p_description: parsed.data.description ?? undefined,
  });

  if (error) return actionError(leagueError(error.message));

  const created = data?.[0];
  if (!created) return actionError("אירעה שגיאה ביצירת הליגה");

  revalidatePath("/leagues");
  redirect(`/leagues/${created.league_id}?created=1`);
}

export async function joinLeague(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = joinLeagueSchema.safeParse({
    inviteCode: formData.get("inviteCode"),
  });

  if (!parsed.success) {
    return actionError("יש לתקן את הפרטים", fieldErrorsOf(parsed.error.issues));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league", {
    p_invite_code: parsed.data.inviteCode,
  });

  if (error) return actionError(leagueError(error.message));
  if (!data) return actionError("קוד הזמנה לא תקין");

  revalidatePath("/leagues");
  revalidatePath("/games");
  redirect(`/leagues/${data}?joined=1`);
}

export async function leaveLeague(
  input: { leagueId: string },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("יש להתחבר תחילה");

  const { data: league } = await supabase
    .from("leagues")
    .select("is_public, creator_id")
    .eq("id", input.leagueId)
    .maybeSingle();

  if (!league) return actionError("הליגה לא נמצאה");
  // Public leagues are how a user gets any fixtures at all; leaving one would
  // silently remove a whole tournament from their product.
  if (league.is_public) return actionError("לא ניתן לעזוב ליגה ציבורית");
  // The creator is the permanent admin. Letting them leave would strand the
  // league with an admin who is not a member of it.
  if (league.creator_id === user.id) {
    return actionError("מנהל הליגה אינו יכול לעזוב אותה");
  }

  const { error } = await supabase
    .from("league_members")
    .delete()
    .eq("league_id", input.leagueId)
    .eq("user_id", user.id);

  if (error) return actionError("אירעה שגיאה. נסה שוב");

  revalidatePath("/leagues");
  redirect("/leagues?left=1");
}

export async function archiveLeague(
  input: { leagueId: string },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("יש להתחבר תחילה");

  // RLS already restricts updates to the creator; this check exists so the
  // user gets a message rather than a silently empty result.
  const { data: league } = await supabase
    .from("leagues")
    .select("creator_id, is_public")
    .eq("id", input.leagueId)
    .maybeSingle();

  if (!league || league.is_public) return actionError("הליגה לא נמצאה");
  if (league.creator_id !== user.id) return actionError("רק מנהל הליגה יכול לסגור עונה");

  const { error } = await supabase
    .from("leagues")
    .update({ status: "archived" })
    .eq("id", input.leagueId);

  if (error) return actionError("אירעה שגיאה. נסה שוב");

  revalidatePath(`/leagues/${input.leagueId}`);
  return { ok: true, data: undefined };
}
