"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  cancelPredictionSchema,
  makePredictionSchema,
} from "@/lib/validation/schemas";
import { validatePrediction } from "@/lib/domain/prediction-rules";
import {
  EXACT_SCORE_MULTIPLIER,
  validateExactScore,
  type ExactScoreRejection,
} from "@/lib/domain/exact-score";
import { pointsForCorrectPrediction, round2 } from "@/lib/domain/scoring";
import type { Outcome } from "@/lib/football-api/types";
import type { QuestionType } from "@/lib/domain/types";
import { actionError, type ActionResult } from "./types";

const REJECTION_MESSAGES: Record<string, string> = {
  GAME_STARTED: "המשחק כבר התחיל, לא ניתן לנחש",
  GAME_NOT_OPEN: "המשחק אינו פתוח לניחושים",
  ALREADY_PREDICTED: "כבר ניחשת בשאלה הזו",
  NO_LEAGUE_FOR_COMPETITION: "אינך חבר בליגה של התחרות הזו",
  INVALID_OUTCOME: "התשובה שנבחרה אינה חוקית",
  NOT_OWNER: "הניחוש אינו שלך",
  ALREADY_SETTLED: "הניחוש כבר עבר עיבוד",
  CANCEL_WINDOW_CLOSED: "לא ניתן לבטל — נותרו פחות מ-10 דקות לפתיחה",
};

/** Same wording the DerbyUp app shows under its score picker. */
const EXACT_SCORE_MESSAGES: Record<ExactScoreRejection, string> = {
  INVALID_FORMAT: "פורמט: 0-0",
  DRAW_NEEDS_EQUAL: "תיקו = מספרים שווים",
  NOT_A_DRAW: "לא יכולה להיות תיקו",
  HOME_MUST_LEAD: "הקבוצה הביתית חייבת להוביל",
  AWAY_MUST_LEAD: "קבוצת החוץ חייבת להוביל",
};

function messageFor(reason: string): string {
  return REJECTION_MESSAGES[reason] ?? "אירעה שגיאה. נסה שוב";
}

export async function makePrediction(
  input: { questionId: string; outcome: string; exactScore?: string | null },
): Promise<
  ActionResult<{
    predictionId: string;
    points: number;
    provisional: boolean;
    exactScore: string | null;
  }>
> {
  const parsed = makePredictionSchema.safeParse(input);
  if (!parsed.success) return actionError("קלט לא תקין");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("יש להתחבר תחילה");

  // The question, its fixture, and the league context are read together so the
  // domain rules get everything they need in one round trip.
  const { data: question } = await supabase
    .from("questions")
    .select("id, type, outcomes, odds_provisional, games(id, kickoff_at, status, competition_id)")
    .eq("id", parsed.data.questionId)
    .maybeSingle();

  if (!question?.games) return actionError("השאלה לא נמצאה");

  const game = question.games;

  const [{ data: existing }, { data: memberships }] = await Promise.all([
    supabase
      .from("predictions")
      .select("id")
      .eq("user_id", user.id)
      .eq("question_id", question.id)
      .in("status", ["pending", "correct", "incorrect", "void"])
      .maybeSingle(),
    supabase
      .from("league_members")
      .select("leagues(competition_id, featured_game_id, featured_bonus_pct)")
      .eq("user_id", user.id),
  ]);

  const leagues = (memberships ?? []).flatMap((m) => (m.leagues ? [m.leagues] : []));

  const verdict = validatePrediction({
    game: {
      kickoffAt: new Date(game.kickoff_at),
      status: game.status as never,
      competitionId: game.competition_id,
    },
    questionType: question.type as QuestionType,
    selectedOutcome: parsed.data.outcome,
    hasExisting: Boolean(existing),
    userCompetitions: leagues.map((l) => l.competition_id),
    now: new Date(),
  });

  if (!verdict.ok) return actionError(messageFor(verdict.reason));

  // The exact score rides on the winner call and nothing else: it is defined
  // against home/draw/away, and the settlement rule compares it to the final
  // score of the fixture.
  const exactScore =
    question.type === "match_result" ? (parsed.data.exactScore ?? null) : null;

  if (exactScore) {
    const rejection = validateExactScore(exactScore, parsed.data.outcome);
    // Rejected rather than stored: a score that contradicts the chosen outcome
    // could never win the bonus, so accepting it would be accepting something
    // worthless while looking like it counts.
    if (rejection) return actionError(EXACT_SCORE_MESSAGES[rejection]);
  }

  // Odds are read from the question and copied onto the prediction. Reading
  // them again at settlement would let a line that moved after kickoff change
  // what somebody already scored.
  const outcomes = question.outcomes as unknown as Outcome[];
  const chosen = outcomes.find((o) => o.key === parsed.data.outcome);
  if (!chosen) return actionError("התשובה שנבחרה אינה חוקית");

  // The bonus applies only if one of the user's own leagues has featured this
  // fixture — a featured game in a league they are not in must not pay out.
  const bonusPct = Math.max(
    0,
    ...leagues
      .filter((l) => l.featured_game_id === game.id && l.competition_id === game.competition_id)
      .map((l) => l.featured_bonus_pct ?? 0),
    0,
  );

  const { data: created, error } = await supabase
    .from("predictions")
    .insert({
      user_id: user.id,
      question_id: question.id,
      selected_outcome: parsed.data.outcome,
      odds: chosen.odds,
      bonus_pct: bonusPct,
      // Carried from the question: if the fixture is not priced yet, this
      // prediction is scored at the price on the day instead of at the
      // placeholder shown now.
      odds_provisional: question.odds_provisional,
      exact_score: exactScore,
    })
    .select("id")
    .single();

  if (error) {
    // The unique index is the last line of defence against two submits racing.
    if (error.code === "23505") return actionError(messageFor("ALREADY_PREDICTED"));
    return actionError("אירעה שגיאה. נסה שוב");
  }

  revalidatePath(`/games/${game.id}`);
  revalidatePath("/predictions");
  revalidatePath("/dashboard");

  const base = pointsForCorrectPrediction(chosen.odds, bonusPct);

  return {
    ok: true,
    data: {
      predictionId: created.id,
      // What the user stands to win, exact-score bonus included, so the
      // confirmation names the number they were shown before submitting.
      points: exactScore ? round2(base * EXACT_SCORE_MULTIPLIER) : base,
      provisional: question.odds_provisional,
      exactScore,
    },
  };
}

export async function cancelPrediction(
  input: { predictionId: string },
): Promise<ActionResult> {
  const parsed = cancelPredictionSchema.safeParse(input);
  if (!parsed.success) return actionError("קלט לא תקין");

  const supabase = await createClient();

  // Ownership, status and the ten-minute window are all enforced inside the
  // function. Doing it here instead would leave the rules reachable only
  // through this action, and predictions is closed to direct writes precisely
  // so they cannot be bypassed.
  const { error } = await supabase.rpc("cancel_prediction", {
    p_id: parsed.data.predictionId,
  });

  if (error) {
    const reason = Object.keys(REJECTION_MESSAGES).find((k) =>
      error.message.includes(k),
    );
    return actionError(reason ? messageFor(reason) : "אירעה שגיאה. נסה שוב");
  }

  revalidatePath("/predictions");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}
