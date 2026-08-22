import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, World, type TestUser } from "./world";

/**
 * §4.8 — creating a league and joining one.
 *
 * Both go through SECURITY DEFINER functions rather than plain inserts, because
 * the read policy on `leagues` grants access to members only: at the moment of
 * creating or joining, the caller is not one yet.
 */
describe("§4.8 יצירה והצטרפות לליגה", () => {
  const world = new World();
  let competition: number;
  let creator: TestUser;
  let joiner: TestUser;

  beforeAll(async () => {
    competition = await world.competition();
    creator = await world.user("יוצר");
    joiner = await world.user("מצטרף");
  });

  afterAll(() => world.dispose());

  it("1–3. יצירת ליגה — קוד באורך 8, היוצר הוא creator_id וחבר, הטורניר נשמר", async () => {
    const { id, code } = await world.league(creator, competition, "ליגת המשרד");

    expect(code).toHaveLength(8);
    // The alphabet drops 0/O/1/I so a code read aloud cannot be mistyped.
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);

    const { data: league } = await admin
      .from("leagues")
      .select("creator_id, competition_id, status")
      .eq("id", id)
      .single();
    expect(league?.creator_id).toBe(creator.id);
    expect(league?.competition_id).toBe(competition);
    expect(league?.status).toBe("active");

    const { data: members } = await admin
      .from("league_members")
      .select("user_id")
      .eq("league_id", id);
    expect(members?.map((m) => m.user_id)).toEqual([creator.id]);
  });

  it("4. שתי ליגות — שני קודים שונים", async () => {
    const first = await world.league(creator, competition, "ליגה א");
    const second = await world.league(creator, competition, "ליגה ב");
    expect(first.code).not.toBe(second.code);
  });

  it("5. הצטרפות בקוד תקין — נוצרה חברות ו-joined_at נרשם", async () => {
    const { id, code } = await world.league(creator, competition, "ליגה פתוחה");

    const { data, error } = await joiner.client.rpc("join_league", { p_invite_code: code });
    expect(error).toBeNull();
    expect(data).toBe(id);

    const { data: membership } = await admin
      .from("league_members")
      .select("joined_at")
      .eq("league_id", id)
      .eq("user_id", joiner.id)
      .single();
    expect(membership?.joined_at).toBeTruthy();
  });

  it("קוד מתקבל גם באותיות קטנות ועם רווחים", async () => {
    const { code } = await world.league(creator, competition, "ליגה סלחנית");
    const user = await world.user("מקליד");

    const { error } = await user.client.rpc("join_league", {
      p_invite_code: `  ${code.toLowerCase()} `,
    });
    expect(error).toBeNull();
  });

  it("6. קוד שגוי — INVALID_CODE", async () => {
    const { error } = await joiner.client.rpc("join_league", { p_invite_code: "ZZZZZZZZ" });
    expect(error?.message).toContain("INVALID_CODE");
  });

  it("7. הצטרפות כפולה — נדחית, בלי כפילות", async () => {
    const { id, code } = await world.league(creator, competition, "ליגה כפולה");
    await joiner.client.rpc("join_league", { p_invite_code: code });

    const { error } = await joiner.client.rpc("join_league", { p_invite_code: code });
    expect(error?.message).toContain("ALREADY_MEMBER");

    const { data } = await admin
      .from("league_members")
      .select("id")
      .eq("league_id", id)
      .eq("user_id", joiner.id);
    expect(data?.length).toBe(1);
  });

  it("8. קוד של ליגה בארכיון — נדחה באותה שגיאה כמו קוד שגוי", async () => {
    const { id, code } = await world.league(creator, competition, "ליגה בארכיון");
    await admin.from("leagues").update({ status: "archived" }).eq("id", id);

    const user = await world.user("מאחר");
    const { error } = await user.client.rpc("join_league", { p_invite_code: code });

    // Deliberately identical to a wrong code: otherwise the response tells a
    // stranger which leagues exist.
    expect(error?.message).toContain("INVALID_CODE");
  });

  it("9. אדמין מעדכן פרסים — נשמרים כ-JSONB", async () => {
    const { id } = await world.league(creator, competition, "ליגה עם פרסים");
    const prizes = [
      { place: 1, prize: "כרטיסים למשחק" },
      { place: 2, prize: "ארוחת צהריים" },
    ];

    const { error } = await creator.client
      .from("leagues")
      .update({ prizes, prize_note: "הפרסים מטעם החברה" })
      .eq("id", id);
    expect(error).toBeNull();

    const { data } = await admin
      .from("leagues")
      .select("prizes, prize_note")
      .eq("id", id)
      .single();
    expect(data?.prizes).toEqual(prizes);
    expect(data?.prize_note).toBe("הפרסים מטעם החברה");
  });

  it("שם קצר מדי נדחה", async () => {
    const { error } = await creator.client.rpc("create_league", {
      p_name: "אב",
      p_competition_id: competition,
    });
    expect(error?.message).toContain("INVALID_NAME");
  });

  it("טורניר שאינו פעיל נדחה", async () => {
    const inactive = await world.competition("טורניר כבוי");
    await admin.from("competitions").update({ is_active: false }).eq("id", inactive);

    const { error } = await creator.client.rpc("create_league", {
      p_name: "ליגה על טורניר כבוי",
      p_competition_id: inactive,
    });
    expect(error?.message).toContain("INVALID_COMPETITION");
  });

  it("אורח אינו רשאי ליצור ליגה או להצטרף", async () => {
    const { anon } = await import("./world");
    const guest = anon();

    const { error: createError } = await guest.rpc("create_league", {
      p_name: "ליגת אורח",
      p_competition_id: competition,
    });
    const { error: joinError } = await guest.rpc("join_league", { p_invite_code: "ABCDEFGH" });

    expect(createError).not.toBeNull();
    expect(joinError).not.toBeNull();
  });
});
