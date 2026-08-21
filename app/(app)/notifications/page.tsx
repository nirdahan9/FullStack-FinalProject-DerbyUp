import Link from "next/link";
import { Bell, Target, Trophy, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/shared/empty-state";
import { MarkReadButton } from "@/components/layout/mark-read-button";

const ICONS = {
  prediction_settled: Target,
  achievement: Trophy,
  league_joined: Users,
  puzzle_available: Bell,
} as const;

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "אתמול" : `לפני ${days} ימים`;
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS restricts this to the caller's own rows.
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, link_url, read_at, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = notifications ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="section-label">מה קרה</span>
          <h1 className="text-3xl font-black leading-tight">
            התראות
            {unread > 0 && (
              <span className="ms-2 align-middle text-base font-bold text-primary">
                {unread} חדשות
              </span>
            )}
          </h1>
        </div>
        {rows.length > 0 && <MarkReadButton disabled={unread === 0} />}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="אין התראות"
          body="כשמשחק שניחשתם בו יסתיים, תקבלו כאן עדכון עם הנקודות."
          action={{ href: "/games", label: "אל המשחקים" }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((n) => {
            const Icon = ICONS[n.type as keyof typeof ICONS] ?? Bell;
            const isUnread = !n.read_at;

            const content = (
              <div
                className={`card-kickoff flex items-start gap-3 py-3 ${
                  isUnread ? "border border-primary/30 bg-primary/5" : ""
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <Icon className="h-4 w-4 text-primary" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-bold" dir="auto">
                    {n.title}
                    {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </span>
                  {n.body && (
                    <span className="text-xs text-muted-foreground" dir="auto">{n.body}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                </div>
              </div>
            );

            return n.link_url ? (
              <Link key={n.id} href={n.link_url} className="transition-opacity hover:opacity-90">
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
