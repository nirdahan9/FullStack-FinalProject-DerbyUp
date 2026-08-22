import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAnswer, MAX_ATTEMPTS, pointsForAttempt } from "@/lib/domain/puzzle";
import { admin, profileOf, standingOf, World, type TestUser } from "./world";

/**
 * §4.9 — the daily challenge.
 *
 * The scoring itself is covered by the unit tests; what needs a database is
 * everything around it: three attempts and no more, no second credit for a
 * puzzle already solved, points that reach the site-wide total and never the
 * league table, and a future puzzle whose answers stay unreadable.
 *
 * The action wraps this in a cookie-bound Supabase client, which only exists
 * inside a request — the browser path is covered end to end in tests/e2e.
 */
describe("§4.9 אתגר יומי", () => {
  const world = new World();
  let user: TestUser;
  let puzzle: { id: string; playDate: string };

  const ANSWERS = ["Gabriel Paulista", "Lucas Torreira"];

  /** Writes an attempt the way the action does, with the service role. */
  async function attempt(as: TestUser, n: number, answer: string) {
    const isCorrect = checkAnswer(answer, ANSWERS);
    const points = isCorrect ? pointsForAttempt(n) : 0;
    const { error } = await admin.from("puzzle_attempts").insert({
      user_id: as.id,
      puzzle_id: puzzle.id,
      answer,
      is_correct: isCorrect,
      attempt_number: n,
      points_earned: points,
    });
    if (!error && points > 0) {
      const before = Number((await profileOf(as.id)).total_points);
      await admin.from("profiles").update({ total_points: before + points }).eq("id", as.id);
    }
    return { error, points };
  }

  beforeAll(async () => {
    user = await world.user("פותר");
    puzzle = await world.puzzle(ANSWERS);
  });

  afterAll(() => world.dispose());

  it("1. תשובה נכונה בניסיון 1 — 5 נקודות", async () => {
    const solver = await world.user("ראשון", { signIn: false });
    const { points } = await attempt(solver, 1, "Gabriel Paulista");

    expect(points).toBe(5);
    expect(Number((await profileOf(solver.id)).total_points)).toBe(5);
  });

  it("2. נכונה בניסיון 2 — 3 נקודות", async () => {
    const solver = await world.user("שני", { signIn: false });
    await attempt(solver, 1, "Wrong");
    const { points } = await attempt(solver, 2, "lucas torreira");

    expect(points).toBe(3);
    expect(Number((await profileOf(solver.id)).total_points)).toBe(3);
  });

  it("3. נכונה בניסיון 3 — נקודה אחת", async () => {
    const solver = await world.user("שלישי", { signIn: false });
    await attempt(solver, 1, "Wrong");
    await attempt(solver, 2, "Also Wrong");
    const { points } = await attempt(solver, 3, "GABRIEL PAULISTA");

    expect(points).toBe(1);
    expect(Number((await profileOf(solver.id)).total_points)).toBe(1);
  });

  it("4. ניסיון 4 — נדחה ב-CHECK", async () => {
    const solver = await world.user("עקשן", { signIn: false });
    for (const n of [1, 2, 3]) await attempt(solver, n, `Wrong ${n}`);

    const { error } = await attempt(solver, 4, "Gabriel Paulista");
    expect(error).not.toBeNull();

    const { data } = await admin.from("puzzle_attempts").select("id").eq("user_id", solver.id);
    expect(data?.length).toBe(MAX_ATTEMPTS);
    expect(Number((await profileOf(solver.id)).total_points)).toBe(0);
  });

  it("5. תשובה נכונה אחרי שכבר פתר — אין זיכוי כפול", async () => {
    const solver = await world.user("כפול", { signIn: false });
    await attempt(solver, 1, "Gabriel Paulista");

    // The action refuses this outright; the unique index is the backstop if a
    // second request slips past the check.
    const { error } = await attempt(solver, 1, "Lucas Torreira");
    expect(error?.code).toBe("23505");
    expect(Number((await profileOf(solver.id)).total_points)).toBe(5);
  });

  it("6. הנקודות אינן נספרות בדירוג הליגה", async () => {
    const competition = await world.competition();
    const solver = await world.user("חבר ליגה");
    const { id: league } = await world.league(solver, competition);

    await attempt(solver, 1, "Gabriel Paulista");

    expect(Number((await profileOf(solver.id)).total_points)).toBe(5);
    expect(Number((await standingOf(solver, league, solver.id))?.points)).toBe(0);
  });

  it("7. הנקודות נספרות בלידרבורד הכללי", async () => {
    const solver = await world.user("בלוח", { signIn: false });
    await attempt(solver, 1, "Gabriel Paulista");

    const { data } = await user.client.rpc("get_global_leaderboard", {
      p_limit: 100,
      p_offset: 0,
    });
    const rows = data as { display_name: string; total_points: number }[];
    expect(rows.some((r) => r.display_name === "בלוח" && Number(r.total_points) === 5)).toBe(true);
  });

  it("אתגר עתידי אינו נראה — התשובות של מחר אינן ניתנות לקריאה", async () => {
    const { data, error } = await user.client
      .from("daily_puzzles")
      .select("id, valid_answers")
      .eq("id", puzzle.id);

    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("משתמש אינו יכול לכתוב ניסיון בעצמו — אין policy של INSERT", async () => {
    const { error } = await user.client.from("puzzle_attempts").insert({
      user_id: user.id,
      puzzle_id: puzzle.id,
      answer: "Gabriel Paulista",
      is_correct: true,
      attempt_number: 1,
      points_earned: 5,
    });

    expect(error).not.toBeNull();
    expect(Number((await profileOf(user.id)).total_points)).toBe(0);
  });

  it("מאגר השחקנים פתוח לקריאה למחוברים בלבד", async () => {
    const { anon } = await import("./world");

    const { data: mine } = await user.client.from("bridge_players").select("name").limit(3);
    expect(mine?.length).toBeGreaterThan(0);

    const { data: guest } = await anon().from("bridge_players").select("name").limit(3);
    expect(guest?.length ?? 0).toBe(0);
  });
});
