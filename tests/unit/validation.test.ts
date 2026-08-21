import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import {
  createLeagueSchema,
  featuredGameSchema,
  joinLeagueSchema,
  makePredictionSchema,
  prizesSchema,
  submitPuzzleAnswerSchema,
} from "@/lib/validation/schemas";

const UUID = "11111111-2222-4333-8444-555555555555";

/** docs/04-test-spec.md §3.1 and §3.2 */
describe("signUpSchema", () => {
  const valid = { email: "a@b.com", password: "12345678", displayName: "ניר" };

  it("accepts valid input", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["email without @", { email: "nope" }],
    ["password of 7 characters", { password: "1234567" }],
    ["display name of 1 character", { displayName: "א" }],
    ["display name over 60", { displayName: "א".repeat(61) }],
    ["missing email", { email: "" }],
  ])("rejects %s", (_label, override) => {
    expect(signUpSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("rejects a null password", () => {
    expect(signUpSchema.safeParse({ ...valid, password: null }).success).toBe(false);
  });

  it("rejects a megabyte of text in a field", () => {
    expect(
      signUpSchema.safeParse({ ...valid, displayName: "x".repeat(1_000_000) }).success,
    ).toBe(false);
  });

  it("keeps a script tag as text rather than rejecting it", () => {
    // React escapes on render, so this is stored and shown literally. The
    // schema's job is length and shape, not stripping markup.
    const parsed = signUpSchema.safeParse({
      ...valid,
      displayName: "<script>alert(1)</script>",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.displayName).toContain("<script>");
  });
});

describe("signInSchema", () => {
  it("accepts valid input", () => {
    expect(signInSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(signInSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("createLeagueSchema", () => {
  const valid = { name: "ליגת המשרד", competitionId: 39 };

  it("accepts valid input", () => {
    expect(createLeagueSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a competition — a league is always bound to one tournament", () => {
    expect(createLeagueSchema.safeParse({ name: "ליגה" }).success).toBe(false);
  });

  it.each([
    ["a 2-character name", { name: "אב" }],
    ["a 61-character name", { name: "א".repeat(61) }],
    ["a negative competition id", { competitionId: -1 }],
    ["a non-integer competition id", { competitionId: 1.5 }],
    ["a description over 500", { description: "x".repeat(501) }],
  ])("rejects %s", (_label, override) => {
    expect(createLeagueSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe("joinLeagueSchema", () => {
  it("accepts an 8-character code", () => {
    expect(joinLeagueSchema.safeParse({ inviteCode: "AB12CD34" }).success).toBe(true);
  });

  it("uppercases a lowercase code", () => {
    const parsed = joinLeagueSchema.safeParse({ inviteCode: "ab12cd34" });
    expect(parsed.success && parsed.data.inviteCode).toBe("AB12CD34");
  });

  it.each([
    ["7 characters", "AB12CD3"],
    ["9 characters", "AB12CD345"],
    ["punctuation", "AB12-CD3"],
    ["a SQL fragment", "' OR 1=1"],
  ])("rejects %s", (_label, inviteCode) => {
    expect(joinLeagueSchema.safeParse({ inviteCode }).success).toBe(false);
  });
});

describe("makePredictionSchema", () => {
  it("accepts valid input", () => {
    expect(makePredictionSchema.safeParse({ questionId: UUID, outcome: "home" }).success).toBe(true);
  });

  it.each([
    ["a non-uuid question id", { questionId: "123" }],
    ["an empty outcome", { outcome: "" }],
    ["an outcome over 20 characters", { outcome: "x".repeat(21) }],
  ])("rejects %s", (_label, override) => {
    expect(
      makePredictionSchema.safeParse({ questionId: UUID, outcome: "home", ...override }).success,
    ).toBe(false);
  });

  it("ignores extra fields rather than trusting them", () => {
    // A crafted request could add pointsEarned; Zod drops what is not declared.
    const parsed = makePredictionSchema.safeParse({
      questionId: UUID,
      outcome: "home",
      pointsEarned: 9999,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("pointsEarned" in parsed.data).toBe(false);
  });

  it("does not know which outcomes are legal — that is a domain rule", () => {
    // "over" passes here and is rejected by validatePrediction, which knows
    // the question type. Documented so the split stays deliberate.
    expect(makePredictionSchema.safeParse({ questionId: UUID, outcome: "over" }).success).toBe(true);
  });
});

describe("prizesSchema", () => {
  const valid = { leagueId: UUID, prizes: [{ place: 1, prize: "כרטיס למשחק" }] };

  it("accepts valid input", () => {
    expect(prizesSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects place 0", () => {
    expect(prizesSchema.safeParse({ ...valid, prizes: [{ place: 0, prize: "x" }] }).success).toBe(false);
  });

  it("rejects more than 20 prizes", () => {
    const prizes = Array.from({ length: 21 }, (_, i) => ({ place: i + 1, prize: "x" }));
    expect(prizesSchema.safeParse({ ...valid, prizes }).success).toBe(false);
  });

  it("accepts an empty prize list", () => {
    expect(prizesSchema.safeParse({ ...valid, prizes: [] }).success).toBe(true);
  });
});

describe("featuredGameSchema", () => {
  const valid = { leagueId: UUID, gameId: UUID, bonusPct: 50 };

  it("accepts valid input", () => {
    expect(featuredGameSchema.safeParse(valid).success).toBe(true);
  });

  it.each([[-1], [101], [1.5]])("rejects a bonus of %s", (bonusPct) => {
    expect(featuredGameSchema.safeParse({ ...valid, bonusPct }).success).toBe(false);
  });

  it.each([[0], [100]])("accepts a bonus of %i", (bonusPct) => {
    expect(featuredGameSchema.safeParse({ ...valid, bonusPct }).success).toBe(true);
  });
});

describe("submitPuzzleAnswerSchema", () => {
  it("accepts valid input", () => {
    expect(submitPuzzleAnswerSchema.safeParse({ puzzleId: UUID, answer: "Ozil" }).success).toBe(true);
  });

  it("rejects an empty answer", () => {
    expect(submitPuzzleAnswerSchema.safeParse({ puzzleId: UUID, answer: "   " }).success).toBe(false);
  });
});
