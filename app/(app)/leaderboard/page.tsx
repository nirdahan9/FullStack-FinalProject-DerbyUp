import { Globe } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LeaderboardTable } from "@/components/leagues/leaderboard-table";
import { Pagination } from "@/components/shared/pagination";
import type { ScoreRow } from "@/lib/domain/standings";

const PAGE_SIZE = 20;

/**
 * The site-wide board. Deliberately the mirror image of a league table: every
 * competition, every question type, the daily puzzle included, and no join
 * date to filter by.
 *
 * It reads through get_global_leaderboard rather than from profiles. The
 * profiles policy exposes only yourself and people you share a private league
 * with, which is right — so instead of widening it, that function returns a
 * display name, an avatar and a score, and nothing that identifies anyone.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: board, error }, { data: me }, { count: ahead }] = await Promise.all([
    supabase.rpc("get_global_leaderboard", {
      p_limit: PAGE_SIZE + 1,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase
      .from("profiles")
      .select("display_name, total_points, total_correct")
      .eq("id", user!.id)
      .single(),
    // Rank without reading anybody's row: how many scores beat mine. head:true
    // makes this a count rather than a payload that gets discarded.
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gt("total_points", 0),
  ]);

  const all = board ?? [];
  const hasNext = all.length > PAGE_SIZE;
  const offset = (page - 1) * PAGE_SIZE;

  // The function returns no ids, so rows are keyed by position. The current
  // user is matched on name and score rather than identity, which is enough to
  // highlight a row and does not require exposing who anybody is.
  const rows: ScoreRow[] = all.slice(0, PAGE_SIZE).map((r, index) => ({
    userId: `rank-${offset + index}`,
    displayName: r.display_name ?? "משתמש",
    avatarUrl: r.avatar_url,
    points: Number(r.total_points),
    correctCount: 0,
    joinedAt: new Date(0),
  }));

  const mineIndex = rows.findIndex(
    (r) =>
      r.displayName === (me?.display_name ?? "") &&
      r.points === Number(me?.total_points ?? -1),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">🌍 כל המשתמשים</span>
        <h1 className="text-3xl font-black leading-tight">לידרבורד האתר</h1>
      </div>

      <div className="card-kickoff flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Globe className="h-4 w-4 text-primary" />
        </span>
        <p className="text-sm leading-relaxed text-muted-foreground">
          כאן נספר <span className="font-bold text-foreground">הכל</span>: שלושת סוגי
          הניחוש, כל הטורנירים, והאתגר היומי. טבלת ליגה, לעומת זאת, סופרת רק ניחושי
          מנצח בטורניר שלה ומרגע ההצטרפות.
        </p>
      </div>

      {/* Shown only past the first page, where the highlighted row is not on
          screen. On page one it would just repeat it. */}
      {page > 1 && (
        <div className="card-kickoff flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-[11px] text-muted-foreground">הניקוד שלך</span>
            <span className="text-sm font-bold" dir="auto">
              {me?.display_name ?? "אתה"}
            </span>
          </span>
          <span className="text-sm font-black text-primary">
            {Number(me?.total_points ?? 0).toLocaleString("he-IL", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            נק׳
          </span>
        </div>
      )}

      {error ? (
        <p className="card-kickoff text-center text-sm text-muted-foreground">
          לא ניתן לטעון את הלוח כרגע.
        </p>
      ) : (
        <LeaderboardTable
          rows={rows}
          currentUserId={mineIndex >= 0 ? rows[mineIndex].userId : undefined}
          emptyLabel="עדיין אין נקודות באתר"
          showCorrectCount={false}
        />
      )}

      <Pagination page={page} hasNext={hasNext} baseUrl="/leaderboard" />

      <p className="text-center text-xs text-muted-foreground">
        {ahead ?? 0} משתמשים צברו נקודות עד כה.
      </p>
    </div>
  );
}
