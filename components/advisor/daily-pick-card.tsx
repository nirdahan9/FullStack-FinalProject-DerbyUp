import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import type { DailyPick } from "@/lib/advisor/daily-pick";
import { FixtureLabel } from "@/components/shared/fixture";

const TYPE_LABEL: Record<string, string> = {
  match_result: "מי ינצח?",
  over_under_2_5: "סך השערים",
  btts: "שתי הקבוצות יבקיעו?",
};

/**
 * The advisor's pick of the day, on the dashboard.
 *
 * One match, one sentence, one reason — and a link into the fixture where the
 * guess actually happens. Deliberately shorter than the panel: this card is a
 * reason to come back, not the analysis itself. Anyone who wants the rest taps
 * through.
 */
export function DailyPickCard({ pick }: { pick: DailyPick }) {
  const kickoff = new Date(pick.kickoffAt).toLocaleString("he-IL", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });

  return (
    <Link
      href={`/games/${pick.gameId}`}
      className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          הבחירה של היועץ היום
        </span>
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <div>
        {/* Names arrive already translated; translateTeam passes them through. */}
        <FixtureLabel
          home={pick.homeTeam}
          away={pick.awayTeam}
          homeLogo={pick.homeLogo}
          awayLogo={pick.awayLogo}
          crestClassName="h-5 w-5"
          className="block text-sm font-black"
        />
        <p className="text-xs text-muted-foreground">
          {pick.competitionName} · {kickoff}
        </p>
      </div>

      <p className="text-sm font-bold leading-snug" dir="auto">
        {pick.insight.headline}
      </p>

      <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold" dir="auto">
          {pick.insight.recommendation.outcomeLabel}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {TYPE_LABEL[pick.insight.recommendation.question_type] ?? ""}
        </span>
        <span className="shrink-0 font-mono text-base font-black text-primary">
          {pick.insight.recommendation.odds.toFixed(2)}
        </span>
      </div>
    </Link>
  );
}
