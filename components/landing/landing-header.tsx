import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * The landing page's own bar. The app has <TopBar>, but that one belongs to a
 * signed-in session — it carries the notification bell and the profile — so
 * the two share a look rather than a component.
 *
 * Sticky and translucent: the fixture card and the scoring example are the
 * things worth scrolling to, and the way back to "פתיחת חשבון" should not be
 * one of them.
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl safe-area-top">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-5">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/kickoff_logo_cropped.png"
            alt=""
            width={32}
            height={32}
            className="h-7 w-auto"
            priority
          />
          <span className="text-xl font-black tracking-tight">DerbyUp</span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" className="hidden font-bold sm:inline-flex" asChild>
            <Link href="/login">התחברות</Link>
          </Button>
          <Button className="font-bold" asChild>
            <Link href="/signup">פתיחת חשבון</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
