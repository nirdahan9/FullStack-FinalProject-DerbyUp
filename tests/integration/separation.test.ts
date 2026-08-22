import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, profileOf, standingOf, World, type TestUser } from "./world";

/**
 * §4.7 — the two boards side by side.
 *
 * Each case scores one user once and then reads both boards. If the league
 * ever agrees with the site-wide board on a case below, one of the two is not
 * filtering — which is exactly the bug this section exists to catch.
 */
describe("§4.7 הפרדה בין דירוג הליגה ללידרבורד", () => {
  const world = new World();
  let competition: number;
  let other: number;
  let league: string;
  let admin_: TestUser;

  async function credit(user: TestUser, points: number) {
    const before = Number((await profileOf(user.id)).total_points);
    await admin.from("profiles").update({ total_points: before + points }).eq("id", user.id);
  }

  async function join(user: TestUser) {
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });
  }

  beforeAll(async () => {
    competition = await world.competition("טורניר הליגה");
    other = await world.competition("טורניר אחר");
    admin_ = await world.user("מנהל");
    ({ id: league } = await world.league(admin_, competition));
  });

  afterAll(() => world.dispose());

  it("1. מנצח (2.10) + BTTS (1.75) באותו משחק — ליגה 2.10, כללי 3.85", async () => {
    const user = await world.user("שני שווקים", { signIn: false });
    await join(user);
    const game = await world.game(competition);

    await world.predict(user, game.questions.match_result, { status: "correct", points: 2.1 });
    await world.predict(user, game.questions.btts, {
      outcome: "yes",
      status: "correct",
      points: 1.75,
    });
    await credit(user, 2.1 + 1.75);

    expect(Number((await standingOf(admin_, league, user.id))?.points)).toBe(2.1);
    expect(Number((await profileOf(user.id)).total_points)).toBe(3.85);
  });

  it("2. פתרון אתגר יומי בלבד — ליגה 0, כללי 5", async () => {
    const user = await world.user("רק אתגר", { signIn: false });
    await join(user);
    await credit(user, 5);

    expect(Number((await standingOf(admin_, league, user.id))?.points)).toBe(0);
    expect(Number((await profileOf(user.id)).total_points)).toBe(5);
  });

  it("3. מנצח בטורניר אחר — ליגה 0, כללי היחס", async () => {
    const user = await world.user("טורניר אחר", { signIn: false });
    await join(user);
    const game = await world.game(other);
    await world.predict(user, game.questions.match_result, { status: "correct", points: 7.15 });
    await credit(user, 7.15);

    expect(Number((await standingOf(admin_, league, user.id))?.points)).toBe(0);
    expect(Number((await profileOf(user.id)).total_points)).toBe(7.15);
  });

  it("4. שני משתמשים — הסדר שונה בין שני הלוחות", async () => {
    // א׳ scores only inside the league's tournament, on the winner market.
    const a = await world.user("חזק בליגה", { signIn: false });
    await join(a);
    const inLeague = await world.game(competition);
    await world.predict(a, inLeague.questions.match_result, { status: "correct", points: 4 });
    await credit(a, 4);

    // ב׳ scores more overall, but none of it on a market the league counts.
    const b = await world.user("חזק בכללי", { signIn: false });
    await join(b);
    const game = await world.game(competition);
    await world.predict(b, game.questions.over_under_2_5, {
      outcome: "over",
      status: "correct",
      points: 6,
    });
    await world.predict(b, game.questions.btts, {
      outcome: "yes",
      status: "correct",
      points: 4,
    });
    await credit(b, 10);

    const leaguePoints = {
      a: Number((await standingOf(admin_, league, a.id))?.points),
      b: Number((await standingOf(admin_, league, b.id))?.points),
    };
    const globalPoints = {
      a: Number((await profileOf(a.id)).total_points),
      b: Number((await profileOf(b.id)).total_points),
    };

    expect(leaguePoints).toEqual({ a: 4, b: 0 });
    expect(globalPoints).toEqual({ a: 4, b: 10 });

    // The proof: א׳ leads the league, ב׳ leads the site.
    expect(leaguePoints.a).toBeGreaterThan(leaguePoints.b);
    expect(globalPoints.a).toBeLessThan(globalPoints.b);
  });
});
