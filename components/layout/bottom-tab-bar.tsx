"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Gamepad2, Globe, Home, Sparkles, Trophy } from "lucide-react";

const TABS = [
  { href: "/dashboard", icon: Home, label: "בית" },
  { href: "/games", icon: CalendarDays, label: "משחקים" },
  { href: "/advisor", icon: Sparkles, label: "יועץ" },
  { href: "/leagues", icon: Trophy, label: "ליגות" },
  { href: "/leaderboard", icon: Globe, label: "דירוג" },
  { href: "/challenge", icon: Gamepad2, label: "אתגרים" },
] as const;

/**
 * The tab bar from the DerbyUp app. Client-side only because the active tab
 * depends on the current path.
 *
 * Six entries rather than five since the advisor arrived. The labels drop to
 * 10px and the icons to 20 at the narrowest widths, which keeps every tap
 * target above 44px on a 360px screen — the point at which a sixth tab would
 * have had to displace one of the others instead.
 */
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-50 bg-card shadow-elevated">
      <div className="mx-auto flex h-16 max-w-xl items-center justify-around md:max-w-4xl lg:max-w-6xl">
        {TABS.map(({ href, icon: Icon, label }) => {
          // Nested routes keep their tab lit: /leagues/abc is still "ליגות".
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-200 ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon
                className="h-5 w-5 sm:h-[22px] sm:w-[22px]"
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className="text-[10px] font-medium sm:text-[11px]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
