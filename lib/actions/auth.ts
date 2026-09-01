"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { actionError, type ActionResult } from "./types";

/**
 * Supabase reports a wrong password and an unknown email with the same
 * message, which is what we want: distinguishing them would let anyone probe
 * which addresses are registered.
 */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "אימייל או סיסמה שגויים";
  // Should not occur while autoconfirm is on, but it would otherwise fall
  // through to the generic message and leave the user with no idea what to do.
  if (m.includes("email not confirmed")) return "החשבון טרם אומת. בדקו את תיבת האימייל";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "כתובת האימייל הזו כבר רשומה";
  if (m.includes("email rate limit") || m.includes("rate limit"))
    return "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות";
  if (m.includes("password")) return "הסיסמה אינה עומדת בדרישות";
  return "אירעה שגיאה. נסה שוב";
}

export async function signUp(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return actionError("יש לתקן את הפרטים", fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // Read by the handle_new_user trigger, which creates the profile row.
    options: { data: { display_name: parsed.data.displayName } },
  });

  if (error) return actionError(friendlyAuthError(error.message));

  // The project runs with autoconfirm on, so signUp returns a session and the
  // user is in straight away. If that setting is ever turned off, Supabase
  // returns a user with no session instead — redirecting then would bounce off
  // the proxy straight back to /login with nothing explaining why.
  if (!data.session) {
    return actionError("החשבון נוצר. יש לאמת את כתובת האימייל לפני ההתחברות");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signIn(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return actionError("יש לתקן את הפרטים", fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return actionError(friendlyAuthError(error.message));

  // `next` comes from the proxy redirect. Only a path is accepted:
  // taking an absolute URL here would turn the login form into an open
  // redirect that could bounce a user to another site after signing in.
  const next = formData.get("next");
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  revalidatePath("/", "layout");
  redirect(target);
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
