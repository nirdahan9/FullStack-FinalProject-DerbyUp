import { describe, expect, it } from "vitest";
import {
  buildQuestions,
  DEFAULT_ODDS,
  mapFixtureStatus,
  parseOdds,
} from "@/lib/football-api/mapping";
import { OUTCOME_KEYS } from "@/lib/domain/types";

describe("mapFixtureStatus", () => {
  it.each([
    ["NS", "scheduled"],
    ["TBD", "scheduled"],
    ["1H", "live"],
    ["HT", "live"],
    ["2H", "live"],
    ["FT", "finished"],
    ["AET", "finished"],
    ["PEN", "finished"],
    ["PST", "postponed"],
    ["CANC", "cancelled"],
    ["ABD", "cancelled"],
    ["WO", "cancelled"],
  ])("%s → %s", (short, expected) => {
    expect(mapFixtureStatus(short)).toBe(expected);
  });

  it("falls back to scheduled for a code we have never seen", () => {
    // Better than throwing: an unknown status must not abort a whole sync,
    // and a fixture left scheduled is simply never settled — visible and
    // fixable, rather than a lost run.
    expect(mapFixtureStatus("WHAT")).toBe("scheduled");
    expect(mapFixtureStatus("")).toBe("scheduled");
  });
});

const market = (name: string, values: [string, string][]) => ({
  name,
  values: values.map(([value, odd]) => ({ value, odd })),
});

const fullBookmaker = (name = "Bookie") => ({
  name,
  bets: [
    market("Match Winner", [["Home", "8.00"], ["Draw", "4.75"], ["Away", "1.36"]]),
    market("Goals Over/Under", [["Over 2.5", "1.65"], ["Under 2.5", "2.20"]]),
    market("Both Teams Score", [["Yes", "1.91"], ["No", "1.83"]]),
  ],
});

describe("parseOdds", () => {
  it("reads all three markets", () => {
    const { odds, complete } = parseOdds([fullBookmaker()]);
    expect(complete).toBe(true);
    expect(odds).toEqual({
      home: 8, draw: 4.75, away: 1.36,
      over: 1.65, under: 2.2, yes: 1.91, no: 1.83,
    });
  });

  it("prefers the first bookmaker pricing all three markets", () => {
    // The DerbyUp app always took bookmakers[0]; a response can carry
    // fourteen, and the first may skip a market. Picking blindly would drop a
    // real price for a default.
    const partial = { name: "Partial", bets: [market("Match Winner", [["Home", "2.00"], ["Draw", "3.00"], ["Away", "4.00"]])] };
    const { odds, complete } = parseOdds([partial, fullBookmaker("Complete")]);
    expect(complete).toBe(true);
    expect(odds.home).toBe(8);
  });

  it("keeps the real prices it has when nothing is complete", () => {
    const partial = { name: "Partial", bets: [market("Match Winner", [["Home", "2.00"], ["Draw", "3.00"], ["Away", "4.00"]])] };
    const { odds, complete } = parseOdds([partial]);
    expect(complete).toBe(false);
    expect(odds.home).toBe(2);
    expect(odds.over).toBe(DEFAULT_ODDS.over);
  });

  it("picks the bookmaker with the most prices when none is complete", () => {
    const thin = { name: "Thin", bets: [market("Both Teams Score", [["Yes", "1.50"], ["No", "2.50"]])] };
    const thicker = {
      name: "Thicker",
      bets: [
        market("Match Winner", [["Home", "2.00"], ["Draw", "3.00"], ["Away", "4.00"]]),
        market("Goals Over/Under", [["Over 2.5", "1.70"], ["Under 2.5", "2.10"]]),
      ],
    };
    const { odds } = parseOdds([thin, thicker]);
    expect(odds.home).toBe(2);
  });

  it("falls back entirely when there are no bookmakers", () => {
    expect(parseOdds([]).odds).toEqual(DEFAULT_ODDS);
    expect(parseOdds(undefined).odds).toEqual(DEFAULT_ODDS);
    expect(parseOdds([]).complete).toBe(false);
  });

  it("rejects odds below 1", () => {
    // Decimal odds under 1 would score a correct prediction less than a point,
    // which is never a real price.
    const bad = { bets: [market("Match Winner", [["Home", "0.50"], ["Draw", "3.00"], ["Away", "4.00"]])] };
    expect(parseOdds([bad]).odds.home).toBe(DEFAULT_ODDS.home);
  });

  it("rejects unparseable odds", () => {
    const bad = { bets: [market("Match Winner", [["Home", "n/a"], ["Draw", "3.00"], ["Away", "4.00"]])] };
    expect(parseOdds([bad]).odds.home).toBe(DEFAULT_ODDS.home);
  });

  it("ignores markets we do not score on", () => {
    const extra = {
      bets: [...fullBookmaker().bets, market("Corners Over Under", [["Over 9.5", "1.80"]])],
    };
    expect(parseOdds([extra]).complete).toBe(true);
  });
});

describe("buildQuestions", () => {
  const teams = { home: "ארסנל", away: "קובנטרי" };

  it("builds exactly three questions", () => {
    const questions = buildQuestions(DEFAULT_ODDS, teams);
    expect(questions.map((q) => q.type)).toEqual([
      "match_result", "over_under_2_5", "btts",
    ]);
  });

  it("uses the outcome keys settlement compares against", () => {
    // If these drift from OUTCOME_KEYS, every prediction silently scores zero.
    for (const q of buildQuestions(DEFAULT_ODDS, teams)) {
      expect(q.outcomes.map((o) => o.key)).toEqual([...OUTCOME_KEYS[q.type]]);
    }
  });

  it("puts team names in labels only, never in keys", () => {
    const [matchResult] = buildQuestions(DEFAULT_ODDS, teams);
    expect(matchResult.outcomes[0]).toMatchObject({ key: "home", label: "ארסנל" });
    expect(matchResult.outcomes[2]).toMatchObject({ key: "away", label: "קובנטרי" });
    expect(matchResult.outcomes.map((o) => o.key)).not.toContain("ארסנל");
  });

  it("carries the odds through to every outcome", () => {
    const odds = { home: 8, draw: 4.75, away: 1.36, over: 1.65, under: 2.2, yes: 1.91, no: 1.83 };
    const [mr, ou, btts] = buildQuestions(odds, teams);
    expect(mr.outcomes.map((o) => o.odds)).toEqual([8, 4.75, 1.36]);
    expect(ou.outcomes.map((o) => o.odds)).toEqual([1.65, 2.2]);
    expect(btts.outcomes.map((o) => o.odds)).toEqual([1.91, 1.83]);
  });
});
