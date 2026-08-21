import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { InviteCodeBox } from "@/components/leagues/invite-code-box";
import { LeaderboardTable } from "@/components/leagues/leaderboard-table";
import { PrizeList, type Prize } from "@/components/leagues/prize-list";
import { Pagination } from "@/components/shared/pagination";
import type { ScoreRow } from "@/lib/domain/standings";

const PAGE_SIZE = 20;

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; created?: string; joined?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam, created, joined } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS returns nothing for a league the user is not in, so a non-member and a
  // non-existent league are indistinguishable here — which is the intent.
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, description, invite_code, creator_id, prizes, prize_note, competitions(name, country)")
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  // One extra row is requested so we know whether a next page exists without
  // running a second count query.
  const { data: standings, error } = await supabase.rpc("league_standings", {
    p_league_id: id,
    p_limit: PAGE_SIZE + 1,
    p_offset: (page - 1) * PAGE_SIZE,
  });

  const allRows = standings ?? [];
  const hasNext = allRows.length > PAGE_SIZE;

  const rows: ScoreRow[] = allRows.slice(0, PAGE_SIZE).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name ?? "משתמש",
    points: Number(r.points),
    correctCount: Number(r.correct_count),
    joinedAt: new Date(r.joined_at),
  }));

  const isAdmin = league.creator_id === user!.id;
  const prizes = (league.prizes as Prize[] | null) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {(created || joined) && (
        <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
          {created ? "הליגה נוצרה. שתפו את הקוד כדי להזמין." : "הצטרפת לליגה בהצלחה."}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <span className="section-label">{league.competitions?.name}</span>
        <h1 className="text-3xl font-black leading-tight" dir="auto">{league.name}</h1>
        {league.description && (
          <p className="text-sm text-muted-foreground" dir="auto">{league.description}</p>
        )}
      </div>

      {isAdmin && <InviteCodeBox code={league.invite_code} />}

      <PrizeList prizes={prizes} note={league.prize_note} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-bold">טבלת הדירוג</h2>
        </div>

        {error ? (
          <p className="card-kickoff text-center text-sm text-muted-foreground">
            לא ניתן לטעון את הטבלה כרגע.
          </p>
        ) : (
          <LeaderboardTable
            rows={rows}
            currentUserId={user!.id}
            emptyLabel="עדיין אין ניחושים בליגה הזו"
          />
        )}

        <Pagination page={page} hasNext={hasNext} baseUrl={`/leagues/${id}`} />
      </section>

      <p className="text-center text-xs text-muted-foreground">
        הטבלה סופרת ניחושי מנצח בטורניר של הליגה, מרגע ההצטרפות.
      </p>
    </div>
  );
}
