"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionError, type ActionResult } from "./types";

/**
 * Marks the user's unread notifications as read.
 *
 * No user id is passed in and none is needed: the RLS policy on notifications
 * scopes the update to the caller's own rows, so this cannot touch anybody
 * else's however it is called.
 */
export async function markAllRead(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("יש להתחבר תחילה");

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return actionError("אירעה שגיאה. נסה שוב");

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
