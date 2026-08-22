import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Shared scaffolding for the browser tests.
 *
 * Users sign up through the real form wherever the test is about signing up;
 * everywhere else they are created with the service role and the session is
 * injected as a cookie, because retyping a registration form is not what those
 * tests are checking.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const admin: SupabaseClient = createClient(
  URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Supabase names its auth cookie after the project ref. */
export const authCookieName = `sb-${URL.match(/https:\/\/([a-z0-9]+)\./)![1]}-auth-token`;

export const PASSWORD = "TestPass123!";

export type E2EUser = { id: string; email: string; displayName: string; session: unknown };

export class E2EWorld {
  readonly tag = randomUUID().slice(0, 6);
  private seq = 0;
  readonly users: E2EUser[] = [];
  readonly competitions: number[] = [];
  readonly games: string[] = [];
  readonly leagues: string[] = [];

  /** An email nobody else will claim, usable with the signup form too. */
  email() {
    return `e2e-${this.tag}-${this.seq++}@example.com`;
  }

  async signUp(displayName: string): Promise<E2EUser> {
    const email = this.email();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw new Error(`createUser: ${error.message}`);

    const client = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: signed, error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw new Error(`signIn: ${signInError.message}`);

    const user = { id: data.user.id, email, displayName, session: signed.session };
    this.users.push(user);
    return user;
  }

  /** Adopts a user that registered through the form, so cleanup still covers it. */
  track(user: E2EUser) {
    this.users.push(user);
  }

  async competition(name: string) {
    const id = 900_000 + Math.floor(Math.random() * 90_000);
    const { error } = await admin
      .from("competitions")
      .insert({ id, name, country: "בדיקות", season: 2026, is_active: true });
    if (error) throw new Error(`competition: ${error.message}`);
    this.competitions.push(id);
    return id;
  }

  async game(
    competitionId: number,
    opts: { home: string; away: string; kickoffAt?: Date; odds?: number },
  ) {
    const kickoff = opts.kickoffAt ?? new Date(Date.now() + 3 * 3_600_000);
    // 90,000,000 and up: api-football's own ids are in the low millions, and a
    // test fixture that collides with a real one gets the real result back from
    // the provider — which silently overwrites the score the test seeded.
    const fixtureId = 90_000_000 + Math.floor(Math.random() * 9_000_000);
    const odds = opts.odds ?? 2.1;

    const { data: game, error } = await admin
      .from("games")
      .insert({
        fixture_id: fixtureId,
        competition_id: competitionId,
        home_team: opts.home,
        away_team: opts.away,
        kickoff_at: kickoff.toISOString(),
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error) throw new Error(`game: ${error.message}`);
    this.games.push(game.id);

    const { error: qError } = await admin.from("questions").insert([
      {
        game_id: game.id,
        type: "match_result",
        outcomes: [
          { key: "home", label: opts.home, odds },
          { key: "draw", label: "תיקו", odds: 3.4 },
          { key: "away", label: opts.away, odds: 3.6 },
        ],
      },
      {
        game_id: game.id,
        type: "over_under_2_5",
        outcomes: [
          { key: "over", label: "מעל 2.5", odds: 1.75 },
          { key: "under", label: "מתחת 2.5", odds: 2.05 },
        ],
      },
      {
        game_id: game.id,
        type: "btts",
        outcomes: [
          { key: "yes", label: "כן", odds: 1.8 },
          { key: "no", label: "לא", odds: 1.95 },
        ],
      },
    ]);
    if (qError) throw new Error(`questions: ${qError.message}`);

    return { id: game.id, fixtureId, kickoffAt: kickoff, odds };
  }

  trackLeague(id: string) {
    this.leagues.push(id);
  }

  async dispose() {
    for (const id of this.leagues) await admin.from("leagues").delete().eq("id", id);
    for (const id of this.games) await admin.from("games").delete().eq("id", id);
    for (const user of this.users) await admin.auth.admin.deleteUser(user.id).catch(() => {});
    for (const id of this.competitions) await admin.from("competitions").delete().eq("id", id);
  }
}

/** The cookie value Supabase's SSR client expects. */
export function sessionCookie(user: E2EUser, domain: string) {
  return {
    name: authCookieName,
    value: `base64-${Buffer.from(JSON.stringify(user.session)).toString("base64")}`,
    domain,
    path: "/",
  };
}
