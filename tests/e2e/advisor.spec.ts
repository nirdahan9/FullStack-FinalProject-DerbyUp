import { expect, test } from "@playwright/test";
import { admin, E2EWorld, sessionCookie } from "./fixtures";

/**
 * §8.3 — the advisor in a real browser.
 *
 * The unit tests cover the guard, the integration tests cover the policies and
 * the quota, and the component tests cover the rendering against mocked
 * actions. What none of them cover is the seam: a signed-in person opening a
 * fixture and the Server Action actually running — auth, quota, cache read and
 * all.
 *
 * The analysis is planted in `advisor_insights` with the hash the action will
 * compute, so this test exercises the **cache hit** path. That is deliberate:
 * a browser test must not depend on Gemini being reachable, on a free-tier
 * quota, or on what a model happens to say today. The miss path — context,
 * model, validation, publish — is exercised for real by the cron, which is
 * where a live failure would actually matter.
 */
test("§8.3 היועץ נפתח בעמוד המשחק ומציג דעה", async ({ page, context }) => {
  const world = new E2EWorld();

  try {
    const competition = await world.competition("ליגת היועץ");
    const game = await world.game(competition, {
      home: "Arsenal",
      away: "Chelsea",
      odds: 2.1,
    });
    const user = await world.signUp("בודק יועץ");

    // The same hash the action derives, computed the same way: status,
    // updated_at and the priced markets. Reproducing it here is what makes the
    // planted row findable.
    const { data: row } = await admin
      .from("games")
      .select("status, updated_at, questions(type, outcomes)")
      .eq("id", game.id)
      .single();

    const questions = (row!.questions ?? []) as { type: string; outcomes: { key: string; odds: number }[] }[];
    const priced = [...questions]
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((q) => {
        const outcomes = (q.outcomes ?? [])
          .map((o) => `${o.key}:${Number(o.odds)}`)
          .sort()
          .join(",");
        return `${q.type}(${outcomes})`;
      })
      .join("|");

    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256")
      .update(`${row!.status}|${row!.updated_at}|${priced}`)
      .digest("hex");

    await admin.from("advisor_insights").insert({
      game_id: game.id,
      context_hash: hash,
      model: "e2e-fixture",
      payload: {
        headline: "ארסנל בבית תיקח את זה בלי יותר מדי דרמה",
        recommendation: {
          question_type: "match_result",
          outcome_key: "home",
          outcomeLabel: "ארסנל",
          odds: 2.1,
        },
        reasons: ["הכושר הביתי שלה טוב", "צ׳לסי ספגה בכל אחד מחמשת האחרונים"],
      },
    });

    await context.addCookies([sessionCookie(user, "localhost")]);
    await page.goto(`/games/${game.id}`);

    // The trigger is only rendered while the fixture is still open.
    const trigger = page.getByRole("button", { name: "שאל את היועץ" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(page.getByText("ארסנל בבית תיקח את זה בלי יותר מדי דרמה")).toBeVisible();
    await expect(page.getByText("הכושר הביתי שלה טוב")).toBeVisible();

    // A cache hit must not have spent any of the day's allowance.
    await expect(page.getByText(/נותרו 10 שאלות היום/)).toBeVisible();

    const { data: usage } = await admin
      .from("advisor_usage")
      .select("question_count")
      .eq("user_id", user.id);
    expect(usage?.length ?? 0).toBe(0);
  } finally {
    await world.dispose();
  }
});

test("§8.3 היועץ אינו מוצע על משחק שכבר התחיל", async ({ page, context }) => {
  const world = new E2EWorld();

  try {
    const competition = await world.competition("ליגת היועץ ב");
    const game = await world.game(competition, {
      home: "Arsenal",
      away: "Chelsea",
      odds: 2.1,
    });
    const user = await world.signUp("בודק יועץ ב");

    // Advice on a guess nobody can still make is noise, so the trigger goes.
    await admin.from("games").update({ status: "live" }).eq("id", game.id);

    await context.addCookies([sessionCookie(user, "localhost")]);
    await page.goto(`/games/${game.id}`);

    await expect(page.getByRole("button", { name: "שאל את היועץ" })).toHaveCount(0);
  } finally {
    await world.dispose();
  }
});
