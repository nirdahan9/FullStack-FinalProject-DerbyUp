"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Search, Shield, X } from "lucide-react";
import { searchPlayers, submitPuzzleAnswer, type PuzzleResult } from "@/lib/actions/challenge";
import { MAX_ATTEMPTS } from "@/lib/domain/puzzle";
import { crestUrl } from "@/lib/challenge/club-crests";
import { ResultModal } from "@/components/challenge/result-modal";

type Attempt = { answer: string; isCorrect: boolean };

/**
 * Football Bridge: two clubs, name a player who turned out for both.
 *
 * Laid out like the DerbyUp minigame it is ported from — two crest tiles either
 * side of a `+`, the question in a tinted panel, a pill search box and a
 * full-width confirm button, with the verdict in a modal.
 *
 * The answer is checked on the server: the valid names live on the puzzle row
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
  const [searching, setSearching] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  const isDone = solved || attempts.some((a) => a.isCorrect) || attempts.length >= MAX_ATTEMPTS;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attempts.length);

  // Debounced so a fast typist does not fire a query per keystroke.
  //
  // The effect only ever sets state from the timeout callback. Clearing the
  // list on a short query is done during render instead, via `visible` below:
  // a synchronous setState in an effect body cascades an extra render, which
  // is what react-hooks/set-state-in-effect warns about.
  useEffect(() => {
    if (dismissed || isDone || answer.trim().length < 2) return;

    const id = window.setTimeout(async () => {
      setSearching(true);
      setSuggestions(await searchPlayers(answer));
      setSearching(false);
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
  const visible = dismissed || isDone || answer.trim().length < 2 ? [] : suggestions;

  function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 2 || pending || isDone) return;

    startTransition(async () => {
      const response = await submitPuzzleAnswer({ puzzleId, answer: trimmed });
      if (!response.ok) return;

      setAttempts((prev) => [...prev, { answer: trimmed, isCorrect: response.data.isCorrect }]);
      setResult(response.data);
      setModalOpen(true);
      setAnswer("");
      setSuggestions([]);
      setDismissed(true);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <p className="text-center text-xs text-muted-foreground">
        {isDone
          ? "האתגר של היום הסתיים"
          : attemptsLeft === 1
            ? `ניסיון ${attempts.length + 1}/${MAX_ATTEMPTS} — נותר ניסיון 1`
            : `ניסיון ${attempts.length + 1}/${MAX_ATTEMPTS} — נותרו ${attemptsLeft} ניסיונות`}
      </p>

      <section className="flex items-center justify-center gap-6">
        <ClubTile name={clubA} />
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xl font-bold text-primary">+</span>
        <ClubTile name={clubB} />
      </section>

      <section className="rounded-xl border border-primary/10 bg-primary/5 p-4 text-center">
        <p className="text-xs font-medium text-primary">
          מי שיחק ב{clubA} וב{clubB}?
        </p>
      </section>

      {!isDone && (
        <section className="flex flex-col gap-4">
          <div ref={boxRef} className="relative w-full">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 shadow-soft transition-all focus-within:ring-2 focus-within:ring-primary">
              {searching ? (
                <Loader2 size={18} className="shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Search size={18} className="shrink-0 text-muted-foreground" />
              )}
              <input
                dir="auto"
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setDismissed(false);
                }}
                onFocus={() => suggestions.length > 0 && setDismissed(false)}
                onKeyDown={(e) => e.key === "Enter" && submit(answer)}
                placeholder="חפש שחקן לפי שם..."
                maxLength={80}
                autoComplete="off"
                className="flex-1 bg-transparent text-center text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {answer && (
                <button
                  type="button"
                  aria-label="ניקוי"
                  onClick={() => {
                    setAnswer("");
                    setSuggestions([]);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {visible.length > 0 && (
              <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-hidden overflow-y-auto rounded-2xl border border-border bg-card shadow-elevated">
                {visible.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      onMouseDown={() => {
                        setAnswer(name);
                        setDismissed(true);
                      }}
                      className="w-full px-4 py-3 text-start text-sm font-medium transition-colors hover:bg-primary/10"
                      dir="auto"
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={() => submit(answer)}
            disabled={pending || answer.trim().length < 2}
            className="w-full rounded-full bg-gradient-to-tr from-primary to-primary/80 py-4 text-lg font-bold text-primary-foreground shadow-elevated transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {pending ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              "אישור תשובה"
            )}
          </button>
        </section>
      )}

      {attempts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attempts.map((attempt, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-3"
            >
              <span className="truncate text-sm font-bold" dir="auto">
                {attempt.answer}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {attempt.isCorrect && result?.pointsEarned ? (
                  <span className="text-sm font-black text-primary">+{result.pointsEarned} נק׳</span>
                ) : null}
                <span
                  className={`rounded-full p-1 ${
                    attempt.isCorrect
                      ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {attempt.isCorrect ? <Check size={18} /> : <X size={18} />}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {isDone && result?.answers?.length ? (
        <section className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="border-b border-border pb-3 text-lg font-black">
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

      <ResultModal
        open={modalOpen}
        isCorrect={result?.isCorrect ?? false}
        pointsEarned={result?.pointsEarned ?? 0}
        answers={result?.answers ?? null}
        attemptsLeft={attemptsLeft}
        onClose={() => setModalOpen(false)}
        onRetry={() => setModalOpen(false)}
      />
    </div>
  );
}

/** One club: crest on a card, name beneath — the DerbyUp minigame tile. */
function ClubTile({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const url = crestUrl(name);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-border bg-card shadow-soft">
        {url && !failed ? (
          // A public crest CDN, same as the team logos elsewhere in the app;
          // next/image would mean a remote-pattern allowlist to maintain.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-16 w-16 object-contain drop-shadow-sm"
            onError={() => setFailed(true)}
          />
        ) : (
          <Shield size={44} className="text-primary/30" />
        )}
      </div>
      <span className="text-center text-sm font-bold" dir="auto">
        {name}
      </span>
    </div>
  );
}
