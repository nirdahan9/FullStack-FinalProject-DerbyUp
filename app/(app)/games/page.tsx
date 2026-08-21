import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GameRow } from "@/components/games/game-row";
import { EmptyState } from "@/components/shared/empty-state";
import { CompetitionTabs } from "@/components/games/competition-tabs";
import { Pagination } from "@/components/shared/pagination";

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

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="אין משחקים קרובים"
          body="המשחקים מסונכרנים מדי יום. חזרו מאוחר יותר."
        />
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
