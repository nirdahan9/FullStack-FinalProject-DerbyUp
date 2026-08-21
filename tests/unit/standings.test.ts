import { describe, expect, it } from "vitest";
import { rankRows, type ScoreRow } from "@/lib/domain/standings";

const row = (over: Partial<ScoreRow> & { userId: string }): ScoreRow => ({
  displayName: over.userId,
  points: 0,
  correctCount: 0,
  joinedAt: new Date("2026-08-01T00:00:00Z"),
  ...over,
});

/** docs/04-test-spec.md §2.4 */
describe("rankRows", () => {
  it("orders by points, highest first", () => {
    const ranked = rankRows([
      row({ userId: "b", points: 12.5 }),
      row({ userId: "a", points: 30.1 }),
      row({ userId: "c", points: 20 }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["a", "c", "b"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("breaks a points tie on correct predictions", () => {
    const ranked = rankRows([
      row({ userId: "fewer", points: 20, correctCount: 3 }),
      row({ userId: "more", points: 20, correctCount: 7 }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["more", "fewer"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("breaks a full tie on who joined first", () => {
    const ranked = rankRows([
      row({ userId: "late", points: 10, correctCount: 2, joinedAt: new Date("2026-08-10") }),
      row({ userId: "early", points: 10, correctCount: 2, joinedAt: new Date("2026-08-02") }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["early", "late"]);
  });

  it("gives tied rows the same rank", () => {
    const ranked = rankRows([
      row({ userId: "a", points: 10, correctCount: 2 }),
      row({ userId: "b", points: 10, correctCount: 2 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("skips the next rank after a tie", () => {
    // Competition ranking: 100/100/90 is 1, 1, 3. If two people genuinely
    // tie for first, nobody finished second.
    const ranked = rankRows([
      row({ userId: "a", points: 100, correctCount: 5 }),
      row({ userId: "b", points: 100, correctCount: 5 }),
      row({ userId: "c", points: 90, correctCount: 4 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("handles a three-way tie", () => {
    const ranked = rankRows([
      row({ userId: "a", points: 50, correctCount: 3 }),
      row({ userId: "b", points: 50, correctCount: 3 }),
      row({ userId: "c", points: 50, correctCount: 3 }),
      row({ userId: "d", points: 10 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it("returns an empty array for an empty league", () => {
    expect(rankRows([])).toEqual([]);
  });

  it("still lists a member with no points", () => {
    const ranked = rankRows([row({ userId: "quiet" })]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ rank: 1, points: 0 });
  });

  it("does not mutate the array it was given", () => {
    const input = [row({ userId: "b", points: 1 }), row({ userId: "a", points: 9 })];
    const before = input.map((r) => r.userId);
    rankRows(input);
    expect(input.map((r) => r.userId)).toEqual(before);
  });

  it("separates rows tied on points but not on correct count", () => {
    // joinedAt orders them, but must not be treated as a tie-breaker that
    // makes two rows "equal" — otherwise nobody would ever share a rank.
    const ranked = rankRows([
      row({ userId: "a", points: 10, correctCount: 4 }),
      row({ userId: "b", points: 10, correctCount: 1 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });
});
