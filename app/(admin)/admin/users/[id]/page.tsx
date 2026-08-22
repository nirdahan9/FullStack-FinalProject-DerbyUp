import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { UserActions } from "@/components/site-admin/user-actions";
import { Badge } from "@/components/ui/badge";
import { FixtureLabel } from "@/components/shared/fixture";
import { formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const QUESTION_LABELS: Record<string, string> = {
  match_result: "מנצח",
  over_under_2_5: "סך שערים",
  btts: "שתיהן יבקיעו",
};

const OUTCOME_LABELS: Record<string, string> = {
  home: "מארחת",
  draw: "תיקו",
  away: "אורחת",
  over: "מעל 2.5",
  under: "מתחת 2.5",
  yes: "כן",
  no: "לא",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  correct: "פגיעה",
  incorrect: "החטאה",
  void: "בוטל (משחק)",
  cancelled: "בוטל (משתמש)",
};

/**
 * One account, end to end.
 *
 * The predictions table is here rather than on the list because it answers the
 * only question that reaches support: "why did I not get the points". The row
 * shows the pick, the odds it was locked at, the correct outcome and what it
 * paid — which between them explain every possible answer.
 */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: me }, { data: detail }, { data: leagues }, { data: predictions }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("admin_user_detail", { p_user_id: id }),
      supabase.rpc("admin_user_leagues", { p_user_id: id }),
      supabase.rpc("admin_user_predictions", { p_user_id: id, p_limit: 50 }),
    ]);

  const profile = detail?.[0];
  if (!profile) notFound();

  const name = profile.display_name ?? profile.username;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/users"
        className="flex items-center gap-1 self-start text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
      >
        חזרה לרשימה
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <section className="card-kickoff flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="flex items-center gap-2 text-2xl font-black leading-tight" dir="auto">
              {name}
              {profile.is_site_admin && (
                <Badge className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  מנהל אתר
                </Badge>
              )}
            </h1>
            <span className="text-sm text-muted-foreground" dir="ltr">
              {profile.email ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground" dir="ltr">
              @{profile.username}
            </span>
          </div>

          <UserActions
            userId={profile.id}
            displayName={name}
            isAdmin={profile.is_site_admin}
            isSelf={profile.id === me.user?.id}
          />
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="נקודות" value={formatPoints(profile.total_points)} />
          <Fact label="ניחושים" value={formatNumber(profile.total_predictions)} />
          <Fact label="פגיעות" value={formatNumber(profile.total_correct)} />
          <Fact label="נרשם" value={formatDateTime(profile.created_at)} />
        </dl>
      </section>

      <section className="card-kickoff flex flex-col gap-3">
        <h2 className="font-bold">ליגות</h2>
        {(leagues ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">המשתמש אינו חבר באף ליגה.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {(leagues ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold" dir="auto">
                    {l.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    הצטרף {formatDateTime(l.joined_at)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {l.is_creator && <Badge variant="secondary">מנהל הליגה</Badge>}
                  {l.status === "archived" && <Badge variant="outline">ארכיון</Badge>}
                  <Badge variant={l.is_public ? "outline" : "default"}>
                    {l.is_public ? "ציבורית" : "פרטית"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-kickoff flex flex-col gap-3 p-0">
        <h2 className="px-5 pt-5 font-bold">50 הניחושים האחרונים</h2>

        {(predictions ?? []).length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">
            המשתמש עדיין לא ניחש.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">משחק</TableHead>
                  <TableHead className="text-right">שאלה</TableHead>
                  <TableHead className="text-right">ניחוש</TableHead>
                  <TableHead className="text-right">יחס</TableHead>
                  <TableHead className="text-right">תוצאה נכונה</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right">נקודות</TableHead>
                  <TableHead className="text-right">נוחש</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {(predictions ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[200px]">
                      <Link
                        href={`/games/${p.game_id}`}
                        className="truncate text-sm font-bold hover:underline"
                      >
                        <FixtureLabel home={p.home_team} away={p.away_team} />
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {QUESTION_LABELS[p.question_type] ?? p.question_type}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-bold">
                      {OUTCOME_LABELS[p.selected_outcome] ?? p.selected_outcome}
                      {p.exact_score && (
                        <span className="text-muted-foreground" dir="ltr">
                          {" "}
                          ({p.exact_score})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm" dir="ltr">
                      {Number(p.odds).toFixed(2)}
                      {p.bonus_pct > 0 && (
                        <span className="text-primary"> +{p.bonus_pct}%</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {p.correct_outcome
                        ? (OUTCOME_LABELS[p.correct_outcome] ?? p.correct_outcome)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "correct"
                            ? "default"
                            : p.status === "incorrect"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-bold">
                      {p.points_earned === null ? "—" : formatPoints(p.points_earned)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(p.predicted_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-secondary px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-black">{value}</dd>
    </div>
  );
}
