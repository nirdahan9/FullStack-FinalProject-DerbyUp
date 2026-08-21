import { describe, expect, it } from "vitest";
import {
  CANCEL_WINDOW_MINUTES,
  validateCancellation,
  validatePrediction,
} from "@/lib/domain/prediction-rules";
import type { GameStatus, QuestionType } from "@/lib/domain/types";

const KICKOFF = new Date("2026-09-01T19:00:00Z");
const minutesBefore = (m: number) => new Date(KICKOFF.getTime() - m * 60_000);

function ctx(over: Partial<Parameters<typeof validatePrediction>[0]> = {}) {
  return {
    game: {
      kickoffAt: KICKOFF,
      status: "scheduled" as GameStatus,
      competitionId: 39,
    },
    questionType: "match_result" as QuestionType,
    selectedOutcome: "home",
    hasExisting: false,
    userCompetitions: [39],
    now: minutesBefore(60),
    ...over,
  };
}

/** docs/04-test-spec.md §4.1 */
describe("validatePrediction", () => {
  it("allows a valid prediction", () => {
    expect(validatePrediction(ctx())).toEqual({ ok: true });
  });

  it("rejects once the match has started", () => {
    expect(validatePrediction(ctx({ now: new Date(KICKOFF.getTime() + 1000) })))
      .toEqual({ ok: false, reason: "GAME_STARTED" });
  });

  it("rejects at exactly kickoff", () => {
    // Boundary: the whistle closes the window, it does not leave it open.
    expect(validatePrediction(ctx({ now: new Date(KICKOFF) }))).toEqual({
      ok: false,
      reason: "GAME_STARTED",
    });
  });

  it("allows one second before kickoff", () => {
    expect(
      validatePrediction(ctx({ now: new Date(KICKOFF.getTime() - 1000) })),
    ).toEqual({ ok: true });
  });

  it("rejects a second prediction on the same question", () => {
    expect(validatePrediction(ctx({ hasExisting: true }))).toEqual({
      ok: false,
      reason: "ALREADY_PREDICTED",
    });
  });

  it.each<GameStatus>(["finished", "cancelled", "live", "postponed"])(
    "rejects a %s fixture",
    (status) => {
      const result = validatePrediction(
        ctx({ game: { kickoffAt: KICKOFF, status, competitionId: 39 } }),
      );
      expect(result).toEqual({ ok: false, reason: "GAME_NOT_OPEN" });
    },
  );

  it("rejects when the user has no league for that competition", () => {
    expect(validatePrediction(ctx({ userCompetitions: [] }))).toEqual({
      ok: false,
      reason: "NO_LEAGUE_FOR_COMPETITION",
    });
  });

  it("rejects when the user's leagues cover a different competition", () => {
    expect(validatePrediction(ctx({ userCompetitions: [140, 135] }))).toEqual({
      ok: false,
      reason: "NO_LEAGUE_FOR_COMPETITION",
    });
  });

  it("rejects an outcome that does not belong to the question type", () => {
    // "over" is a real key, just not for match_result. Zod cannot catch this:
    // it only sees a short string.
    expect(validatePrediction(ctx({ selectedOutcome: "over" }))).toEqual({
      ok: false,
      reason: "INVALID_OUTCOME",
    });
  });

  it("rejects a fabricated outcome", () => {
    expect(validatePrediction(ctx({ selectedOutcome: "definitely_home" })))
      .toEqual({ ok: false, reason: "INVALID_OUTCOME" });
  });

  it.each([
    ["over_under_2_5" as QuestionType, "over"],
    ["over_under_2_5" as QuestionType, "under"],
    ["btts" as QuestionType, "yes"],
    ["btts" as QuestionType, "no"],
    ["match_result" as QuestionType, "draw"],
    ["match_result" as QuestionType, "away"],
  ])("accepts %s / %s", (questionType, selectedOutcome) => {
    expect(validatePrediction(ctx({ questionType, selectedOutcome }))).toEqual({
      ok: true,
    });
  });

  it("reports the fixture state before the clock", () => {
    // A finished match an hour ago should say GAME_NOT_OPEN, not GAME_STARTED:
    // the user needs to know it is over, not that they were late.
    const result = validatePrediction(
      ctx({
        game: { kickoffAt: KICKOFF, status: "finished", competitionId: 39 },
        now: new Date(KICKOFF.getTime() + 3_600_000),
      }),
    );
    expect(result).toEqual({ ok: false, reason: "GAME_NOT_OPEN" });
  });
});

/** docs/04-test-spec.md §4.2 — boundary cases around the 10-minute window. */
describe("validateCancellation", () => {
  function cancelCtx(over = {}) {
    return {
      prediction: { userId: "user-a", status: "pending" as const },
      game: { kickoffAt: KICKOFF },
      requesterId: "user-a",
      now: minutesBefore(60),
      ...over,
    };
  }

  it("allows a cancel an hour out", () => {
    expect(validateCancellation(cancelCtx())).toEqual({ ok: true });
  });

  it("allows a cancel 11 minutes out", () => {
    expect(validateCancellation(cancelCtx({ now: minutesBefore(11) }))).toEqual({
      ok: true,
    });
  });

  it("rejects at exactly 10 minutes", () => {
    // The `<` vs `<=` boundary, and it carries meaning: this is the point
    // where team news starts to arrive.
    expect(
      validateCancellation(cancelCtx({ now: minutesBefore(CANCEL_WINDOW_MINUTES) })),
    ).toEqual({ ok: false, reason: "CANCEL_WINDOW_CLOSED" });
  });

  it("rejects at 9 minutes", () => {
    expect(validateCancellation(cancelCtx({ now: minutesBefore(9) }))).toEqual({
      ok: false,
      reason: "CANCEL_WINDOW_CLOSED",
    });
  });

  it("rejects after kickoff", () => {
    expect(
      validateCancellation(cancelCtx({ now: new Date(KICKOFF.getTime() + 60_000) })),
    ).toEqual({ ok: false, reason: "CANCEL_WINDOW_CLOSED" });
  });

  it("rejects a settled prediction", () => {
    expect(
      validateCancellation(
        cancelCtx({ prediction: { userId: "user-a", status: "correct" } }),
      ),
    ).toEqual({ ok: false, reason: "ALREADY_SETTLED" });
  });

  it("rejects one already cancelled", () => {
    expect(
      validateCancellation(
        cancelCtx({ prediction: { userId: "user-a", status: "cancelled" } }),
      ),
    ).toEqual({ ok: false, reason: "ALREADY_SETTLED" });
  });

  it("rejects someone else's prediction", () => {
    expect(validateCancellation(cancelCtx({ requesterId: "user-b" }))).toEqual({
      ok: false,
      reason: "NOT_OWNER",
    });
  });

  it("checks ownership before anything else", () => {
    // A stranger must not learn whether a prediction is settled by reading
    // which rejection comes back.
    const result = validateCancellation(
      cancelCtx({
        requesterId: "user-b",
        prediction: { userId: "user-a", status: "correct" },
        now: minutesBefore(1),
      }),
    );
    expect(result).toEqual({ ok: false, reason: "NOT_OWNER" });
  });
});
