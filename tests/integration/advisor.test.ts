import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, World, type TestGame, type TestUser } from "./world";

/**
 * The advisor's boundaries, against the live database.
 *
 * Three things are checked here and nowhere else, because none of them can be
 * checked without real sessions and real policies:
 *
 *   - one user cannot read another's conversation with the advisor;
 *   - the daily quota cannot be spent twice by two concurrent requests;
 *   - the tables a user may not write are in fact unwritable, including
 *     through the SECURITY DEFINER functions that exist to write them.
 *
 * No Gemini call happens in this file. The model is not what is under test.
 */
describe("§5.4 יועץ AI — הרשאות ומכסות", () => {
  const world = new World();
  let a: TestUser;
  let b: TestUser;
  let competition: number;
  let game: TestGame;

  beforeAll(async () => {
    competition = await world.competition("טורניר יועץ");
    game = await world.game(competition);
    a = await world.user("יועץ א");
    b = await world.user("יועץ ב");
  });

  afterAll(() => world.dispose());

  // ─── Conversations are private ──────────────────────────────────────────

  it("1. שיחה של א׳ אינה נראית ל-ב׳", async () => {
    const { data: conversation } = await a.client
      .from("advisor_conversations")
      .insert({ user_id: a.id, game_id: game.id })
      .select("id")
      .single();

    expect(conversation?.id).toBeTruthy();

    await a.client.from("advisor_messages").insert({
      conversation_id: conversation!.id,
      role: "user",
      content: "מי ינצח?",
    });

    const { data: seenByB } = await b.client
      .from("advisor_conversations")
      .select("id")
      .eq("user_id", a.id);
    expect(seenByB?.length ?? 0).toBe(0);

    const { data: messagesByB } = await b.client
      .from("advisor_messages")
      .select("id")
      .eq("conversation_id", conversation!.id);
    expect(messagesByB?.length ?? 0).toBe(0);
  });

  it("2. ב׳ אינו יכול לכתוב הודעה לשיחה של א׳", async () => {
    const { data: conversation } = await admin
      .from("advisor_conversations")
      .select("id")
      .eq("user_id", a.id)
      .eq("game_id", game.id)
      .single();

    const { error } = await b.client.from("advisor_messages").insert({
      conversation_id: conversation!.id,
      role: "user",
      content: "הודעה מזויפת",
    });
    expect(error).not.toBeNull();
  });

  it("3. א׳ אינו יכול לפתוח שיחה בשם ב׳", async () => {
    const { error } = await a.client
      .from("advisor_conversations")
      .insert({ user_id: b.id, game_id: game.id });
    expect(error).not.toBeNull();
  });

  it("4. תמלול אינו ניתן לעריכה או למחיקה", async () => {
    const { data: conversation } = await admin
      .from("advisor_conversations")
      .select("id")
      .eq("user_id", a.id)
      .single();

    const { data: message } = await admin
      .from("advisor_messages")
      .select("id")
      .eq("conversation_id", conversation!.id)
      .limit(1)
      .single();

    await a.client
      .from("advisor_messages")
      .update({ content: "משהו אחר" })
      .eq("id", message!.id);
    await a.client.from("advisor_messages").delete().eq("id", message!.id);

    const { data: after } = await admin
      .from("advisor_messages")
      .select("content")
      .eq("id", message!.id)
      .single();
    expect(after?.content).toBe("מי ינצח?");
  });

  // ─── Quota ──────────────────────────────────────────────────────────────

  it("5. המכסה נספרת ויורדת", async () => {
    const { data: first } = await a.client.rpc("advisor_consume_quota", { p_limit: 3 });
    const { data: second } = await a.client.rpc("advisor_consume_quota", { p_limit: 3 });

    expect(first).toBe(2);
    expect(second).toBe(1);
  });

  it("6. מכסה מוצתה מחזירה -1 ואינה מוסיפה עוד", async () => {
    // Two already spent above, so one call reaches the ceiling and the next
    // must be refused rather than pushing the counter past the limit.
    await a.client.rpc("advisor_consume_quota", { p_limit: 3 });
    const { data: refused } = await a.client.rpc("advisor_consume_quota", { p_limit: 3 });
    expect(refused).toBe(-1);

    const { data: row } = await admin
      .from("advisor_usage")
      .select("question_count")
      .eq("user_id", a.id)
      .single();
    expect(row?.question_count).toBe(3);
  });

  it("7. בקשות מקבילות אינן עוקפות את המכסה", async () => {
    // The race the function exists to close: ten simultaneous claims against a
    // limit of four must hand out exactly four, not ten and not five.
    const LIMIT = 4;
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        b.client.rpc("advisor_consume_quota", { p_limit: LIMIT }),
      ),
    );

    const granted = results.filter((r) => (r.data as number) >= 0).length;
    expect(granted).toBe(LIMIT);

    const { data: row } = await admin
      .from("advisor_usage")
      .select("question_count")
      .eq("user_id", b.id)
      .single();
    expect(row?.question_count).toBe(LIMIT);
  });

  it("8. המכסה של א׳ אינה נראית ל-ב׳", async () => {
    const { data } = await b.client
      .from("advisor_usage")
      .select("question_count")
      .eq("user_id", a.id);
    expect(data?.length ?? 0).toBe(0);
  });

  // ─── Shared tables are read-only to users ───────────────────────────────

  it("9. משתמש אינו יכול לשתול ניתוח ישירות", async () => {
    const { error } = await a.client.from("advisor_insights").insert({
      game_id: game.id,
      context_hash: "deadbeef",
      payload: { headline: "מזויף" },
      model: "fake",
    });
    expect(error).not.toBeNull();
  });

  it("10. משתמש אינו יכול לשתול בחירה יומית", async () => {
    const { error } = await a.client.from("advisor_daily_pick").insert({
      pick_date: new Date().toISOString().slice(0, 10),
      competition_id: competition,
      game_id: game.id,
      payload: { headline: "מזויף" },
    });
    expect(error).not.toBeNull();
  });

  it("11. api_cache אינו נראה למשתמש כלל", async () => {
    const { data, error } = await a.client.from("api_cache").select("cache_key");
    // No policy at all: the read returns nothing, whichever way PostgREST
    // chooses to report it.
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });

  it("12. api_cache_put דוחה מפתח שאינו endpoint מוכר", async () => {
    const { error } = await a.client.rpc("api_cache_put", {
      p_key: "not-an-endpoint",
      p_payload: { junk: true },
    });
    expect(error).not.toBeNull();
  });

  it("13. api_cache_put מקבל מפתח תקין", async () => {
    const key = `/fixtures?test=${Date.now()}`;
    const { error } = await a.client.rpc("api_cache_put", {
      p_key: key,
      p_payload: [{ ok: true }],
    });
    expect(error).toBeNull();

    await admin.from("api_cache").delete().eq("cache_key", key);
  });

  // ─── The landing page's opening ─────────────────────────────────────────

  it("14. אנונימי אינו רואה את טבלת הבחירות היומיות", async () => {
    const { data } = await anon().from("advisor_daily_pick").select("id");
    expect(data?.length ?? 0).toBe(0);
  });

  it("15. אנונימי כן יכול לקרוא ל-landing_advisor_card", async () => {
    // The narrow opening: the function answers, the table stays shut.
    const { error } = await anon().rpc("landing_advisor_card");
    expect(error).toBeNull();
  });

  it("16. אנונימי אינו יכול לצרוך מכסה", async () => {
    const { error } = await anon().rpc("advisor_consume_quota", { p_limit: 10 });
    expect(error).not.toBeNull();
  });

  it("17. אנונימי אינו יכול לקרוא את התפלגות הניחושים", async () => {
    const { error } = await anon().rpc("advisor_crowd_split", { p_game_id: game.id });
    expect(error).not.toBeNull();
  });
});
