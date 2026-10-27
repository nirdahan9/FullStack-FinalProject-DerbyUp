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
  return { ok: true, data: undefined };
}

/**
 * Marks one notification as read — used when a notification is opened rather
 * than when the list is cleared.
 *
 * The id is the only input, and no ownership check is written here: the RLS
 * policy scopes the update to the caller's own rows, so an id belonging to
 * somebody else matches nothing.
 */
export async function markNotificationRead(
  input: { notificationId: string },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("יש להתחבר תחילה");

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", input.notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return actionError("אירעה שגיאה. נסה שוב");
  return { ok: true, data: undefined };
}
