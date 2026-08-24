import { Sparkles } from "lucide-react";
import type { LandingAdvisorCard } from "@/lib/advisor/daily-pick";

const TYPE_LABEL: Record<string, string> = {
  match_result: "מי ינצח?",
  over_under_2_5: "סך השערים",
  btts: "שתי הקבוצות יבקיעו?",
};

/**
 * The advisor, shown to someone who has not signed up.
 *
 * Everything else on this page is a claim about the product. This is the
 * product: a real analysis of a real fixture, generated last night by the same
 * job that fills the dashboard card, on odds the visitor can check. Nothing
 * here is illustrative and nothing is hard-coded.
 *
 * It costs one query. The analysis was paid for once, overnight, and every
 * visitor since has been served the same row.
 */
export function AdvisorPreview({ card }: { card: LandingAdvisorCard }) {
  return (
    <section className="px-4 py-14 md:py-20">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <span className="section-label justify-center">✨ יועץ AI</span>
          <h2 className="text-2xl font-black leading-tight md:text-3xl">
            לא בטוחים? תשאלו את היועץ
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            לפני כל ניחוש אפשר לקבל דעה מנומקת — מבוססת על הכושר, המפגשים
            הקודמים והיחסים עצמם. הנה הניתוח של היום, אמיתי לגמרי:
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-5 text-start">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              דעת היועץ
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {card.competitionName}
            </span>
          </div>

          <p className="text-sm font-black" dir="auto">
            {card.homeTeam} — {card.awayTeam}
          </p>

          <p className="text-base font-bold leading-snug" dir="auto">
            {card.insight.headline}
          </p>

          <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-bold" dir="auto">
              {card.insight.recommendation.outcomeLabel}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {TYPE_LABEL[card.insight.recommendation.question_type] ?? ""}
            </span>
            <span className="shrink-0 font-mono text-base font-black text-primary">
              {card.insight.recommendation.odds.toFixed(2)}
            </span>
          </div>

          <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm leading-relaxed">
            {card.insight.reasons.slice(0, 3).map((reason, index) => (
              <li key={index} dir="auto">
                {reason}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          היועץ עונה רק על המשחק שלפניו ועל כללי הניקוד — ואין בו כסף אמיתי,
          רק נקודות.
        </p>
      </div>
    </section>
  );
}
