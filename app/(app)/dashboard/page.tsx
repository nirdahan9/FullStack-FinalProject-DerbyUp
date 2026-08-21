import Link from "next/link";
import { CalendarDays, Target, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GameRow } from "@/components/games/game-row";
import { EmptyState } from "@/components/shared/empty-state";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username, total_points, total_predictions, total_correct")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("league_members")
      .select("leagues(id, name, competition_id, featured_game_id, competitions(name))")
      .eq("user_id", user!.id),
  ]);

  const leagues = (memberships ?? []).flatMap((m) => (m.leagues ? [m.leagues] : []));
  const competitionIds = [...new Set(leagues.map((l) => l.competition_id))];
  const featuredIds = new Set(leagues.map((l) => l.featured_game_id).filter(Boolean));

  const { data: upcoming } = competitionIds.length
    ? await supabase
        .from("games")
        .select("id, home_team, away_team, home_logo, away_logo, kickoff_at, competitions(name)")
        .in("competition_id", competitionIds)
        .eq("status", "scheduled")
        .gt("kickoff_at", new Date().toISOString())
        .order("kickoff_at", { ascending: true })
        .limit(5)
    : { data: [] };

  const { data: predictions } = await supabase
    .from("predictions")
    .select("question_id, questions(game_id)")
    .eq("user_id", user!.id)
    .in("status", ["pending", "correct", "incorrect", "void"]);

  const countByGame = new Map<string, number>();
  for (const p of predictions ?? []) {
    const gameId = p.questions?.game_id;
    if (gameId) countByGame.set(gameId, (countByGame.get(gameId) ?? 0) + 1);
  }

  const stats = [
    { label: "נקודות", value: Number(profile?.total_points ?? 0) },
    { label: "ניחושים", value: profile?.total_predictions ?? 0 },
    { label: "פגיעות", value: profile?.total_correct ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="section-label">שלום</span>
        <h1 className="text-3xl font-black leading-tight" dir="auto">
          {profile?.display_name ?? profile?.username}
        </h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="card-kickoff flex flex-col items-center gap-1 py-4">
            <span className="text-2xl font-black text-primary">
              {stat.value.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      {leagues.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="הצטרפו לליגה כדי להתחיל"
          body="כל ליגה קשורה לטורניר אחד, ורק המשחקים שלו יופיעו לכם. אחרי שתצטרפו אפשר להתחיל לנחש."
          action={{ href: "/leagues/new", label: "פתיחת ליגה" }}
          secondaryAction={{ href: "/join", label: "הצטרפות בקוד" }}
        />
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="section-label">🏆 הליגות שלי</span>
              <Link href="/leagues" className="text-xs font-bold text-primary hover:underline">
                הכל
              </Link>
            </div>
            {leagues.slice(0, 3).map((league) => (
              <Link
                key={league.id}
                href={`/leagues/${league.id}`}
                className="card-kickoff flex items-center gap-3 py-3 transition-colors hover:bg-secondary/60"
              >
                <Trophy className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-bold" dir="auto">{league.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {league.competitions?.name}
                </span>
              </Link>
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="section-label">📅 משחקים קרובים</span>
              <Link href="/games" className="text-xs font-bold text-primary hover:underline">
                הכל
              </Link>
            </div>
            {(upcoming ?? []).length === 0 ? (
              <p className="card-kickoff text-center text-sm text-muted-foreground">
                אין משחקים קרובים בטורנירים שלך.
              </p>
            ) : (
              (upcoming ?? []).map((game) => (
                <GameRow
                  key={game.id}
                  id={game.id}
                  homeTeam={game.home_team}
                  awayTeam={game.away_team}
                  homeLogo={game.home_logo}
                  awayLogo={game.away_logo}
                  kickoffAt={game.kickoff_at}
                  competitionName={game.competitions?.name}
                  isFeatured={featuredIds.has(game.id)}
                  predictedCount={countByGame.get(game.id) ?? 0}
                />
              ))
            )}
          </section>
        </>
      )}

      <Link
        href="/predictions"
        className="card-kickoff flex items-center gap-3 py-3 transition-colors hover:bg-secondary/60"
      >
        <Target className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 font-bold">הניחושים שלי</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}
