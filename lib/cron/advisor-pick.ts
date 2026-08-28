import { createAdminClient } from "@/lib/supabase/admin";
import { buildGameContext } from "@/lib/advisor/context";
import type { AdvisorClient } from "@/lib/advisor/db";
import { buildInsightPrompt, DEFAULT_SYSTEM_PROMPT } from "@/lib/advisor/prompts";
import { generateJson } from "@/lib/advisor/provider";
import { DAILY_PICK_RESPONSE_SCHEMA, decorate, insightSchema } from "@/lib/advisor/schema";
import type { Outcome } from "@/lib/football-api/types";

/**
 * One match per competition, analysed overnight.
 *
 * Two surfaces read what this writes — the dashboard card and the landing page
 * — and neither may cost a model call at request time. The dashboard is the
 * first screen after sign-in, and the landing page is served to people who
 * have not signed in at all and whose visit must not be billable.
 *
 * Seven competitions is seven calls a night. That fits inside the free tier
 * with room to spare, which is the reason the fan-out is per competition
 * rather than per fixture.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

/** How far ahead to look. Beyond this, "today's pick" stops being today's. */
const HORIZON_HOURS = 48;

export type PickReport = {
  considered: number;
  picked: number;
  skipped: number;
  failed: number;
};

type Candidate = {
  gameId: string;
  competitionId: number;
  spread: number;
};

/**
 * The most interesting match is the least predictable one.
 *
 * Measured as the spread between the shortest and longest price on the winner
 * market: a fixture quoted 1.20 / 7.00 / 15.00 is a formality, and one quoted
 * 2.40 / 3.30 / 2.90 is a real question. That is the fixture worth a card.
 *
 * Deliberately arithmetic rather than a model call — asking the model which
 * match to analyse would double the nightly cost to choose the input to the
 * thing we were going to pay for anyway.
 */
export function pickMostUncertain(
  games: { id: string; competition_id: number; questions: { type: string; outcomes: Outcome[] }[] }[],
): Candidate[] {
  const byCompetition = new Map<number, Candidate>();

  for (const game of games) {
    const winner = game.questions?.find((q) => q.type === "match_result");
    const odds = (winner?.outcomes ?? []).map((o) => Number(o.odds)).filter((n) => n > 0);
    // A market with a leg missing is not one we can compare.
    if (odds.length < 3) continue;

    const spread = Math.max(...odds) - Math.min(...odds);
    const current = byCompetition.get(game.competition_id);
    if (!current || spread < current.spread) {
      byCompetition.set(game.competition_id, {
        gameId: game.id,
        competitionId: game.competition_id,
        spread,
      });
    }
  }

  return [...byCompetition.values()];
}

export async function refreshDailyPicks(): Promise<PickReport> {
  const admin = createAdminClient();
  const client = admin as unknown as AdvisorClient;

  const horizon = new Date(Date.now() + HORIZON_HOURS * 60 * 60 * 1000).toISOString();

  const { data: games, error } = await admin
    .from("games")
    .select("id, competition_id, questions(type, outcomes)")
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString())
    .lt("kickoff_at", horizon)
    .order("kickoff_at", { ascending: true });

  if (error) throw new Error(`Supabase: ${error.message}`);

  const candidates = pickMostUncertain(
    (games ?? []) as unknown as Parameters<typeof pickMostUncertain>[0],
  );

  const report: PickReport = {
    considered: games?.length ?? 0,
    picked: 0,
    skipped: 0,
    failed: 0,
  };

  const today = new Date().toISOString().slice(0, 10);

  // Sequential on purpose. Seven calls do not need to be fast, and the free
  // tier is rate-limited per minute — firing them together is the one way to
  // turn a comfortable nightly job into a burst that trips the limit.
  for (const candidate of candidates) {
    const { data: existing } = await admin
      .from("advisor_daily_pick")
      .select("id")
      .eq("pick_date", today)
      .eq("competition_id", candidate.competitionId)
      .maybeSingle();

    // Already done today. Re-running the job must not re-bill it.
    if (existing) {
      report.skipped += 1;
      continue;
    }

    try {
      const context = await buildGameContext(candidate.gameId, { enrich: true, client });
      // The daily card always answers "מי ינצח": the schema's enum has one
      // member and the prompt says so, and the check below catches the case
      // where neither held.
      const call = await generateJson({
        model: MODEL,
        systemInstruction: DEFAULT_SYSTEM_PROMPT,
        prompt: buildInsightPrompt(context, { winnerOnly: true }),
        responseSchema: DAILY_PICK_RESPONSE_SCHEMA,
        temperature: 0.3,
        maxOutputTokens: 2048,
        thinkingLevel: "low",
      });

      const parsed = insightSchema.safeParse(JSON.parse(call.text));
      if (!parsed.success || parsed.data.recommendation.question_type !== "match_result") {
        report.failed += 1;
        continue;
      }

      const insight = decorate(parsed.data, context.questions);

      await admin.from("advisor_daily_pick").insert({
        pick_date: today,
        competition_id: candidate.competitionId,
        game_id: candidate.gameId,
        payload: insight as never,
      });

      report.picked += 1;
    } catch (cause) {
      // One competition failing is not a reason to lose the other six.
      console.error(
        `[cron/advisor-pick] competition ${candidate.competitionId}:`,
        cause instanceof Error ? cause.message : cause,
      );
      report.failed += 1;
    }
  }

  return report;
}
