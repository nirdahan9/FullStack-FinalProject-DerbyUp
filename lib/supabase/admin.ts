import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client. **Bypasses Row Level Security entirely.**
 *
 * Only for the cron route handlers, which have no user session and legitimately
 * write across all users — syncing fixtures, settling predictions, publishing
 * the daily puzzle. Never import this from a Server Component or from an Action
 * that runs on behalf of a user: doing so would hand that user unrestricted
 * read and write access to every row in the database.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
