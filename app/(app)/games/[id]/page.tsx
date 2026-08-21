import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QuestionCard } from "@/components/games/question-card";
import { CANCEL_WINDOW_MINUTES } from "@/lib/domain/prediction-rules";
import { translateTeam } from "@/lib/i18n/teams";
import type { Outcome } from "@/lib/football-api/types";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: game } = await supabase
    .from("games")
    .select("id, home_team, away_team, home_logo, away_logo, kickoff_at, status, competition_id, score_home, score_away, competitions(name)")
    .eq("id", id)
    .maybeSingle();

  if (!game) notFound();

  const [{ data: questions }, { data: memberships }, { data: predictions }] =
    await Promise.all([
      supabase
        .from("questions")
        .select("id, type, outcomes, correct_outcome")
        .eq("game_id", id)
        .order("type"),
      supabase
        .from("league_members")
        .select("leagues(competition_id, featured_game_id, featured_bonus_pct)")
        .eq("user_id", user!.id),
      supabase
        .from("predictions")
        .select("id, question_id, selected_outcome, odds, bonus_pct, points_earned, status")
        .eq("user_id", user!.id),
    ]);

  const leagues = (memberships ?? []).flatMap((m) => (m.leagues ? [m.leagues] : []));
  const inCompetition = leagues.some((l) => l.competition_id === game.competition_id);

  const bonusPct = Math.max(
    0,
    ...leagues
      .filter((l) => l.featured_game_id === game.id)
      .map((l) => l.featured_bonus_pct ?? 0),
    0,
  );

  const byQuestion = new Map(
    (predictions ?? []).map((p) => [p.question_id, p]),
  );

  // Match winner leads, exactly as the DerbyUp app orders them: it is the
  // question everyone understands, and the only one a league table counts.
  const ORDER = ["match_result", "over_under_2_5", "btts"];
  const ordered = [...(questions ?? [])].sort(
    (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type),
  );

  const kickoff = new Date(game.kickoff_at);
  const now = new Date();
  const started = now >= kickoff;
  const locked = started || game.status !== "scheduled" || !inCompetition;

  const lockReason = !inCompetition
    ? "אינך חבר בליגה של התחרות הזו"
    : game.status !== "scheduled"
      ? "המשחק אינו פתוח לניחושים"
      : started
        ? "המשחק כבר התחיל"
        : undefined;

  const kickoffLabel = kickoff.toLocaleString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">{game.competitions?.name}</span>
        <h1 className="text-2xl font-black leading-tight" dir="auto">
          {translateTeam(game.home_team)} — {translateTeam(game.away_team)}
        </h1>
        <p className="text-sm text-muted-foreground">{kickoffLabel}</p>
      </div>

      {game.status === "finished" && game.score_home !== null && (
        <div className="card-kickoff flex items-center justify-center gap-3 py-4">
          <span className="text-3xl font-black" dir="ltr">
            {game.score_home} - {game.score_away}
          </span>
        </div>
      )}

      {bonusPct > 0 && (
        <p className="flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-bold text-primary">
          <Star className="h-4 w-4 fill-current" />
          משחק השבוע — בונוס {bonusPct}% על הניקוד
        </p>
      )}

      {ordered.map((q) => {
        const existing = byQuestion.get(q.id);
        return (
          <QuestionCard
            key={q.id}
            questionId={q.id}
            type={q.type}
            outcomes={q.outcomes as unknown as Outcome[]}
            bonusPct={bonusPct}
            existing={
              existing
                ? {
                    id: existing.id,
                    outcome: existing.selected_outcome,
                    status: existing.status,
                  }
                : null
            }
            locked={locked}
            lockReason={lockReason}
          />
        );
      })}

      {!locked && (
        <p className="text-center text-xs text-muted-foreground">
          ניתן לבטל ניחוש עד {CANCEL_WINDOW_MINUTES} דקות לפני שריקת הפתיחה.
        </p>
      )}
    </div>
  );
}
