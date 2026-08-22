import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * A disposable world for the integration suites.
 *
 * Everything is built inside one throwaway competition rather than an existing
 * one. An earlier version of the RLS script reused a real competition id and
 * its cleanup failed silently against the fixtures referencing it, leaving a
 * production row renamed — so here the competition is created, owned and
 * removed by the test, and `dispose()` asserts that it actually went.
 *
 * Test competition ids live above 900000, far outside the API-Football id
 * space, so a leftover row is recognisable at a glance.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });

export type TestUser = {
  id: string;
  email: string;
  password: string;
  /**
   * A client signed in as this user — subject to RLS, like the browser.
   *
   * Only present for users created with `{ signIn: true }`. Supabase rate-limits
   * sign-ins per IP, and most users in these suites exist only to hold a score,
   * so signing every one of them in would spend the whole allowance on sessions
   * nothing reads.
   */
  client: SupabaseClient;
};

export type TestGame = {
  id: string;
  fixtureId: number;
  kickoffAt: string;
  /** question id per type */
  questions: Record<"match_result" | "over_under_2_5" | "btts", string>;
};

const OUTCOMES = {
  match_result: [
    { key: "home", label: "בית", odds: 2.1 },
    { key: "draw", label: "תיקו", odds: 3.4 },
    { key: "away", label: "חוץ", odds: 3.6 },
  ],
  over_under_2_5: [
    { key: "over", label: "מעל 2.5", odds: 1.75 },
    { key: "under", label: "מתחת 2.5", odds: 2.05 },
  ],
  btts: [
    { key: "yes", label: "כן", odds: 1.8 },
    { key: "no", label: "לא", odds: 1.95 },
  ],
} as const;

/**
 * Signs in, retrying the per-IP rate limit rather than failing the suite.
 * The limit is short-lived; a run that trips it is a pacing problem, not a bug
 * in the thing under test.
 */
