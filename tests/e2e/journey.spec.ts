import { expect, test } from "@playwright/test";
import { admin, E2EWorld, PASSWORD, sessionCookie, type E2EUser } from "./fixtures";

/**
 * §8.2 — one scenario through the whole product.
 *
 * An admin registers, opens a league and sets prizes; an employee joins with
 * the code, predicts a fixture, the fixture is settled by the real scheduled
 * job, and both boards are checked — the league table counting only the winner
 * market and the site-wide board counting everything.
 *
 * Written as a single test with steps rather than several tests, because it is
 * one continuous story: splitting it would mean either rebuilding the world
 * each time or leaving each test dependent on the previous one having passed.
 */
test("§8.2 המסע המרכזי — מהרשמה עד שני הלוחות", async ({ page, context }) => {
  const world = new E2EWorld();
  const adminEmail = world.email();
  let leagueId = "";
  let inviteCode = "";
  let employee!: E2EUser;

  try {
    const competition = await world.competition("ליגת הבדיקות");
    const game = await world.game(competition, {
      home: "Arsenal",
      away: "Chelsea",
      odds: 2.1,
    });

    await test.step("1–2. הרשמה — הכניסה לדשבורד ומתחילים מאפס", async () => {
      await page.goto("/signup");
      await page.getByLabel("שם לתצוגה").fill("מנהל הליגה");
      await page.getByLabel("אימייל").fill(adminEmail);
      await page.getByLabel("סיסמה").fill(PASSWORD);
      await page.getByRole("button", { name: "יצירת חשבון" }).click();
      await page.waitForURL("**/dashboard", { timeout: 30_000 });

      const {
        data: { users },
      } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const created = users.find((u) => u.email === adminEmail)!;
      world.track({
        id: created.id,
        email: adminEmail,
        displayName: "מנהל הליגה",
        session: null,
      });

      // No sign-up grant: the first point has to be earned.
      const { data: profile } = await admin
        .from("profiles")
        .select("total_points")
        .eq("id", created.id)
        .single();
      expect(Number(profile!.total_points)).toBe(0);
    });

    await test.step("3. פתיחת ליגה על הטורניר, עם קוד הזמנה ופרסים", async () => {
      await page.goto("/leagues/new");
      await page.getByLabel("שם הליגה").fill("ליגת המשרד");
      await page.selectOption("#competitionId", String(competition));
      await page.getByRole("button", { name: "יצירת ליגה" }).click();
      await page.waitForURL(/\/leagues\/[0-9a-f-]{36}/, { timeout: 30_000 });

      leagueId = page.url().match(/\/leagues\/([0-9a-f-]{36})/)![1];
      world.trackLeague(leagueId);

      await expect(page.getByText("קוד הזמנה", { exact: true })).toBeVisible();
      const { data: league } = await admin
        .from("leagues")
        .select("invite_code")
        .eq("id", leagueId)
        .single();
      inviteCode = league!.invite_code;
      expect(inviteCode).toHaveLength(8);

      // Prizes are free text set by the organisation itself.
      await admin
        .from("leagues")
        .update({ prizes: [{ place: 1, prize: "כרטיסים לדרבי" }] })
        .eq("id", leagueId);
    });

    await test.step("4–5. התנתקות והתחברות של המשתמש השני", async () => {
      employee = await world.signUp("עובד");
      await context.clearCookies();

      await page.goto("/login");
      await page.getByLabel("אימייל").fill(employee.email);
      await page.getByLabel("סיסמה").fill(PASSWORD);
      await page.getByRole("button", { name: "התחברות" }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
      });
    });

    await test.step("6–7. הצטרפות בקוד — הליגה, הטורניר והפרסים מוצגים", async () => {
      await page.goto("/join");
      await page.getByLabel("קוד הזמנה").fill(inviteCode);
      await page.getByRole("button", { name: "הצטרפות" }).click();
      await page.waitForURL(/\/leagues\/[0-9a-f-]{36}/, { timeout: 30_000 });

      await expect(page.getByRole("heading", { name: "ליגת המשרד" })).toBeVisible();
      await expect(page.getByText("ליגת הבדיקות").first()).toBeVisible();
      await expect(page.getByText("כרטיסים לדרבי")).toBeVisible();
      await expect(page.getByText("עובד").first()).toBeVisible();
    });

    await test.step("8–10. ניחוש בלחיצה אחת, ממתין, והיחס מוקפא", async () => {
      await page.goto(`/games/${game.id}`);
      await expect(page.getByText("ארסנל").first()).toBeVisible();

      await page.getByRole("button", { name: /ארסנל/ }).first().click();
      await expect(page.getByRole("button", { pressed: true }).first()).toBeVisible();

      const { data: prediction } = await admin
        .from("predictions")
        .select("status, odds, points_earned, selected_outcome")
        .eq("user_id", employee.id)
        .single();

      expect(prediction!.status).toBe("pending");
      expect(prediction!.selected_outcome).toBe("home");
      // Frozen at the price shown: later movement cannot change a score.
      expect(Number(prediction!.odds)).toBe(2.1);
      expect(prediction!.points_earned).toBeNull();

      await page.goto("/predictions");
      await expect(page.getByText("ממתין").first()).toBeVisible();
    });

    await test.step("11–13. יישוב דרך ה-cron — צדקת, והנקודות הן היחס", async () => {
      // The score is recorded and the scheduled endpoint is called exactly as
      // pg_cron calls it. The provider has never heard of fixture 9xxxxx, so
      // settlement falls back to the row — the manual-settlement path.
      await admin
        .from("games")
        .update({
          status: "finished",
          score_home: 2,
          score_away: 0,
          kickoff_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        })
        .eq("id", game.id);

      const response = await page.request.post("/api/cron/settle", {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      expect(response.ok()).toBe(true);
      expect((await response.json()).gamesSettled).toBeGreaterThan(0);

      const { data: prediction } = await admin
        .from("predictions")
        .select("status, points_earned")
        .eq("user_id", employee.id)
        .single();
      expect(prediction!.status).toBe("correct");
      expect(Number(prediction!.points_earned)).toBe(2.1);

      await context.addCookies([sessionCookie(employee, "localhost")]);
      await page.goto("/predictions");
      await expect(page.getByText("צדקת").first()).toBeVisible();
    });

    await test.step("14–15. שני הלוחות — הליגה 2.10, הכללי 4.05", async () => {
      // A second correct call, this one on BTTS: the league ignores it, the
      // site-wide board does not. That difference is the scoring model.
      const { data: question } = await admin
        .from("questions")
        .select("id")
        .eq("game_id", game.id)
        .eq("type", "btts")
        .single();
      await admin.from("predictions").insert({
        user_id: employee.id,
        question_id: question!.id,
        selected_outcome: "no",
        odds: 1.95,
        status: "correct",
        points_earned: 1.95,
        settled_at: new Date().toISOString(),
      });
      const { data: profile } = await admin
        .from("profiles")
        .select("total_points")
        .eq("id", employee.id)
        .single();
      await admin
        .from("profiles")
        .update({ total_points: Number(profile!.total_points) + 1.95 })
        .eq("id", employee.id);

      await page.goto(`/leagues/${leagueId}`);
      await expect(page.getByText("עובד").first()).toBeVisible();
      await expect(page.getByText("2.10 נק׳")).toBeVisible();

      await page.goto("/leaderboard");
      await expect(page.getByText("4.05 נק׳").first()).toBeVisible();
    });
  } finally {
    await world.dispose();
  }
});
