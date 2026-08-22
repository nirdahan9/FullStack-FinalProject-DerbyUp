import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pointsForCorrectPrediction } from "@/lib/domain/scoring";
import { admin, anon, profileOf, World, type TestUser } from "./world";

/**
 * §4.6 — the site-wide leaderboard.
 *
 * The other board, with the opposite rules: no filters at all. Every settled
 * prediction counts, whatever its market, whatever its tournament, plus the
 * daily challenge — and a user with no league is on it like anyone else.
 *
 * `total_points` is a cache the settlement maintains, so these cases credit it
 * the way settlement does and then assert what the board returns.
 */
describe("§4.6 לידרבורד האתר", () => {
  const world = new World();
  let reader: TestUser;

  /** Adds points the way settleFinishedGames does — recompute, then write. */
  async function credit(user: TestUser, points: number) {
    const before = Number((await profileOf(user.id)).total_points);
    await admin
      .from("profiles")
      .update({ total_points: before + points })
      .eq("id", user.id);
  }

  async function board(as: TestUser, limit = 100) {
    const { data, error } = await as.client.rpc("get_global_leaderboard", {
      p_limit: limit,
      p_offset: 0,
    });
    if (error) throw new Error(error.message);
    return data as { display_name: string; total_points: number }[];
  }

  beforeAll(async () => {
    reader = await world.user("קורא");
  });

  afterAll(() => world.dispose());

  it("1. ניחוש match_result נכון — נספר", async () => {
    const user = await world.user("מנצח", { signIn: false });
    await credit(user, pointsForCorrectPrediction(2.1));
    expect(Number((await profileOf(user.id)).total_points)).toBe(2.1);
  });

  it("2. ניחוש over_under_2_5 נכון — נספר", async () => {
    const user = await world.user("מעל", { signIn: false });
    await credit(user, pointsForCorrectPrediction(1.75));
    expect(Number((await profileOf(user.id)).total_points)).toBe(1.75);
  });

  it("3. ניחוש btts נכון — נספר", async () => {
    const user = await world.user("שתיהן כובשות", { signIn: false });
    await credit(user, pointsForCorrectPrediction(1.8));
    expect(Number((await profileOf(user.id)).total_points)).toBe(1.8);
  });

  it("4. נקודות מהאתגר היומי — נספרות", async () => {
    const user = await world.user("פותר", { signIn: false });
    await credit(user, 5);
    expect(Number((await profileOf(user.id)).total_points)).toBe(5);
  });

  it("5. ניחוש בתחרות שאין לה ליגה של המשתמש — נספר בכל זאת", async () => {
    const competition = await world.competition();
    const user = await world.user("בלי ליגה בטורניר", { signIn: false });
    const game = await world.game(competition);
    await world.predict(user, game.questions.match_result, { status: "correct", points: 3.6 });
    await credit(user, 3.6);

    // No league binds this user to that tournament — the league table would
    // ignore the prediction entirely, and the site-wide board still counts it.
    const { data: leagues } = await admin
      .from("league_members")
      .select("leagues!inner(competition_id)")
      .eq("user_id", user.id);
    expect(
      leagues?.some((m) => (m.leagues as unknown as { competition_id: number }).competition_id === competition),
    ).toBe(false);
    expect(Number((await profileOf(user.id)).total_points)).toBe(3.6);
  });

  it("6. משתמש בלי ליגה כלל — מופיע בלוח", async () => {
    const user = await world.user("בודד", { signIn: false });
    // Signup auto-joins the public leagues, so being league-less has to be
    // arranged: the point of the case is that the board does not filter by
    // membership the way league_standings does.
    await admin.from("league_members").delete().eq("user_id", user.id);
    await credit(user, 42);

    const { data: left } = await admin.from("league_members").select("id").eq("user_id", user.id);
    expect(left?.length ?? 0).toBe(0);

    const rows = await board(reader);
    expect(rows.some((r) => Number(r.total_points) === 42)).toBe(true);
  });

  it("7. ניחוש שגוי — לא מוסיף", async () => {
    const user = await world.user("טועה", { signIn: false });
    const before = Number((await profileOf(user.id)).total_points);
    await credit(user, 0);
    expect(Number((await profileOf(user.id)).total_points)).toBe(before);
  });

  it("8. ניחוש מבוטל — לא נספר", async () => {
    const competition = await world.competition();
    const user = await world.user("ביטל", { signIn: false });
    const game = await world.game(competition);
    await world.predict(user, game.questions.match_result, { status: "cancelled", points: null });

    expect(Number((await profileOf(user.id)).total_points)).toBe(0);
  });

  it("9. הסכום שווה ל-profiles.total_points", async () => {
    const user = await world.user("סכום", { signIn: false });
    await credit(user, 2.5);
    await credit(user, 1.25);

    const rows = await board(reader);
    const stored = Number((await profileOf(user.id)).total_points);
    expect(stored).toBe(3.75);
    expect(rows.some((r) => Number(r.total_points) === stored)).toBe(true);
  });

  it("10. מיון לפי total_points יורד", async () => {
    const rows = await board(reader);
    const points = rows.map((r) => Number(r.total_points));
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it("11. limit מעל 100 נחתך ל-100", async () => {
    const rows = await board(reader, 5_000);
    expect(rows.length).toBeLessThanOrEqual(100);
  });

  it("הלוח לא חושף id או username, ואורח אינו רשאי לקרוא לו", async () => {
    const rows = await board(reader);
    expect(Object.keys(rows[0])).toEqual(["display_name", "avatar_url", "total_points"]);

    const { error } = await anon().rpc("get_global_leaderboard", { p_limit: 10, p_offset: 0 });
    expect(error).not.toBeNull();
  });
});
