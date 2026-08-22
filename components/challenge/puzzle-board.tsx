"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { searchPlayers, submitPuzzleAnswer, type PuzzleResult } from "@/lib/actions/challenge";
import { PUZZLE_POINTS, MAX_ATTEMPTS } from "@/lib/domain/puzzle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Attempt = { answer: string; isCorrect: boolean };

/**
 * Football Bridge: two clubs, name a player who turned out for both.
 *
 * The answer is checked on the server — the valid names live on the puzzle row
 * and never reach the browser, or the page source would be the solution.
 */
export function PuzzleBoard({
  puzzleId,
  clubA,
  clubB,
  initialAttempts,
  solved,
}: {
  puzzleId: string;
  clubA: string;
  clubB: string;
  initialAttempts: Attempt[];
  solved: boolean;
}) {
  const [attempts, setAttempts] = useState<Attempt[]>(initialAttempts);
  const [answer, setAnswer] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  const isDone = solved || attempts.some((a) => a.isCorrect) || attempts.length >= MAX_ATTEMPTS;
  const attemptNumber = attempts.length + 1;

  // Debounced so a fast typist does not fire a query per keystroke.
  //
  // The effect only ever sets state from the timeout callback. Clearing the
  // list on a short query is done during render instead, via `visible` below:
  // a synchronous setState in an effect body cascades an extra render, which
  // is what react-hooks/set-state-in-effect warns about.
  useEffect(() => {
    if (dismissed || isDone || answer.trim().length < 2) return;

    const id = window.setTimeout(async () => {
      setSuggestions(await searchPlayers(answer));
    }, 200);
    return () => window.clearTimeout(id);
  }, [answer, isDone, dismissed]);

  // Close the suggestion list on an outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setDismissed(true);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // What actually renders: stale results from a previous, longer query are
  // hidden the moment the input drops below two characters, without waiting
  // for the debounce to come back.
  const visible =
    dismissed || isDone || answer.trim().length < 2 ? [] : suggestions;

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || pending || isDone) return;

    startTransition(async () => {
      const response = await submitPuzzleAnswer({ puzzleId, answer: trimmed });
      if (!response.ok) return;

      setAttempts((prev) => [...prev, { answer: trimmed, isCorrect: response.data.isCorrect }]);
      setResult(response.data);
      setAnswer("");
      setSuggestions([]);
      setDismissed(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card-kickoff flex flex-col items-center gap-3 py-6">
        <span className="section-label">מי שיחק בשתיהן?</span>
        <div className="flex w-full items-center justify-center gap-3">
          <span className="flex-1 text-center text-lg font-black" dir="auto">{clubA}</span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
            +
          </span>
          <span className="flex-1 text-center text-lg font-black" dir="auto">{clubB}</span>
        </div>

        <div className="flex gap-1.5">
          {PUZZLE_POINTS.map((points, index) => {
            const spent = index < attempts.length;
            const isCurrent = index === attempts.length && !isDone;
            return (
              <span
                key={index}
                className={`flex h-7 w-9 items-center justify-center rounded-lg text-xs font-black ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : spent
                      ? "bg-secondary text-muted-foreground line-through"
                      : "bg-secondary text-muted-foreground"
                }`}
                title={`ניסיון ${index + 1}`}
              >
                {points}
              </span>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {isDone ? "האתגר של היום הסתיים" : `ניסיון ${attemptNumber} מתוך ${MAX_ATTEMPTS}`}
        </p>
      </section>

      {!isDone && (
        <div ref={boxRef} className="relative flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setDismissed(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit(answer)}
              placeholder="שם השחקן"
              maxLength={80}
              autoComplete="off"
              className="rounded-xl"
            />
            <Button
              className="shrink-0 font-bold"
              disabled={pending || answer.trim().length < 2}
              onClick={() => submit(answer)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "שליחה"}
            </Button>
          </div>

          {visible.length > 0 && (
            <ul className="absolute top-12 z-10 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
              {visible.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => submit(name)}
                    className="w-full px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-secondary"
                    dir="auto"
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {attempts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attempts.map((attempt, index) => (
            <li
              key={index}
              className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold ${
                attempt.isCorrect
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {attempt.isCorrect ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <X className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate" dir="auto">{attempt.answer}</span>
              {attempt.isCorrect && result?.pointsEarned ? (
                <span className="ms-auto shrink-0">+{result.pointsEarned} נק׳</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isDone && result?.answers?.length ? (
        <section className="card-kickoff flex flex-col gap-2">
          <h2 className="text-sm font-bold">
            {result.isCorrect ? "תשובות נוספות שהיו נכונות" : "התשובות הנכונות"}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground" dir="auto">
            {result.answers.join(" · ")}
          </p>
        </section>
      ) : null}

      {isDone && (
        <p className="text-center text-xs text-muted-foreground">
          אתגר חדש כל יום. הנקודות נספרות בלידרבורד האתר.
        </p>
      )}
    </div>
  );
}
