import Link from "next/link";
import { Button } from "@/components/ui/button";

/** The same two actions as the header, at the point someone has read enough. */
export function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-20">
      <div className="card-kickoff relative overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent"
        />

        <div className="relative flex flex-col items-center gap-5">
          <h2 className="max-w-xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            המשחק הבא כבר בלוח. חבל לפספס אותו.
          </h2>

          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            ההרשמה לוקחת פחות מדקה, ואפשר להתחיל לנחש עוד לפני שפתחתם ליגה —
            יש ליגות ציבוריות פתוחות לכולם.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <Button size="xl" variant="cta" asChild>
              <Link href="/signup">פתיחת חשבון — חינם</Link>
            </Button>
            <Button size="xl" variant="outline" className="font-bold" asChild>
              <Link href="/login">התחברות</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
