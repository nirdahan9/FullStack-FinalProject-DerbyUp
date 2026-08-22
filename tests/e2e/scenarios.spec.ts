import { expect, test } from "@playwright/test";
import { admin, E2EWorld, sessionCookie, type E2EUser } from "./fixtures";

/**
 * §8.3 — the scenarios beyond the main journey.
 *
 * Each one is a place where the product has to say no clearly, or remember
 * something across a reload. Cases 1–2 (guest redirect, bad credentials) live
 * in routes.spec.ts with the rest of the route protection.
 */
test.describe("§8.3 תרחישי E2E נוספים", () => {
  const world = new E2EWorld();
  let user: E2EUser;
  let competition: number;

  test.beforeAll(async () => {
    user = await world.signUp("שחקן");
    competition = await world.competition("טורניר תרחישים");
  });

  test.afterAll(() => world.dispose());

  test.beforeEach(async ({ context }) => {
    await context.addCookies([sessionCookie(user, "localhost")]);
  });

  test("3. הצטרפות בקוד שגוי — הודעת שגיאה, בלי לחשוף אם הליגה קיימת", async ({ page }) => {
    await page.goto("/join");
    await page.getByLabel("קוד הזמנה").fill("ZZZZZZZZ");
    await page.getByRole("button", { name: "הצטרפות" }).click();

    await expect(page.locator("form p[role=alert]")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/join");
  });

  test("4. ביטול ניחוש — אפשר לנחש מחדש באותה שאלה", async ({ page }) => {
    const game = await world.game(competition, { home: "Arsenal", away: "Chelsea" });
    const { id: leagueId } = await createLeague();

    await page.goto(`/games/${game.id}`);
    await page.getByRole("button", { name: /ארסנל/ }).first().click();
    await expect(page.getByRole("button", { name: /ביטול הניחוש/ })).toBeVisible();

    await page.getByRole("button", { name: /ביטול הניחוש/ }).click();
    await expect(page.getByRole("button", { name: /ביטול הניחוש/ })).toBeHidden();

    // The unique index is partial on status <> 'cancelled', so the question is
    // open again — the bug a user reported in stage 6.
    await page.getByRole("button", { name: /צ'לסי/ }).first().click();
    await expect(page.getByRole("button", { pressed: true }).first()).toBeVisible();

    const { data } = await admin
      .from("predictions")
      .select("status, selected_outcome")
      .eq("user_id", user.id)
      .order("predicted_at", { ascending: true });

    expect(data?.map((p) => p.status)).toEqual(["cancelled", "pending"]);
    expect(data?.[1].selected_outcome).toBe("away");

    await admin.from("leagues").delete().eq("id", leagueId);
  });

  test("5. משחק שהתחיל — חסום לניחוש והסיבה מוצגת", async ({ page }) => {
    const game = await world.game(competition, {
      home: "Liverpool",
      away: "Arsenal",
      kickoffAt: new Date(Date.now() - 30 * 60_000),
    });
    const { id: leagueId } = await createLeague();

    await page.goto(`/games/${game.id}`);
    await expect(page.getByText(/סגור לניחושים|המשחק כבר התחיל/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /ליברפול/ })).toHaveCount(0);

    await admin.from("leagues").delete().eq("id", leagueId);
  });

  test("6. פתרון האתגר היומי — הנקודות מתעדכנות", async ({ page }) => {
    const before = await totalPoints();

    await page.goto("/challenge");
    const heading = page.getByRole("heading", { name: "גשר הכדורגל" });
    await expect(heading).toBeVisible();

    // The answers are checked on the server and are not in the page, so the
    // test reads them the way only the server can.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const { data: puzzle } = await admin
      .from("daily_puzzles")
      .select("valid_answers")
      .eq("play_date", today)
      .maybeSingle();
    test.skip(!puzzle, "אין אתגר מפורסם להיום");

    const answer = (puzzle!.valid_answers as unknown as string[])[0];
    expect(await page.content()).not.toContain(answer);

    await page.getByPlaceholder("חפש שחקן לפי שם...").fill(answer);
    await page.getByRole("button", { name: "אישור תשובה" }).click();

    await expect(page.getByText("כל הכבוד!")).toBeVisible();
    await expect(page.getByText("+5 נקודות!")).toBeVisible();
    expect(await totalPoints()).toBe(before + 5);
  });

  test("7. מעבר למצב כהה — נשמר אחרי רענון", async ({ page }) => {
    await page.goto("/dashboard");
    const root = page.locator("html");
    await expect(root).not.toHaveClass(/dark/);

    await page.getByRole("button", { name: "החלפת מצב תצוגה" }).click();
    await expect(root).toHaveClass(/dark/);

    await page.reload();
    await expect(root).toHaveClass(/dark/);
  });

  test("8. RTL — הדף בכיוון ימין-לשמאל ובעברית", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");

    // Not just the attribute: the tab bar has to actually lay out from the
    // right, which is what the attribute is there to cause.
    const nav = page.locator("nav a").first();
    const box = await nav.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x + box!.width).toBeGreaterThan(viewport.width / 2);
  });

  test("9. פתיחת התראה מסמנת אותה כנקראה", async ({ page }) => {
    // Cleared first: earlier scenarios in this file earn achievements, and
    // each one produces its own notification.
    await admin.from("notifications").delete().eq("user_id", user.id);

    await admin.from("notifications").insert([
      {
        user_id: user.id,
        type: "prediction_settled",
        title: "התראה עם קישור",
        body: "צדקת",
        link_url: "/predictions",
      },
      {
        user_id: user.id,
        type: "achievement",
        title: "התראה בלי קישור",
        body: "הישג",
      },
    ]);

    await page.goto("/notifications");
    await expect(page.getByText("2 חדשות")).toBeVisible();

    // A notification with a link: opening it is what marks it read.
    await page.getByText("התראה עם קישור").click();
    await page.waitForURL("**/predictions");
    await page.goto("/notifications");
    await expect(page.getByText("1 חדשות")).toBeVisible();

    // One without a link is a button instead, so it can still be cleared.
    await page.getByText("התראה בלי קישור").click();
    await expect(page.getByText("חדשות")).toBeHidden();

    const { data } = await admin
      .from("notifications")
      .select("read_at")
      .eq("user_id", user.id);
    expect(data?.every((n) => n.read_at !== null)).toBe(true);

    await admin.from("notifications").delete().eq("user_id", user.id);
  });

  /** A league on the test tournament, so its fixtures are predictable. */
  async function createLeague() {
    const { data, error } = await admin
      .from("leagues")
      .insert({
        name: "ליגת תרחישים",
        creator_id: user.id,
        competition_id: competition,
        invite_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await admin.from("league_members").insert({ league_id: data.id, user_id: user.id });
    return { id: data.id as string };
  }

  async function totalPoints() {
    const { data } = await admin
      .from("profiles")
      .select("total_points")
      .eq("id", user.id)
      .single();
    return Number(data!.total_points);
  }
});
