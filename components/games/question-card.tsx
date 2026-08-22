"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { makePrediction, cancelPrediction } from "@/lib/actions/predictions";
import { translateTeam } from "@/lib/i18n/teams";
import {
  EXACT_SCORE_MULTIPLIER,
  validateExactScore,
  type ExactScoreRejection,
} from "@/lib/domain/exact-score";
import { round2 } from "@/lib/domain/scoring";
import { Button } from "@/components/ui/button";
import { ScoreDrumPicker } from "@/components/games/score-drum-picker";

type Outcome = { key: string; label: string; odds: number };

const TITLES: Record<string, string> = {
  match_result: "מי ינצח?",
  over_under_2_5: "סך השערים",
  btts: "שתי הקבוצות יבקיעו?",
};

/** The wording under the DerbyUp app's picker, kept verbatim. */
const SCORE_ERRORS: Record<ExactScoreRejection, string> = {
  INVALID_FORMAT: "פורמט: 0-0",
  DRAW_NEEDS_EQUAL: "תיקו = מספרים שווים",
  NOT_A_DRAW: "לא יכולה להיות תיקו",
  HOME_MUST_LEAD: "הקבוצה הביתית חייבת להוביל",
  AWAY_MUST_LEAD: "קבוצת החוץ חייבת להוביל",
};

/** A first guess that already agrees with the pick, so the drums open valid. */
function openingScore(outcome: string): string {
  if (outcome === "home") return "1-0";
  if (outcome === "away") return "0-1";
  return "1-1";
}

/**
 * One question and its outcomes, laid out as the DerbyUp app lays them out:
 * a two or three column grid of bordered tiles, label above and value below,
 * the selected one filled with the primary colour.
 *
 * The value shown is points rather than the app's ×multiplier, because here
 * the odds *are* the score — a correct call at 7.15 is worth 7.15 points.
 *
 * Over/Under and BTTS are a single tap. The winner market takes two, because
 * it carries the optional exact-score call: pick a side, the picker opens, and
 * a confirm button closes it — the same flow as the app.
 */
