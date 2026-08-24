import { Sparkles } from "lucide-react";
import type { Insight } from "@/lib/advisor/schema";

const TYPE_LABEL: Record<string, string> = {
  match_result: "מי ינצח?",
  over_under_2_5: "סך השערים",
  btts: "שתי הקבוצות יבקיעו?",
};

/**
 * The advisor's opinion.
 *
 * What is *not* here is the design: no probability, no expected points, no
 * confidence meter. An earlier version showed all three and read as an
 * analytics dashboard — which is a different product from a friend telling you
 * what they think. The expected-value reasoning still decides the pick; it
 * just stays in the prompt.
 *
 * The odds are the one number that survives, because they are the score: a
 * correct call at 4.65 is worth 4.65 points, and that is the product's rule
 * rather than the model's arithmetic.
 */
export function InsightCard({ insight }: { insight: Insight }) {
  const { recommendation } = insight;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
      <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        דעת היועץ
      </span>

      <p className="text-base font-bold leading-snug" dir="auto">
        {insight.headline}
      </p>

      <div className="flex items-center gap-3 rounded-xl bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">הניחוש שהייתי בוחר</p>
          <p className="truncate text-sm font-black" dir="auto">
            {recommendation.outcomeLabel}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {TYPE_LABEL[recommendation.question_type] ?? recommendation.question_type}
          </p>
        </div>
        <div className="flex flex-col items-center border-s border-border ps-3">
          <span className="text-[10px] text-muted-foreground">נקודות</span>
          <span className="font-mono text-lg font-black text-primary">
            {recommendation.odds.toFixed(2)}
          </span>
        </div>
      </div>

      <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm leading-relaxed">
        {insight.reasons.map((reason, index) => (
          <li key={index} dir="auto">
            {reason}
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground">
        זו דעה של מודל שפה על סמך נתוני עבר — לא תחזית ודאית.
      </p>
    </div>
  );
}
