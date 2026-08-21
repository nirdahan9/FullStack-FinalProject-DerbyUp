import Link from "next/link";
import { Trophy, Plus, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default async function LeaguesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS restricts this to leagues the user belongs to, so no filter by user is
  // needed here — and adding one would not make it any safer.
  const { data: memberships } = await supabase
    .from("league_members")
    .select("joined_at, leagues(id, name, description, competition_id, competitions(name, country))")
    .eq("user_id", user!.id)
    .order("joined_at", { ascending: false });

  const leagues = (memberships ?? []).flatMap((m) => (m.leagues ? [m.leagues] : []));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="section-label">התחרות שלך</span>
          <h1 className="text-3xl font-black leading-tight">הליגות שלי</h1>
        </div>
      </div>

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

      {leagues.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="אין לך עדיין ליגות"
          body="פתחו ליגה לארגון שלכם, או הצטרפו לאחת עם קוד הזמנה."
          action={{ href: "/leagues/new", label: "פתיחת ליגה" }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/leagues/${league.id}`}
              className="card-kickoff flex items-center gap-3 py-4 transition-colors hover:bg-secondary/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Trophy className="h-5 w-5 text-primary" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-bold" dir="auto">{league.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {league.competitions?.name}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
