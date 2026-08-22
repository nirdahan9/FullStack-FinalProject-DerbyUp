import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, profileOf, standingOf, World, type TestUser } from "./world";

/**
 * §4.3 and §4.4 — a prediction from placement to settlement, and cancellation.
 *
 * Settlement is driven through the real `settleFinishedGames`, with only the
 * provider mocked: everything downstream of the fetch — resolving the outcome,
 * scoring, the profile totals, the notification — is the code that runs in
 * production. Mocking the provider is what makes the test deterministic;
 * mocking anything below it would test the mock.
 */

const fetchFixturesByIds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/football-api/client", () => ({ fetchFixturesByIds }));

const { settleFinishedGames } = await import("@/lib/cron/settle");

/** The provider's shape for a finished fixture. */
function finished(fixtureId: number, home: number, away: number) {
  return {
    fixtureId,
    status: "finished" as const,
    scoreHome: home,
    scoreAway: away,
  };
}

describe("§4.3 מחזור חיים מלא של ניחוש", () => {
  const world = new World();
  let competition: number;
  let user: TestUser;

  beforeAll(async () => {
    competition = await world.competition();
    user = await world.user("מנחש");
  });

  // Reset per case rather than queueing values: settleFinishedGames returns
  // before it fetches when nothing is pending, so a queued value would survive
  // into the next test and be answered with the wrong fixture.
  // Braces matter: mockReset() returns the mock, and a function returned from
  // beforeEach is treated by Vitest as a teardown callback — so an arrow with
  // an implicit return would have Vitest *call* the mock after every test.
  beforeEach(() => {
    fetchFixturesByIds.mockReset();
  });

  afterAll(() => world.dispose());

  it("1–4. הנחת ניחוש — pending, יחס מוקפא, בונוס, בלי נקודות", async () => {
    const game = await world.game(competition);
    const id = await world.predict(user, game.questions.match_result, {
      outcome: "home",
      odds: 2.1,
      bonusPct: 20,
    });

    const { data } = await admin
      .from("predictions")
      .select("status, odds, bonus_pct, points_earned")
      .eq("id", id)
      .single();

    expect(data?.status).toBe("pending");
    expect(Number(data?.odds)).toBe(2.1);
    expect(data?.bonus_pct).toBe(20);
    expect(data?.points_earned).toBeNull();
  });

  it("5–8. עיבוד כשצדק — correct, נקודות = היחס, סכומי הפרופיל, התראה", async () => {
    const kickoff = new Date(Date.now() - 3 * 3_600_000);
    const game = await world.game(competition, { kickoffAt: kickoff });
    const id = await world.predict(user, game.questions.match_result, {
      outcome: "home",
      odds: 2.1,
    });
    const before = await profileOf(user.id);

    fetchFixturesByIds.mockResolvedValue([finished(game.fixtureId, 2, 0)]);
    const report = await settleFinishedGames();
    expect(report.errors).toEqual([]);

    const { data } = await admin
      .from("predictions")
      .select("status, points_earned")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("correct");
    expect(Number(data?.points_earned)).toBe(2.1);

    const after = await profileOf(user.id);
    expect(Number(after.total_points)).toBe(Number(before.total_points) + 2.1);
    expect(after.total_correct).toBe(before.total_correct + 1);

    const { data: notes } = await admin
      .from("notifications")
      .select("id, type")
      .eq("user_id", user.id)
      .eq("type", "prediction_settled");
    expect(notes?.length).toBeGreaterThan(0);
  });

  it("9–10. עיבוד כשטעה — incorrect, 0 נקודות, total_points ללא שינוי", async () => {
    const kickoff = new Date(Date.now() - 3 * 3_600_000);
    const game = await world.game(competition, { kickoffAt: kickoff });
    const id = await world.predict(user, game.questions.match_result, {
      outcome: "home",
      odds: 2.1,
    });
    const before = await profileOf(user.id);

    fetchFixturesByIds.mockResolvedValue([finished(game.fixtureId, 0, 3)]);
    await settleFinishedGames();

    const { data } = await admin
      .from("predictions")
      .select("status, points_earned")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("incorrect");
    expect(Number(data?.points_earned)).toBe(0);
    expect(Number((await profileOf(user.id)).total_points)).toBe(Number(before.total_points));
  });

  it("§7.1.4 תוצאה מגיעה פעמיים — עיבוד פעם אחת בלבד", async () => {
    const kickoff = new Date(Date.now() - 3 * 3_600_000);
    const game = await world.game(competition, { kickoffAt: kickoff });
    await world.predict(user, game.questions.match_result, { outcome: "home", odds: 3.0 });

    fetchFixturesByIds.mockResolvedValue([finished(game.fixtureId, 1, 0)]);
    await settleFinishedGames();
    const once = Number((await profileOf(user.id)).total_points);

    // The second run must not select the fixture again: settled_at is set.
    fetchFixturesByIds.mockResolvedValue([finished(game.fixtureId, 1, 0)]);
    const second = await settleFinishedGames();
    expect(second.gamesSettled).toBe(0);
    expect(Number((await profileOf(user.id)).total_points)).toBe(once);
  });

  it("§7.1.3 משחק שנדחה — הכל ל-void ו-0 נקודות", async () => {
    const kickoff = new Date(Date.now() - 3 * 3_600_000);
    const game = await world.game(competition, { kickoffAt: kickoff });
    const id = await world.predict(user, game.questions.match_result, { odds: 2.1 });
    const before = Number((await profileOf(user.id)).total_points);

    fetchFixturesByIds.mockResolvedValue([
      { fixtureId: game.fixtureId, status: "postponed" as const, scoreHome: null, scoreAway: null },
    ]);
    await settleFinishedGames();

    const { data } = await admin
      .from("predictions")
      .select("status, points_earned")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("void");
    expect(Number(data?.points_earned)).toBe(0);
    expect(Number((await profileOf(user.id)).total_points)).toBe(before);
  });

  it("§7.1.5 משחק ללא תוצאה למרות finished — לא מעובד", async () => {
    const kickoff = new Date(Date.now() - 3 * 3_600_000);
    const game = await world.game(competition, { kickoffAt: kickoff });
    const id = await world.predict(user, game.questions.match_result, { odds: 2.1 });

    fetchFixturesByIds.mockResolvedValue([
      { fixtureId: game.fixtureId, status: "finished" as const, scoreHome: null, scoreAway: null },
    ]);
    await settleFinishedGames();

    const { data } = await admin.from("predictions").select("status").eq("id", id).single();
    expect(data?.status).toBe("pending");
    const { data: g } = await admin.from("games").select("settled_at").eq("id", game.id).single();
    expect(g?.settled_at).toBeNull();
  });

});

