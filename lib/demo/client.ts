import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { DEMO_NOW } from "./now";
import { DEMO_USER_ID, PROFILES } from "./fixtures";
import { demoEmail, isTableName, type AnyRow } from "./tables";
import { DemoQueryBuilder, type DemoResult } from "./query-builder";
import { callRpc } from "./rpc";

/**
 * The client the demo runs on, in place of Supabase.
 *
 * ── Why it pretends to be the real thing ──────────────────────────────────
 *
 * `createClient()` below returns something shaped like
 * `lib/supabase/server.ts`'s client and *typed* as it. That is deliberate, and
 * it is the one decision in `lib/demo` worth arguing about, so here is the
 * argument.
 *
 * The alternative is a `DemoClient` type of its own — an honest, structural
 * description of the twenty-odd methods the demo implements. It cannot work.
 * PostgREST's types are not a method list; they are a compiler.
 * `select("leagues(id, name, competitions(name))")` is a *string literal* that
 * `@supabase/postgrest-js` parses at the type level into
 * `{ leagues: { id: string; name: string; competitions: { name: string } | null } | null }`,
 * and seven pages in this codebase read two levels into that result. Any type
 * that did not reproduce that parser would turn every one of those reads into
 * an error, and the instruction for this work was that each consuming file
 * changes by exactly one import line. Copying the parser to get there would be
 * vendoring a few thousand lines of conditional types to describe data that is
 * already in a local array.
 *
 * So the shape is built with full internal typing — `query-builder.ts` and
 * `rpc.ts` are checked against `types/database.ts`, and `rpc.ts` pins every
 * one of the twenty-eight return shapes to its generated `Returns` — and
 * handed over at the boundary with a single cast. Everything above the cast is
 * the real generated types; everything below it is checked on its own terms.
 * The cast is the seam, it is one line, and it is the same seam
 * `lib/advisor/db.ts` already contains: `(await createClient()) as unknown as
 * AdvisorClient`, written for the same reason.
 *
 * What the seam costs is worth stating plainly: the compiler can no longer
 * prove that this object satisfies the client it claims to be. What keeps that
 * honest is coverage of the surface rather than the type — the sixteen filter
 * and transform methods, four writes, four auth calls and twenty-eight
 * functions were counted off the codebase, not guessed, and anything missed
 * fails loudly as `undefined is not a function` on first render rather than
 * quietly returning the wrong rows.
 *
 * ── What it does not do ───────────────────────────────────────────────────
 *
 * No RLS, because there are no other users to protect and no second session to
 * confuse it with. No writes, because the snapshot is compiled source. No
 * network, no key, no environment variable — which is the point: this is what
 * lets the whole product build to static files and keep working in five years
 * with nobody maintaining it.
 */

export type DemoClient = SupabaseClient<Database>;

// ─── The visitor ───────────────────────────────────────────────────────────

const DEMO_PROFILE = PROFILES.find((profile) => profile.id === DEMO_USER_ID);

/**
 * The signed-in user, in the shape `supabase.auth.getUser()` returns one.
 *
 * Twenty-seven call sites read this and between them they touch two fields:
 * `user.id`, everywhere, and `user.email`, on the profile page. The rest of
 * the object is filled in anyway, because a half-built `User` is the kind of
 * thing that works until something reasonable — a log line, a dev tool, a
 * component added later — reads `created_at` and finds nothing.
 *
 * `email_confirmed_at` and `last_sign_in_at` are set because the project runs
 * with autoconfirm on and the demo visitor is, by construction, signed in.
 */
const DEMO_USER: User = {
  id: DEMO_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: demoEmail(DEMO_PROFILE?.username ?? "demo"),
  email_confirmed_at: DEMO_PROFILE?.created_at ?? DEMO_NOW.toISOString(),
  confirmed_at: DEMO_PROFILE?.created_at ?? DEMO_NOW.toISOString(),
  last_sign_in_at: DEMO_NOW.toISOString(),
  created_at: DEMO_PROFILE?.created_at ?? DEMO_NOW.toISOString(),
  updated_at: DEMO_PROFILE?.updated_at ?? DEMO_NOW.toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: DEMO_PROFILE?.display_name ?? "" },
  identities: [],
  is_anonymous: false,
};

