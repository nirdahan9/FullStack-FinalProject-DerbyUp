import { describe, expect, it } from "vitest";
import { anon } from "./world";

/**
 * §5.5 — the one door left open to an anonymous visitor.
 *
 * `landing_fixtures()` is the only function in the product `anon` may execute,
 * and it exists so the landing page can show real fixtures without widening
 * the policies on `games`, `questions` and `competitions`. Two things are
 * therefore worth pinning down: that the door opens, and that it is the only
 * one — a visitor who calls the function gets three rows of football and
 * cannot reach the tables behind it.
 *
 * The assertions are about invariants rather than about specific fixtures.
 * The function reads the whole product and returns three rows, so a test
 * cannot guarantee its own row is among them; what it can guarantee is that
 * whatever comes back obeys the contract.
 */
describe("§5.5 תצוגת דף הנחיתה", () => {
  const KEYS = [
    "home_team",
    "away_team",
    "home_logo",
    "away_logo",
    "kickoff_at",
    "competition_name",
    "outcomes",
    "odds_provisional",
    "status",
    "score_home",
    "score_away",
    "minute",
  ].sort();

  it("1. אורח קורא ל-landing_fixtures — מצליח, ומקבל עד 3 שורות", async () => {
    const { data, error } = await anon().rpc("landing_fixtures");

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data ?? []).length).toBeLessThanOrEqual(3);
  });

  it("2. מוחזרים רק משחקים קרובים או חיים", async () => {
    const { data } = await anon().rpc("landing_fixtures");

    for (const row of data ?? []) {
      expect(["scheduled", "live"]).toContain(row.status);
      // A scheduled fixture that has already kicked off is not upcoming, and
      // is exactly the row the old filter existed to keep out.
      if (row.status === "scheduled") {
        expect(new Date(row.kickoff_at).getTime()).toBeGreaterThan(Date.now());
      }
    }
  });

  it("3. משחק חי מקדים משחק עתידי", async () => {
    const { data } = await anon().rpc("landing_fixtures");

    // The card at the top of the page is the featured one, so the order is
    // the feature: once a scheduled fixture has appeared, no live one may.
    let seenScheduled = false;
    for (const row of data ?? []) {
      if (row.status === "scheduled") seenScheduled = true;
      else expect(seenScheduled).toBe(false);
    }
  });

  it("4. אין בתשובה דבר שמזהה מישהו — 12 עמודות של כדורגל בלבד", async () => {
    const { data } = await anon().rpc("landing_fixtures");
    const rows = data ?? [];
    if (!rows.length) return;

    expect(Object.keys(rows[0]).sort()).toEqual(KEYS);
  });

  it("5. אותו אורח עדיין נדחה מהטבלאות עצמן", async () => {
    const client = anon();

    // The whole reason the function exists: the policies stay shut. RLS
    // returns an empty set rather than an error, which is the correct shape —
    // there is nothing to see, not something that went wrong.
    for (const table of ["games", "questions", "competitions"] as const) {
      const { data, error } = await client.from(table).select("*").limit(1);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });
});
