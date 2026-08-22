import { z } from "zod";

/**
 * Input schemas for the Server Actions.
 *
 * These run on the server, and they are the validation that counts: anything
 * enforced only in the browser can be edited away in the console. They check
 * shape and range; whether an outcome is legal for a question type is a
 * domain rule and lives in lib/domain/prediction-rules.ts.
 */

export const createLeagueSchema = z.object({
  name: z.string().trim().min(3, "שם הליגה קצר מדי").max(60, "שם הליגה ארוך מדי"),
  description: z.string().trim().max(500, "התיאור ארוך מדי").optional(),
  // Required: a league is always bound to exactly one tournament.
  competitionId: z.number().int().positive("יש לבחור טורניר"),
});

export const joinLeagueSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(8, "קוד הזמנה חייב להכיל 8 תווים")
    .regex(/^[A-Z0-9]+$/, "קוד הזמנה מכיל תווים לא חוקיים"),
});

export const makePredictionSchema = z.object({
  questionId: z.string().uuid("מזהה שאלה לא תקין"),
  outcome: z.string().trim().min(1, "יש לבחור תשובה").max(20),
  /**
   * Optional exact-score call, "home-away". Shape only — whether it agrees
   * with the chosen outcome is a domain rule, checked in the action against
   * `validateExactScore`, because only the domain knows that "home" and 1-2
   * contradict each other.
   */
  exactScore: z
    .string()
    .regex(/^[0-9]-[0-9]$/, "פורמט: 0-0")
    .optional()
    .nullable(),
});

export const cancelPredictionSchema = z.object({
  predictionId: z.string().uuid("מזהה ניחוש לא תקין"),
});

export const prizesSchema = z.object({
  leagueId: z.string().uuid(),
  prizes: z
    .array(
      z.object({
        place: z.number().int().min(1).max(20),
        prize: z.string().trim().min(1, "יש להזין פרס").max(120),
      }),
    )
    .max(20, "עד 20 פרסים"),
  note: z.string().trim().max(500).optional(),
});

export const featuredGameSchema = z.object({
  leagueId: z.string().uuid(),
  gameId: z.string().uuid(),
  bonusPct: z.number().int().min(0).max(100, "בונוס חייב להיות בין 0 ל-100"),
});

export const submitPuzzleAnswerSchema = z.object({
  puzzleId: z.string().uuid(),
  answer: z.string().trim().min(1, "יש להזין שם שחקן").max(80),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2, "השם קצר מדי").max(60, "השם ארוך מדי"),
});

/**
 * Site administration. Range checks only — who may call these is decided in
 * Postgres, by the SECURITY DEFINER functions the actions go through.
 */
export const adminSettleSchema = z.object({
  gameId: z.string().uuid("מזהה משחק לא תקין"),
  scoreHome: z.number().int().min(0, "תוצאה לא תקינה").max(99, "תוצאה לא תקינה"),
  scoreAway: z.number().int().min(0, "תוצאה לא תקינה").max(99, "תוצאה לא תקינה"),
});

export const adminUserSchema = z.object({
  userId: z.string().uuid("מזהה משתמש לא תקין"),
});
