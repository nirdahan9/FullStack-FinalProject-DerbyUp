import Link from "next/link";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { translateTeam } from "@/lib/i18n/teams";
import { isExactScoreHit } from "@/lib/domain/exact-score";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";

const PAGE_SIZE = 20;

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "ממתין", className: "bg-secondary text-muted-foreground" },
  correct: { label: "צדקת", className: "bg-primary/15 text-primary" },
  incorrect: { label: "טעית", className: "bg-destructive/10 text-destructive" },
  void: { label: "בוטל המשחק", className: "bg-secondary text-muted-foreground" },
  cancelled: { label: "ביטלת", className: "bg-secondary text-muted-foreground" },
};

const OUTCOME_LABELS: Record<string, string> = {
  home: "ניצחון בית", draw: "תיקו", away: "ניצחון חוץ",
  over: "מעל 2.5", under: "מתחת ל-2.5", yes: "כן", no: "לא",
};

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: predictions } = await supabase
    .from("predictions")
    .select("id, selected_outcome, odds, bonus_pct, points_earned, status, predicted_at, exact_score, questions(type, games(home_team, away_team, kickoff_at, score_home, score_away))")
    .eq("user_id", user!.id)
    .order("predicted_at", { ascending: false })
    .range(from, from + PAGE_SIZE);

  const rows = (predictions ?? []).slice(0, PAGE_SIZE);
  const hasNext = (predictions ?? []).length > PAGE_SIZE;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">ההיסטוריה שלך</span>
        <h1 className="text-3xl font-black leading-tight">הניחושים שלי</h1>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Target}
          title="עדיין לא ניחשת"
          body="בחרו משחק קרוב והניחו את הניחוש הראשון שלכם."
          action={{ href: "/games", label: "אל המשחקים" }}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {rows.map((p) => {
              const game = p.questions?.games;
              const status = STATUS[p.status] ?? STATUS.pending;
              const potential = Math.round(Number(p.odds) * (1 + (p.bonus_pct ?? 0) / 100) * 100) / 100;
              const earned = Number(p.points_earned ?? 0);
              const isExactHit = isExactScoreHit(
                p.exact_score,
                game?.score_home ?? null,
                game?.score_away ?? null,
              );

              return (
                <div key={p.id} className="card-kickoff flex items-center gap-3 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-bold" dir="auto">
                      {game ? `${translateTeam(game.home_team)} — ${translateTeam(game.away_team)}` : "משחק"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {OUTCOME_LABELS[p.selected_outcome] ?? p.selected_outcome}
                      {" · "}
                      {p.status === "correct" ? `${earned} נק׳` : `${potential} נק׳ אפשריות`}
                    </span>
                    {p.exact_score && (
                      // Whether the call landed is only knowable once the
                      // fixture has a score, so before then it is stated
                      // plainly rather than dressed up as a result.
                      <span
                        className={`truncate text-[11px] font-bold ${
                          isExactHit ? "text-amber-500" : "text-muted-foreground"
                        }`}
                      >
                        🎯 {p.exact_score}
                        {p.status === "pending"
                          ? " · פגיעה מזכה ב-×3"
                          : isExactHit
                            ? " · פגעת! ×3"
                            : " · לא נפגעה"}
                      </span>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
          <Pagination page={page} hasNext={hasNext} baseUrl="/predictions" />
        </>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/games" className="font-bold text-primary hover:underline">
          למשחקים הקרובים
        </Link>
      </p>
    </div>
  );
}
