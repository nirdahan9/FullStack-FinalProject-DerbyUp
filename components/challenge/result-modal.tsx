"use client";

import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react";

/**
 * The verdict dialog from the DerbyUp minigame (`minigames/ResultModal.tsx`),
 * carried over as-is: a big icon, the headline, the points line, and either one
 * button to close or two — retry and back — while tries remain.
 */
export function ResultModal({
  open,
  isCorrect,
  pointsEarned,
  answers,
  attemptsLeft,
  onClose,
  onRetry,
}: {
  open: boolean;
  isCorrect: boolean;
  pointsEarned: number;
  answers: string[] | null;
  attemptsLeft: number;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (!open) return null;

  // Out of tries: the answers came back with the response, so the board is
  // over and there is nothing to retry.
  const exhausted = !isCorrect && answers !== null;

  const body = isCorrect
    ? "כל הנקודות נוספו לדירוג שלכם."
    : exhausted
      ? `התשובות הנכונות היו: ${answers.join(" · ")}. אל תדאגו, תמיד יש אתגרים חדשים!`
      : attemptsLeft === 1
        ? "נשאר לכם ניסיון 1 נוסף"
        : `נשארו לכם ${attemptsLeft} ניסיונות נוספים`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-[32px] border border-border bg-card p-8 text-center shadow-elevated">
        <div
          className={`rounded-full p-4 ${
            isCorrect ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          }`}
        >
          {isCorrect ? <CheckCircle2 size={64} /> : <XCircle size={64} />}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-black text-foreground">
            {isCorrect ? "כל הכבוד!" : exhausted ? "נגמרו הניסיונות" : "אופס, לא בדיוק..."}
          </h2>
          {isCorrect && pointsEarned > 0 && (
            <p className="text-xl font-black text-primary">+{pointsEarned} נקודות!</p>
          )}
          <p className="px-4 text-sm font-medium leading-relaxed text-muted-foreground" dir="auto">
            {body}
          </p>
        </div>

        <div className="mt-2 flex w-full flex-col gap-3">
          {isCorrect || exhausted ? (
            <button
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-soft transition-all hover:opacity-90 active:scale-95"
            >
              סגירה
              <ArrowLeft size={20} />
            </button>
          ) : (
            <button
              onClick={onRetry}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-soft transition-all hover:opacity-90 active:scale-95"
            >
              נסו שוב
              <RotateCcw size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
