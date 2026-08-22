import {
  Bell,
  Gamepad2,
  Globe2,
  Medal,
  Palette,
  Radio,
  Settings2,
  Smartphone,
  Star,
  Trophy,
} from "lucide-react";
import { ThemeSwatches } from "@/components/landing/theme-swatches";

/**
 * Everything the product actually does, in the order someone meets it.
 *
 * Only shipped features are listed. A landing page that promises a screen
 * which does not exist is a bug report waiting to be filed on the first day.
 */
const FEATURES = [
  {
    icon: Radio,
    title: "תוצאות חיות",
    body: "המשחק רץ, התוצאה זזה על המסך, ולידה כמה נקודות הניחוש שלכם מרוויח כרגע. אותה נוסחה שתזכה אתכם בסוף.",
  },
  {
    icon: Star,
    title: "בחירת העורך",
    body: "אדמין הליגה מסמן משחק אחד בשבוע ומצמיד לו בונוס באחוזים. אותו משחק, יותר על הכף, לכולם.",
  },
  {
    icon: Gamepad2,
    title: "האתגר היומי",
    body: "שני מועדונים — מצאו שחקן ששיחק בשניהם. שלושה ניסיונות, 5/3/1 נקודות. בנק של 141 פאזלים ו-4,310 שחקנים.",
  },
  {
    icon: Medal,
    title: "הישגים",
    body: "ניחוש ראשון, רצף פגיעות, היחס הגבוה ביותר שצדקתם עליו. נפתחים לבד מהנתונים שכבר נצברו.",
  },
  {
    icon: Bell,
    title: "התראות",
    body: "הניחוש עובד, מישהו הצטרף לליגה, נפתח הישג חדש — הכול במקום אחד, בלי מייל ובלי קבוצת ווטסאפ.",
  },
  {
    icon: Settings2,
    title: "ניהול ליגה",
    body: "מגדירים פרסים למקומות הראשונים, בוחרים משחק מודגש, ורואים מי הצטרף. הכול מתוך הליגה עצמה.",
  },
  {
    icon: Globe2,
    title: "ליגות ציבוריות",
    body: "אין לכם ארגון? יש ליגות פתוחות לכל אחד, אחת לכל טורניר. נכנסים ומתחילים לנחש עוד היום.",
  },
  {
    icon: Smartphone,
    title: "בנוי לנייד",
    body: "טאב-בר תחתון, כפתורים בגודל אצבע ומצב כהה. שום דבר להתקין — זה אתר, והוא נפתח בדפדפן.",
  },
] as const;

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
      <div className="flex flex-col gap-2 text-center">
        <span className="section-label">מה יש בפנים</span>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          כל מה שליגת ניחושים צריכה
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
          ליגה, לוחות תוצאות, אתגר יומי והתראות — בלי גיליון אקסל ובלי מישהו
          שצריך לזכור לעדכן אותו.
        </p>
      </div>

      {/* The two tables lead, and get the width: which one counts what is the
          question every new member asks in their first week. */}
      <div className="mt-10 card-kickoff flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold">שני לוחות תוצאות</h3>
          <p className="text-sm text-muted-foreground">
            אחד לליגה שלכם, אחד לכל האתר — ובכוונה הם לא סופרים את אותו הדבר.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
            <span className="flex items-center gap-2 font-bold">
              <Trophy className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              דירוג הליגה
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              רק ניחושי &quot;מי ינצח&quot;, ורק מרגע שהצטרפתם. נשאר פשוט בכוונה —
              מי שלא מבין ב-Over/Under לא נשאר מאחור.
            </p>
            <span className="mt-auto w-fit rounded-full bg-background px-3 py-1 text-[11px] font-bold text-muted-foreground">
              חברי הליגה בלבד
            </span>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border-2 border-border bg-secondary/40 p-4">
            <span className="flex items-center gap-2 font-bold">
              <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              לידרבורד האתר
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              שלושת סוגי השאלות והאתגר היומי, מאז ההרשמה. כאן נמדד העומק — מול
              כל מי שמשחק, מכל הארגונים.
            </p>
            <span className="mt-auto w-fit rounded-full bg-background px-3 py-1 text-[11px] font-bold text-muted-foreground">
              כל המשתמשים
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="card-kickoff flex flex-col gap-2 transition-shadow hover:shadow-elevated"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <feature.icon className="h-5 w-5 text-primary" aria-hidden />
            </span>
            <h3 className="font-bold">{feature.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </div>

      {/* Last, and interactive: the swatches change the page you are reading. */}
      <div className="mt-4 card-kickoff flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 font-bold">
            <Palette className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            אחת עשרה ערכות צבע
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            צבעי המועדון שלכם על כל האתר. בחרו אחת — הדף הזה ישנה צבע עכשיו,
            וההעדפה תישמר לפעם הבאה.
          </p>
        </div>

        <ThemeSwatches />
      </div>
    </section>
  );
}
