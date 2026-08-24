"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import {
  askAdvisor,
  getAdvisorThread,
  getGameInsight,
} from "@/lib/actions/advisor";
import type { Insight } from "@/lib/advisor/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightCard } from "@/components/advisor/insight-card";

type Message = { role: "user" | "assistant"; content: string; blocked: boolean };

/** Openers, so the first thing a user sees is not an empty box. */
const STARTERS = [
  "למה דווקא הבחירה הזו?",
  "מי לדעתך יהיו השחקנים הבולטים?",
  "איך מחושבות הנקודות בתוצאה מדויקת?",
];

/**
 * The advisor, wherever it is mounted.
 *
 * Used by the sheet on the match page and inline by /advisor, which is why it
 * takes a game and nothing else — the two surfaces differ in their frame, not
 * in what the advisor does.
 *
 * The opening analysis is fetched on mount rather than behind a second click.
 * Most of the time it is already cached and arrives immediately; asking
 * someone to press "analyse" to find out that we had the answer all along is a
 * worse trade than one wasted request when they change their mind.
 */
export function AdvisorPanel({ gameId }: { gameId: string }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(true);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // The thread is loaded alongside the analysis so a returning user sees
      // the conversation they left, not a blank panel.
      const [result, thread] = await Promise.all([
        getGameInsight(gameId),
        getAdvisorThread(gameId),
      ]);
      if (cancelled) return;

      if (result.ok) {
        setInsight(result.data.insight);
        setRemaining(result.data.remaining);
      } else {
        setError(result.error);
      }
      setMessages(thread);
      setLoadingInsight(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    // Optional-called: scrollIntoView is missing in jsdom and in a few older
    // mobile browsers, and keeping the thread pinned to the bottom is a
    // convenience — not a reason for the panel to throw.
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages.length, pending]);

  const ask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      setQuestion("");
      setError(null);
      setMessages((previous) => [
        ...previous,
        { role: "user", content: trimmed, blocked: false },
      ]);

      startTransition(async () => {
        const result = await askAdvisor({ gameId, question: trimmed });

        if (!result.ok) {
          // The question never landed, so the bubble that promised it did is
          // rolled back rather than left hanging above an error.
          setMessages((previous) => previous.slice(0, -1));
          setError(result.error);
          return;
        }

        setMessages((previous) => [
          ...previous,
          {
            role: "assistant",
            content: result.data.answer,
            blocked: result.data.refused,
          },
        ]);
        setRemaining(result.data.remaining);
      });
    },
    [gameId, pending],
  );

  const spent = remaining !== null && remaining <= 0;

  return (
    <div className="flex flex-col gap-4">
      {loadingInsight && (
        <div className="flex flex-col gap-2 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}

      {insight && <InsightCard insight={insight} />}

      {error && !insight && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {insight && (
        <>
          <div className="flex flex-col gap-2">
            {messages.map((message, index) => (
              <div
                key={index}
                dir="auto"
                className={
                  message.role === "user"
                    ? "max-w-[85%] self-start rounded-2xl bg-secondary px-3 py-2 text-sm"
                    : message.blocked
                      ? "max-w-[85%] self-end rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      : "max-w-[85%] self-end rounded-2xl bg-primary/10 px-3 py-2 text-sm"
                }
              >
                {message.content}
              </div>
            ))}

            {pending && (
              <div className="flex max-w-[85%] items-center gap-2 self-end rounded-2xl bg-primary/10 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                חושב…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {!messages.length && !pending && (
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => ask(starter)}
                  disabled={spent}
                  className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                >
                  {starter}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
          >
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={spent ? "נגמרו השאלות להיום" : "שאל על המשחק…"}
              maxLength={300}
              disabled={pending || spent}
              dir="auto"
            />
            <Button type="submit" size="icon" disabled={pending || spent || !question.trim()}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="sr-only">שלח</span>
            </Button>
          </form>

          {remaining !== null && (
            <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              נותרו {remaining} שאלות היום
            </p>
          )}
        </>
      )}
    </div>
  );
}
