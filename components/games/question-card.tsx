"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { makePrediction, cancelPrediction } from "@/lib/actions/predictions";
import { translateTeam } from "@/lib/i18n/teams";
import { Button } from "@/components/ui/button";

type Outcome = { key: string; label: string; odds: number };

const TITLES: Record<string, string> = {
  match_result: "מי ינצח?",
  over_under_2_5: "סך השערים",
  btts: "שתי הקבוצות יבקיעו?",
};

/**
 * One question and its outcomes, laid out as the DerbyUp app lays them out:
 * a two or three column grid of bordered tiles, label above and value below,
 * the selected one filled with the primary colour.
 *
 * The value shown is points rather than the app's ×multiplier, because here
 * the odds *are* the score — a correct call at 7.15 is worth 7.15 points.
 * Predicting is a single tap; there is no stake to enter.
 */
export function QuestionCard({
  questionId,
  type,
  outcomes,
  bonusPct,
  existing,
  locked,
  lockReason,
}: {
  questionId: string;
  type: string;
  outcomes: Outcome[];
  bonusPct: number;
  existing: { id: string; outcome: string; status: string } | null;
  locked: boolean;
  lockReason?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(existing);

  const gridCols = outcomes.length <= 2 ? "grid-cols-2" : "grid-cols-3";
  const pointsFor = (odds: number) =>
    Math.round(odds * (1 + bonusPct / 100) * 100) / 100;

  function predict(outcome: Outcome) {
    startTransition(async () => {
      const result = await makePrediction({ questionId, outcome: outcome.key });
      if (!result.ok) return void toast.error(result.error);
      setCurrent({ id: result.data.predictionId, outcome: outcome.key, status: "pending" });
      toast.success(`ניחשת. אם תצדק תקבל ${result.data.points} נקודות`);
    });
  }

  function undo() {
    if (!current) return;
    startTransition(async () => {
      const result = await cancelPrediction({ predictionId: current.id });
      if (!result.ok) return void toast.error(result.error);
      setCurrent(null);
      toast.success("הניחוש בוטל");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold">{TITLES[type] ?? type}</h3>
        {bonusPct > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            בונוס {bonusPct}%
          </span>
        )}
      </div>

      {locked && !current ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock size={12} />
          {lockReason ?? "סגור לניחושים"}
        </p>
      ) : (
        <div className={`grid gap-2 ${gridCols}`}>
          {outcomes.map((outcome) => {
            const isSelected = current?.outcome === outcome.key;
            const disabled = locked || pending || Boolean(current);

            return (
              <button
                key={outcome.key}
                type="button"
                disabled={disabled}
                onClick={() => predict(outcome)}
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
