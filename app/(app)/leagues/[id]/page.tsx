import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { InviteCodeBox } from "@/components/leagues/invite-code-box";
import { LeaderboardTable } from "@/components/leagues/leaderboard-table";
import { LeagueActions } from "@/components/leagues/league-actions";
import { LeagueGames, type LeagueGame } from "@/components/leagues/league-games";
import { LeagueRules } from "@/components/leagues/league-rules";
import { PrizeList, type Prize } from "@/components/leagues/prize-list";
import { rankRows, type ScoreRow } from "@/lib/domain/standings";

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; joined?: string; finished?: string }>;
}) {
  const { id } = await params;
  const { created, joined, finished } = await searchParams;
  const showFinished = finished === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS returns nothing for a league the user is not in, so a non-member and a
  // missing league are indistinguishable — which is the intent.
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, description, invite_code, creator_id, is_public, status, prizes, prize_note, competition_id, competitions(name, country)")
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  const [{ data: standings }, { data: games }, { data: predictions }] =
    await Promise.all([
      supabase.rpc("league_standings", { p_league_id: id, p_limit: 100, p_offset: 0 }),
      supabase
        .from("games")
        .select("id, home_team, away_team, home_logo, away_logo, kickoff_at, status, score_home, score_away")
        .eq("competition_id", league.competition_id)
        .order("kickoff_at", { ascending: true }),
      supabase
        .from("predictions")
        .select("question_id, questions(game_id)")
        .eq("user_id", user!.id)
        .in("status", ["pending", "correct", "incorrect", "void"]),
    ]);

  // A fixture is predictable only once the sync has priced it and written its
  // questions; the rest of the season is calendar only.
  const { data: openGames } = await supabase
    .from("questions")
    .select("game_id")
    .in("game_id", (games ?? []).map((g) => g.id));
  const openIds = new Set((openGames ?? []).map((q) => q.game_id));

  const rows: ScoreRow[] = (standings ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name ?? "משתמש",
    avatarUrl: r.avatar_url,
    points: Number(r.points),
    correctCount: Number(r.correct_count),
    joinedAt: new Date(r.joined_at),
  }));

  const ranked = rankRows(rows);
  const mine = ranked.find((r) => r.userId === user!.id);

  const countByGame = new Map<string, number>();
  for (const p of predictions ?? []) {
    const gameId = p.questions?.game_id;
    if (gameId) countByGame.set(gameId, (countByGame.get(gameId) ?? 0) + 1);
  }

  const leagueGames: LeagueGame[] = (games ?? []).map((g) => ({
    id: g.id,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    homeLogo: g.home_logo,
    awayLogo: g.away_logo,
    kickoffAt: g.kickoff_at,
    status: g.status,
    scoreHome: g.score_home,
    scoreAway: g.score_away,
    predictedCount: countByGame.get(g.id) ?? 0,
    isOpen: openIds.has(g.id),
  }));

  const isAdmin = !league.is_public && league.creator_id === user!.id;
  const isArchived = league.status === "archived";
  const prizes = (league.prizes as Prize[] | null) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/leagues"
        className="flex items-center gap-1 self-start text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        חזרה לליגות
        <ArrowLeft className="h-4 w-4" />
      </Link>

      {(created || joined) && (
        <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
          {created ? "הליגה נוצרה. שתפו את הקוד כדי להזמין." : "הצטרפת לליגה בהצלחה."}
        </p>
      )}

      <section className="card-kickoff flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary">
          {league.is_public ? (
            <Globe className="h-5 w-5 text-primary" />
          ) : (
            <Trophy className="h-5 w-5 text-primary" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="text-lg font-black leading-tight" dir="auto">{league.name}</h1>
          {league.description && (
            <p className="text-sm text-muted-foreground" dir="auto">{league.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {league.competitions?.name}
            </span>
            {league.is_public && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                ציבורית
              </span>
            )}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            isArchived ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          {isArchived ? "הסתיימה" : "פעיל"}
        </span>
      </section>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "חברים", value: String(rows.length) },
          {
            label: "הניקוד שלי",
            value: (mine?.points ?? 0).toLocaleString("he-IL", { maximumFractionDigits: 2 }),
          },
          { label: "המיקום שלי", value: mine ? `#${mine.rank}` : "—" },
        ].map((stat) => (
          <div key={stat.label} className="card-kickoff flex flex-col items-center gap-1 py-4">
            <span className="text-xl font-black text-primary">{stat.value}</span>
            <span className="text-[11px] text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      <LeagueRules competitionName={league.competitions?.name ?? "הטורניר"} />

      {isAdmin && !isArchived && (
        <div className="flex flex-col gap-2">
          <span className="section-label">קוד הזמנה — שתפו עם חברים</span>
          <InviteCodeBox code={league.invite_code} />
        </div>
      )}

      <PrizeList prizes={prizes} note={league.prize_note} />

      <section className="flex flex-col gap-3">
        <span className="section-label">דירוג הליגה</span>
        <LeaderboardTable
          rows={rows}
          currentUserId={user!.id}
          creatorId={league.creator_id}
          emptyLabel="עדיין אין ניחושים בליגה הזו"
        />
        <p className="text-center text-[11px] text-muted-foreground">
          נספרים ניחושי מנצח בטורניר של הליגה, מרגע ההצטרפות.
        </p>
      </section>

      <LeagueGames
        games={leagueGames}
        showFinished={showFinished}
        baseUrl={`/leagues/${id}`}
      />

      {!league.is_public && (
        <LeagueActions leagueId={id} isAdmin={isAdmin} isArchived={isArchived} />
      )}
    </div>
  );
}