/**
 * A session, needed for one reason: `signUp()` in `lib/actions/auth.ts` checks
 * `data.session` and refuses to redirect without one, because a project with
 * autoconfirm off returns a user and no session. The demo has autoconfirm on
 * by definition, so the session is present.
 *
 * `expires_at` is derived from `DEMO_NOW` rather than from the wall clock: a
 * token that expired before the page rendered would be a strange thing for a
 * frozen demo to hand out, and nothing ever validates it.
 */
const DEMO_SESSION: Session = {
  access_token: "demo-access-token",
  refresh_token: "demo-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(DEMO_NOW.getTime() / 1000) + 3600,
  user: DEMO_USER,
};

// ─── Auth ──────────────────────────────────────────────────────────────────

/**
 * Sign-in, sign-up and sign-out all succeed and do nothing.
 *
 * There is one account and no password to be wrong about, so the forms are
 * kept reachable and made inert: whatever is typed, the action reports success
 * and `redirect()` lands on the dashboard as the demo user. The alternative —
 * refusing, or hiding the forms — would remove two screens that are part of
 * the product being shown.
 *
 * Sign-out is the odd one. It resolves cleanly, and then `redirect("/login")`
 * sends the visitor to a login page that will let them straight back in. That
 * is the most honest behaviour available: a demo with no session cannot really
 * end one, and a sign-out button that silently did nothing would look broken.
 */
const auth = {
  getUser: async () => ({ data: { user: DEMO_USER }, error: null }),

  getSession: async () => ({ data: { session: DEMO_SESSION }, error: null }),

  signInWithPassword: async () => ({
    data: { user: DEMO_USER, session: DEMO_SESSION },
    error: null,
  }),

  signUp: async () => ({
    data: { user: DEMO_USER, session: DEMO_SESSION },
    error: null,
  }),

  signOut: async () => ({ error: null }),
};

// ─── The client ────────────────────────────────────────────────────────────

type DemoClientShape = {
  from(table: string): DemoQueryBuilder;
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): DemoQueryBuilder | Promise<DemoResult<unknown>>;
  auth: typeof auth;
};

const demo: DemoClientShape = {
  from(table) {
    // The generated types make an unknown table unreachable from checked code,
    // so this is a backstop rather than a path: an empty result is quieter than
    // a thrown error on a page whose only sin is a typo the compiler caught.
    return new DemoQueryBuilder(isTableName(table) ? table : []);
  },

  /**
   * A table-returning function hands back a builder, so `.eq()`, `.limit()`
   * and `.single()` keep working on an RPC exactly as they do against the real
   * PostgREST. A scalar-returning one — `join_league`, `is_site_admin`,
   * `advisor_consume_quota`, `api_cache_get` — and any failure resolve
   * straight to the result, because there is nothing to filter.
   */
  rpc(name, args) {
    const result = callRpc(name, args);
    if (result.error === null && Array.isArray(result.data)) {
      return new DemoQueryBuilder(result.data as AnyRow[]);
    }
    return Promise.resolve(result);
  },

  auth,
};

/**
 * Stands in for `lib/supabase/server.ts`'s `createClient`.
 *
 * Async and argument-free, so the call site is unchanged: every one of the
 * thirty-one files that reads `const supabase = await createClient()` keeps
 * that line exactly as written and swaps only the import above it.
 *
 * Returns the same instance every time. The real one builds a client per
 * request because it carries that request's cookies and session; this one
 * carries neither and holds no mutable state — `DemoQueryBuilder` keeps its
 * filters on itself, not here — so a shared instance is safe under concurrency
 * and saves an allocation on every render.
 */
export async function createClient(): Promise<DemoClient> {
  return demo as unknown as DemoClient;
}

/**
 * Stands in for `lib/supabase/admin.ts`'s `createAdminClient`.
 *
 * Synchronous and throwing-on-missing-key in the original; synchronous and
 * incapable of either here. It exists so the four files that reach for the
 * service role — `lib/achievements/award.ts`, `lib/actions/challenge.ts` and
 * the cron entry points — also change by one import line.
 *
 * The real client's own comment warns that it bypasses RLS entirely and must
 * never be imported from a user-facing path. That warning is void here for the
 * only acceptable reason: the demo has no RLS to bypass and no writes to
 * perform, so the service-role client and the user client are the same frozen,
 * read-only object. It is deliberately *not* given extra powers, so nothing
 * comes to depend on the distinction before the real client returns.
 */
export function createAdminClient(): DemoClient {
  return demo as unknown as DemoClient;
}
