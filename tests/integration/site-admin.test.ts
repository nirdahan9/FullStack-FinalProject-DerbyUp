import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, World, type TestGame, type TestUser } from "./world";

/**
 * §5.4 — the site-wide dashboard.
 *
 * Every screen under /admin reads through a SECURITY DEFINER function, because
 * the data it shows is exactly the data RLS hides: other people's profiles,
 * their emails, their predictions. So the tests here are not about what the
 * pages render — they are about what the database hands to a caller who is not
 * an operator, which must be nothing.
 *
 * The last group covers the escalation path that matters: profiles has an
 * UPDATE policy for a user's own row, and is_site_admin lives on that row.
 */
describe("§5.4 ניהול אתר", () => {
  const world = new World();
  let competition: number;
  let operator: TestUser;
  let regular: TestUser;
  let started: TestGame;

  /** Granting through the service role, which the tamper trigger lets past. */
  async function grant(user: TestUser, value = true) {
    const { error } = await admin
      .from("profiles")
      .update({ is_site_admin: value })
      .eq("id", user.id);
    if (error) throw new Error(`grant: ${error.message}`);
  }

  beforeAll(async () => {
    competition = await world.competition();
    operator = await world.user("מנהל אתר");
    regular = await world.user("משתמש רגיל");
    await grant(operator);

    started = await world.game(competition, {
      kickoffAt: new Date(Date.now() - 3 * 3_600_000),
      status: "live",
    });
  });

  afterAll(() => world.dispose());

  // ─── The gate ────────────────────────────────────────────────────────────

  it("1. משתמש רגיל קורא ל-admin_overview — נדחה", async () => {
    const { data, error } = await regular.client.rpc("admin_overview");
    expect(error?.message).toContain("NOT_SITE_ADMIN");
    expect(data).toBeNull();
  });

  it("2. מנהל אתר מקבל סקירה עם מונים", async () => {
    const { data, error } = await operator.client.rpc("admin_overview");
    expect(error).toBeNull();

    const stats = (data as Record<string, number>[])[0];
    expect(stats.users_total).toBeGreaterThan(0);
    expect(stats.games_total).toBeGreaterThan(0);
    // The fixture kicked off and nothing has settled it.
    expect(stats.games_awaiting).toBeGreaterThan(0);
  });

  it("3. משתמש רגיל קורא ל-admin_list_users — נדחה", async () => {
    const { error } = await regular.client.rpc("admin_list_users", { p_limit: 10 });
    expect(error?.message).toContain("NOT_SITE_ADMIN");
  });

  it("4. מנהל אתר מוצא משתמש לפי אימייל, כולל כתובת", async () => {
    const { data, error } = await operator.client.rpc("admin_list_users", {
      p_search: regular.email,
      p_limit: 10,
    });
    expect(error).toBeNull();

    const rows = data as { id: string; email: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(regular.id);
    expect(rows[0].email).toBe(regular.email);
  });

  it("5. משתמש רגיל קורא ל-admin_list_games ול-admin_list_leagues — נדחה", async () => {
    const games = await regular.client.rpc("admin_list_games", { p_limit: 5 });
    const leagues = await regular.client.rpc("admin_list_leagues", { p_limit: 5 });
    expect(games.error?.message).toContain("NOT_SITE_ADMIN");
    expect(leagues.error?.message).toContain("NOT_SITE_ADMIN");
  });

  it("6. משתמש רגיל קורא ל-admin_user_predictions של אחר — נדחה", async () => {
    const { error } = await regular.client.rpc("admin_user_predictions", {
      p_user_id: operator.id,
      p_limit: 10,
    });
    expect(error?.message).toContain("NOT_SITE_ADMIN");
  });

  // ─── Escalation ──────────────────────────────────────────────────────────

  it("7. משתמש מעניק לעצמו הרשאת ניהול ישירות — נדחה", async () => {
    await regular.client
      .from("profiles")
      .update({ is_site_admin: true })
      .eq("id", regular.id);

    const { data } = await admin
      .from("profiles")
      .select("is_site_admin")
      .eq("id", regular.id)
      .single();
    expect(data?.is_site_admin).toBe(false);
  });

  it("8. משתמש רגיל ממנה את עצמו דרך הפונקציה — נדחה", async () => {
    const { error } = await regular.client.rpc("admin_set_site_admin", {
      p_user_id: regular.id,
      p_value: true,
    });
    expect(error?.message).toContain("NOT_SITE_ADMIN");
  });

  it("9. מנהל אתר משנה את ההרשאות של עצמו — נדחה", async () => {
    const { error } = await operator.client.rpc("admin_set_site_admin", {
      p_user_id: operator.id,
      p_value: false,
    });
    expect(error?.message).toContain("CANNOT_CHANGE_SELF");
  });

  it("10. מנהל אתר ממנה משתמש אחר, ואז מסיר — מצליח בשני הכיוונים", async () => {
    const promoted = await world.user("מועמד", { signIn: false });

    const up = await operator.client.rpc("admin_set_site_admin", {
      p_user_id: promoted.id,
      p_value: true,
    });
    expect(up.error).toBeNull();

    const after = await admin
      .from("profiles")
      .select("is_site_admin")
      .eq("id", promoted.id)
      .single();
    expect(after.data?.is_site_admin).toBe(true);

    const down = await operator.client.rpc("admin_set_site_admin", {
      p_user_id: promoted.id,
      p_value: false,
    });
    expect(down.error).toBeNull();
  });

  // ─── Settling ────────────────────────────────────────────────────────────

  it("11. משתמש רגיל מעבד משחק — נדחה, והמשחק לא נגע", async () => {
    const { error } = await regular.client.rpc("admin_settle_game", {
      p_game_id: started.id,
      p_score_home: 5,
      p_score_away: 0,
    });
    expect(error?.message).toContain("NOT_SITE_ADMIN");

    const { data } = await admin
      .from("games")
      .select("score_home, status")
      .eq("id", started.id)
      .single();
    expect(data?.score_home).toBeNull();
    expect(data?.status).toBe("live");
  });

  it("12. מנהל אתר מעבד משחק שהתחיל — התוצאה נרשמת, העיבוד נשאר לעבודה המתוזמנת", async () => {
    const { error } = await operator.client.rpc("admin_settle_game", {
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
    // Left null on purpose: scoring belongs to the settlement job, so there is
    // one implementation of it rather than a second one in this function.
    expect(data?.settled_at).toBeNull();
  });

  it("13. מנהל אתר מעבד משחק שטרם התחיל — נדחה", async () => {
    const future = await world.game(competition);
    const { error } = await operator.client.rpc("admin_settle_game", {
      p_game_id: future.id,
      p_score_home: 1,
      p_score_away: 0,
    });
    expect(error?.message).toContain("GAME_NOT_STARTED");
  });

  // ─── Deleting ────────────────────────────────────────────────────────────

  it("14. מנהל אתר מוחק מנהל אחר — נדחה עד שההרשאה מוסרת", async () => {
    const other = await world.user("מנהל נוסף", { signIn: false });
    await grant(other);

    const blocked = await operator.client.rpc("admin_delete_user", {
      p_user_id: other.id,
    });
    expect(blocked.error?.message).toContain("CANNOT_DELETE_ADMIN");

    await grant(other, false);
    const allowed = await operator.client.rpc("admin_delete_user", {
      p_user_id: other.id,
    });
    expect(allowed.error).toBeNull();
  });

  it("15. מחיקת משתמש מוחקת גם את הניחושים שלו", async () => {
    const doomed = await world.user("נמחק", { signIn: false });
    const prediction = await world.predict(doomed, started.questions.match_result);

    const { error } = await operator.client.rpc("admin_delete_user", {
      p_user_id: doomed.id,
    });
    expect(error).toBeNull();

    const profile = await admin.from("profiles").select("id").eq("id", doomed.id);
    const left = await admin.from("predictions").select("id").eq("id", prediction);
    expect(profile.data).toHaveLength(0);
    expect(left.data).toHaveLength(0);
  });

  it("16. מנהל אתר מוחק את עצמו — נדחה", async () => {
    const { error } = await operator.client.rpc("admin_delete_user", {
      p_user_id: operator.id,
    });
    expect(error?.message).toContain("CANNOT_DELETE_SELF");
  });
});
