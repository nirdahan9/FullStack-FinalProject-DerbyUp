import Image from "next/image";
import Link from "next/link";
import { Target, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Landing page. Still provisional — the business-value copy is written
 * properly once the product flows exist — but it now routes into auth.
 */
export default function Home() {
  return (
    <main className="min-h-dvh bg-background px-5 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/kickoff_logo_cropped.png"
              alt=""
              width={28}
              height={28}
              className="h-6 w-auto"
              priority
            />
            <span className="text-2xl font-black tracking-tight">DerbyUp</span>
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
          <Button size="lg" className="font-bold" asChild>
            <Link href="/signup">פתיחת חשבון</Link>
          </Button>
          <Button size="lg" variant="outline" className="font-bold" asChild>
            <Link href="/login">התחברות</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
