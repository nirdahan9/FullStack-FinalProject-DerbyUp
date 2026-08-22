"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitPuzzleAnswerSchema } from "@/lib/validation/schemas";
import { checkAnswer, MAX_ATTEMPTS, pointsForAttempt } from "@/lib/domain/puzzle";
import { awardAchievements } from "@/lib/achievements/award";
import { actionError, type ActionResult } from "./types";

export type PuzzleResult = {
  isCorrect: boolean;
  pointsEarned: number;
  attemptsLeft: number;
  /** Revealed once the puzzle is over, so it does not end in a dead end. */
  answers?: string[];
};

/**
 * Checks an answer to today's puzzle.
 *
 * The whole check happens here: the valid answers live on the puzzle row and
 * never reach the browser, and the attempt is written with the service role
 * because puzzle_attempts has no INSERT policy — if users could write their
 * own rows they would set their own points_earned.
 */
export async function submitPuzzleAnswer(
  input: { puzzleId: string; answer: string },
): Promise<ActionResult<PuzzleResult>> {
  const parsed = submitPuzzleAnswerSchema.safeParse(input);
  if (!parsed.success) return actionError("יש להזין שם שחקן");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("יש להתחבר תחילה");

  // Read through the user's client, so the "published only" policy applies and
  // tomorrow's answers cannot be fetched by guessing an id.
  const { data: puzzle } = await supabase
    .from("daily_puzzles")
    .select("id, valid_answers")
    .eq("id", parsed.data.puzzleId)
    .maybeSingle();

  if (!puzzle) return actionError("האתגר לא נמצא");

  const { data: attempts } = await supabase
    .from("puzzle_attempts")
    .select("attempt_number, is_correct")
    .eq("user_id", user.id)
    .eq("puzzle_id", puzzle.id)
    .order("attempt_number", { ascending: true });

  const used = attempts ?? [];
  if (used.some((a) => a.is_correct)) return actionError("כבר פתרת את האתגר של היום");
  if (used.length >= MAX_ATTEMPTS) return actionError("נגמרו הניסיונות להיום");

  const attemptNumber = used.length + 1;
  const isCorrect = checkAnswer(
    parsed.data.answer,
    puzzle.valid_answers as unknown as string[],
  );
  const pointsEarned = isCorrect ? pointsForAttempt(attemptNumber) : 0;

  // Service role: puzzle_attempts is closed to user writes precisely so the
  // score cannot be chosen by the client.
  const admin = createAdminClient();
  const { error } = await admin.from("puzzle_attempts").insert({
    user_id: user.id,
    puzzle_id: puzzle.id,
    answer: parsed.data.answer.slice(0, 80),
    is_correct: isCorrect,
    attempt_number: attemptNumber,
    points_earned: pointsEarned,
  });

  if (error) {
    // The unique index is what stops two submissions racing to the same slot.
    if (error.code === "23505") return actionError("הניסיון כבר נרשם");
    return actionError("אירעה שגיאה. נסה שוב");
  }

  if (pointsEarned > 0) {
    // Recomputed rather than incremented, matching settlement: a total that is
    // derived can be repaired, one that is accumulated cannot.
    const { data: profile } = await admin
      .from("profiles")
      .select("total_points")
      .eq("id", user.id)
      .single();

    await admin
      .from("profiles")
      .update({
        total_points: Math.round((Number(profile?.total_points ?? 0) + pointsEarned) * 100) / 100,
      })
      .eq("id", user.id);
  }

  // Solving the challenge is what earns `first_puzzle`; awarding it here means
  // a user who only ever plays the challenge still collects badges.
  if (isCorrect) await awardAchievements(user.id);

  const attemptsLeft = MAX_ATTEMPTS - attemptNumber;
  const finished = isCorrect || attemptsLeft === 0;

  revalidatePath("/challenge");
  revalidatePath("/", "layout");

  return {
    ok: true,
    data: {
      isCorrect,
      pointsEarned,
      attemptsLeft,
      answers: finished
        ? ((puzzle.valid_answers as unknown as string[]) ?? [])
        : undefined,
    },
  };
}

/**
 * Player-name suggestions for the answer box.
 *
 * Matched on the normalised name so accents do not have to be typed, capped at
 * ten, and only queried from two characters up — a one-letter query would scan
 * most of the table to return a list nobody reads.
 */
export async function searchPlayers(query: string): Promise<string[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("bridge_players")
    .select("name")
    .ilike("normalized_name", `%${term.toLowerCase()}%`)
    .limit(10);

  return (data ?? []).map((p) => p.name);
}
