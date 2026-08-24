import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Which client the advisor reads through.
 *
 * The advisor runs in two contexts with opposite session shapes. In an action
 * it runs *as the signed-in user*, which is what RLS is for and what keeps a
 * bug from reaching another person's rows. In the nightly pick it runs with no
 * session at all — and `games`, `questions` and `competitions` admit
 * `authenticated` only, so the same code reading as `anon` would find an empty
 * database and quietly publish nothing.
 *
 * So the client is a parameter rather than something each function reaches for
 * on its own. It is threaded explicitly and never held at module scope: one
 * instance serves many concurrent requests, and a shared mutable "current
 * client" is how one user's request ends up running with another's rights.
 */
export type AdvisorClient = SupabaseClient<Database>;

/** The signed-in user's client — the default everywhere except cron. */
export async function userClient(): Promise<AdvisorClient> {
  return (await createClient()) as unknown as AdvisorClient;
}

/** Falls back to the user's client, so callers may omit it. */
export async function resolveClient(client?: AdvisorClient): Promise<AdvisorClient> {
  return client ?? (await userClient());
}
