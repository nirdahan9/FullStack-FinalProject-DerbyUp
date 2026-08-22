import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FeaturedGamePicker } from "@/components/admin/featured-game-picker";
import { ManualSettle } from "@/components/admin/manual-settle";
import { PrizesEditor } from "@/components/admin/prizes-editor";
import type { Prize } from "@/components/leagues/prize-list";

export default async function LeagueAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, creator_id, is_public, status, competition_id, prizes, prize_note, featured_game_id, featured_bonus_pct, competitions(name)")
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  // The page is redirected rather than 404'd for a member who is not the
  // admin: they are allowed to know the league exists, just not to manage it.
  // The database refuses the writes regardless of what this does.
  if (league.is_public || league.creator_id !== user!.id) {
    redirect(`/leagues/${id}`);
  }

  const now = new Date().toISOString();

  const [{ data: upcoming }, { data: unsettled }] = await Promise.all([
    supabase
      .from("games")
      .select("id, home_team, away_team, kickoff_at")
      .eq("competition_id", league.competition_id)
      .eq("status", "scheduled")
      .gt("kickoff_at", now)
      .order("kickoff_at", { ascending: true })
      .limit(30),
    // Started but not settled — the only fixtures a manual result makes sense
    // for.
    supabase
      .from("games")
      .select("id, home_team, away_team, kickoff_at")
      .eq("competition_id", league.competition_id)
      .is("settled_at", null)
      .lt("kickoff_at", now)
      .order("kickoff_at", { ascending: false })
      .limit(20),
  ]);

  const toGame = (g: { id: string; home_team: string; away_team: string; kickoff_at: string }) => ({
    id: g.id,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    kickoffAt: g.kickoff_at,
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/leagues/${id}`}
        className="flex items-center gap-1 self-start text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        חזרה לליגה
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="flex flex-col gap-1">
        <span className="section-label flex items-center gap-1.5">
          <Settings className="h-3 w-3" />
          ניהול
        </span>
        <h1 className="text-2xl font-black leading-tight" dir="auto">{league.name}</h1>
        <p className="text-sm text-muted-foreground">{league.competitions?.name}</p>
      </div>

      {league.status === "archived" && (
        <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
          העונה נסגרה. הדירוג נעול ולא יתווספו ניחושים חדשים.
        </p>
      )}

      <PrizesEditor
        leagueId={id}
        initialPrizes={(league.prizes as Prize[] | null) ?? []}
        initialNote={league.prize_note ?? ""}
      />

      <FeaturedGamePicker
        leagueId={id}
        games={(upcoming ?? []).map(toGame)}
        currentGameId={league.featured_game_id}
        currentBonus={league.featured_bonus_pct}
      />

      <ManualSettle leagueId={id} games={(unsettled ?? []).map(toGame)} />
    </div>
  );
}
