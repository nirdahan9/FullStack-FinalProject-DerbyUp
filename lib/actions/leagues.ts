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
