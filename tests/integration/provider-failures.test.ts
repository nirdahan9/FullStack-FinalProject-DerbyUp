import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, World, type TestUser } from "./world";

/**
 * §7.4 — what happens when API-Football does not cooperate.
 *
 * The product's whole fixture list comes from one provider, so its bad days
 * are a design input, not an edge case: the rule everywhere here is that a
 * failed fetch leaves the database exactly as it was. Nothing half-written,
 * nothing settled on a guess.
 *
 * The failure mocks throw synchronously rather than returning a rejected
 * promise. `await` catches both identically, but a rejected promise handed to
 * a spy is also inspected by Vitest's own result tracking, which reports it as
 * an unhandled rejection before the code under test ever awaits it.
 */

const fetchFixturesByIds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/football-api/client", () => ({ fetchFixturesByIds }));

const { settleFinishedGames } = await import("@/lib/cron/settle");

describe("§7.4 כשל בספק החיצוני", () => {
  const world = new World();
  let competition: number;
  let user: TestUser;

  beforeAll(async () => {
    competition = await world.competition();
    user = await world.user("מנחש");
  });

  // Braces matter: mockReset() returns the mock, and a function returned from
  // beforeEach is treated by Vitest as a teardown callback — so an arrow with
  // an implicit return would have Vitest *call* the mock after every test.
  beforeEach(() => {
    fetchFixturesByIds.mockReset();
  });
  afterAll(() => world.dispose());

  /** A fixture that has kicked off and is waiting for a result. */
  async function awaitingResult() {
    const game = await world.game(competition, {
      kickoffAt: new Date(Date.now() - 3 * 3_600_000),
    });
    const id = await world.predict(user, game.questions.match_result, { odds: 2.1 });
    return { game, id };
  }

  async function statusOf(id: string) {
    const { data } = await admin.from("predictions").select("status").eq("id", id).single();
    return data?.status;
  }

  it("1. הספק מחזיר 500 — מדווח שגיאה, נתונים קיימים נשמרים", async () => {
    const { id } = await awaitingResult();
    fetchFixturesByIds.mockImplementation(() => {
      throw new Error("api-football 500 Internal Server Error");
    });

    const report = await settleFinishedGames();

    expect(report.errors.some((e) => e.includes("500"))).toBe(true);
    expect(report.gamesSettled).toBe(0);
    expect(await statusOf(id)).toBe("pending");
  });

  it("2. timeout — נרשם בדוח, בלי קריסה", async () => {
    const { id } = await awaitingResult();
    fetchFixturesByIds.mockImplementation(() => {
      throw Object.assign(new Error("fetch failed"), { cause: { code: "ETIMEDOUT" } });
    });

    const report = await settleFinishedGames();

    expect(report.errors.length).toBeGreaterThan(0);
    expect(await statusOf(id)).toBe("pending");
  });

  it("3. חריגת מכסה (429) — לא מיושב; ההרצה הבאה מצליחה", async () => {
    const { game, id } = await awaitingResult();

    fetchFixturesByIds.mockImplementation(() => {
      throw new Error("api-football 429 Too Many Requests");
    });
    await settleFinishedGames();
    expect(await statusOf(id)).toBe("pending");

    // Nothing was written, so the retry has the same work to do and does it.
    fetchFixturesByIds.mockImplementation(async () => [
      { fixtureId: game.fixtureId, status: "finished" as const, scoreHome: 2, scoreAway: 0 },
    ]);
    const retry = await settleFinishedGames();

    expect(retry.errors).toEqual([]);
    expect(await statusOf(id)).toBe("correct");
  });

  it("4. תשובה במבנה לא צפוי — אין כתיבה שגויה", async () => {
    const { id } = await awaitingResult();
    // A fixture the request did not ask about, with no usable status.
    fetchFixturesByIds.mockImplementation(async () => [
      { fixtureId: -1, status: "scheduled" as const, scoreHome: null, scoreAway: null },
    ]);

    const report = await settleFinishedGames();

    expect(report.gamesSettled).toBe(0);
    expect(await statusOf(id)).toBe("pending");
  });

  it("5. יחסים חסרים לשוק מסוים — ברירת מחדל, והשאלה עדיין נוצרת", async () => {
    // parseOdds is pure, so this one needs no database: a bookmaker that
    // prices nothing must still yield three markets, or the fixture would
    // silently vanish from the product.
    const { parseOdds, buildQuestions } = await import("@/lib/football-api/mapping");
    const { odds, complete } = parseOdds([{ name: "Bookie", bets: [] }]);

    expect(complete).toBe(false);
    expect(Object.values(odds).every((o) => o >= 1)).toBe(true);
    expect(buildQuestions(odds, { home: "בית", away: "חוץ" }).map((q) => q.type)).toEqual([
      "match_result",
      "over_under_2_5",
      "btts",
    ]);
  });
});
