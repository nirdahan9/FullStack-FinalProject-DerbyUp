import Image from "next/image";
import Link from "next/link";
import { Bell, User } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

/**
 * Mirrors the DerbyUp app bar: mark on the right, controls on the left.
 *
 * The language switch from the original is gone — this build is Hebrew only —
 * and the points pill shows total_points, since there is no balance to spend.
 */
export function TopBar({
  displayName,
  totalPoints,
  avatarUrl,
}: {
  displayName: string;
  totalPoints: number;
  avatarUrl: string | null;
}) {
  const initial = (displayName.trim()[0] ?? "?").toUpperCase();

  return (
    <header className="safe-area-top sticky top-0 z-40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-3 md:max-w-4xl md:px-8 lg:max-w-6xl">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-1.5">
          <Image
            src="/kickoff_logo_cropped.png"
            alt=""
            width={24}
            height={24}
            className="h-[18px] w-auto md:h-5"
            priority
          />
          <span className="text-sm font-black leading-none tracking-tight md:text-xl">
            DerbyUp
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <ThemeToggle />

          <Link
            href="/notifications"
            aria-label="התראות"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-secondary/80 md:h-9 md:w-9"
          >
            <Bell size={15} className="text-foreground" />
          </Link>

          <div className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 md:px-3 md:py-1.5">
            <span className="text-[10px] md:text-sm">🪙</span>
            <span className="text-[10px] font-black md:text-sm">
              {totalPoints.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
            </span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">נקודות</span>
          </div>

          <Link
            href="/profile"
            aria-label="הפרופיל שלי"
            className="h-8 w-8 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/40 transition-all hover:ring-primary active:scale-95 md:h-9 md:w-9"
          >
            {avatarUrl ? (
              // Avatars can come from any host a user pastes in, so next/image
              // is skipped here rather than allow-listing arbitrary domains in
              // remotePatterns — which would let anyone route traffic through
              // our optimiser. They render at 36px, so nothing is saved by it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-primary text-xs font-black text-primary-foreground">
                {initial === "?" ? <User size={14} /> : initial}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
