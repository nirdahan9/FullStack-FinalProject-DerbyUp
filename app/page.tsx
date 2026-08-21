import { Trophy, Target, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Temporary landing page for stage 0. Its only job is to prove the design
 * system carried over: Heebo, the DerbyUp green, the 24px radius, the
 * card-kickoff surface, RTL layout, and both colour schemes.
 * The real landing page is built in a later stage.
 */
export default function Home() {
  return (
    <main className="min-h-dvh bg-background px-5 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="section-label">RUNI CS 2026</span>
            <h1 className="text-3xl font-black text-foreground">DerbyUp</h1>
          </div>
          <ThemeToggle />
        </header>

        <section className="card-kickoff flex flex-col gap-4 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Trophy className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground">ניחושי כדורגל לארגונים</h2>
              <p className="text-sm text-muted-foreground">
                פותחים ליגה, מזמינים את העובדים, ומנחשים תוצאות אמיתיות
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-foreground">
            מנחשים מי ינצח. צדקת — מקבל את היחס כנקודות. ניחוש נכון ביחס{" "}
            <span className="font-bold text-primary">7.15</span> שווה{" "}
            <span className="font-bold text-primary">7.15 נקודות</span>. אין הימור, אין
            יתרה, אין הפסד.
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge>ליגות ארגוניות</Badge>
            <Badge variant="secondary">יחסים אמיתיים</Badge>
            <Badge variant="outline">יישוב אוטומטי</Badge>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="card-kickoff flex items-start gap-3">
            <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-bold text-foreground">דירוג הליגה</h3>
              <p className="text-sm text-muted-foreground">רק ניחושי מנצח, בטורניר של הליגה</p>
            </div>
          </div>
          <div className="card-kickoff flex items-start gap-3">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-bold text-foreground">לידרבורד האתר</h3>
              <p className="text-sm text-muted-foreground">כל סוגי הניחוש והאתגר היומי</p>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Button size="lg">התחלה</Button>
          <Button size="lg" variant="outline">
            מידע נוסף
          </Button>
          <Button size="lg" variant="secondary">
            כפתור משני
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          שלב 0 · מערכת העיצוב הועתקה מ־bet-joy-league-hub
        </p>
      </div>
    </main>
  );
}
