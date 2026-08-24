"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteUser, setSiteAdmin } from "@/lib/actions/site-admin";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * The two writes on a user row.
 *
 * Neither is offered on your own row: the functions behind them refuse both —
 * an operator who could demote themselves could lock the last admin out, and
 * deleting yourself would end the session mid-request — so the buttons are
 * hidden rather than left to fail.
 *
 * Both writes confirm first. Deletion always has; the admin toggle earned the
 * same treatment because granting the role hands over the whole dashboard —
 * including the power to appoint and remove other operators — and revoking it
 * locks a colleague out. Neither belongs one accidental tap away.
 */
export function UserActions({
  userId,
  displayName,
  isAdmin,
  isSelf,
}: {
  userId: string;
  displayName: string;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (isSelf) {
    return <span className="text-xs text-muted-foreground">זה אתה</span>;
  }

  function toggleAdmin() {
    startTransition(async () => {
      const result = await setSiteAdmin({ userId, value: !isAdmin });
      if (!result.ok) return void toast.error(result.error);
      toast.success(isAdmin ? "הרשאת הניהול הוסרה" : "המשתמש מונה למנהל אתר");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteUser({ userId });
      if (!result.ok) return void toast.error(result.error);
      toast.success("המשתמש נמחק");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            title={isAdmin ? "הסרת הרשאת ניהול" : "מינוי למנהל אתר"}
          >
            {isAdmin ? (
              <ShieldOff className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {isAdmin ? "הסרת ניהול" : "מינוי"}
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              {isAdmin ? `להסיר את ${displayName} מניהול האתר?` : `למנות את ${displayName} למנהל אתר?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {isAdmin
                ? "הגישה לדשבורד הניהול תיחסם מיידית. אפשר למנות מחדש בכל רגע."
                : "מנהל אתר רואה את כל המשתמשים, הליגות והניחושים, יכול לעבד משחקים ולמחוק משתמשים — וגם למנות ולהסיר מנהלים אחרים, כולל אותך."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={toggleAdmin}>
              {isAdmin ? "הסרה" : "מינוי"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={pending || isAdmin}
            title={isAdmin ? "יש להסיר קודם את הרשאת הניהול" : "מחיקת המשתמש"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">
              למחוק את {displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              החשבון, הניחושים, החברויות בליגות וההישגים יימחקו לצמיתות. אי אפשר
              לבטל את הפעולה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              מחיקה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
