import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, World, type TestUser } from "./world";

/**
 * §4.10 — the live layer, against the real database.
 *
 * Two claims are being tested, and they are the two the feature lives or dies
 * on:
 *
 *   1. the sync is a display layer — it moves a score and nothing else;
 *   2. the number shown during a match is the number credited after it.
 *
 * (2) is checked end to end here rather than only as a property in the unit
 * suite, because between the projection and settlement sit two more things
 * that could disagree with each other: the filters in
 * league_live_predictions and the filters in league_standings.
 */

const fetchLiveFixtures = vi.hoisted(() => vi.fn());
const fetchFixturesByIds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/football-api/client", () => ({ fetchLiveFixtures, fetchFixturesByIds }));

const { syncLiveScores } = await import("@/lib/cron/sync-live");
const { settleFinishedGames } = await import("@/lib/cron/settle");
const { getLeagueLive } = await import("@/lib/live/league");

/** What the provider returns for a match in progress. */
function livePayload(
  fixtureId: number,
  scoreHome: number,
  scoreAway: number,
  minute: number,
) {
  return {
    fixtureId,
    competitionId: 0,
    homeTeam: "Test Home",
    awayTeam: "Test Away",
    homeLogo: null,
    awayLogo: null,
    kickoffAt: new Date().toISOString(),
    status: "live" as const,
    scoreHome,
    scoreAway,
    minute,
  };
}

async function gameRow(id: string) {
  const { data } = await admin
    .from("games")
    .select("status, score_home, score_away, minute, live_updated_at, settled_at")
    .eq("id", id)
    .single();
  return data!;
}