describe("§4.4 ביטול ניחוש", () => {
  const world = new World();
  let competition: number;
  let user: TestUser;
  let league: string;

  beforeAll(async () => {
    competition = await world.competition();
    user = await world.user("מבטל");
    ({ id: league } = await world.league(user, competition));
  });

  afterAll(() => world.dispose());

  it("1–2. ביטול תקין — cancelled, cancelled_at מולא, אפשר לנחש מחדש", async () => {
    const game = await world.game(competition);
    const id = await world.predict(user, game.questions.match_result);

    const { error } = await user.client.rpc("cancel_prediction", { p_id: id });
    expect(error).toBeNull();

    const { data } = await admin
      .from("predictions")
      .select("status, cancelled_at")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("cancelled");
    expect(data?.cancelled_at).not.toBeNull();

    // The unique index is partial on status <> 'cancelled', so the same
    // question is open again — the bug a user hit in stage 6.
    const again = await world.predict(user, game.questions.match_result, { outcome: "away" });
    expect(again).toBeTruthy();
  });

  it("3–4. ניחוש מבוטל אינו מעובד ואינו נספר בדירוג", async () => {
    const game = await world.game(competition);
    const id = await world.predict(user, game.questions.match_result, {
      status: "cancelled",
      points: null,
    });

    const { data } = await admin.from("predictions").select("status").eq("id", id).single();
    expect(data?.status).toBe("cancelled");
    expect(Number((await standingOf(user, league, user.id))?.points)).toBe(0);
  });

  it("5. ביטול כפול במקביל — פעולה אחת בלבד", async () => {
    const game = await world.game(competition);
    const id = await world.predict(user, game.questions.match_result);

    const results = await Promise.all([
      user.client.rpc("cancel_prediction", { p_id: id }),
      user.client.rpc("cancel_prediction", { p_id: id }),
    ]);

    // FOR UPDATE serialises them: the second sees a non-pending row.
    expect(results.filter((r) => r.error === null).length).toBe(1);
    expect(results.some((r) => r.error?.message.includes("ALREADY_SETTLED"))).toBe(true);
  });

  it("6–7. UPDATE ו-DELETE ישירים על predictions — נדחים ב-RLS", async () => {
    const game = await world.game(competition);
    const id = await world.predict(user, game.questions.match_result);

    await user.client.from("predictions").update({ status: "cancelled" }).eq("id", id);
    await user.client.from("predictions").delete().eq("id", id);

    const { data } = await admin.from("predictions").select("status").eq("id", id).single();
    expect(data?.status).toBe("pending");
  });

  it("ביטול בתוך חלון 10 הדקות — CANCEL_WINDOW_CLOSED", async () => {
    const game = await world.game(competition, {
      kickoffAt: new Date(Date.now() + 5 * 60_000),
    });
    const id = await world.predict(user, game.questions.match_result);

    const { error } = await user.client.rpc("cancel_prediction", { p_id: id });
    expect(error?.message).toContain("CANCEL_WINDOW_CLOSED");
  });
});
