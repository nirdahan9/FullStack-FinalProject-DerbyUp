import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GameRow } from "@/components/games/game-row";
import { EmptyState } from "@/components/shared/empty-state";
import { CompetitionTabs } from "@/components/games/competition-tabs";
import { Pagination } from "@/components/shared/pagination";
import { LiveRefresher } from "@/components/shared/live-refresher";

const PAGE_SIZE = 20;

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; competition?: string }>;
}) {
  const { page: pageParam, competition: competitionParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const selectedCompetition = Number(competitionParam) || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: memberships }, { data: allCompetitions }] = await Promise.all([
    supabase
      .from("league_members")
      .select("leagues(competition_id, featured_game_id)")
      .eq("user_id", user!.id),
    supabase.from("competitions").select("id, name").eq("is_active", true).order("id"),
  ]);

  const leagues = (memberships ?? []).flatMap((m) => (m.leagues ? [m.leagues] : []));
  const competitionIds = [...new Set(leagues.map((l) => l.competition_id))];
  // Narrowed to one tournament when a tab is selected; the tab list itself
  // only offers competitions the user is actually in a league for.
  const visibleIds = selectedCompetition && competitionIds.includes(selectedCompetition)
    ? [selectedCompetition]
    : competitionIds;
  const tabs = (allCompetitions ?? []).filter((c) => competitionIds.includes(c.id));
  const featuredIds = new Set(leagues.map((l) => l.featured_game_id).filter(Boolean));

  if (!competitionIds.length) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <EmptyState
          icon={CalendarDays}
          title="קודם צריך ליגה"
          body="כל ליגה קשורה לטורניר אחד, והמשחקים שתראו כאן הם המשחקים שלו. פתחו ליגה לארגון שלכם, או הצטרפו לאחת עם קוד הזמנה."
          action={{ href: "/leagues/new", label: "פתיחת ליגה" }}
          secondaryAction={{ href: "/join", label: "הצטרפות בקוד" }}
        />
      </div>
    );
  }

  // Only fixtures that have not kicked off: a past match cannot be predicted,
  // so listing it would only be a dead end.
  const from = (page - 1) * PAGE_SIZE;
  const { data: games } = await supabase
    .from("games")
    .select("id, home_team, away_team, home_logo, away_logo, kickoff_at, competitions(name)")
    .in("competition_id", visibleIds)
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .range(from, from + PAGE_SIZE);

  // Matches being played right now, above the list rather than in it. They are
  // the one thing on this page that cannot be predicted and is still the most
  // interesting — and until this query existed they were invisible, because a
  // fixture leaves 'scheduled' the moment it kicks off and the list above
  // never showed it again.
  //
  // Only on the first page. Pagination walks the upcoming calendar; repeating
  // the same live strip on page four would be noise, and the user reaches page
  // four by looking forward, not at what is on now.
  const { data: liveGames } = page === 1
    ? await supabase
        .from("games")
        .select("id, home_team, away_team, home_logo, away_logo, kickoff_at, score_home, score_away, minute, competitions(name)")
        .in("competition_id", visibleIds)
        .eq("status", "live")
        .order("kickoff_at", { ascending: true })
        .limit(10)
    : { data: null };

  const rows = (games ?? []).slice(0, PAGE_SIZE);
  const hasNext = (games ?? []).length > PAGE_SIZE;

  // One query for every prediction on this page, rather than one per fixture.
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

  return (
    <div className="flex flex-col gap-4">
      <Header />

      {tabs.length > 1 && (
        <CompetitionTabs competitions={tabs} active={selectedCompetition} />
      )}

      {(liveGames ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="section-label">🔴 חי עכשיו</span>
          {(liveGames ?? []).map((game) => (
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
              live={{
                scoreHome: game.score_home,
                scoreAway: game.score_away,
                minute: game.minute,
              }}
            />
          ))}
          <LiveRefresher />
        </section>
      )}

      {rows.length === 0 ? (
        (liveGames ?? []).length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title="אין משחקים קרובים"
            body="המשחקים מסונכרנים מדי יום. חזרו מאוחר יותר."
          />
        )
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {rows.map((game) => (
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
            ))}
          </div>
          <Pagination
            page={page}
            hasNext={hasNext}
            baseUrl={selectedCompetition ? `/games?competition=${selectedCompetition}` : "/games"}
          />
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-1">
      <span className="section-label">📅 משחקים קרובים</span>
      <h1 className="text-3xl font-black leading-tight">המשחק מתחיל כאן.</h1>
      <p className="text-sm text-muted-foreground">
        נחשו מי ינצח — היחס הוא הניקוד.
      </p>
    </div>
  );
}
