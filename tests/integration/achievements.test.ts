import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "@/lib/domain/achievements";
import { awardAchievements } from "@/lib/achievements/award";
import { admin, World, type TestUser } from "./world";

/**
 * Achievements, end to end.
 *
 * The unit suite already checks `newlyEarned` against every combination of
 * stats. What needs a database is the half that was actually broken: whether
 * the stats reaching it are real. `bestRank` was hard-coded to null, so
 * `league_leader` could never be earned by anybody — a badge on the profile
 * page that nothing could unlock.
 */
describe("הישגים — הענקה בפועל", () => {
  const world = new World();
  let competition: number;

  async function badgesOf(user: TestUser): Promise<string[]> {
    const { data } = await admin
      .from("user_achievements")
      .select("achievement_key")
      .eq("user_id", user.id);
    return (data ?? []).map((a) => a.achievement_key).sort();
  }

  beforeAll(async () => {
    competition = await world.competition();
  });

  afterAll(() => world.dispose());

  it("כל 8 ההישגים ניתנים להשגה — אף אחד אינו מת", async () => {
    const user = await world.user("אספן");
    const { id: league } = await world.league(user, competition, "ליגת ההישגים");

    // A private league where this user is the only member and has scored,
    // which makes them first.
    const games = await Promise.all(
      Array.from({ length: 10 }, () => world.game(competition)),
    );
    for (const [i, game] of games.entries()) {
      await world.predict(user, game.questions.match_result, {
        status: "correct",
        points: i === 0 ? 6.5 : 2.1,
        odds: i === 0 ? 6.5 : 2.1,
      });
    }

    const puzzle = await world.puzzle(["Someone"]);
    await admin.from("puzzle_attempts").insert({
      user_id: user.id,
      puzzle_id: puzzle.id,
      answer: "Someone",
      is_correct: true,
      attempt_number: 1,
      points_earned: 5,
    });

    await awardAchievements(user.id);

    // Every achievement the product defines, held by one user.
    expect(await badgesOf(user)).toEqual(ACHIEVEMENTS.map((a) => a.key).sort());

    const { data: standing } = await admin.rpc("best_league_rank", { p_user: user.id });
    expect(Number(standing)).toBe(1);
    expect(league).toBeTruthy();
  });

  it("league_leader אינו מוענק למי שאינו ראשון", async () => {
    const leader = await world.user("מוביל", { signIn: false });
    const second = await world.user("שני בתור");
    const { id: league } = await world.league(second, competition, "ליגה עם שניים");
    await admin.from("league_members").insert({ league_id: league, user_id: leader.id });

    const game = await world.game(competition);
    await world.predict(leader, game.questions.match_result, { status: "correct", points: 9 });
    await world.predict(second, game.questions.btts, {
      outcome: "yes",
      status: "correct",
      points: 1,
    });

    await awardAchievements(second.id);

    expect(await badgesOf(second)).not.toContain("league_leader");
    const { data: rank } = await admin.rpc("best_league_rank", { p_user: second.id });
    expect(Number(rank)).toBe(2);
  });

  it("ליגה ציבורית אינה מזכה ב-league_joined ולא ב-league_leader", async () => {
    // Signing up auto-joins the public leagues; being top of one of those is
    // not the achievement the product means.
    const user = await world.user("רק ציבוריות", { signIn: false });

    const { data: memberships } = await admin
      .from("league_members")
      .select("leagues!inner(is_public)")
      .eq("user_id", user.id);
    expect(memberships?.length).toBeGreaterThan(0);
    expect(
      memberships?.every((m) => (m.leagues as unknown as { is_public: boolean }).is_public),
    ).toBe(true);

    await awardAchievements(user.id);

    const badges = await badgesOf(user);
    expect(badges).not.toContain("league_joined");
    expect(badges).not.toContain("league_leader");
    const { data: rank } = await admin.rpc("best_league_rank", { p_user: user.id });
    expect(rank).toBeNull();
  });

  it("פתרון האתגר לבדו מזכה, בלי שאף ניחוש יושב", async () => {
    const user = await world.user("רק אתגר", { signIn: false });
    const puzzle = await world.puzzle(["Someone"]);
    await admin.from("puzzle_attempts").insert({
      user_id: user.id,
      puzzle_id: puzzle.id,
      answer: "Someone",
      is_correct: true,
      attempt_number: 1,
      points_earned: 5,
    });

    // This is the case the old code missed: achievements were computed only
    // inside settlement, so a challenge-only player never got a badge.
    await awardAchievements(user.id);

    expect(await badgesOf(user)).toEqual(["first_puzzle"]);
  });

  it("הענקה חוזרת אינה מכפילה", async () => {
    const user = await world.user("כפול", { signIn: false });
    const puzzle = await world.puzzle(["Someone"]);
    await admin.from("puzzle_attempts").insert({
      user_id: user.id,
      puzzle_id: puzzle.id,
      answer: "Someone",
      is_correct: true,
      attempt_number: 1,
      points_earned: 5,
    });

    expect(await awardAchievements(user.id)).toBe(1);
    expect(await awardAchievements(user.id)).toBe(0);
    expect(await badgesOf(user)).toEqual(["first_puzzle"]);

    const { data: notes } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "achievement");
    expect(notes?.length).toBe(1);
  });

  it("משתמש אינו יכול להעניק לעצמו הישג", async () => {
    const user = await world.user("רמאי");

    const { error } = await user.client
      .from("user_achievements")
      .insert({ user_id: user.id, achievement_key: "league_leader" });

    expect(error).not.toBeNull();
    expect(await badgesOf(user)).toEqual([]);
  });

  it("סוג ההתראה puzzle_available הוסר מהסכימה", async () => {
    const user = await world.user("מקבל התראות", { signIn: false });

    const { error } = await admin.from("notifications").insert({
      user_id: user.id,
      type: "puzzle_available",
      title: "אתגר חדש",
    });

    // Nothing ever produced this type; leaving it in the CHECK would have kept
    // a promise in the schema that the product does not make.
    expect(error?.code).toBe("23514");
  });
});
