import { describe, expect, it } from "vitest";
import { translateTeam } from "@/lib/i18n/teams";
import { TEAM_NAMES_HE } from "@/lib/i18n/team-names";

describe("translateTeam", () => {
  it.each([
    ["Arsenal", "ארסנל"],
    ["Real Madrid", "ריאל מדריד"],
    ["AC Milan", "מילאן"],
    ["Coventry", "קובנטרי"],
    ["Hapoel Ramat Gan", "הפועל רמת גן"],
  ])("%s → %s", (english, hebrew) => {
    expect(translateTeam(english)).toBe(hebrew);
  });

  it("matches regardless of case", () => {
    expect(translateTeam("arsenal")).toBe("ארסנל");
  });

  it("matches a name carrying a club suffix", () => {
    // The provider sends "Liverpool" and "Liverpool FC" interchangeably.
    expect(translateTeam("Liverpool FC")).toBe(translateTeam("Liverpool"));
  });

  it("matches across accent spellings", () => {
    // Bayern arrives as both "Bayern Munich" and "Bayern München".
    expect(translateTeam("Bayern München")).toBe("באיירן מינכן");
    expect(translateTeam("Bayern Munich")).toBe("באיירן מינכן");
  });

  it("falls back to the English name for an unknown club", () => {
    // A club we have never seen must render untranslated, not break the list.
    expect(translateTeam("Some New FC")).toBe("Some New FC");
  });

  it("handles an empty name", () => {
    expect(translateTeam("")).toBe("");
  });

  it("has no empty translations", () => {
    for (const [en, he] of Object.entries(TEAM_NAMES_HE)) {
      expect(he.trim().length, `${en} is empty`).toBeGreaterThan(0);
    }
  });
});
