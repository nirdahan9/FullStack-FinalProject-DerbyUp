import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, World, type TestGame, type TestUser } from "./world";

/**
 * §5.2 — what a league admin may do, and what an ordinary member may not.
 *
 * Two of the three admin powers are plain updates on `leagues`, restricted by
 * the creator policy. The third — settling a game by hand — writes to a table
 * no user writes to, so it is a SECURITY DEFINER function with its own checks.
 */
describe("§5.2 הרשאות אדמין ליגה", () => {
  const world = new World();
  let competition: number;
  let other: number;
  let owner: TestUser;
  let member: TestUser;
  let league: string;
  let game: TestGame;

  beforeAll(async () => {
    competition = await world.competition();
    other = await world.competition("טורניר אחר");
    owner = await world.user("מנהל");
    member = await world.user("חבר");

    const created = await world.league(owner, competition, "ליגת המשרד");
    league = created.id;
    await member.client.rpc("join_league", { p_invite_code: created.code });

    game = await world.game(competition);
  });

  afterAll(() => world.dispose());

  it("1. האדמין מסמן משחק שבוע — מצליח", async () => {
    const { error } = await owner.client
      .from("leagues")
      .update({ featured_game_id: game.id, featured_bonus_pct: 25 })
      .eq("id", league);
    expect(error).toBeNull();

    const { data } = await admin
      .from("leagues")
      .select("featured_game_id, featured_bonus_pct")
      .eq("id", league)
      .single();
    expect(data?.featured_game_id).toBe(game.id);
    expect(data?.featured_bonus_pct).toBe(25);
  });

  it("2. חבר רגיל מסמן משחק שבוע — נדחה", async () => {
    const another = await world.game(competition);

    await member.client
      .from("leagues")
      .update({ featured_game_id: another.id, featured_bonus_pct: 90 })
      .eq("id", league);

    const { data } = await admin
      .from("leagues")
      .select("featured_game_id, featured_bonus_pct")
      .eq("id", league)
      .single();
    expect(data?.featured_game_id).toBe(game.id);
    expect(data?.featured_bonus_pct).toBe(25);
  });

  it("3. חבר רגיל מעדכן פרסים — נדחה", async () => {
    await member.client
      .from("leagues")
      .update({ prizes: [{ place: 1, prize: "לעצמי" }] })
      .eq("id", league);

    const { data } = await admin.from("leagues").select("prizes").eq("id", league).single();
    expect(data?.prizes).toBeNull();
  });

  it("4. חבר רגיל מיישב ידנית — NOT_LEAGUE_ADMIN", async () => {
    const started = await world.game(competition, {
      kickoffAt: new Date(Date.now() - 3 * 3_600_000),
    });

    const { error } = await member.client.rpc("settle_game_manually", {
      p_league_id: league,
      p_game_id: started.id,
      p_score_home: 3,
      p_score_away: 0,
    });

    expect(error?.message).toContain("NOT_LEAGUE_ADMIN");
    const { data } = await admin
      .from("games")
      .select("score_home, status")
      .eq("id", started.id)
      .single();
    expect(data?.score_home).toBeNull();
    expect(data?.status).toBe("scheduled");
  });

  it("5. אדמין של ליגה א׳ מנהל ליגה ב׳ — נדחה", async () => {
    const stranger = await world.user("מנהל אחר");
    const theirs = await world.league(stranger, competition, "הליגה שלהם");

    await owner.client
      .from("leagues")
      .update({ name: "השתלטתי" })
      .eq("id", theirs.id);

    const { data } = await admin.from("leagues").select("name").eq("id", theirs.id).single();
    expect(data?.name).toBe("הליגה שלהם");
  });

  it("האדמין מיישב ידנית משחק של הטורניר שלו — מצליח, ומשאיר את היישוב ל-cron", async () => {
    const started = await world.game(competition, {
      kickoffAt: new Date(Date.now() - 3 * 3_600_000),
    });

    const { error } = await owner.client.rpc("settle_game_manually", {
      p_league_id: league,
      p_game_id: started.id,
      p_score_home: 2,
      p_score_away: 1,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from("games")
      .select("score_home, score_away, status, settled_at")
      .eq("id", started.id)
      .single();
    expect(data?.score_home).toBe(2);
    expect(data?.score_away).toBe(1);
    expect(data?.status).toBe("finished");
    // The scoring itself is left to the scheduled job, so there is only ever
    // one implementation of it.
    expect(data?.settled_at).toBeNull();
  });

  it("האדמין אינו יכול ליישב משחק מטורניר אחר", async () => {
    const elsewhere = await world.game(other, {
      kickoffAt: new Date(Date.now() - 3 * 3_600_000),
    });

    const { error } = await owner.client.rpc("settle_game_manually", {
      p_league_id: league,
      p_game_id: elsewhere.id,
      p_score_home: 1,
      p_score_away: 1,
    });
    expect(error).not.toBeNull();
  });

  it("משחק שטרם התחיל אינו ניתן ליישוב ידני", async () => {
    const { error } = await owner.client.rpc("settle_game_manually", {
      p_league_id: league,
      p_game_id: game.id,
      p_score_home: 1,
      p_score_away: 0,
    });
    expect(error?.message).toContain("GAME_NOT_STARTED");
  });

  it("תוצאה שלילית נדחית", async () => {
    const started = await world.game(competition, {
      kickoffAt: new Date(Date.now() - 3 * 3_600_000),
    });

    const { error } = await owner.client.rpc("settle_game_manually", {
      p_league_id: league,
      p_game_id: started.id,
      p_score_home: -1,
      p_score_away: 0,
    });
    expect(error?.message).toContain("INVALID_SCORE");
  });
});
