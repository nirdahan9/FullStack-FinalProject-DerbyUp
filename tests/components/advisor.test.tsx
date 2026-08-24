import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdvisorPanel } from "@/components/advisor/advisor-panel";
import { InsightCard } from "@/components/advisor/insight-card";
import { DailyPickCard } from "@/components/advisor/daily-pick-card";
import type { Insight } from "@/lib/advisor/schema";

/**
 * §8.2 — the advisor's surfaces.
 *
 * Server Actions cannot run in jsdom and Gemini must never be reached from a
 * test, so the actions are mocked and what is asserted is the contract between
 * them and the UI: that an opinion is rendered, that a refusal is visibly a
 * refusal, and that a spent quota actually closes the input rather than
 * letting someone press send into a rejection.
 */

const getGameInsight = vi.hoisted(() => vi.fn());
const askAdvisor = vi.hoisted(() => vi.fn());
const getAdvisorThread = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/advisor", () => ({
  getGameInsight,
  askAdvisor,
  getAdvisorThread,
}));

const insight: Insight = {
  headline: "בולוניה בבית חזקה מספיק כדי לנצל את המשבר של לאציו",
  recommendation: {
    question_type: "match_result",
    outcome_key: "home",
    outcomeLabel: "בולוניה",
    odds: 2.2,
  },
  reasons: ["הכושר הביתי שלה טוב", "לאציו הפסידה שלושה ברצף"],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("§8.2 יועץ AI", () => {
  describe("InsightCard", () => {
    it("מציג את הדעה, הבחירה והיחס", () => {
      render(<InsightCard insight={insight} />);

      expect(screen.getByText(insight.headline)).toBeInTheDocument();
      expect(screen.getByText("בולוניה")).toBeInTheDocument();
      expect(screen.getByText("2.20")).toBeInTheDocument();
      expect(screen.getByText("הכושר הביתי שלה טוב")).toBeInTheDocument();
    });

    it("אינו מציג אחוזים, תוחלת או רמת ביטחון", () => {
      // The product decision this card exists to express: an opinion, not a
      // dashboard. A percentage creeping back in would be a regression.
      render(<InsightCard insight={insight} />);
      const text = document.body.textContent ?? "";

      expect(text).not.toMatch(/%/);
      expect(text).not.toMatch(/תוחלת/);
      expect(text).not.toMatch(/ביטחון/);
    });

    it("מבהיר שזו הערכה ולא ודאות", () => {
      render(<InsightCard insight={insight} />);
      expect(document.body.textContent).toMatch(/לא תחזית ודאית/);
    });
  });

  describe("AdvisorPanel", () => {
    it("מרנדר את הניתוח ואת מונה השאלות", async () => {
      getGameInsight.mockResolvedValue({
        ok: true,
        data: { insight, cached: true, remaining: 7 },
      });
      getAdvisorThread.mockResolvedValue([]);

      render(<AdvisorPanel gameId="game-1" />);

      expect(await screen.findByText(insight.headline)).toBeInTheDocument();
      expect(screen.getByText(/נותרו 7 שאלות היום/)).toBeInTheDocument();
    });

    it("מציג שגיאה כשהניתוח נכשל, בלי צ׳אט", async () => {
      getGameInsight.mockResolvedValue({ ok: false, error: "היועץ אינו זמין כרגע" });
      getAdvisorThread.mockResolvedValue([]);

      render(<AdvisorPanel gameId="game-1" />);

      expect(await screen.findByText("היועץ אינו זמין כרגע")).toBeInTheDocument();
      // No analysis means nothing to ask follow-ups about.
      expect(screen.queryByPlaceholderText(/שאל על המשחק/)).not.toBeInTheDocument();
    });

    it("משבית את הקלט כשהמכסה נגמרה", async () => {
      getGameInsight.mockResolvedValue({
        ok: true,
        data: { insight, cached: true, remaining: 0 },
      });
      getAdvisorThread.mockResolvedValue([]);

      render(<AdvisorPanel gameId="game-1" />);

      const input = await screen.findByPlaceholderText("נגמרו השאלות להיום");
      expect(input).toBeDisabled();
    });

    it("מציג תשובה של היועץ ומעדכן את המונה", async () => {
      getGameInsight.mockResolvedValue({
        ok: true,
        data: { insight, cached: true, remaining: 5 },
      });
      getAdvisorThread.mockResolvedValue([]);
      askAdvisor.mockResolvedValue({
        ok: true,
        data: { answer: "כי הכושר הביתי שלה טוב יותר", refused: false, remaining: 4 },
      });

      render(<AdvisorPanel gameId="game-1" />);
      await screen.findByText(insight.headline);

      await userEvent.click(screen.getByRole("button", { name: "למה דווקא הבחירה הזו?" }));

      expect(await screen.findByText("כי הכושר הביתי שלה טוב יותר")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByText(/נותרו 4 שאלות היום/)).toBeInTheDocument(),
      );
      expect(askAdvisor).toHaveBeenCalledWith({
        gameId: "game-1",
        question: "למה דווקא הבחירה הזו?",
      });
    });

    it("מציג סירוב כשהשאלה מחוץ לתחום", async () => {
      getGameInsight.mockResolvedValue({
        ok: true,
        data: { insight, cached: true, remaining: 5 },
      });
      getAdvisorThread.mockResolvedValue([]);
      askAdvisor.mockResolvedValue({
        ok: true,
        data: { answer: "אני עונה רק על המשחק שמולך", refused: true, remaining: 5 },
      });

      render(<AdvisorPanel gameId="game-1" />);
      await screen.findByText(insight.headline);

      const input = screen.getByPlaceholderText(/שאל על המשחק/);
      await userEvent.type(input, "מה מתכון לשקשוקה?");
      await userEvent.click(screen.getByRole("button", { name: "שלח" }));

      expect(await screen.findByText("אני עונה רק על המשחק שמולך")).toBeInTheDocument();
    });

    it("מסיר את השאלה מהמסך כשהקריאה נכשלה", async () => {
      getGameInsight.mockResolvedValue({
        ok: true,
        data: { insight, cached: true, remaining: 5 },
      });
      getAdvisorThread.mockResolvedValue([]);
      askAdvisor.mockResolvedValue({ ok: false, error: "נגמרו לך שאלות היועץ להיום" });

      render(<AdvisorPanel gameId="game-1" />);
      await screen.findByText(insight.headline);

      const input = screen.getByPlaceholderText(/שאל על המשחק/);
      await userEvent.type(input, "למה?");
      await userEvent.click(screen.getByRole("button", { name: "שלח" }));

      expect(await screen.findByText("נגמרו לך שאלות היועץ להיום")).toBeInTheDocument();
      // The question never landed, so leaving its bubble on screen would claim
      // it had been asked.
      expect(screen.queryByText("למה?")).not.toBeInTheDocument();
    });

    it("טוען שיחה קיימת בפתיחה", async () => {
      getGameInsight.mockResolvedValue({
        ok: true,
        data: { insight, cached: true, remaining: 5 },
      });
      getAdvisorThread.mockResolvedValue([
        { role: "user", content: "ומה עם התיקו?", blocked: false },
        { role: "assistant", content: "התיקו כאן פחות סביר", blocked: false },
      ]);

      render(<AdvisorPanel gameId="game-1" />);

      expect(await screen.findByText("ומה עם התיקו?")).toBeInTheDocument();
      expect(screen.getByText("התיקו כאן פחות סביר")).toBeInTheDocument();
    });
  });

  describe("DailyPickCard", () => {
    it("מקשר למשחק ומציג את הדעה", () => {
      render(
        <DailyPickCard
          pick={{
            gameId: "game-9",
            homeTeam: "בולוניה",
            awayTeam: "לאציו",
            homeLogo: null,
            awayLogo: null,
            kickoffAt: "2026-08-24T18:00:00Z",
            competitionName: "סרייה A",
            insight,
          }}
        />,
      );

      expect(screen.getByRole("link")).toHaveAttribute("href", "/games/game-9");
      expect(screen.getByText(insight.headline)).toBeInTheDocument();
      expect(screen.getByText("2.20")).toBeInTheDocument();
    });
  });
});