export function QuestionCard({
  questionId,
  type,
  outcomes,
  bonusPct,
  existing,
  locked,
  lockReason,
  provisional,
  homeTeam,
  awayTeam,
}: {
  questionId: string;
  type: string;
  outcomes: Outcome[];
  bonusPct: number;
  existing: { id: string; outcome: string; status: string; exactScore: string | null } | null;
  locked: boolean;
  lockReason?: string;
  /** The fixture is not priced yet; these numbers are placeholders. */
  provisional: boolean;
  homeTeam: string;
  awayTeam: string;
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(existing);
  const [draft, setDraft] = useState<{ outcome: Outcome; score: string } | null>(null);

  const takesScore = type === "match_result";
  const gridCols = outcomes.length <= 2 ? "grid-cols-2" : "grid-cols-3";
  const pointsFor = (odds: number) => round2(odds * (1 + bonusPct / 100));

  const scoreError =
    draft && validateExactScore(draft.score, draft.outcome.key);

  function choose(outcome: Outcome) {
    // Everything except the winner market is still one tap.
    if (!takesScore) return void submit(outcome, null);
    setDraft({ outcome, score: openingScore(outcome.key) });
  }

  function submit(outcome: Outcome, exactScore: string | null) {
    startTransition(async () => {
      const result = await makePrediction({
        questionId,
        outcome: outcome.key,
        exactScore,
      });
      if (!result.ok) return void toast.error(result.error);

      setCurrent({
        id: result.data.predictionId,
        outcome: outcome.key,
        status: "pending",
        exactScore: result.data.exactScore,
      });
      setDraft(null);
      toast.success(
        result.data.provisional
          ? "ניחשת. הניקוד ייקבע לפי היחס בשריקת הפתיחה"
          : `ניחשת. אם תצדק תקבל ${result.data.points} נקודות`,
      );
    });
  }

  function undo() {
    if (!current) return;
    startTransition(async () => {
      const result = await cancelPrediction({ predictionId: current.id });
      if (!result.ok) return void toast.error(result.error);
      setCurrent(null);
      setDraft(null);
      toast.success("הניחוש בוטל");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold">{TITLES[type] ?? type}</h3>
        <span className="flex shrink-0 items-center gap-1.5">
          {takesScore && !locked && !current && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-500">
              🎯 תוצאה מדויקת ×{EXACT_SCORE_MULTIPLIER}
            </span>
          )}
          {provisional && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              יחס משוער
            </span>
          )}
          {bonusPct > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              בונוס {bonusPct}%
            </span>
          )}
        </span>
      </div>

      {provisional && !locked && (
        <p className="text-xs text-muted-foreground">
          היחסים למשחק הזה עדיין לא פורסמו. אפשר לנחש כבר עכשיו — הניקוד ייקבע
          לפי היחס בשריקת הפתיחה, אותו יחס לכולם.
        </p>
      )}

      {locked && !current ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock size={12} />
          {lockReason ?? "סגור לניחושים"}
        </p>
      ) : (
        <div className={`grid gap-2 ${gridCols}`}>
          {outcomes.map((outcome) => {
            const isSelected =
              current?.outcome === outcome.key || draft?.outcome.key === outcome.key;
            // Once a prediction exists the grid is frozen; while choosing a
            // score it is not, so the side can still be changed.
            const disabled = locked || pending || Boolean(current);

            return (
              <button
                key={outcome.key}
                type="button"
                disabled={disabled}
                onClick={() => choose(outcome)}
                aria-pressed={isSelected}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 transition-all active:scale-95 ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-lg"
                    : "border-border bg-secondary hover:border-primary/40"
                } ${disabled && !isSelected ? "opacity-50" : ""}`}
              >
                <span className="text-center text-sm font-bold leading-tight" dir="auto">
                  {translateTeam(outcome.label)}
                </span>
                <span
                  className={`text-sm font-black ${
                    isSelected ? "text-primary-foreground/80" : "text-primary"
                  }`}
                >
                  {pointsFor(outcome.odds)} נק׳
                </span>
              </button>
            );
          })}
        </div>
      )}

      {draft && !locked && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-secondary/40 p-3">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            🎯 תוצאה מדויקת
            <span className="font-bold text-amber-500">· בונוס ×{EXACT_SCORE_MULTIPLIER}</span>
          </p>

          <ScoreDrumPicker
            homeTeam={translateTeam(homeTeam)}
            awayTeam={translateTeam(awayTeam)}
            value={draft.score}
            onChange={(score) => setDraft((d) => (d ? { ...d, score } : d))}
            isDraw={draft.outcome.key === "draw"}
          />

          {scoreError ? (
            <span className="text-xs text-destructive">{SCORE_ERRORS[scoreError]}</span>
          ) : (
            <span className="text-xs font-bold text-amber-500">
              ✓ {round2(pointsFor(draft.outcome.odds) * EXACT_SCORE_MULTIPLIER)} נק׳ אם תפגע בתוצאה
            </span>
          )}

          <div className="flex w-full gap-2">
            <Button
              className="flex-1 font-bold"
              disabled={pending || Boolean(scoreError)}
              onClick={() => submit(draft.outcome, draft.score)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "אישור ניחוש"}
            </Button>
            {/* Skipping keeps the winner call and drops only the bonus, so the
                score picker never becomes a toll on predicting. */}
            <Button
              variant="outline"
              className="font-bold"
              disabled={pending}
              onClick={() => submit(draft.outcome, null)}
            >
              בלי תוצאה
            </Button>
          </div>
        </div>
      )}

      {current?.exactScore && (
        <p className="flex items-center gap-1 text-xs font-bold text-amber-500">
          🎯 ניחשת {current.exactScore} · פגיעה מזכה ב-×{EXACT_SCORE_MULTIPLIER}
        </p>
      )}

      {current && !locked && current.status === "pending" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={pending}
          className="self-start font-bold text-muted-foreground"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
          ביטול הניחוש
        </Button>
      )}
    </div>
  );
}
