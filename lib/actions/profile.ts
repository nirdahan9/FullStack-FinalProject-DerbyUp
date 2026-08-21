"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema } from "@/lib/validation/schemas";
import { actionError, type ActionResult } from "./types";

/**
 * Edits the caller's display name.
 *
 * No user id is accepted from the client: it comes from the session, and the
 * RLS policy on profiles restricts the update to the caller's own row anyway.
 * The score columns are frozen by a trigger, so this cannot touch them however
 * it is called.
 */
export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] ??= issue.message;
    }
    return actionError("יש לתקן את הפרטים", fieldErrors);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("יש להתחבר תחילה");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id);

  if (error) return actionError("אירעה שגיאה. נסה שוב");

  // The name shows in the top bar and in every standings table.
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
