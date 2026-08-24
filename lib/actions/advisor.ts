"use server";

import { createClient } from "@/lib/supabase/server";
import { classifyQuestion, REFUSAL_BY_CATEGORY } from "@/lib/advisor/classifier";
import { buildGameContext, insightCacheKey, loadGameMeta } from "@/lib/advisor/context";
import { fetchPlayerContext } from "@/lib/advisor/football";
import { guardQuestion } from "@/lib/advisor/guard";
import {
  buildChatPrompt,
  buildInsightPrompt,
  chatSystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
} from "@/lib/advisor/prompts";
import { generateJson } from "@/lib/advisor/provider";
import {
  CHAT_RESPONSE_SCHEMA,
  chatAnswerSchema,
  decorate,
  INSIGHT_RESPONSE_SCHEMA,
  insightSchema,
  InsightRejected,
  type Insight,
} from "@/lib/advisor/schema";
import { askAdvisorSchema } from "@/lib/validation/schemas";
import { actionError, type ActionResult } from "./types";
import type { ChatTurn } from "@/lib/advisor/types";

/**
 * The advisor, as the product sees it.
 *
 * The lab's route handlers took `systemPrompt` and `model` from the caller,
 * which is exactly right for a workbench and would be a hole here: a client
 * that can rewrite the system prompt has walked past every guard layer at
 * once. Neither is a parameter below. The prompt comes from prompts.ts, the
 * model from the environment, and the conversation history from our own table
 * rather than from the browser — a request that supplies its own "history"
 * supplies the advisor's memory too.
 *
 * Nothing here uses the service-role client. The two tables a user may not
 * write are reached through SECURITY DEFINER functions instead; see
 * supabase/migrations/20260823140100_advisor_functions.sql.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const GUARD_MODEL = process.env.GEMINI_GUARD_MODEL ?? "gemini-3.5-flash-lite";

/** How many advisor answers one person may draw in a day. */
const DAILY_LIMIT = Number(process.env.ADVISOR_DAILY_LIMIT ?? 10);

/** How much of the thread the model is shown. */
const HISTORY_TURNS = 6;

const UNAVAILABLE = "היועץ אינו זמין כרגע. נסה שוב בעוד רגע";
const QUOTA_SPENT = `נגמרו לך שאלות היועץ להיום (${DAILY_LIMIT} ליום). נסה שוב מחר`;

export type AdvisorInsight = {
  insight: Insight;
  /** Cached analyses cost nothing, and the UI says so. */
  cached: boolean;
  remaining: number;
};

export type AdvisorAnswer = {
  answer: string;
  refused: boolean;
  remaining: number;
};

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Claims one unit of today's allowance. Returns null when there is none left. */
async function consumeQuota(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advisor_consume_quota", {
    p_limit: DAILY_LIMIT,
  });

  if (error) return null;
  const remaining = data as number;
  return remaining < 0 ? null : remaining;
}

export async function advisorQuotaRemaining(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advisor_quota_remaining", {
    p_limit: DAILY_LIMIT,
  });
  return error ? 0 : ((data as number) ?? 0);
}

// ─── The opening analysis ──────────────────────────────────────────────────

export async function getGameInsight(
  gameId: string,
): Promise<ActionResult<AdvisorInsight>> {
  const userId = await currentUserId();
  if (!userId) return actionError("יש להתחבר כדי להשתמש ביועץ");

  const key = await insightCacheKey(gameId);
  if (!key) return actionError("המשחק לא נמצא");
  if (key.status !== "scheduled") {
    return actionError("היועץ זמין רק למשחקים שטרם התחילו");
  }

  const supabase = await createClient();

  // The cache is consulted before anything is spent — no quota, no provider
  // calls, no model call. This is the path most opens take.
  const { data: cached } = await supabase
    .from("advisor_insights")
    .select("payload")
    .eq("game_id", gameId)
    .eq("context_hash", key.hash)
    .maybeSingle();

  if (cached?.payload) {
    return {
      ok: true,
      data: {
        insight: cached.payload as unknown as Insight,
        cached: true,
        remaining: await advisorQuotaRemaining(),
      },
    };
  }

  // A miss is a real analysis, so it costs the same as a question. Without
  // this, stepping through matches would generate unlimited analyses for free.
  const remaining = await consumeQuota();
  if (remaining === null) return actionError(QUOTA_SPENT);

  try {
    const context = await buildGameContext(gameId, { enrich: true });
    const call = await generateJson({
      model: MODEL,
      systemInstruction: DEFAULT_SYSTEM_PROMPT,
      prompt: buildInsightPrompt(context),
      responseSchema: INSIGHT_RESPONSE_SCHEMA,
      temperature: 0.3,
      maxOutputTokens: 2048,
      thinkingLevel: "low",
    });

    const parsed = insightSchema.safeParse(JSON.parse(call.text));
    if (!parsed.success) return actionError(UNAVAILABLE);

    const insight = decorate(parsed.data, context.questions);

    // Published for everyone else who opens this match. A failure here is a
    // cache miss for the next reader, not a failure for this one.
    await supabase.rpc("advisor_publish_insight", {
      p_game_id: gameId,
      p_context_hash: key.hash,
      p_payload: insight as never,
      p_model: MODEL,
    });

    return { ok: true, data: { insight, cached: false, remaining } };
  } catch (cause) {
    // InsightRejected means the model named an outcome this match does not
    // offer — caught by decorate(), and the one failure a user could act on.
    if (cause instanceof InsightRejected) return actionError(UNAVAILABLE);
    console.error("[advisor/insight]", cause instanceof Error ? cause.message : cause);
    return actionError(UNAVAILABLE);
  }
}

