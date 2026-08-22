import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GameFilters } from "@/components/site-admin/game-filters";
import { GameStatusBadge } from "@/components/site-admin/game-status-badge";
import { SettleGameDialog } from "@/components/site-admin/settle-game-dialog";
import { FixtureLabel, FixtureScore } from "@/components/shared/fixture";
import { Pagination } from "@/components/shared/pagination";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

/**
 * Every fixture in the database, with how many people are exposed to it.
 *
 * The default view is "ממתינים לעיבוד" — kicked off and not scored yet. That
 * is the only state on this screen that needs a human: everything else either
 * has not happened or has already settled itself.
 */
export default async function AdminGamesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    competition?: string;
    page?: string;
  }>;
}) {
  const {
    q,
    status: statusParam,
    competition: competitionParam,
    page: pageParam,
  } = await searchParams;

  const search = (q ?? "").trim();
  const status = statusParam ?? "unsettled";
  const competition = competitionParam ?? "";
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  const [{ data: competitions }, { data: games, error }] = await Promise.all([
    supabase.from("competitions").select("id, name").order("id"),
    supabase.rpc("admin_list_games", {
      p_search: search || null,
      p_status: status,
      p_competition: Number(competition) || null,
      p_limit: PAGE_SIZE + 1,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const rows = (games ?? []).slice(0, PAGE_SIZE);
  const hasNext = (games ?? []).length > PAGE_SIZE;

  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status !== "all") params.set("status", status);
  if (competition) params.set("competition", competition);
  const baseUrl = params.toString()
    ? `/admin/games?${params.toString()}`
    : "/admin/games";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">📅 משחקים</span>
        <h1 className="text-2xl font-black leading-tight md:text-3xl">כל המשחקים</h1>
      </div>

      <GameFilters
        competitions={competitions ?? []}
        search={search}
        status={status}
        competition={competition}
      />

      {error ? (
        <p className="card-kickoff text-center text-sm text-muted-foreground">
          לא ניתן לטעון את רשימת המשחקים כרגע.
        </p>
      ) : rows.length === 0 ? (
        <p className="card-kickoff text-center text-sm text-muted-foreground">
          אין משחקים שתואמים את הסינון.
        </p>
      ) : (
        <div className="card-kickoff overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">משחק</TableHead>
                <TableHead className="text-right">פתיחה</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">תוצאה</TableHead>
                <TableHead className="text-right">ניחושים</TableHead>
                <TableHead className="text-right">שאלות</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="max-w-[240px]">
                    <Link href={`/games/${g.id}`} className="flex flex-col hover:underline">
                      <FixtureLabel
                        home={g.home_team}
                        away={g.away_team}
                        className="truncate font-bold"
                      />
                      <span className="truncate text-[11px] text-muted-foreground">
                        {g.competition_name}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(g.kickoff_at)}
                  </TableCell>
                  <TableCell>
                    <GameStatusBadge status={g.status} settledAt={g.settled_at} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-bold">
                    <FixtureScore home={g.score_home} away={g.score_away} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatNumber(g.prediction_count)}
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatNumber(g.player_count)} משתמשים
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{formatNumber(g.question_count)}</TableCell>
                  <TableCell>
                    {/* Offered only once a fixture has started: the function
                        refuses a result for a match people can still predict. */}
                    {new Date(g.kickoff_at) < new Date() && !g.settled_at && (
                      <SettleGameDialog
                        gameId={g.id}
                        homeTeam={g.home_team}
                        awayTeam={g.away_team}
                        scoreHome={g.score_home}
                        scoreAway={g.score_away}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} hasNext={hasNext} baseUrl={baseUrl} />

      <p className="text-xs text-muted-foreground">
        רישום תוצאה ידני שומר את התוצאה בלבד — העיבוד עצמו מתבצע בהרצה המתוזמנת
        הבאה, באותו קוד שמעבד כל משחק אחר.
      </p>
    </div>
  );
}
