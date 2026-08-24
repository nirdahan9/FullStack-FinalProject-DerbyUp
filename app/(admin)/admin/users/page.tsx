import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminSearch } from "@/components/site-admin/admin-search";
import { UserActions } from "@/components/site-admin/user-actions";
import { SiteAdminsCard, type SiteAdminRow } from "@/components/site-admin/site-admins-card";
import { Pagination } from "@/components/shared/pagination";
import { formatDate, formatDateTime, formatNumber, formatPoints } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

/**
 * Every account in the product, newest first.
 *
 * Search covers username, display name and email, because those are the three
 * things a user identifies themselves by when they write in — and the email is
 * the only one of them that is unique and that they actually know.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const search = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // One row over the page size answers "is there a next page" without a
  // second count query. The operators list rides the same round trip.
  const [{ data: users, error }, { data: siteAdmins }] = await Promise.all([
    supabase.rpc("admin_list_users", {
      p_search: search || null,
      p_limit: PAGE_SIZE + 1,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("admin_list_site_admins"),
  ]);

  const rows = (users ?? []).slice(0, PAGE_SIZE);
  const hasNext = (users ?? []).length > PAGE_SIZE;
  const baseUrl = search ? `/admin/users?q=${encodeURIComponent(search)}` : "/admin/users";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">👥 משתמשים</span>
        <h1 className="text-2xl font-black leading-tight md:text-3xl">כל המשתמשים</h1>
      </div>

      {(siteAdmins ?? []).length > 0 && (
        <SiteAdminsCard admins={(siteAdmins ?? []) as SiteAdminRow[]} selfId={user!.id} />
      )}

      <AdminSearch
        basePath="/admin/users"
        initial={search}
        placeholder="חיפוש לפי שם, שם משתמש או אימייל"
      />

      {error ? (
        <p className="card-kickoff text-center text-sm text-muted-foreground">
          לא ניתן לטעון את רשימת המשתמשים כרגע.
        </p>
      ) : rows.length === 0 ? (
        <p className="card-kickoff text-center text-sm text-muted-foreground">
          {search ? "לא נמצאו משתמשים תואמים." : "אין עדיין משתמשים."}
        </p>
      ) : (
        <div className="card-kickoff overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">משתמש</TableHead>
                <TableHead className="text-right">נקודות</TableHead>
                <TableHead className="text-right">ניחושים</TableHead>
                <TableHead className="text-right">ליגות</TableHead>
                <TableHead className="text-right">ניחוש אחרון</TableHead>
                <TableHead className="text-right">הצטרף</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="max-w-[220px]">
                    <Link href={`/admin/users/${u.id}`} className="flex flex-col hover:underline">
                      <span className="flex items-center gap-1 truncate font-bold" dir="auto">
                        {u.display_name ?? u.username}
                        {u.is_site_admin && (
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground" dir="ltr">
                        {u.email ?? u.username}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="font-bold">{formatPoints(u.total_points)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatNumber(u.total_predictions)}
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatNumber(u.total_correct)} פגיעות
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{formatNumber(u.leagues_count)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(u.last_prediction_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(u.created_at)}
                  </TableCell>
                  <TableCell>
                    <UserActions
                      userId={u.id}
                      displayName={u.display_name ?? u.username}
                      isAdmin={u.is_site_admin}
                      isSelf={u.id === user!.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} hasNext={hasNext} baseUrl={baseUrl} />

      <p className="text-xs text-muted-foreground">
        מספר הליגות סופר ליגות פרטיות בלבד — כל משתמש חבר אוטומטית בכל הליגות הציבוריות.
      </p>
    </div>
  );
}
