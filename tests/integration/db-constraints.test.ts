import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, World, type TestGame, type TestUser } from "./world";

/**
 * §6 — the constraints on the tables themselves.
 *
 * Every attempt here uses the service role, which bypasses RLS. That is
 * deliberate: it isolates what the schema guarantees from what the policies
 * guarantee. If a CHECK holds against the service role, it holds against
 * anything — including a future action with a bug in it.
 */
describe("§6 בדיקות למסד הנתונים", () => {
  const world = new World();
  let competition: number;
  let user: TestUser;
  let game: TestGame;

  beforeAll(async () => {
    competition = await world.competition();
    user = await world.user("בודק אילוצים");
    game = await world.game(competition);
  });

  afterAll(() => world.dispose());

  it("1. odds קטן מ-1 — CHECK דוחה", async () => {
    const { error } = await admin.from("predictions").insert({
      user_id: user.id,
      question_id: game.questions.match_result,
      selected_outcome: "home",
      odds: 0.5,
    });
    expect(error?.code).toBe("23514");
  });

  it("2. bonus_pct = 150 — CHECK דוחה", async () => {
    const { error } = await admin.from("predictions").insert({
      user_id: user.id,
      question_id: game.questions.btts,
      selected_outcome: "yes",
      odds: 1.8,
      bonus_pct: 150,
    });
    expect(error?.code).toBe("23514");
  });

  it("3. attempt_number = 4 — CHECK דוחה", async () => {
    const puzzle = await world.puzzle(["Someone"]);
    const { error } = await admin.from("puzzle_attempts").insert({
      user_id: user.id,
      puzzle_id: puzzle.id,
      answer: "Someone",
      is_correct: true,
      attempt_number: 4,
      points_earned: 5,
    });
    expect(error?.code).toBe("23514");
  });

  it("4. username כפול — UNIQUE דוחה", async () => {
    const { data: existing } = await admin
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    const other = await world.user("מתחזה", { signIn: false });
    const { error } = await admin
      .from("profiles")
      .update({ username: existing!.username })
      .eq("id", other.id);
    expect(error?.code).toBe("23505");
  });

  it("5. invite_code כפול — UNIQUE דוחה", async () => {
    const league = await world.league(user, competition, "ליגה ראשונה");
    const { data: code } = await admin
      .from("leagues")
      .select("invite_code")
      .eq("id", league.id)
      .single();

    const { error } = await admin.from("leagues").insert({
      name: "ליגה מתחזה",
      creator_id: user.id,
      competition_id: competition,
      invite_code: code!.invite_code,
    });
    expect(error?.code).toBe("23505");
  });

  it("6. שני ניחושים לאותה שאלה מאותו משתמש — UNIQUE דוחה", async () => {
    const fresh = await world.game(competition);
    await world.predict(user, fresh.questions.match_result, { outcome: "home" });

    const { error } = await admin.from("predictions").insert({
      user_id: user.id,
      question_id: fresh.questions.match_result,
      selected_outcome: "away",
      odds: 3.6,
    });
    expect(error?.code).toBe("23505");
  });

  it("6א. אחרי ביטול, אותה שאלה פתוחה שוב — האינדקס הייחודי חלקי", async () => {
    const fresh = await world.game(competition);
    const id = await world.predict(user, fresh.questions.match_result);
    await admin.from("predictions").update({ status: "cancelled" }).eq("id", id);

    const { error } = await admin.from("predictions").insert({
      user_id: user.id,
      question_id: fresh.questions.match_result,
      selected_outcome: "away",
      odds: 3.6,
    });
    expect(error).toBeNull();
  });

  it("7. ניחוש לשאלה שאינה קיימת — FK דוחה", async () => {
    const { error } = await admin.from("predictions").insert({
      user_id: user.id,
      question_id: "00000000-0000-0000-0000-000000000000",
      selected_outcome: "home",
      odds: 2.1,
    });
    expect(error?.code).toBe("23503");
  });

  it("8. ליגה בלי competition_id — NOT NULL דוחה", async () => {
    const { error } = await admin.from("leagues").insert({
      name: "ליגה בלי טורניר",
      creator_id: user.id,
      invite_code: "NOCOMPXX",
    });
    expect(error?.code).toBe("23502");
  });

  it("9. סטטוס לא חוקי — CHECK דוחה", async () => {
    const fresh = await world.game(competition);
    const { error } = await admin.from("predictions").insert({
      user_id: user.id,
      question_id: fresh.questions.btts,
      selected_outcome: "yes",
      odds: 1.8,
      status: "foo",
    });
    expect(error?.code).toBe("23514");
  });

  it("10. מחיקת משתמש — הניחושים נמחקים ב-cascade", async () => {
    const doomed = await world.user("נמחק", { signIn: false });
    const fresh = await world.game(competition);
    const id = await world.predict(doomed, fresh.questions.match_result);

    await admin.auth.admin.deleteUser(doomed.id);

    const { data } = await admin.from("predictions").select("id").eq("id", id);
    expect(data?.length).toBe(0);
  });

  it("11. מחיקת ליגה — החברויות נמחקות ב-cascade", async () => {
    const owner = await world.user("בעל ליגה");
    const { id } = await world.league(owner, competition, "ליגה למחיקה");

    await admin.from("leagues").delete().eq("id", id);

    const { data } = await admin.from("league_members").select("id").eq("league_id", id);
    expect(data?.length).toBe(0);
  });

  it("12. מחיקת משחק — השאלות נמחקות ב-cascade", async () => {
    const doomed = await world.game(competition);
    await admin.from("games").delete().eq("id", doomed.id);

    const { data } = await admin.from("questions").select("id").eq("game_id", doomed.id);
    expect(data?.length).toBe(0);
  });

  it("13–14. הרשמה — הטריגר יצר פרופיל עם 0 נקודות, בלי מענק", async () => {
    const fresh = await world.user("נרשם עכשיו");
    const { data } = await admin
      .from("profiles")
      .select("id, username, total_points, total_predictions, total_correct")
      .eq("id", fresh.id)
      .single();

    expect(data).not.toBeNull();
    expect(data!.username.length).toBeLessThanOrEqual(30);
    expect(Number(data!.total_points)).toBe(0);
    expect(data!.total_predictions).toBe(0);
    expect(data!.total_correct).toBe(0);
  });

  it("15. שתי חברויות זהות — UNIQUE דוחה", async () => {
    const owner = await world.user("חבר יחיד");
    const { id } = await world.league(owner, competition, "ליגה לחברות");

    const { error } = await admin
      .from("league_members")
      .insert({ league_id: id, user_id: owner.id });
    expect(error?.code).toBe("23505");
  });

  it("16. שני אתגרים לאותו תאריך — UNIQUE דוחה", async () => {
    const puzzle = await world.puzzle(["Someone"]);

    const { error } = await admin.from("daily_puzzles").insert({
      play_date: puzzle.playDate,
      club_a: "מועדון ג",
      club_b: "מועדון ד",
      valid_answers: ["Another"],
    });
    expect(error?.code).toBe("23505");
  });

  it("סוג שאלה לא חוקי, ושתי שאלות מאותו סוג למשחק — נדחים", async () => {
    const fresh = await world.game(competition);

    const { error: typeError } = await admin.from("questions").insert({
      game_id: fresh.id,
      type: "corners",
      outcomes: [],
    });
    expect(typeError?.code).toBe("23514");

    const { error: dupError } = await admin.from("questions").insert({
      game_id: fresh.id,
      type: "btts",
      outcomes: [],
    });
    expect(dupError?.code).toBe("23505");
  });

  it("fixture_id כפול ב-games — UNIQUE דוחה", async () => {
    const fresh = await world.game(competition);
    const { error } = await admin.from("games").insert({
      fixture_id: fresh.fixtureId,
      competition_id: competition,
      home_team: "A",
      away_team: "B",
      kickoff_at: new Date().toISOString(),
    });
    expect(error?.code).toBe("23505");
  });
});
