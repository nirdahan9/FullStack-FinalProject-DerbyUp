import Link from "next/link";
import { Globe, LogIn, Plus, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type Tab = "mine" | "public";

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; left?: string }>;
}) {
  const { tab: tabParam, left } = await searchParams;
  const tab: Tab = tabParam === "public" ? "public" : "mine";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS limits this to leagues the user belongs to — which, since everyone is
  // enrolled in the public ones, is both lists at once.
  const { data: memberships } = await supabase
    .from("league_members")
    .select("joined_at, leagues(id, name, description, is_public, status, competitions(name))")
    .eq("user_id", user!.id)
    .order("joined_at", { ascending: false });

  const all = (memberships ?? []).flatMap((m) => (m.leagues ? [m.leagues] : []));
  const mine = all.filter((l) => !l.is_public);
  const publics = all.filter((l) => l.is_public);
  const shown = tab === "public" ? publics : mine;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "mine", label: "הליגות שלי", count: mine.length },
    { key: "public", label: "ליגות ציבוריות", count: publics.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">התחרות שלך</span>
        <h1 className="text-3xl font-black leading-tight">ליגות</h1>
      </div>

      {left && (
        <p className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
          עזבת את הליגה.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "public" ? "/leagues?tab=public" : "/leagues"}
            scroll={false}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className={`text-[11px] ${tab === t.key ? "opacity-80" : "opacity-60"}`}>
              {t.count}
            </span>
          </Link>
        ))}
      </div>

      {tab === "mine" && (
        <div className="flex gap-2">
          <Button asChild className="flex-1 font-bold">
            <Link href="/leagues/new">
              <Plus className="h-4 w-4" />
              ליגה חדשה
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 font-bold">
            <Link href="/join">
              <LogIn className="h-4 w-4" />
              הצטרפות בקוד
            </Link>
          </Button>
        </div>
      )}

      {tab === "public" && (
        <p className="rounded-2xl bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          כל משתמשי DerbyUp מתחרים בליגות האלה. ההצטרפות אוטומטית — אחת לכל
          טורניר, כדי שתמיד יהיה על מה לנחש.
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="אין לך עדיין ליגות פרטיות"
          body="פתחו ליגה לארגון שלכם, או הצטרפו לאחת עם קוד הזמנה. בינתיים אפשר לנחש בליגות הציבוריות."
          action={{ href: "/leagues/new", label: "פתיחת ליגה" }}
          secondaryAction={{ href: "/join", label: "הצטרפות בקוד" }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((league) => (
            <Link
              key={league.id}
              href={`/leagues/${league.id}`}
              className="card-kickoff flex items-center gap-3 py-4 transition-colors hover:bg-secondary/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                {league.is_public ? (
                  <Globe className="h-5 w-5 text-primary" />
                ) : (
                  <Trophy className="h-5 w-5 text-primary" />
                )}
              </span>

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-bold" dir="auto">{league.name}</span>
                <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Users className="h-3 w-3 shrink-0" />
                  {league.competitions?.name}
                  {league.status === "archived" && " · הסתיימה"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
