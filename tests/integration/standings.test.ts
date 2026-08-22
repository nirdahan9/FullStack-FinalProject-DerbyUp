import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, standingOf, World, type TestGame, type TestUser } from "./world";

/**
 * §4.5 — the league table.
 *
 * The standings are computed, not stored, and pass through three filters:
 * match_result only, this competition only, and only from the member's
 * joined_at onwards. Each filter changes the answer, so each gets a case.
 */
describe("§4.5 חישוב דירוג הליגה", () => {
  const world = new World();
  let competition: number;
  let other: number;
  let league: string;
  let member: TestUser;
  let game: TestGame;

  beforeAll(async () => {
    competition = await world.competition("טורניר הליגה");
    other = await world.competition("טורניר אחר");
    member = await world.user("חבר");
    ({ id: league } = await world.league(member, competition));
    game = await world.game(competition);
  });

  afterAll(() => world.dispose());

  it("1. שלושה ניחושי מנצח נכונים — סכום שלושת היחסים", async () => {
    const user = await world.user("סוכם", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });

    for (const odds of [2.1, 3.4, 1.5]) {
      const g = await world.game(competition);
      await world.predict(user, g.questions.match_result, { status: "correct", points: odds, odds });
    }

    const row = await standingOf(member, league, user.id);
    expect(Number(row?.points)).toBe(7);
  });

  it("2. ניחושים נכונים ושגויים — רק הנכונים נספרים", async () => {
    const user = await world.user("מעורב", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });

    const hit = await world.game(competition);
    const miss = await world.game(competition);
    await world.predict(user, hit.questions.match_result, { status: "correct", points: 2.5 });
    await world.predict(user, miss.questions.match_result, { status: "incorrect", points: 0 });

    const row = await standingOf(member, league, user.id);
    expect(Number(row?.points)).toBe(2.5);
    expect(Number(row?.correct_count ?? 0)).toBe(1);
  });

  it("3. ניחוש over_under_2_5 נכון — לא נספר בליגה", async () => {
    const user = await world.user("מעל-מתחת", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
    await world.predict(user, game.questions.over_under_2_5, {
      outcome: "over",
      status: "correct",
      points: 1.75,
    });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(0);
  });

  it("4. ניחוש btts נכון — לא נספר בליגה", async () => {
    const user = await world.user("שתיהן", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
    await world.predict(user, game.questions.btts, {
      outcome: "yes",
      status: "correct",
      points: 1.8,
    });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(0);
  });

  it("5. נקודות מהאתגר היומי — לא נספרות בליגה", async () => {
    const user = await world.user("פותר אתגרים", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
    // The challenge credits the profile cache directly; the league never
    // reads that column, which is the whole point of computing the table.
    await admin.from("profiles").update({ total_points: 5 }).eq("id", user.id);

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(0);
  });

  it("6. ניחוש מנצח בתחרות אחרת — לא נספר בליגה הזו", async () => {
    const user = await world.user("נודד", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
    const elsewhere = await world.game(other);
    await world.predict(user, elsewhere.questions.match_result, { status: "correct", points: 9.9 });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(0);
  });

  it("7. ניחוש מנצח לפני ההצטרפות — לא נספר", async () => {
    const user = await world.user("ותיק", { signIn: false });
    const g = await world.game(competition);
    await world.predict(user, g.questions.match_result, {
      status: "correct",
      points: 4.4,
      predictedAt: new Date(Date.now() - 86_400_000),
    });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(0);
  });

  it("8. ניחוש מנצח אחרי ההצטרפות בתחרות הנכונה — נספר", async () => {
    const user = await world.user("מצטרף", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
    const g = await world.game(competition);
    await world.predict(user, g.questions.match_result, { status: "correct", points: 3.3 });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(3.3);
  });

  it("9. אותו משתמש בשתי ליגות של אותה תחרות — אותו ניקוד בשתיהן", async () => {
    const user = await world.user("כפול");
    const second = await world.league(user, competition, "ליגה שנייה");
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });

    const g = await world.game(competition);
    await world.predict(user, g.questions.match_result, { status: "correct", points: 2.2 });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(2.2);
    expect(Number((await standingOf(user, second.id, user.id))?.points)).toBe(2.2);
  });

  it("10. אותו משתמש בשתי ליגות של תחרויות שונות — ניקוד שונה בכל אחת", async () => {
    const user = await world.user("מפוצל");
    const elsewhere = await world.league(user, other, "ליגת הטורניר האחר");
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });

    const here = await world.game(competition);
    const there = await world.game(other);
    await world.predict(user, here.questions.match_result, { status: "correct", points: 1.5 });
    await world.predict(user, there.questions.match_result, { status: "correct", points: 6.5 });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(1.5);
    expect(Number((await standingOf(user, elsewhere.id, user.id))?.points)).toBe(6.5);
  });

  it("11. ניחוש מבוטל — לא נספר", async () => {
    const user = await world.user("מבטל", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
    const g = await world.game(competition);
    await world.predict(user, g.questions.match_result, { status: "cancelled", points: null });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(0);
  });

  it("12. ניחוש void (משחק בוטל) — לא נספר", async () => {
    const user = await world.user("בוטל", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
    const g = await world.game(competition);
    await world.predict(user, g.questions.match_result, { status: "void", points: 0 });

    expect(Number((await standingOf(member, league, user.id))?.points)).toBe(0);
  });

  it("13. חבר שניחש רק Over/Under ו-BTTS — 0 נקודות בליגה, אבל מופיע בטבלה", async () => {
    const user = await world.user("שוקי שווקים", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
    const g = await world.game(competition);
    await world.predict(user, g.questions.over_under_2_5, {
      outcome: "under",
      status: "correct",
      points: 2.05,
    });
    await world.predict(user, g.questions.btts, { outcome: "no", status: "correct", points: 1.95 });

    const row = await standingOf(member, league, user.id);
    expect(row).toBeDefined();
    expect(Number(row?.points)).toBe(0);
  });
});
