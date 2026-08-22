import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Coins,
  Gamepad2,
  Radio,
  Target,
  Ticket,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/site-admin/stat-card";
import { GameStatusBadge } from "@/components/site-admin/game-status-badge";
import { SettleGameDialog } from "@/components/site-admin/settle-game-dialog";
import { FixtureLabel } from "@/components/shared/fixture";
import { formatDateTime, formatNumber, formatPoints } from "@/lib/format";

/**
 * The landing screen: what the product looks like right now, and the one
 * queue that needs somebody to act.
 *
 * Every number comes from admin_overview() in a single round trip rather than
 * a count query per card — seventeen counters over five tables would otherwise
 * be seventeen requests.
 */
export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [{ data: overview, error }, { data: newest }, { data: awaiting }] =
    await Promise.all([
      supabase.rpc("admin_overview"),
      supabase.rpc("admin_list_users", { p_limit: 5 }),
      supabase.rpc("admin_list_games", { p_status: "unsettled", p_limit: 5 }),
    ]);

  const stats = overview?.[0];

  if (error || !stats) {
    return (
      <p className="card-kickoff text-center text-sm text-muted-foreground">
        לא ניתן לטעון את נתוני האתר כרגע.
      </p>
    );
  }

  const decided = stats.predictions_correct + stats.predictions_incorrect;
  const accuracy = decided ? Math.round((stats.predictions_correct / decided) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">🛡️ ניהול אתר</span>
        <h1 className="text-2xl font-black leading-tight md:text-3xl">סקירה כללית</h1>
        <p className="text-sm text-muted-foreground">
          כל המשתמשים, כל המשחקים וכל הליגות — במבט אחד.
        </p>
      </div>

      {stats.games_awaiting > 0 && (
        <Link
          href="/admin/games?status=unsettled"
          className="card-kickoff flex items-center gap-3 border border-destructive/30 py-3 transition-colors hover:bg-secondary/60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-bold">
              {formatNumber(stats.games_awaiting)} משחקים ממתינים לעיבוד
            </span>
            <span className="text-xs text-muted-foreground">
              משחקים שהתחילו ועדיין לא נוקדו. אם המספר לא יורד — בדקו את הסנכרון מהספק.
            </span>
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="משתמשים"
          value={formatNumber(stats.users_total)}
          hint={`${formatNumber(stats.users_new_today)} היום · ${formatNumber(stats.users_new_30d)} ב-30 יום`}
        />
        <StatCard
          icon={Ticket}
          label="ניחושים"
          value={formatNumber(stats.predictions_total)}
          hint={`${formatNumber(stats.predictions_pending)} ממתינים`}
        />
        <StatCard
          icon={Target}
          label="אחוז פגיעה"
          value={`${accuracy}%`}
          hint={`${formatNumber(stats.predictions_correct)} מתוך ${formatNumber(decided)} שעובדו`}
        />
        <StatCard
          icon={Coins}
          label="נקודות שחולקו"
          value={formatPoints(stats.points_awarded)}
        />
        <StatCard
          icon={Trophy}
          label="ליגות פרטיות"
          value={formatNumber(stats.leagues_private)}
          hint={`${formatNumber(stats.leagues_total)} כולל ציבוריות · ${formatNumber(stats.leagues_archived)} בארכיון`}
        />
        <StatCard
          icon={UserPlus}
          label="חברויות בליגות פרטיות"
          value={formatNumber(stats.members_private)}
        />
        <StatCard
          icon={CalendarDays}
          label="משחקים קרובים"
          value={formatNumber(stats.games_upcoming)}
          hint={`${formatNumber(stats.games_total)} במאגר`}
        />
        <StatCard
          icon={Radio}
          label="משחקים חיים"
          value={formatNumber(stats.games_live)}
        />
        <StatCard
          icon={AlertTriangle}
          label="ממתינים לעיבוד"
          value={formatNumber(stats.games_awaiting)}
          tone={stats.games_awaiting > 0 ? "alert" : "default"}
        />
        <StatCard
          icon={Gamepad2}
          label="ניסיונות באתגר היומי"
          value={formatNumber(stats.puzzle_attempts_today)}
          hint="היום, שעון ישראל"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-kickoff flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">משתמשים אחרונים</h2>
            <Link href="/admin/users" className="text-xs font-bold text-primary">
              לכל המשתמשים
            </Link>
          </div>

          {(newest ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">אין עדיין משתמשים.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {(newest ?? []).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="flex min-w-0 flex-col hover:underline"
                  >
                    <span className="truncate text-sm font-bold" dir="auto">
                      {u.display_name ?? u.username}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
                      {u.email ?? u.username}
                    </span>
                  </Link>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateTime(u.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-kickoff flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">ממתינים לעיבוד</h2>
            <Link
              href="/admin/games?status=unsettled"
              className="text-xs font-bold text-primary"
            >
              לכל המשחקים
            </Link>
          </div>

          {(awaiting ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין משחקים שהתחילו וטרם עברו עיבוד. הכול מסונכרן.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {(awaiting ?? []).map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <FixtureLabel
                      home={g.home_team}
                      away={g.away_team}
                      className="truncate text-sm font-bold"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(g.kickoff_at)} · {formatNumber(g.prediction_count)} ניחושים
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <GameStatusBadge status={g.status} settledAt={g.settled_at} />
                    <SettleGameDialog
                      gameId={g.id}
                      homeTeam={g.home_team}
                      awayTeam={g.away_team}
                      scoreHome={g.score_home}
                      scoreAway={g.score_away}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
