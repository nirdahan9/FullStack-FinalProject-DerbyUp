import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/site-admin/admin-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "DerbyUp Admin",
  // Nothing here should ever reach a search result.
  robots: { index: false, follow: false },
};

/**
 * Shell for the site-wide dashboard, deliberately outside the (app) group:
 * no bottom tab bar, no points pill, and a header that says which product
 * you are in. An operator looking at every user's email should be able to
 * tell at a glance that this is not the app.
 *
 * The gate here is one of two. It decides what is rendered; the other is in
 * Postgres, where every function this dashboard calls checks
 * is_site_admin() for itself. A mistake in this file changes what a page
 * shows, not what the database is willing to return.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_site_admin");

  // A signed-in user who is not an operator is told so rather than silently
  // bounced: the only way to land here without the shield button is to type
  // the URL, and a redirect would leave that person wondering what happened.
  if (!isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
          <ShieldX className="h-7 w-7 text-destructive" />
        </span>
        <h1 className="text-xl font-black">אין לך הרשאה להיכנס לכאן</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          אזור הניהול פתוח למנהלי האתר בלבד.
        </p>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          חזרה לאפליקציה
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="safe-area-top sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary">
              <ShieldCheck className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="text-sm font-black leading-none tracking-tight md:text-lg">
              DerbyUp Admin
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold transition-colors hover:bg-secondary/70"
            >
              חזרה לאפליקציה
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 pt-4 md:px-8">
        <AdminNav />
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 md:px-8">
        {children}
      </main>

      <Toaster position="top-center" richColors />
    </div>
  );
}
