import { ShieldCheck } from "lucide-react";
import { UserActions } from "@/components/site-admin/user-actions";
import { formatDate } from "@/lib/format";

export type SiteAdminRow = {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
  created_at: string;
};

/**
 * The operators, as a list of their own.
 *
 * Appointment has always lived on the user rows below; what was missing was
 * the answer to "who has dashboard access right now" — which used to mean
 * paging through every account looking for shield icons. The role that can
 * delete users and appoint more of itself is the one list an operator should
 * be able to read at a glance.
 *
 * Revoking happens here; appointing happens by finding the person in the
 * table below, because appointment starts from a user, not from this list.
 */
export function SiteAdminsCard({ admins, selfId }: { admins: SiteAdminRow[]; selfId: string }) {
  return (
    <section className="card-kickoff flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-black">מנהלי האתר ({admins.length})</h2>
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {admins.map((operator) => (
          <li key={operator.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" dir="auto">
                {operator.display_name ?? operator.username}
                {operator.id === selfId && (
                  <span className="text-xs font-normal text-muted-foreground"> (אתה)</span>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                {operator.email}
              </p>
            </div>
            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
              מנהל מ־{formatDate(operator.created_at)}
            </span>
            <UserActions
              userId={operator.id}
              displayName={operator.display_name ?? operator.username}
              isAdmin
              isSelf={operator.id === selfId}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        כל מנהל אתר יכול למנות ולהסיר מנהלים. מינוי מנהל חדש — אתרו את המשתמש
        בטבלה למטה ולחצו ״מינוי״. איש אינו יכול להסיר את עצמו, כך שתמיד נשאר
        מנהל אחד לפחות.
      </p>
    </section>
  );
}