async function signIn(email: string, password: string): Promise<SupabaseClient> {
  for (let attempt = 0; ; attempt++) {
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (!error) return client;

    const rateLimited = /rate limit/i.test(error.message);
    if (!rateLimited || attempt >= 3) throw new Error(`signIn: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, 5_000 * (attempt + 1)));
  }
}

export class World {
  readonly tag = randomUUID().slice(0, 8);
  /** Claimed synchronously, so two concurrent user() calls never share it. */
  private seq = 0;
  private readonly users: TestUser[] = [];
  private readonly competitions: number[] = [];
  private readonly games: string[] = [];
  private readonly leagues: string[] = [];
  private readonly puzzles: string[] = [];

  /**
   * A user with a fresh profile, created by the auth trigger.
   *
   * `signIn: false` skips the session for users that only need to exist — a
   * member holding a score, a stranger who must stay invisible. Reading
   * `.client` on one of those fails loudly rather than silently using the
   * service role and testing nothing.
   */
  async user(displayName = "בודק", opts: { signIn?: boolean } = {}): Promise<TestUser> {
    const email = `it-${this.tag}-${this.seq++}@example.com`;
    const password = "TestPass123!";

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw new Error(`createUser: ${error.message}`);

    const user = { id: data.user.id, email, password } as TestUser;

    if (opts.signIn === false) {
      Object.defineProperty(user, "client", {
        get() {
          throw new Error(
            `המשתמש ${displayName} נוצר בלי התחברות — צריך user(name) ולא user(name, { signIn: false })`,
          );
        },
      });
    } else {
      user.client = await signIn(email, password);
    }

    this.users.push(user);
    return user;
  }

  /** A competition nothing else in the product points at. */
  async competition(name = "טורניר בדיקה"): Promise<number> {
    // Random within the reserved band so two suites running back to back do
    // not collide on a row the previous one has not finished deleting.
    const id = 900_000 + Math.floor(Math.random() * 90_000);
    const { error } = await admin
      .from("competitions")
      .insert({ id, name, country: "בדיקות", season: 2026, is_active: true });
    if (error) throw new Error(`competition: ${error.message}`);
    this.competitions.push(id);
    return id;
  }

  /**
   * A fixture with all three questions.
   *
   * `kickoffAt` defaults to two hours out — open for predictions and outside
   * the ten-minute cancellation window, which is what most tests want.
   */
  async game(
    competitionId: number,
    opts: { kickoffAt?: Date; status?: string; home?: string; away?: string } = {},
  ): Promise<TestGame> {
    const kickoff = opts.kickoffAt ?? new Date(Date.now() + 2 * 3_600_000);
    // 90,000,000 and up: api-football's own ids are in the low millions, and a
    // test fixture that collides with a real one gets the real result back from
    // the provider — which silently overwrites the score the test seeded.
    const fixtureId = 90_000_000 + Math.floor(Math.random() * 9_000_000);

    const { data: game, error } = await admin
      .from("games")
      .insert({
        fixture_id: fixtureId,
        competition_id: competitionId,
        home_team: opts.home ?? "Test Home",
        away_team: opts.away ?? "Test Away",
        kickoff_at: kickoff.toISOString(),
        status: opts.status ?? "scheduled",
      })
      .select("id")
      .single();
    if (error) throw new Error(`game: ${error.message}`);
    this.games.push(game.id);

    const { data: rows, error: qError } = await admin
      .from("questions")
      .insert(
        (Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[]).map((type) => ({
          game_id: game.id,
          type,
          outcomes: OUTCOMES[type],
        })),
      )
      .select("id, type");
    if (qError) throw new Error(`questions: ${qError.message}`);

    const questions = Object.fromEntries(rows.map((q) => [q.type, q.id])) as TestGame["questions"];
    return { id: game.id, fixtureId, kickoffAt: kickoff.toISOString(), questions };
  }

  /** A league created through the product's own function, as a user would. */
  async league(creator: TestUser, competitionId: number, name = "ליגת בדיקה") {
    const { data, error } = await creator.client.rpc("create_league", {
      p_name: name,
      p_competition_id: competitionId,
    });
    if (error) throw new Error(`create_league: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    this.leagues.push(row.league_id);
    return { id: row.league_id as string, code: row.league_code as string };
  }

  /**
   * A prediction written directly.
   *
   * `predictions` is closed to client writes on purpose, and the action layer
   * adds rules the standings tests are not exercising, so the row is seeded
   * with the service role and the rules themselves are tested in §4.1–4.4.
   */
  async predict(
    user: TestUser,
    questionId: string,
    opts: {
      outcome?: string;
      odds?: number;
      status?: "pending" | "correct" | "incorrect" | "void" | "cancelled";
      points?: number | null;
      predictedAt?: Date;
      bonusPct?: number;
    } = {},
  ) {
    const { data, error } = await admin
      .from("predictions")
      .insert({
        user_id: user.id,
        question_id: questionId,
        selected_outcome: opts.outcome ?? "home",
        odds: opts.odds ?? 2.1,
        bonus_pct: opts.bonusPct ?? 0,
        status: opts.status ?? "pending",
        points_earned: opts.points ?? null,
        ...(opts.predictedAt ? { predicted_at: opts.predictedAt.toISOString() } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(`predict: ${error.message}`);
    return data.id as string;
  }

  /** A puzzle on a date far enough out that it is not the live one. */
  async puzzle(validAnswers: string[]) {
    const day = new Date(Date.now() + (400 + Math.floor(Math.random() * 200)) * 86_400_000);
    const playDate = day.toISOString().slice(0, 10);
    const { data, error } = await admin
      .from("daily_puzzles")
      .insert({
        play_date: playDate,
        club_a: "מועדון א",
        club_b: "מועדון ב",
        valid_answers: validAnswers,
      })
      .select("id")
      .single();
    if (error) throw new Error(`puzzle: ${error.message}`);
    this.puzzles.push(data.id);
    return { id: data.id as string, playDate };
  }

  /**
   * Removes everything this world created, children first so no delete is
   * silently blocked by a foreign key, and verifies that nothing survived.
   */
  async dispose() {
    for (const id of this.puzzles) await admin.from("daily_puzzles").delete().eq("id", id);
    for (const id of this.leagues) await admin.from("leagues").delete().eq("id", id);
    for (const id of this.games) await admin.from("games").delete().eq("id", id);
    for (const user of this.users) await admin.auth.admin.deleteUser(user.id);
    for (const id of this.competitions) await admin.from("competitions").delete().eq("id", id);

    const leftovers: string[] = [];
    if (this.competitions.length) {
      const { data } = await admin.from("competitions").select("id").in("id", this.competitions);
      if (data?.length) leftovers.push(`competitions: ${data.map((c) => c.id).join(", ")}`);
    }
    if (this.users.length) {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .in("id", this.users.map((u) => u.id));
      if (data?.length) leftovers.push(`profiles: ${data.length}`);
    }
    if (leftovers.length) throw new Error(`הניקוי לא הושלם — ${leftovers.join(" · ")}`);
  }
}

/** Reads a profile with the service role, bypassing the read policy. */
export async function profileOf(userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("total_points, total_correct, total_predictions, display_name, username")
    .eq("id", userId)
    .single();
  return data!;
}

export type StandingRow = {
  user_id: string;
  display_name: string;
  points: number;
  correct_count: number;
  joined_at: string;
};

/** The standings row for one member, or undefined if they are not listed. */
export async function standingOf(user: TestUser, leagueId: string, memberId: string) {
  const { data, error } = await user.client.rpc("league_standings", {
    p_league_id: leagueId,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) throw new Error(`league_standings: ${error.message}`);
  return (data as StandingRow[]).find((r) => r.user_id === memberId);
}
