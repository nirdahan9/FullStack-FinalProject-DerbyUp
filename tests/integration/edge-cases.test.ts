import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validatePrediction } from "@/lib/domain/prediction-rules";
import { rankRows } from "@/lib/domain/standings";
import { admin, standingOf, World, type TestUser } from "./world";

/**
 * §7.1–7.3 — the awkward cases.
 *
 * The time boundaries are pure functions and are covered exhaustively in the
 * unit suite; what is left here is everything whose answer depends on the
 * database: an empty league, a member with nothing, a very large league, and
 * what happens when two requests arrive at once.
 */
describe("§7 מקרי קצה", () => {
  const world = new World();
  let competition: number;
  let owner: TestUser;

  beforeAll(async () => {
    competition = await world.competition();
    owner = await world.user("מנהל");
  });

  afterAll(() => world.dispose());

  describe("§7.1 קצוות בזמן", () => {
    it("1–2. ניחוש בדיוק בשנייה של שריקת הפתיחה נדחה, שנייה לפני מאושר", async () => {
      const kickoff = new Date("2026-09-01T18:00:00Z");
      const base = {
        game: { kickoffAt: kickoff, status: "scheduled" as const, competitionId: 39 },
        questionType: "match_result" as const,
        selectedOutcome: "home",
        hasExisting: false,
        userCompetitions: [39],
      };

      expect(validatePrediction({ ...base, now: kickoff }).ok).toBe(false);
      expect(
        validatePrediction({ ...base, now: new Date(kickoff.getTime() - 1000) }).ok,
      ).toBe(true);
    });

    it("6. הצטרפות באותה שנייה של ניחוש — הכלל >= עקבי", async () => {
      const user = await world.user("בדיוק ברגע", { signIn: false });
      const { id: league } = await world.league(owner, competition, "ליגת רגעים");
      const game = await world.game(competition);

      const moment = new Date();
      await admin.from("league_members").insert({
        league_id: league,
        user_id: user.id,
        joined_at: moment.toISOString(),
      });
      await world.predict(user, game.questions.match_result, {
        status: "correct",
        points: 2.5,
        predictedAt: moment,
      });

      // predicted_at >= joined_at, so a prediction made at the very instant of
      // joining counts. Either rule is defensible; what matters is that one of
      // them is applied and it is the same one every time.
      expect(Number((await standingOf(owner, league, user.id))?.points)).toBe(2.5);
    });
  });

  describe("§7.2 קצוות בנתונים", () => {
    it("1. ליגה בלי חברים — דירוג ריק, בלי קריסה", async () => {
      const { id } = await world.league(owner, competition, "ליגה מתרוקנת");
      await admin.from("league_members").delete().eq("league_id", id);

      // The creator is no longer a member, so the function refuses rather than
      // returning a table to someone with no right to it.
      const { error } = await owner.client.rpc("league_standings", {
        p_league_id: id,
        p_limit: 20,
        p_offset: 0,
      });
      expect(error?.message).toContain("NOT_A_MEMBER");
    });

    it("2. חבר בלי ניחושים — 0 נקודות, ומופיע בטבלה", async () => {
      const { id, code } = await world.league(owner, competition, "ליגה שקטה");
      const idle = await world.user("שקט");
      await idle.client.rpc("join_league", { p_invite_code: code });

      const row = await standingOf(owner, id, idle.id);
      expect(row).toBeDefined();
      expect(Number(row?.points)).toBe(0);
    });

    it("4. יחס גבוה מאוד (50.0) — מחושב תקין", async () => {
      const { id, code } = await world.league(owner, competition, "ליגת מאאוטסיידרים");
      const user = await world.user("אאוטסיידר");
      await user.client.rpc("join_league", { p_invite_code: code });

      const game = await world.game(competition);
      await world.predict(user, game.questions.match_result, {
        odds: 50,
        status: "correct",
        points: 50,
      });

      expect(Number((await standingOf(owner, id, user.id))?.points)).toBe(50);
    });

    it("5. שם קבוצה באורך המקסימלי נשמר במלואו", async () => {
      const name = "א".repeat(80);
      const game = await world.game(competition, { home: name });

      const { data } = await admin.from("games").select("home_team").eq("id", game.id).single();
      expect(data?.home_team).toHaveLength(80);
    });

    it("6. ליגה גדולה — pagination עובד והדירוג נכון", async () => {
      const { id } = await world.league(owner, competition, "ליגה גדולה");
      const game = await world.game(competition);

      // 24 members rather than 200, created a few at a time: the query shape
      // is identical, and signing up two hundred accounts at once is a load
      // test of Supabase Auth rather than of the standings.
      const members: TestUser[] = [];
      for (let i = 0; i < 24; i += 4) {
        members.push(
          ...(await Promise.all([0, 1, 2, 3].map((k) => makeMember(id, i + k)))),
        );
      }

      const first = await page(id, 12, 0);
      const second = await page(id, 12, 12);

      expect(first).toHaveLength(12);
      expect(second).toHaveLength(12);
      expect(new Set([...first, ...second].map((r) => r.user_id)).size).toBe(24);

      // Highest scorer first, and the scores descend across both pages.
      const points = [...first, ...second].map((r) => Number(r.points));
      expect([...points].sort((a, b) => b - a)).toEqual(points);
      expect(points[0]).toBe(24);
      expect(members).toHaveLength(24);

      async function makeMember(league: string, i: number) {
        const user = await world.user(`חבר ${i}`, { signIn: false });
        await admin.from("league_members").insert({ league_id: league, user_id: user.id });
        await world.predict(user, game.questions.match_result, {
          status: "correct",
          points: i + 1,
          odds: i + 1,
        });
        return user;
      }
      async function page(league: string, limit: number, offset: number) {
        const { data, error } = await owner.client.rpc("league_standings", {
          p_league_id: league,
          p_limit: limit,
          p_offset: offset,
        });
        if (error) throw new Error(error.message);
        return data as { user_id: string; points: number }[];
      }
    });

    it("7. אין אתגר לתאריך — שאילתה מחזירה ריק ולא שוגה", async () => {
      const { data, error } = await owner.client
        .from("daily_puzzles")
        .select("id")
        .eq("play_date", "1999-01-01")
        .maybeSingle();

      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("8. ליגה בתחרות בלי משחקים — רשימת משחקים ריקה", async () => {
      const empty = await world.competition("טורניר בלי משחקים");
      const { data } = await owner.client.from("games").select("id").eq("competition_id", empty);
      expect(data?.length).toBe(0);
    });

    it("תיקו בניקוד — דירוג תחרותי, בלי לדלג על מקום שגוי", () => {
      const joinedAt = new Date("2026-08-01T00:00:00Z");
      const ranked = rankRows([
        { userId: "a", displayName: "א", points: 100, correctCount: 5, joinedAt },
        { userId: "b", displayName: "ב", points: 100, correctCount: 5, joinedAt },
        { userId: "c", displayName: "ג", points: 90, correctCount: 4, joinedAt },
      ]);
      expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
    });
  });

  describe("§7.3 מקביליות", () => {
    it("1. שני ניחושים במקביל לאותה שאלה — אחד מצליח, השני נדחה", async () => {
      const user = await world.user("לוחץ פעמיים", { signIn: false });
      const game = await world.game(competition);

      const results = await Promise.allSettled([
        admin.from("predictions").insert({
          user_id: user.id,
          question_id: game.questions.match_result,
          selected_outcome: "home",
          odds: 2.1,
        }),
        admin.from("predictions").insert({
          user_id: user.id,
          question_id: game.questions.match_result,
          selected_outcome: "away",
          odds: 3.6,
        }),
      ]);

      const errors = results.map((r) => (r.status === "fulfilled" ? r.value.error : null));
      expect(errors.filter((e) => e === null)).toHaveLength(1);
      expect(errors.some((e) => e?.code === "23505")).toBe(true);

      const { data } = await admin
        .from("predictions")
        .select("id")
        .eq("user_id", user.id)
        .eq("question_id", game.questions.match_result);
      expect(data?.length).toBe(1);
    });

    it("3. הצטרפות כפולה במקביל — חברות אחת", async () => {
      const { id, code } = await world.league(owner, competition, "ליגת מרוץ");
      const user = await world.user("מצטרף פעמיים");

      await Promise.allSettled([
        user.client.rpc("join_league", { p_invite_code: code }),
        user.client.rpc("join_league", { p_invite_code: code }),
      ]);

      const { data } = await admin
        .from("league_members")
        .select("id")
        .eq("league_id", id)
        .eq("user_id", user.id);
      expect(data?.length).toBe(1);
    });

    it("4. ביטול וניחוש חדש במקביל — מצב עקבי", async () => {
      const user = await world.user("מבטל ומנחש");
      const game = await world.game(competition);
      const id = await world.predict(user, game.questions.match_result);

      await Promise.allSettled([
        user.client.rpc("cancel_prediction", { p_id: id }),
        admin.from("predictions").insert({
          user_id: user.id,
          question_id: game.questions.match_result,
          selected_outcome: "away",
          odds: 3.6,
        }),
      ]);

      // Whatever the interleaving, at most one row is live for that question.
      const { data } = await admin
        .from("predictions")
        .select("status")
        .eq("user_id", user.id)
        .eq("question_id", game.questions.match_result);
      expect(data?.filter((p) => p.status !== "cancelled").length).toBeLessThanOrEqual(1);
    });
  });
});
