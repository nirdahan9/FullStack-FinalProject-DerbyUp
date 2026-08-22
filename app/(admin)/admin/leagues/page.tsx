import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminSearch } from "@/components/site-admin/admin-search";
import { Pagination } from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/format";
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
 * Every league, private ones first — the public league per competition is
 * product furniture that everybody is in, while a private league is an
 * organisation that signed up and is the number worth watching.
 *
 * The name is not a link. A league page is readable by its members only, and
 * that policy holds for operators too: reading one means joining it with the
 * invite code shown here, which leaves a membership row behind rather than a
 * silent look at somebody's standings.
 */
export default async function AdminLeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const search = (q ?? "").trim();
  const page = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();
  const { data: leagues, error } = await supabase.rpc("admin_list_leagues", {
    p_search: search || null,
    p_limit: PAGE_SIZE + 1,
    p_offset: (page - 1) * PAGE_SIZE,
  });

  const rows = (leagues ?? []).slice(0, PAGE_SIZE);
  const hasNext = (leagues ?? []).length > PAGE_SIZE;
  const baseUrl = search
    ? `/admin/leagues?q=${encodeURIComponent(search)}`
    : "/admin/leagues";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">🏆 ליגות</span>
        <h1 className="text-2xl font-black leading-tight md:text-3xl">כל הליגות</h1>
      </div>

      <AdminSearch
        basePath="/admin/leagues"
        initial={search}
        placeholder="חיפוש לפי שם ליגה או שם מנהל"
      />

      {error ? (
        <p className="card-kickoff text-center text-sm text-muted-foreground">
          לא ניתן לטעון את רשימת הליגות כרגע.
        </p>
      ) : rows.length === 0 ? (
        <p className="card-kickoff text-center text-sm text-muted-foreground">
          {search ? "לא נמצאו ליגות תואמות." : "אין עדיין ליגות."}
        </p>
      ) : (
        <div className="card-kickoff overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">ליגה</TableHead>
                <TableHead className="text-right">טורניר</TableHead>
                <TableHead className="text-right">סוג</TableHead>
                <TableHead className="text-right">מנהל</TableHead>
                <TableHead className="text-right">חברים</TableHead>
                <TableHead className="text-right">קוד</TableHead>
                <TableHead className="text-right">נוצרה</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="max-w-[220px]">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-bold" dir="auto">
                        {l.name}
                      </span>
                      {l.status === "archived" && <Badge variant="outline">ארכיון</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                    {l.competition_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={l.is_public ? "outline" : "default"}>
                      {l.is_public ? "ציבורית" : "פרטית"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-sm" dir="auto">
                    {l.creator_id ? (
                      <Link href={`/admin/users/${l.creator_id}`} className="hover:underline">
                        {l.creator_name ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">אין (ליגת מערכת)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-bold">
                    {formatNumber(l.member_count)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs" dir="ltr">
                    {l.is_public ? "—" : l.invite_code}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(l.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} hasNext={hasNext} baseUrl={baseUrl} />
    </div>
  );
}