describe("§4.10 שכבת הלייב", () => {
  const world = new World();
  let competition: number;
  let user: TestUser;

  beforeAll(async () => {
    competition = await world.competition();
    user = await world.user("צופה");
  });

  beforeEach(() => {
    fetchLiveFixtures.mockReset();
    fetchFixturesByIds.mockReset();
  });
  afterAll(() => world.dispose());

  /** A fixture that kicked off an hour ago and is still being played. */
  async function inProgress() {
    return world.game(competition, {
      kickoffAt: new Date(Date.now() - 3_600_000),
      status: "live",
    });
  }

  describe("הסנכרון", () => {
    it("1. כותב תוצאה, דקה וחותמת זמן למשחק קיים", async () => {
      const game = await inProgress();
      fetchLiveFixtures.mockResolvedValue([livePayload(game.fixtureId, 2, 1, 63)]);

      const report = await syncLiveScores();

      expect(report.apiCalls).toBe(1);
      expect(report.errors).toEqual([]);

      const row = await gameRow(game.id);
      expect(row.score_home).toBe(2);
      expect(row.score_away).toBe(1);
      expect(row.minute).toBe(63);
      expect(row.live_updated_at).not.toBeNull();
    });

    it("2. לעולם לא נוגע בניחושים ולא בנקודות", async () => {
      // The commitment the whole design rests on. A live sync that could write
      // a point would need every guarantee settlement has.
      const game = await inProgress();
      const id = await world.predict(user, game.questions.match_result, { odds: 2.1 });
      fetchLiveFixtures.mockResolvedValue([livePayload(game.fixtureId, 3, 0, 80)]);

      await syncLiveScores();

      const { data } = await admin
        .from("predictions")
        .select("status, points_earned, settled_at")
        .eq("id", id)
        .single();

      expect(data).toEqual({ status: "pending", points_earned: null, settled_at: null });
      expect((await gameRow(game.id)).settled_at).toBeNull();
    });

    it("3. לא יוצר משחק שאינו קיים אצלנו", async () => {
      // Fixtures are created by the daily sync, which also prices them and
      // writes their questions. A fixture invented here would be one nobody
      // could ever have predicted on.
      await inProgress();
      const strangerId = 98_000_000 + Math.floor(Math.random() * 900_000);
      fetchLiveFixtures.mockResolvedValue([livePayload(strangerId, 1, 0, 20)]);

      const report = await syncLiveScores();

      expect(report.gamesUpdated).toBe(0);
      const { data } = await admin
        .from("games")
        .select("id")
        .eq("fixture_id", strangerId);
      expect(data).toEqual([]);
    });

    it("4. לא דורס משחק שכבר עובד", async () => {
      // The provider sometimes keeps reporting a match as live for a few
      // minutes after the whistle. Writing that back would move a score
      // predictions have already been settled against.
      const game = await world.game(competition, {
        kickoffAt: new Date(Date.now() - 3 * 3_600_000),
        status: "live",
      });
      await admin
        .from("games")
        .update({ status: "finished", score_home: 1, score_away: 0, settled_at: new Date().toISOString() })
        .eq("id", game.id);

      fetchLiveFixtures.mockResolvedValue([livePayload(game.fixtureId, 4, 4, 90)]);
      await syncLiveScores();

      const row = await gameRow(game.id);
      expect(row.score_home).toBe(1);
      expect(row.score_away).toBe(0);
    });

    it("5. כשל של הספק מדווח ואינו משנה דבר", async () => {
      const game = await inProgress();
      await admin.from("games").update({ score_home: 1, score_away: 1 }).eq("id", game.id);

      fetchLiveFixtures.mockImplementation(() => {
        throw new Error("api-football 503");
      });

      const report = await syncLiveScores();

      expect(report.errors[0]).toContain("503");
      expect(report.gamesUpdated).toBe(0);
      const row = await gameRow(game.id);
      expect(row.score_home).toBe(1);
      expect(row.score_away).toBe(1);
    });

    it("6. מתג הכיבוי עוצר לפני שנקראת הקריאה", async () => {
      const game = await inProgress();
      fetchLiveFixtures.mockResolvedValue([livePayload(game.fixtureId, 1, 0, 10)]);

      process.env.LIVE_SCORES_ENABLED = "false";
      try {
        const report = await syncLiveScores();
        expect(report).toMatchObject({ skipped: true, apiCalls: 0 });
        expect(fetchLiveFixtures).not.toHaveBeenCalled();
      } finally {
        delete process.env.LIVE_SCORES_ENABLED;
      }
    });
  });

  describe("הטבלה החיה", () => {
    /** A league whose member has a pending prediction on a match in progress. */
    async function leagueWithLiveGame(opts: { odds?: number; exactScore?: string } = {}) {
      const creator = await world.user("מנהל");
      const league = await world.league(creator, competition);
      const game = await inProgress();
      await admin
        .from("games")
        .update({ score_home: 1, score_away: 0, minute: 55 })
        .eq("id", game.id);

      const predictionId = await world.predict(creator, game.questions.match_result, {
        outcome: "home",
        odds: opts.odds ?? 2.1,
        ...(opts.exactScore ? { exactScore: opts.exactScore } : {}),
      });

      return { creator, league, game, predictionId };
    }

    it("7. חבר רואה את הנקודות שהוא צובר כרגע", async () => {
      const { creator, league } = await leagueWithLiveGame({ odds: 3.4 });

      const live = await getLeagueLive(creator.client, league.id);

      expect(live.hasLive).toBe(true);
      expect(live.deltas.get(creator.id)).toBe(3.4);
    });

    it("8. בונוס התוצאה המדויקת נספר גם בשכבה החיה", async () => {
      const { creator, league } = await leagueWithLiveGame({ odds: 2, exactScore: "1-0" });

      const live = await getLeagueLive(creator.client, league.id);

      expect(live.deltas.get(creator.id)).toBe(6);
    });

    it("9. מי שלא בליגה לא יכול לקרוא את הפונקציה", async () => {
      const { league } = await leagueWithLiveGame();
      const stranger = await world.user("זר");

      const { error } = await stranger.client.rpc("league_live_predictions", {
        p_league_id: league.id,
      });

      expect(error?.message).toContain("NOT_A_MEMBER");
    });

    it("10. ניחוש שנעשה לפני ההצטרפות אינו נספר", async () => {
      // The same rule league_standings applies. If the two filters disagreed,
      // a member would watch points appear during the match and vanish at the
      // whistle.
      const { creator, league, game } = await leagueWithLiveGame();
      const latecomer = await world.user("מצטרף");
      await latecomer.client.rpc("join_league", { p_invite_code: league.code });

      await world.predict(latecomer, game.questions.over_under_2_5, {
        outcome: "over",
        predictedAt: new Date(Date.now() - 30 * 86_400_000),
      });

      const live = await getLeagueLive(creator.client, league.id);
      expect(live.deltas.has(latecomer.id)).toBe(false);
    });

    it("11. רק ניחושי מנצח נספרים, כמו בטבלה עצמה", async () => {
      const { creator, league, game } = await leagueWithLiveGame({ odds: 3.4 });
      // 1-0: "under" is right at this moment, and is worth nothing in a league
      // table that only counts the winner question.
      await world.predict(creator, game.questions.over_under_2_5, {
        outcome: "under",
        odds: 9.9,
      });

      const live = await getLeagueLive(creator.client, league.id);
      expect(live.deltas.get(creator.id)).toBe(3.4);
    });

    it("12. משחק שהסתיים וטרם עובד עדיין נספר", async () => {
      // The ten minutes between the whistle and settlement. Without this the
      // table would drop every member to zero and then hand the points back.
      const { creator, league, game } = await leagueWithLiveGame({ odds: 3.4 });
      await admin.from("games").update({ status: "finished" }).eq("id", game.id);

      const live = await getLeagueLive(creator.client, league.id);
      expect(live.deltas.get(creator.id)).toBe(3.4);
    });

    it("13. אחרי העיבוד השכבה החיה מתרוקנת — הנקודות עברו לטבלה", async () => {
      const { creator, league, game } = await leagueWithLiveGame({ odds: 3.4 });

      const before = await getLeagueLive(creator.client, league.id);
      const projected = before.deltas.get(creator.id)!;

      fetchFixturesByIds.mockResolvedValue([
        { ...livePayload(game.fixtureId, 1, 0, 90), status: "finished" as const },
      ]);
      await settleFinishedGames();

      const after = await getLeagueLive(creator.client, league.id);
      const { data: standings } = await creator.client.rpc("league_standings", {
        p_league_id: league.id,
        p_limit: 100,
        p_offset: 0,
      });
      const row = (standings as { user_id: string; points: number }[]).find(
        (r) => r.user_id === creator.id,
      );

      // The number moved from one place to the other without changing on the
      // way. This is the whole feature in one assertion.
      expect(after.deltas.has(creator.id)).toBe(false);
      expect(Number(row!.points)).toBe(projected);
    });

    it("14. העיבוד מנקה את דקת המשחק", async () => {
      // Nothing renders the minute once a fixture is finished, but leaving
      // "55'" on the row is residue that would eventually be read as fact.
      const { game } = await leagueWithLiveGame();
      await admin.from("games").update({ minute: 55 }).eq("id", game.id);

      fetchFixturesByIds.mockResolvedValue([
        { ...livePayload(game.fixtureId, 1, 0, 90), status: "finished" as const },
      ]);
      await settleFinishedGames();

      const row = await gameRow(game.id);
      expect(row.status).toBe("finished");
      expect(row.minute).toBeNull();
    });
  });
});
