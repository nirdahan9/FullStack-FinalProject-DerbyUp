import Image from "next/image";
import Link from "next/link";

/**
 * Deliberately thin. The footer of a landing page whose only two actions are
 * "sign up" and "log in" has no business carrying a sitemap.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-secondary/30 safe-area-bottom">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Image
            src="/kickoff_logo_cropped.png"
            alt=""
            width={28}
            height={28}
            className="h-6 w-auto"
          />
          <div>
            <p className="font-black tracking-tight">DerbyUp</p>
            <p className="text-xs text-muted-foreground">ניחושי כדורגל לארגונים</p>
          </div>
        </div>

        <nav className="flex items-center gap-4 text-sm font-bold">
          <Link href="#how" className="text-muted-foreground hover:text-primary">
            איך זה עובד
          </Link>
          <Link href="#faq" className="text-muted-foreground hover:text-primary">
            שאלות נפוצות
          </Link>
          <Link href="/login" className="text-muted-foreground hover:text-primary">
            התחברות
          </Link>
          <Link href="/signup" className="text-primary hover:underline">
            פתיחת חשבון
          </Link>
        </nav>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-8">
        <p className="text-xs leading-relaxed text-muted-foreground">
          נתוני המשחקים, התוצאות והיחסים מגיעים מ-API-Football. DerbyUp אינו אתר
          הימורים: אין בו כסף, אין יתרה ואין אפשרות להפסיד נקודות.
        </p>
      </div>
    </footer>
  );
}
