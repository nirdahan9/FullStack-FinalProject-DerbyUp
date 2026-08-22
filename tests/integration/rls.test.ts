import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, profileOf, World, type TestGame, type TestUser } from "./world";

/**
 * §5.1 — data isolation.
 *
 * The assignment asks outright how one user is kept out of another's data, and
 * this is the answer: two real users, two real sessions, every read and write
 * attempted for real against the live policies. `admin` is used only to set up
 * and to check the result — never to make the attempt under test.
 */
describe("§5.1 בידוד נתונים (RLS)", () => {
  const world = new World();
  let a: TestUser;
  let b: TestUser;
  let competition: number;
  let game: TestGame;
  let bPrediction: string;

  beforeAll(async () => {
    competition = await world.competition();
    game = await world.game(competition);
    a = await world.user("משתמש א");
    b = await world.user("משתמש ב");
    bPrediction = await world.predict(b, game.questions.match_result, { odds: 2.1 });
  });

  afterAll(() => world.dispose());

  it("1. א׳ קורא ניחושים של ב׳ — 0 שורות", async () => {
    const { data } = await a.client.from("predictions").select("id").eq("user_id", b.id);
    expect(data?.length ?? 0).toBe(0);
  });

  it("2. א׳ מנסה UPDATE על ניחוש של ב׳ — נדחה", async () => {
    await a.client
      .from("predictions")
      .update({ selected_outcome: "away" })
      .eq("id", bPrediction);

    const { data } = await admin
      .from("predictions")
      .select("selected_outcome")
      .eq("id", bPrediction)
      .single();
    expect(data?.selected_outcome).toBe("home");
  });

  it("3. א׳ מנסה DELETE על ניחוש של ב׳ — נדחה", async () => {
    await a.client.from("predictions").delete().eq("id", bPrediction);

    const { data } = await admin.from("predictions").select("id").eq("id", bPrediction);
    expect(data?.length).toBe(1);
  });

  it("4. א׳ מנסה UPDATE על הניחוש של עצמו — נדחה (רק דרך הפונקציה)", async () => {
    const own = await world.predict(a, game.questions.btts, { outcome: "yes", odds: 1.8 });

    await a.client.from("predictions").update({ points_earned: 999 }).eq("id", own);

    const { data } = await admin
      .from("predictions")
      .select("points_earned")
      .eq("id", own)
      .single();
    expect(data?.points_earned).toBeNull();
  });

  it("5. א׳ קורא ל-cancel_prediction על ניחוש של ב׳ — NOT_OWNER", async () => {
    const { error } = await a.client.rpc("cancel_prediction", { p_id: bPrediction });
    expect(error?.message).toContain("NOT_OWNER");

    const { data } = await admin.from("predictions").select("status").eq("id", bPrediction).single();
    expect(data?.status).toBe("pending");
  });

  it("6. א׳ קורא התראות של ב׳ — 0 שורות", async () => {
    await admin.from("notifications").insert({
      user_id: b.id,
      type: "prediction_settled",
      title: "התראה פרטית",
    });

    const { data } = await a.client.from("notifications").select("id").eq("user_id", b.id);
    expect(data?.length ?? 0).toBe(0);
  });

  it("7. א׳ קורא ניסיונות אתגר של ב׳ — 0 שורות", async () => {
    const puzzle = await world.puzzle(["Someone"]);
    await admin.from("puzzle_attempts").insert({
      user_id: b.id,
      puzzle_id: puzzle.id,
      answer: "Someone",
      is_correct: true,
      attempt_number: 1,
      points_earned: 5,
    });

    const { data } = await a.client.from("puzzle_attempts").select("id").eq("user_id", b.id);
    expect(data?.length ?? 0).toBe(0);
  });

  it("8. א׳ קורא ליגה שאינו חבר בה — 0 שורות", async () => {
    const { id } = await world.league(b, competition, "הליגה של ב");
    const { data } = await a.client.from("leagues").select("id").eq("id", id);
    expect(data?.length ?? 0).toBe(0);
  });

  it("9. א׳ קורא חברי ליגה שאינו חבר בה — 0 שורות", async () => {
    const { id } = await world.league(b, competition, "ליגה סגורה");
    const { data } = await a.client.from("league_members").select("id").eq("league_id", id);
    expect(data?.length ?? 0).toBe(0);
  });

  it("10. א׳ וב׳ באותה ליגה — א׳ רואה את הדירוג כולל את ב׳", async () => {
    const { id, code } = await world.league(a, competition, "ליגה משותפת");
    const { error: joinError } = await b.client.rpc("join_league", { p_invite_code: code });
    expect(joinError).toBeNull();

    const { data, error } = await a.client.rpc("league_standings", {
      p_league_id: id,
      p_limit: 20,
      p_offset: 0,
    });
    expect(error).toBeNull();
    expect((data as { user_id: string }[]).map((r) => r.user_id).sort()).toEqual([a.id, b.id].sort());
  });

  it("11. משתמש לא מחובר קורא profiles — 0 שורות", async () => {
    const { data } = await anon().from("profiles").select("id");
    expect(data?.length ?? 0).toBe(0);
  });

  it("12. א׳ מנסה לשנות total_points ישירות — נדחה", async () => {
    const { error } = await a.client
      .from("profiles")
      .update({ total_points: 999_999 })
      .eq("id", a.id)
      .select();

    expect(error).not.toBeNull();
    expect(Number((await profileOf(a.id)).total_points)).toBe(0);
  });

  it("13. א׳ מנסה לשנות points_earned בניחוש שלו — נדחה", async () => {
    const own = await world.predict(a, game.questions.over_under_2_5, {
      outcome: "over",
      odds: 1.75,
    });

    await a.client.from("predictions").update({ points_earned: 500 }).eq("id", own);

    const { data } = await admin.from("predictions").select("points_earned").eq("id", own).single();
    expect(data?.points_earned).toBeNull();
  });

  it("14. א׳ קורא select * from profiles — רק עצמו וחברי ליגותיו", async () => {
    const { data } = await a.client.from("profiles").select("id");
    const visible = new Set(data?.map((p) => p.id));

    expect(visible.has(a.id)).toBe(true);
    // ב׳ joined א׳'s league in case 10, so ב׳ is visible — and that is correct.
    expect(visible.has(b.id)).toBe(true);

    const stranger = await world.user("זר", { signIn: false });
    const { data: after } = await a.client.from("profiles").select("id");
    expect(after?.some((p) => p.id === stranger.id)).toBe(false);
  });

  it("15. get_global_leaderboard מחזיר את כולם — בלי id ובלי username", async () => {
    const { data, error } = await a.client.rpc("get_global_leaderboard", {
      p_limit: 10,
      p_offset: 0,
    });
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBeGreaterThan(0);
    expect(Object.keys((data as object[])[0])).toEqual([
      "display_name",
      "avatar_url",
      "total_points",
    ]);
  });

  it("16. אורח קורא ל-get_global_leaderboard — נדחה", async () => {
    const { error } = await anon().rpc("get_global_leaderboard", { p_limit: 10, p_offset: 0 });
    expect(error).not.toBeNull();
  });

  it("א׳ כן יכול לערוך את שם התצוגה שלו", async () => {
    const { error } = await a.client
      .from("profiles")
      .update({ display_name: "שם חדש" })
      .eq("id", a.id)
      .select();

    expect(error).toBeNull();
    expect((await profileOf(a.id)).display_name).toBe("שם חדש");
  });

  it("א׳ לא יכול לערוך את הפרופיל של ב׳", async () => {
    await a.client.from("profiles").update({ display_name: "נפרץ" }).eq("id", b.id);
    expect((await profileOf(b.id)).display_name).not.toBe("נפרץ");
  });
});
