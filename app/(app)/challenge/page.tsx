import { Gamepad2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PuzzleBoard } from "@/components/challenge/puzzle-board";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Today's Football Bridge puzzle.
 *
 * The date is taken in Asia/Jerusalem rather than UTC so "today" changes at
 * local midnight — a puzzle that flipped at 02:00 would be confusing.
 */
function todayInIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function ChallengePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // valid_answers is not selected: it must not reach the browser, or the page
  // source would be the solution.
  const { data: puzzle } = await supabase
    .from("daily_puzzles")
    .select("id, club_a, club_b, play_date")
    .eq("play_date", todayInIsrael())
    .maybeSingle();

  if (!puzzle) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <EmptyState
          icon={Gamepad2}
          title="אין אתגר להיום"
          body="האתגר היומי מתפרסם בחצות. חזרו מאוחר יותר."
          action={{ href: "/games", label: "אל המשחקים" }}
        />
      </div>
    );
  }

  const { data: attempts } = await supabase
    .from("puzzle_attempts")
    .select("answer, is_correct, attempt_number")
    .eq("user_id", user!.id)
    .eq("puzzle_id", puzzle.id)
    .order("attempt_number", { ascending: true });

  const rows = attempts ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Header />
      <PuzzleBoard
        puzzleId={puzzle.id}
        clubA={puzzle.club_a}
        clubB={puzzle.club_b}
        initialAttempts={rows.map((a) => ({ answer: a.answer, isCorrect: a.is_correct }))}
        solved={rows.some((a) => a.is_correct)}
      />
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-1">
      <span className="section-label">🎮 האתגר היומי</span>
      <h1 className="text-3xl font-black leading-tight">גשר הכדורגל</h1>
      <p className="text-sm text-muted-foreground">
        שני מועדונים — מצאו שחקן ששיחק בשניהם.
      </p>
    </div>
  );
}
