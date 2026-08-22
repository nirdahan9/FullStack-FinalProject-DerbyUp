import { expect, test } from "@playwright/test";
import { E2EWorld, sessionCookie, type E2EUser } from "./fixtures";

/**
 * §5.3 — route protection, and §8.3.1–2.
 *
 * The middleware is a convenience layer, not the security boundary: a bug here
 * changes what a page shows, never what the database returns. It is still worth
 * asserting, because a guest landing on an app route with no data is a broken
 * experience even when nothing leaked.
 */
test.describe("§5.3 הגנת מסלולים", () => {
  const world = new E2EWorld();
  let user: E2EUser;

  test.beforeAll(async () => {
    user = await world.signUp("מחובר");
  });

  test.afterAll(() => world.dispose());

  for (const path of ["/dashboard", "/games", "/leagues", "/leaderboard", "/challenge"]) {
    test(`1–2. אורח ב-${path} מופנה ל-/login עם next`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(
        `/login?next=${encodeURIComponent(path)}`.replace(/%2F/g, "%2F"),
      );
      await expect(page.getByRole("button", { name: "התחברות" })).toBeVisible();
    });
  }

  test("3. אורח ב-/ — הדף מוצג", async ({ page }) => {
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("link", { name: /הרשמה|פתיחת חשבון/ }).first()).toBeVisible();
  });

  test("4. מחובר ב-/login מופנה ל-/dashboard", async ({ page, context }) => {
    await context.addCookies([sessionCookie(user, "localhost")]);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("5–6. cron בלי secret ועם secret שגוי — 401", async ({ request }) => {
    for (const endpoint of ["/api/cron/settle", "/api/cron/sync-fixtures"]) {
      const none = await request.post(endpoint);
      expect(none.status()).toBe(401);

      const wrong = await request.post(endpoint, {
        headers: { Authorization: "Bearer definitely-not-the-secret" },
      });
      expect(wrong.status()).toBe(401);
    }
  });

  test("§8.3.2 התחברות בפרטים שגויים — הודעת שגיאה", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("אימייל").fill(user.email);
    await page.getByLabel("סיסמה").fill("NotThePassword1!");
    await page.getByRole("button", { name: "התחברות" }).click();

    // Scoped to the form: Next renders its own aria-live route announcer,
    // which also carries role="alert".
    await expect(page.locator("form p[role=alert]")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("§8.3.2א אימייל שאינו רשום — אותה הודעה בדיוק", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("אימייל").fill("nobody-here@example.com");
    await page.getByLabel("סיסמה").fill("NotThePassword1!");
    await page.getByRole("button", { name: "התחברות" }).click();

    // Identical wording on both paths: otherwise the form tells a stranger
    // which addresses are registered.
    await expect(page.locator("form p[role=alert]")).toHaveText("אימייל או סיסמה שגויים");
  });
});
