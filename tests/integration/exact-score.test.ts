import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, standingOf, World, type TestUser } from "./world";

/**
 * The exact-score bonus, settled by the job that settles it in production.
 *
 * The unit suite proves the arithmetic. What needs a database is that the
 * column survives the round trip, that the ×3 reaches the league table, and
 * that the CHECK constraint refuses a shape the picker could never produce.
 */

const fetchFixturesByIds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/football-api/client", () => ({ fetchFixturesByIds }));

const { settleFinishedGames } = await import("@/lib/cron/settle");

describe("תוצאה מדויקת — מקצה לקצה", () => {
  const world = new World();
  let competition: number;
  let league: string;
  let owner: TestUser;

  beforeAll(async () => {
    competition = await world.competition("טורניר תוצאות");
    owner = await world.user("מנהל");
    ({ id: league } = await world.league(owner, competition));
  });

  beforeEach(() => {
    fetchFixturesByIds.mockReset();
  });

  afterAll(() => world.dispose());

  /** Kicks off a fixture, settles it at the given score, returns the row. */
  async function settleAt(
    user: TestUser,
    opts: { predictOutcome: string; exactScore: string | null; home: number; away: number },
  ) {
    const game = await world.game(competition, {
      kickoffAt: new Date(Date.now() - 3 * 3_600_000),
    });
    const { data: inserted, error } = await admin
      .from("predictions")
      .insert({
        user_id: user.id,
        question_id: game.questions.match_result,
        selected_outcome: opts.predictOutcome,
        odds: 2.1,
        exact_score: opts.exactScore,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    fetchFixturesByIds.mockResolvedValue([
      {
        fixtureId: game.fixtureId,
        status: "finished" as const,
        scoreHome: opts.home,
        scoreAway: opts.away,
      },
    ]);
    const report = await settleFinishedGames();
    expect(report.errors).toEqual([]);

    const { data } = await admin
      .from("predictions")
      .select("status, points_earned, exact_score")
      .eq("id", inserted.id)
      .single();
    return data!;
  }

  it("פגיעה בתוצאה — פי 3", async () => {
    const user = await world.user("פגע", { signIn: false });
    await admin.from("league_members").insert({ league_id: league, user_id: user.id });

    const row = await settleAt(user, {
      predictOutcome: "home",
      exactScore: "2-1",
      home: 2,
      away: 1,
    });

    expect(row.status).toBe("correct");
    expect(Number(row.points_earned)).toBe(6.3);
    // The bonus reaches the league table too — it is the same winner call,
    // made more precisely, not a separate market the league filters out.
    expect(Number((await standingOf(owner, league, user.id))?.points)).toBe(6.3);
  });

  it("מנצחת נכונה, תוצאה שגויה — הניקוד הרגיל, בלי עונש", async () => {
    const user = await world.user("קרוב", { signIn: false });

    const row = await settleAt(user, {
      predictOutcome: "home",
      exactScore: "2-1",
      home: 4,
      away: 0,
    });

    expect(row.status).toBe("correct");
    expect(Number(row.points_earned)).toBe(2.1);
  });

  it("מנצחת שגויה — התוצאה המדויקת לא מצילה", async () => {
    const user = await world.user("טעה", { signIn: false });

    const row = await settleAt(user, {
      predictOutcome: "home",
      exactScore: "0-2",
      home: 0,
      away: 2,
    });

    expect(row.status).toBe("incorrect");
    expect(Number(row.points_earned)).toBe(0);
  });

  it("בלי תוצאה מדויקת — הניקוד כרגיל", async () => {
    const user = await world.user("בלי", { signIn: false });

    const row = await settleAt(user, {
      predictOutcome: "home",
      exactScore: null,
      home: 2,
      away: 1,
    });

    expect(row.status).toBe("correct");
    expect(Number(row.points_earned)).toBe(2.1);
    expect(row.exact_score).toBeNull();
  });

  it("תיקו 0-0 נספר כפגיעה", async () => {
    const user = await world.user("תיקו", { signIn: false });

    const row = await settleAt(user, {
      predictOutcome: "draw",
      exactScore: "0-0",
      home: 0,
      away: 0,
    });

    expect(row.status).toBe("correct");
    expect(Number(row.points_earned)).toBe(6.3);
  });

  it.each([
    ["2:1", "23514", "CHECK — מקף, לא נקודתיים"],
    ["2-", "23514", "CHECK — חסר צד"],
    ["abc", "23514", "CHECK — אותיות"],
    ["12-1", "22001", "varchar(3) — ארוך מדי"],
    ["2 - 1", "22001", "varchar(3) — רווחים מאריכים"],
  ])("פורמט %s נדחה במסד (%s · %s)", async (value, code) => {
    const user = await world.user("פורמט", { signIn: false });
    const game = await world.game(competition);

    const { error } = await admin.from("predictions").insert({
      user_id: user.id,
      question_id: game.questions.match_result,
      selected_outcome: "home",
      odds: 2.1,
      exact_score: value,
    });

    // Two constraints, one rule: varchar(3) catches anything longer than
    // "H-A", and the CHECK catches everything that fits but is not a score.
    // Which one fires does not matter — that nothing invalid is stored does.
    expect(error?.code).toBe(code);
  });

  it("משתמש אינו יכול לשנות תוצאה מדויקת אחרי ההנחה", async () => {
    const user = await world.user("מנסה");
    const game = await world.game(competition);
    const id = await world.predict(user, game.questions.match_result);
    await admin.from("predictions").update({ exact_score: "1-0" }).eq("id", id);

    // predictions has no UPDATE policy, so this changes nothing — the same
    // wall that stops points_earned being edited.
    await user.client.from("predictions").update({ exact_score: "9-0" }).eq("id", id);

    const { data } = await admin
      .from("predictions")
      .select("exact_score")
      .eq("id", id)
      .single();
    expect(data?.exact_score).toBe("1-0");
  });
});
