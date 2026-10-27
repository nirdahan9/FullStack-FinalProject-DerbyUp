import { describe, expect, it } from "vitest";
import { createClient } from "@/lib/demo/client";
import { DEMO_USER_ID } from "@/lib/demo/fixtures";

/** Exactly what the pages compute today, from the wall clock. */
const realNow = new Date().toISOString();
const realToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

describe("wall-clock call sites", () => {
  it("challenge page: todayInIsrael()", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("daily_puzzles")
      .select("id").eq("play_date", realToday).maybeSingle();
    console.log("challenge puzzle found:", data !== null, "realToday:", realToday);
  });

  it("daily pick: new Date().toISOString().slice(0,10)", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("advisor_daily_pick")
      .select("game_id").eq("pick_date", realNow.slice(0, 10))
      .in("competition_id", [39, 2]);
    console.log("daily picks found:", (data ?? []).length);
  });

  it("league admin: unsettled picker", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("games")
      .select("id").eq("competition_id", 2)
      .is("settled_at", null).lt("kickoff_at", realNow)
      .order("kickoff_at", { ascending: false }).limit(20);
    console.log("manual-settle candidates:", (data ?? []).length);
  });

  it("league admin: upcoming featured picker", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("games")
      .select("id").eq("competition_id", 2).eq("status", "scheduled")
      .gt("kickoff_at", realNow).order("kickoff_at", { ascending: true }).limit(30);
    console.log("featured-game candidates:", (data ?? []).length);
  });

  it("dashboard / games: upcoming list", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("games")
      .select("id").in("competition_id", [39, 2]).eq("status", "scheduled")
      .gt("kickoff_at", realNow).order("kickoff_at", { ascending: true }).limit(5);
    console.log("upcoming games:", (data ?? []).length);
  });

  it("advisor picker: kickoffWindow('week')", async () => {
    const supabase = await createClient();
    const from = new Date();
    const to = new Date(Date.now() + 7 * 24 * 3600_000);
    const { data } = await supabase.from("games")
      .select("id").eq("status", "scheduled")
      .gte("kickoff_at", from.toISOString()).lt("kickoff_at", to.toISOString())
      .order("kickoff_at", { ascending: true }).limit(60);
    console.log("advisor week window:", (data ?? []).length);
  });

  it("notifications: unread badge is clock-free", async () => {
    const supabase = await createClient();
    const { count } = await supabase.from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", DEMO_USER_ID).is("read_at", null);
    console.log("unread:", count);
    expect(count).toBeGreaterThan(0);
  });
});
