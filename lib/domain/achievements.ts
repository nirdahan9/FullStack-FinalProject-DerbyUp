/**
 * Achievement definitions live in code, not in a table: adding one is a
 * deploy, not a migration, and every rule below is derived from data the
 * product already stores. Nothing here needs its own tracking column.
 */

export type AchievementStats = {
  totalPredictions: number;
  totalCorrect: number;
  /** Consecutive correct predictions, most recent first. */
  currentStreak: number;
  /** Highest odds the user has ever been right about. */
  bestOdds: number;
  puzzlesSolved: number;
  leaguesJoined: number;
  /** Best position reached in any league; null before any standings exist. */
  bestRank: number | null;
};

export type Achievement = {
  key: string;
  title: string;
  description: string;
  check: (stats: AchievementStats) => boolean;
};

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    key: "first_prediction",
    title: "ניחוש ראשון",
    description: "הנחת את הניחוש הראשון שלך",
    check: (s) => s.totalPredictions >= 1,
  },
  {
    key: "ten_predictions",
    title: "10 ניחושים",
    description: "הנחת 10 ניחושים",
    check: (s) => s.totalPredictions >= 10,
  },
  {
    key: "first_correct",
    title: "פגיעה ראשונה",
    description: "ניחשת נכון בפעם הראשונה",
    check: (s) => s.totalCorrect >= 1,
  },
  {
    key: "streak_three",
    title: "רצף 3 נכונים",
    description: "שלושה ניחושים נכונים ברצף",
    check: (s) => s.currentStreak >= 3,
  },
  {
    // Only possible because the odds are the score: this rewards backing an
    // outcome the market thought unlikely, which a flat points system cannot
    // distinguish from any other win.
    key: "underdog",
    title: "ניחוש הפתעה",
    description: "ניחשת נכון ביחס של 5.0 ומעלה",
    check: (s) => s.bestOdds >= 5,
  },
  {
    key: "first_puzzle",
    title: "אתגר ראשון",
    description: "פתרת את האתגר היומי",
    check: (s) => s.puzzlesSolved >= 1,
  },
  {
    key: "league_joined",
    title: "הצטרפת לליגה",
    description: "הצטרפת לליגה ארגונית",
    check: (s) => s.leaguesJoined >= 1,
  },
  {
    key: "league_leader",
    title: "מקום ראשון",
    description: "הגעת למקום הראשון בליגה",
    check: (s) => s.bestRank === 1,
  },
] as const;

/**
 * Which achievements a user has newly earned.
 *
 * `alreadyEarned` is passed in rather than filtered by the caller so the rule
 * "an achievement is awarded once" is enforced here, next to the definitions.
 */
export function newlyEarned(
  stats: AchievementStats,
  alreadyEarned: readonly string[],
): Achievement[] {
  const have = new Set(alreadyEarned);
  return ACHIEVEMENTS.filter((a) => !have.has(a.key) && a.check(stats));
}
