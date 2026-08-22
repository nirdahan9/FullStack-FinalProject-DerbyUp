import { Ban, Sparkles, Wallet } from "lucide-react";
import { EXACT_SCORE_MULTIPLIER } from "@/lib/domain/exact-score";
import { round2 } from "@/lib/domain/scoring";

/**
 * The one rule the whole product is built on, explained once and properly.
 *
 * The bars are the point of the section. "The odds are the points" is a
 * sentence people nod at and do not act on; three bars of different lengths
 * next to three prices is the moment someone decides to back the underdog.
 *
 * The multiplier and the rounding are imported rather than written out, so a
 * change to the rule cannot leave the marketing copy quoting the old one.
 */
const EXAMPLES = [
  { pick: "הפייבוריטית מנצחת", odds: 1.3, note: "כולם ניחשו את זה" },
  { pick: "תיקו", odds: 4.5, note: "פחות צפוי" },
  { pick: "האאוטסיידרית מנצחת", odds: 7.15, note: "כמעט אף אחד" },
] as const;

const NOT_THIS = [
  { icon: Wallet, title: "אין כסף", body: "לא נכנס, לא יוצא, ואין מה להפקיד" },
  { icon: Ban, title: "אין הפסד", body: "טעית — אפס. הנקודות שצברת נשארות" },
  { icon: Sparkles, title: "אין יתרה", body: "אין מה לנהל ואי אפשר להיתקע בחוץ" },
] as const;

export function ScoringModel() {
  const top = Math.max(...EXAMPLES.map((e) => e.odds));

  return (
    <section id="scoring" className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
      <div className="flex flex-col gap-2 text-center">
        <span className="section-label">מודל הניקוד</span>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          היחס <span className="text-primary">הוא</span> הנקודות
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
          מנחשים מי ינצח. צדקת — מקבלים את היחס כנקודות. טעית — אפס. זה כל
          הכלל, ואין תת-סעיפים.
        </p>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-5">
        <div className="card-kickoff flex flex-col gap-4 lg:col-span-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold">אותו משחק, שלושה ניחושים</h3>
            <p className="text-sm text-muted-foreground">
              ככל שהניחוש פחות צפוי, כך הוא שווה יותר. זה מה שהופך משחק
              &quot;משעמם&quot; להזדמנות.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {EXAMPLES.map((example) => (
              <div key={example.pick} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-bold">{example.pick}</span>
                  <span className="shrink-0 text-sm font-black text-primary">
                    {example.odds} נק׳
                  </span>
                </div>

                {/* Width is the score itself, not a design choice — the longest
                    bar is the biggest number, and that is the entire message. */}
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(example.odds / top) * 100}%` }}
                  />
                </div>

                <span className="text-[11px] text-muted-foreground">{example.note}</span>
              </div>
            ))}
          </div>

          <p className="rounded-2xl bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground">
            היחס מוקפא ברגע הניחוש. אם המחיר זז אחר כך — הניקוד שלכם כבר נקבע,
            ואי אפשר לשנות אותו בדיעבד.
          </p>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="card-kickoff flex flex-col gap-3 border-2 border-amber-500/30">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                🎯
              </span>
              <h3 className="text-lg font-bold">תוצאה מדויקת</h3>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-black text-amber-500">
                ×{EXACT_SCORE_MULTIPLIER} בונוס
              </span>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              לצד ניחוש המנצחת אפשר לנחש גם את התוצאה. פגעתם בשתיהן — פי{" "}
              {EXACT_SCORE_MULTIPLIER}. פגעתם רק במנצחת — הניקוד המלא הרגיל.
            </p>

            <div className="flex items-center justify-center gap-3 rounded-2xl bg-secondary/60 p-3">
              <span className="text-lg font-black text-primary">7.15</span>
              <span className="text-muted-foreground" aria-hidden>
                ←
              </span>
              <span className="text-2xl font-black text-amber-500">
                {round2(7.15 * EXACT_SCORE_MULTIPLIER)}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              פספוס בתוצאה לא עולה כלום — ולכן אין שום סיבה לא לנסות.
            </p>
          </div>

          <div className="grid gap-2">
            {NOT_THIS.map((item) => (
              <div key={item.title} className="card-kickoff flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <item.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
