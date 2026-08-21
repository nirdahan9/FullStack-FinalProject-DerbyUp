/**
 * Football Bridge: two clubs, name a player who appeared for both.
 *
 * Points fall with each attempt, so answering straight away is worth more
 * than grinding through guesses. These land on the site-wide leaderboard
 * only — a league table counts match-winner predictions and nothing else.
 */
export const PUZZLE_POINTS = [5, 3, 1] as const;
export const MAX_ATTEMPTS = PUZZLE_POINTS.length;

export function pointsForAttempt(attemptNumber: number): number {
  if (attemptNumber < 1 || attemptNumber > MAX_ATTEMPTS) return 0;
  return PUZZLE_POINTS[attemptNumber - 1];
}

/**
 * Normalises a player name for comparison.
 *
 * Names reach us with accents the user has no way to type — Özil, Müller,
 * Håland — so combining marks are stripped via NFD before comparison, and
 * punctuation and repeated spaces are removed. Without this the puzzle is
 * unwinnable for anyone on a Hebrew keyboard.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'`’\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function checkAnswer(
  answer: string,
  validAnswers: readonly string[],
): boolean {
  const normalized = normalizeName(answer);
  if (!normalized) return false;
  return validAnswers.some((valid) => normalizeName(valid) === normalized);
}
