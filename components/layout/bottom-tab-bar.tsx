"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Gamepad2, Home, Trophy } from "lucide-react";

const TABS = [
  { href: "/dashboard", icon: Home, label: "בית" },
  { href: "/games", icon: CalendarDays, label: "משחקים" },
  { href: "/leagues", icon: Trophy, label: "ליגות" },
  { href: "/challenge", icon: Gamepad2, label: "אתגרים" },
] as const;

/**
 * The three-tab bar from the DerbyUp app. Client-side only because the active
 * tab depends on the current path.
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
              className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-200 ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
