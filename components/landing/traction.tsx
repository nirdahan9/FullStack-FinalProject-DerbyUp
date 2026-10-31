import { ORIGIN_ENGINEERING, ORIGIN_PEAK, ORIGIN_SCALE } from "@/lib/original-product";

/**
 * The numbers the original product actually produced.
 *
 * Every figure here was counted against the production database in the week it
 * was shut down, not estimated and not rounded up. That is the whole point of
 * the section: anyone can claim traction, and a number that survives being
 * counted is worth more than an adjective.
 *
 * Three groups, because they answer three different questions: how big did it
 * get, what did it look like under real load, and how much was actually built.
 * The peak group carries a note under each figure, since "1,325 users" means
 * nothing without "in one week, during the World Cup".
 */
const GROUPS = [
  { label: "בסך הכול", rows: ORIGIN_SCALE, notes: false },
  { label: "בשיא", rows: ORIGIN_PEAK, notes: true },
  { label: "היקף הנדסי", rows: ORIGIN_ENGINEERING, notes: false },
] as const;

export function Traction() {
  return (
    <section id="traction" className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
      <div className="flex flex-col gap-2 text-center">
        <span className="section-label">מה המוצר המקורי עשה</span>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          מספרים שנספרו, לא הוערכו
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
          כל מספר כאן נמדד ישירות מול מסד הנתונים של הפרודקשן בשבוע שבו המוצר
          נסגר.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-8">
        {GROUPS.map((group, groupIndex) => (
          <div key={group.label} className="flex flex-col gap-3">
            <span className="section-label">{group.label}</span>

            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {group.rows.map((row, index) => (
                <div
                  key={row.label}
                  className="card-kickoff flex animate-fade-in-up flex-col gap-1"
                  style={{ animationDelay: `${groupIndex * 120 + index * 60}ms` }}
                >
                  <dt className="order-2 text-xs font-bold leading-snug text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="order-1 text-2xl font-black tabular-nums tracking-tight sm:text-3xl">
                    {row.value}
                  </dd>
                  {group.notes && "note" in row ? (
                    <dd className="order-3 text-[11px] leading-snug text-muted-foreground/70">
                      {row.note}
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
