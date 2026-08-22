import Link from "next/link";
import { Ban, Rocket, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FixturePreview } from "@/components/landing/fixture-preview";
import { THEME_COLORS } from "@/lib/theme-colors";
import type { LandingGame } from "@/lib/landing/fixtures";

/**
 * The gate. A visitor arriving here knows nothing, so the fold has to answer
 * three things at once: what this is, what it costs them, and what it looks
 * like. The words handle the first two; <FixturePreview> handles the third.
 *
 * The backdrop follows `--primary`, so it repaints with whichever of the
 * colour themes the visitor has chosen — a hero with its own hard-coded
 * gradient would be the one part of the site the picker could not reach.
 */
const TRUST = [
  { icon: Ban, text: "בלי כסף ובלי הימור" },
  { icon: Wifi, text: "בלי התקנה — נפתח בדפדפן" },
  { icon: Rocket, text: "דקה להקמת ליגה" },
] as const;

const STATS = [
  { value: "7", label: "תחרויות" },
  { value: "3", label: "שאלות לכל משחק" },
  { value: "141", label: "אתגרים יומיים" },
  { value: String(THEME_COLORS.length - 1), label: "ערכות צבע" },
] as const;

export function Hero({ games }: { games: LandingGame[] }) {
  return (
    <section className="relative overflow-hidden">
      {/* Decoration only, and inert: two pools of the accent colour and a
          corner of pitch markings, fading into the page before the content
          below starts. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute start-[-10%] top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute end-[-12%] top-[-6rem] h-[26rem] w-[26rem] rounded-full bg-accent/10 blur-3xl" />

        <svg
          viewBox="0 0 400 400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="absolute end-[-6rem] top-[-6rem] h-[26rem] w-[26rem] text-primary/10"
        >
          <circle cx="200" cy="200" r="190" />
          <circle cx="200" cy="200" r="66" />
          <line x1="10" y1="200" x2="390" y2="200" />
          <rect x="200" y="110" width="170" height="180" />
          <rect x="200" y="155" width="72" height="90" />
        </svg>

        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-6 pt-14 sm:pb-10 sm:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col gap-6">
            <span className="animate-fade-in-up w-fit rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-black text-primary">
              ליגת הניחושים של הארגון שלך
            </span>

            <h1
              className="animate-fade-in-up text-4xl font-black leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl"
              style={{ animationDelay: "60ms" }}
            >
              הליגה של המשרד
              <br />
              מתחילה ב<span className="text-primary">ניחוש אחד</span>
            </h1>

            <p
              className="animate-fade-in-up max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
              style={{ animationDelay: "120ms" }}
            >
              פותחים ליגה, מזמינים את הצוות בקוד, וכל אחד מנחש תוצאות של משחקי
              כדורגל אמיתיים. הטבלה מתעדכנת לבד — יש על מה לדבר כל שבוע, בלי
              לגזול דקה מיום העבודה.
            </p>

            <div
              className="animate-fade-in-up flex flex-wrap gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <Button size="xl" variant="cta" className="w-full sm:w-auto" asChild>
                <Link href="/signup">פתיחת חשבון — חינם</Link>
              </Button>
              <Button
                size="xl"
                variant="outline"
                className="w-full font-bold sm:w-auto"
                asChild
              >
                <Link href="/login">כבר יש לי חשבון</Link>
              </Button>
            </div>

            <ul
              className="animate-fade-in-up flex flex-wrap gap-x-5 gap-y-2"
              style={{ animationDelay: "240ms" }}
            >
              {TRUST.map((item) => (
                <li
                  key={item.text}
                  className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <FixturePreview games={games} />
          </div>
        </div>

        <dl
          className="animate-fade-in-up mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4"
          style={{ animationDelay: "360ms" }}
        >
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="card-kickoff flex flex-col items-center gap-0.5 py-4"
            >
              <dt className="sr-only">{stat.label}</dt>
              <dd className="flex flex-col items-center gap-0.5">
                <span className="text-2xl font-black text-primary">{stat.value}</span>
                <span className="text-center text-xs text-muted-foreground">
                  {stat.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
