import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GameRow } from "@/components/games/game-row";
import { QuestionCard } from "@/components/games/question-card";
import { LeaderboardTable } from "@/components/leagues/leaderboard-table";
import { PrizeList } from "@/components/leagues/prize-list";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Trophy } from "lucide-react";

/**
 * §8.1 — the components that carry a rule.
 *
 * Only these: the shadcn primitives underneath them are vendored third-party
 * code, and the styling is not something a test should pin down. What is
 * asserted here is what a component *says* — the points on an outcome tile,
 * the locked state, whose row is highlighted — because those are decisions the
 * product makes, not decoration.
 */

// Server actions cannot run in jsdom; the point of these cases is what the
// component renders and which action it reaches for, not what the action does.
const makePrediction = vi.hoisted(() => vi.fn());
const cancelPrediction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/predictions", () => ({ makePrediction, cancelPrediction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const OUTCOMES = [
  { key: "home", label: "Arsenal", odds: 2.1 },
  { key: "draw", label: "תיקו", odds: 3.4 },
  { key: "away", label: "Chelsea", odds: 3.6 },
];

describe("§8.1 קומפוננטות", () => {
  describe("GameRow", () => {
    const base = {
      id: "g1",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeLogo: null,
      awayLogo: null,
      kickoffAt: "2026-09-01T18:00:00Z",
      predictedCount: 0,
    };

    it("1. מציגה שמות קבוצות בעברית ומועד", () => {
      render(<GameRow {...base} />);

      // Team names go through the translation table, not straight to screen.
      expect(screen.getByText("ארסנל")).toBeInTheDocument();
      expect(screen.getByText("צ'לסי")).toBeInTheDocument();
      expect(screen.getByText("21:00")).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute("href", "/games/g1");
    });

    it("2. בחירת עורך מסומנת", () => {
      render(<GameRow {...base} isFeatured competitionName="פרמייר ליג" />);

      expect(screen.getByText("בחירת העורך")).toBeInTheDocument();
      expect(screen.getByText("פרמייר ליג")).toBeInTheDocument();
    });
  });

  describe("QuestionCard", () => {
    const base = {
      questionId: "q1",
      type: "match_result",
      outcomes: OUTCOMES,
      bonusPct: 0,
      existing: null,
      locked: false,
      provisional: false,
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
    };

    it("3. כל אפשרות מציגה את הנקודות שיתקבלו", () => {
      render(<QuestionCard {...base} />);

      expect(screen.getByText("מי ינצח?")).toBeInTheDocument();
      expect(screen.getByText("2.1 נק׳")).toBeInTheDocument();
      expect(screen.getByText("3.4 נק׳")).toBeInTheDocument();
      expect(screen.getByText("3.6 נק׳")).toBeInTheDocument();
    });

    it("3א. בונוס בחירת העורך מוכפל בנקודות המוצגות", () => {
      render(<QuestionCard {...base} bonusPct={50} />);

      expect(screen.getByText("בונוס 50%")).toBeInTheDocument();
      // 2.1 × 1.5 = 3.15 — the rounding that Number.EPSILON exists for.
      expect(screen.getByText("3.15 נק׳")).toBeInTheDocument();
    });

    it("4. אחרי ניחוש — האפשרות מסומנת ויש כפתור ביטול", () => {
      render(
        <QuestionCard
          {...base}
          existing={{ id: "p1", outcome: "home", status: "pending", exactScore: null }}
        />,
      );

      expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("ארסנל");
      expect(screen.getByRole("button", { name: /ביטול הניחוש/ })).toBeInTheDocument();
    });

    it("4א. ניחוש עם תוצאה מדויקת מציג אותה", () => {
      render(
        <QuestionCard
          {...base}
          existing={{ id: "p1", outcome: "home", status: "pending", exactScore: "2-1" }}
        />,
      );

      expect(screen.getByText(/ניחשת 2-1/)).toBeInTheDocument();
      expect(screen.getByText(/×3/)).toBeInTheDocument();
    });

    it("5. משחק שהתחיל — האפשרויות נעולות והסיבה מוצגת", () => {
      render(<QuestionCard {...base} locked lockReason="המשחק כבר התחיל" />);

      expect(screen.getByText("המשחק כבר התחיל")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("5א. יחס משוער מסומן ומוסבר", () => {
      render(<QuestionCard {...base} provisional />);

      expect(screen.getByText("יחס משוער")).toBeInTheDocument();
      expect(screen.getByText(/הניקוד ייקבע\s+לפי היחס בשריקת הפתיחה/)).toBeInTheDocument();
    });

    it("6. תוך שליחה — האפשרויות ננעלות", async () => {
      const user = userEvent.setup();
      let release!: (value: unknown) => void;
      makePrediction.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));

      // BTTS is a single tap: no exact score to configure, so the click
      // submits and everything locks immediately.
      render(
        <QuestionCard
          {...base}
          type="btts"
          outcomes={[
            { key: "yes", label: "כן", odds: 1.8 },
            { key: "no", label: "לא", odds: 1.95 },
          ]}
        />,
      );
      await user.click(screen.getByRole("button", { name: /כן/ }));

      for (const button of screen.getAllByRole("button")) {
        expect(button).toBeDisabled();
      }
      release({
        ok: true,
        data: { predictionId: "p1", points: 1.8, provisional: false, exactScore: null },
      });
    });

    it("15. מנצחת — לחיצה פותחת את בורר התוצאה ולא שולחת", async () => {
      const user = userEvent.setup();
      render(<QuestionCard {...base} />);

      await user.click(screen.getByRole("button", { name: /ארסנל/ }));

      expect(makePrediction).not.toHaveBeenCalled();
      // Two drums, one per team, each a listbox of goal counts.
      expect(screen.getByRole("listbox", { name: "ארסנל" })).toBeInTheDocument();
      expect(screen.getByRole("listbox", { name: "צ'לסי" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "אישור ניחוש" })).toBeInTheDocument();
      // 2.10 × 3 — the number the user is deciding on before they commit.
      expect(screen.getByText(/6\.3 נק׳ אם תפגע/)).toBeInTheDocument();
    });

    it("16. \"בלי תוצאה\" שולח את הניחוש בלי הבונוס", async () => {
      const user = userEvent.setup();
      makePrediction.mockResolvedValueOnce({
        ok: true,
        data: { predictionId: "p1", points: 2.1, provisional: false, exactScore: null },
      });

      render(<QuestionCard {...base} />);
      await user.click(screen.getByRole("button", { name: /ארסנל/ }));
      await user.click(screen.getByRole("button", { name: "בלי תוצאה" }));

      expect(makePrediction).toHaveBeenCalledWith({
        questionId: "q1",
        outcome: "home",
        exactScore: null,
      });
    });

    it("17. הבורר נפתח על תוצאה שכבר מתאימה לבחירה", async () => {
      const user = userEvent.setup();
      makePrediction.mockResolvedValueOnce({
        ok: true,
        data: { predictionId: "p1", points: 10.2, provisional: false, exactScore: "1-1" },
      });

      render(<QuestionCard {...base} />);
      await user.click(screen.getByRole("button", { name: /תיקו/ }));

      // A draw opens on 1-1, not 1-0: the form never starts in a state it
      // would refuse to submit.
      expect(screen.queryByText("תיקו = מספרים שווים")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "אישור ניחוש" }));

      expect(makePrediction).toHaveBeenCalledWith({
        questionId: "q1",
        outcome: "draw",
        exactScore: "1-1",
      });
    });
  });

  describe("LeaderboardTable", () => {
    const joinedAt = new Date("2026-08-01T00:00:00Z");
    const rows = [
      { userId: "a", displayName: "אלון", points: 12.5, correctCount: 4, joinedAt },
      { userId: "b", displayName: "בר", points: 9, correctCount: 3, joinedAt },
      { userId: "c", displayName: "גיל", points: 9, correctCount: 3, joinedAt },
    ];

    it("7. מציגה שורות לפי סדר, עם דירוג תחרותי", () => {
      const { container } = render(<LeaderboardTable rows={rows} />);
      const names = [...container.querySelectorAll(".card-kickoff")].map((row) =>
        row.textContent?.replace(/\s+/g, " "),
      );

      expect(names[0]).toContain("אלון");
      expect(names[1]).toContain("בר");
      expect(screen.getByText("🥇")).toBeInTheDocument();
      // Two tied for second means nobody is third.
      expect(screen.getAllByText("🥈")).toHaveLength(2);
      expect(screen.queryByText("🥉")).not.toBeInTheDocument();
    });

    it("8. שורת המשתמש הנוכחי מודגשת", () => {
      const { container } = render(<LeaderboardTable rows={rows} currentUserId="b" />);
      const highlighted = container.querySelectorAll(".border-primary\\/30");

      expect(highlighted).toHaveLength(1);
      expect(within(highlighted[0] as HTMLElement).getByText("בר")).toBeInTheDocument();
    });

    it("8א. אותה קומפוננטה משרתת את שני הלוחות", () => {
      const { unmount } = render(<LeaderboardTable rows={rows} showCorrectCount />);
      expect(screen.getByText("4 פגיעות")).toBeInTheDocument();
      unmount();

      // The site-wide board has no per-question breakdown to show.
      render(<LeaderboardTable rows={rows} showCorrectCount={false} />);
      expect(screen.queryByText(/פגיעות/)).not.toBeInTheDocument();
    });

    it("לוח ריק מציג את הטקסט שנמסר", () => {
      render(<LeaderboardTable rows={[]} emptyLabel="אף אחד לא ניחש עדיין" />);
      expect(screen.getByText("אף אחד לא ניחש עדיין")).toBeInTheDocument();
    });
  });

  describe("PrizeList", () => {
    it("9. מציגה פרסים לפי מקום", () => {
      render(
        <PrizeList
          prizes={[
            { place: 1, prize: "כרטיסים למשחק" },
            { place: 2, prize: "ארוחת צהריים" },
          ]}
          note="מטעם החברה"
        />,
      );

      expect(screen.getByText("כרטיסים למשחק")).toBeInTheDocument();
      expect(screen.getByText("ארוחת צהריים")).toBeInTheDocument();
      expect(screen.getByText("מטעם החברה")).toBeInTheDocument();
    });

    it("10. ליגה בלי פרסים — לא מוצג כלום", () => {
      const { container } = render(<PrizeList prizes={[]} />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("EmptyState", () => {
    it("13. מוצג כשאין נתונים, עם קריאה לפעולה", () => {
      render(
        <EmptyState
          icon={Trophy}
          title="אין ליגות"
          body="פתחו ליגה או הצטרפו לאחת"
          action={{ href: "/leagues/new", label: "פתיחת ליגה" }}
        />,
      );

      expect(screen.getByText("אין ליגות")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "פתיחת ליגה" })).toHaveAttribute(
        "href",
        "/leagues/new",
      );
    });
  });

  describe("Pagination", () => {
    it("14. מנוטרל בעמוד הראשון ובעמוד האחרון", () => {
      const { unmount } = render(<Pagination page={1} hasNext baseUrl="/leaderboard" />);
      expect(screen.getByText("הקודם").closest("a")).toBeNull();
      expect(screen.getByText("הבא").closest("a")).toHaveAttribute(
        "href",
        "/leaderboard?page=2",
      );
      unmount();

      render(<Pagination page={3} hasNext={false} baseUrl="/leaderboard" />);
      expect(screen.getByText("הקודם").closest("a")).toHaveAttribute(
        "href",
        "/leaderboard?page=2",
      );
      expect(screen.getByText("הבא").closest("a")).toBeNull();
    });
  });
});