// ─── Follow-up questions ───────────────────────────────────────────────────

/**
 * The thread, read from our own table.
 *
 * Deliberately not a parameter. History supplied by the caller is history the
 * caller wrote, and an advisor that can be told what it previously said can be
 * told it previously agreed to anything.
 */
async function loadHistory(conversationId: string): Promise<ChatTurn[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("advisor_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_TURNS * 2);

  return ((data ?? []) as { role: string; content: string }[])
    .filter((row) => !!row.content)
    .map((row) => ({ role: row.role as ChatTurn["role"], content: row.content }))
    .slice(-HISTORY_TURNS);
}

async function conversationFor(userId: string, gameId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("advisor_conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created } = await supabase
    .from("advisor_conversations")
    .insert({ user_id: userId, game_id: gameId })
    .select("id")
    .maybeSingle();

  return created?.id ?? null;
}

async function record(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  blocked = false,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("advisor_messages")
    .insert({ conversation_id: conversationId, role, content, blocked });
}

export async function askAdvisor(input: {
  gameId: string;
  question: string;
}): Promise<ActionResult<AdvisorAnswer>> {
  const parsedInput = askAdvisorSchema.safeParse(input);
  if (!parsedInput.success) return actionError("קלט לא תקין");

  const { gameId, question: raw } = parsedInput.data;

  const userId = await currentUserId();
  if (!userId) return actionError("יש להתחבר כדי להשתמש ביועץ");

  // Layer 1: pure rules, before anything is loaded or spent. A malformed or
  // hostile question costs one regex sweep and never reaches a paid model.
  const guard = guardQuestion(raw);
  if (!guard.ok) {
    const conversationId = await conversationFor(userId, gameId);
    if (conversationId) {
      await record(conversationId, "user", raw.slice(0, 300));
      await record(conversationId, "assistant", guard.message, true);
    }
    return {
      ok: true,
      data: {
        answer: guard.message,
        refused: true,
        remaining: await advisorQuotaRemaining(),
      },
    };
  }

  const key = await insightCacheKey(gameId);
  if (!key) return actionError("המשחק לא נמצא");
  if (key.status !== "scheduled") {
    return actionError("היועץ זמין רק למשחקים שטרם התחילו");
  }

  const remaining = await consumeQuota();
  if (remaining === null) return actionError(QUOTA_SPENT);

  const conversationId = await conversationFor(userId, gameId);
  if (!conversationId) return actionError(UNAVAILABLE);

  try {
    const context = await buildGameContext(gameId, { enrich: true });

    // Layer 1b: a cheap model deciding whether an expensive one should run. It
    // sees the question and two team names — never the brief, never the thread.
    const classified = await classifyQuestion(
      guard.question,
      { home: context.homeTeam, away: context.awayTeam },
      GUARD_MODEL,
    );

    if (!classified.classification.allowed) {
      const message = REFUSAL_BY_CATEGORY[classified.classification.category];
      await record(conversationId, "user", guard.question);
      await record(conversationId, "assistant", message, true);
      return { ok: true, data: { answer: message, refused: true, remaining } };
    }

    // The classifier doubles as a router: only questions that actually reach
    // for squad detail pay for it.
    let players = null as Awaited<ReturnType<typeof fetchPlayerContext>>["players"];
    const needs = classified.classification.needs;
    if (needs.length) {
      try {
        const meta = await loadGameMeta(gameId);
        const fetched = await fetchPlayerContext({
          fixtureId: meta.fixtureId,
          competitionId: meta.competitionId,
          season: meta.season,
          homeTeam: context.homeTeamRaw,
          awayTeam: context.awayTeamRaw,
          wantLineups: needs.includes("lineups"),
          translate: (name) => name,
        });
        players = fetched.players;
      } catch {
        // Squad colour is an addition to the brief, never a prerequisite.
      }
    }

    const history = await loadHistory(conversationId);
    const call = await generateJson({
      model: MODEL,
      systemInstruction: chatSystemPrompt(DEFAULT_SYSTEM_PROMPT),
      prompt: buildChatPrompt(context, history, guard.question, players),
      responseSchema: CHAT_RESPONSE_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 1024,
      thinkingLevel: "low",
    });

    const parsed = chatAnswerSchema.safeParse(JSON.parse(call.text));
    const answer = parsed.success
      ? parsed.data
      : { refused: true, answer: "לא הצלחתי לנסח תשובה. נסה לשאול שוב" };

    await record(conversationId, "user", guard.question);
    await record(conversationId, "assistant", answer.answer, answer.refused);

    return {
      ok: true,
      data: { answer: answer.answer, refused: answer.refused, remaining },
    };
  } catch (cause) {
    console.error("[advisor/ask]", cause instanceof Error ? cause.message : cause);
    return actionError(UNAVAILABLE);
  }
}

/** The thread so far, for rendering the panel on open. */
export async function getAdvisorThread(
  gameId: string,
): Promise<{ role: "user" | "assistant"; content: string; blocked: boolean }[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("advisor_conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (!conversation?.id) return [];

  const { data } = await supabase
    .from("advisor_messages")
    .select("role, content, blocked")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  return ((data ?? []) as { role: string; content: string; blocked: boolean }[]).map(
    (row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
      blocked: row.blocked,
    }),
  );
}
