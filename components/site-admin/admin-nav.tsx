"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Trophy, Users } from "lucide-react";

const TABS = [
  { href: "/admin", icon: LayoutDashboard, label: "סקירה", exact: true },
  { href: "/admin/users", icon: Users, label: "משתמשים", exact: false },
  { href: "/admin/games", icon: CalendarDays, label: "משחקים", exact: false },
  { href: "/admin/leagues", icon: Trophy, label: "ליגות", exact: false },
] as const;

/**
 * The dashboard's own navigation. Client-side because the active tab depends
 * on the path — the same reason the app's tab bar is.
 *
 * "סקירה" matches exactly: every other route starts with /admin too, so a
 * prefix test would light it up on all of them.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {TABS.map(({ href, icon: Icon, label, exact }) => {
        const isActive = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
