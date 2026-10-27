import { Building2, CalendarRange, Radio } from "lucide-react";
import { ORIGIN_CUSTOMERS, ORIGIN_PERIOD } from "@/lib/original-product";

/**
 * The honest framing of what this project is.
 *
 * This repository is a rebuild. The product it rebuilds shipped, ran in
 * production for seven months, and was shut down in October 2026. Saying that
 * plainly is better than implying this build carried the users itself — and the
 * rebuild is more interesting once you know what it was rebuilding.
 *
 * The section deliberately leads with the shutdown rather than burying it. A
 * product that ran and ended is a stronger story than one that is vaguely
 * "live", and a visitor who later discovers the app store links are dead should
 * not feel misled.
 */
const FACTS = [
  {
    icon: CalendarRange,
    title: "שבעה חודשים באוויר",
    body: `מ-${ORIGIN_PERIOD.from} ועד ${ORIGIN_PERIOD.to}. המונדיאל היה השיא, וגם מה ששבר את מודל ההכנסה — אחרי הטורניר השימוש צנח ולא חזר.`,
  },
  {
    icon: Building2,
    title: "ליגות בתוך חברות",
    body: `${ORIGIN_CUSTOMERS.join(" · ")}. ארגון פתח ליגה פנימית, העובדים שיחקו בחינם, והליגה רצה ברקע כל שבוע בלי שאף אחד ניהל אותה.`,
  },
  {
    icon: Radio,
    title: "לא רק אפליקציה",
    body: "חוץ מ-iOS, אנדרואיד ואתר, הניחושים עבדו גם מתוך קבוצת וואטסאפ או טלגרם — בלי לצאת מהצ׳אט שבו החברים ממילא מתווכחים.",
  },
] as const;

export function OriginStory() {
  return (
    <section id="origin" className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
      <div className="flex flex-col gap-2 text-center">
        <span className="section-label">מאיפה זה הגיע</span>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          הפרויקט הזה הוא בנייה מחדש של מוצר אמיתי
        </h2>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground">
          DerbyUp רץ בפרודקשן כשבעה חודשים, פורסם בשתי חנויות האפליקציות, ושימש
          עובדים בחברות אמיתיות. הוא נסגר באוקטובר 2026. מה שרואים כאן נבנה מחדש
          על סטאק אחר — Next ו-Supabase במקום תהליך Node ארוך-חיים מול Postgres —
          כתרגיל בשאלה איך היה נראה אותו מוצר אילו נכתב מההתחלה היום.
        </p>
      </div>

      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {FACTS.map((fact, index) => (
          <li
            key={fact.title}
            className="card-kickoff flex animate-fade-in-up flex-col gap-3"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <fact.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h3 className="text-lg font-bold">{fact.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{fact.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
