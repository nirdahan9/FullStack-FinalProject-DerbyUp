"use client";

import { useState, useTransition } from "react";
import { Flag, LogOut } from "lucide-react";
import { toast } from "sonner";
import { archiveLeague, leaveLeague } from "@/lib/actions/leagues";
import { Button } from "@/components/ui/button";

/**
 * The two destructive controls at the foot of a league, both behind a
 * confirmation. Archiving ends the season for everyone and leaving cannot be
 * undone without the invite code, so neither should be one stray tap away.
 */
export function LeagueActions({
  leagueId,
  isAdmin,
  isArchived,
}: {
  leagueId: string;
  isAdmin: boolean;
  isArchived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"archive" | "leave" | null>(null);

  function run(kind: "archive" | "leave") {
    startTransition(async () => {
      const result =
        kind === "archive"
          ? await archiveLeague({ leagueId })
          : await leaveLeague({ leagueId });

      if (!result.ok) {
        toast.error(result.error);
        setConfirming(null);
        return;
      }
      if (kind === "archive") toast.success("העונה נסגרה");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {isAdmin && !isArchived && (
        confirming === "archive" ? (
          <div className="card-kickoff flex flex-col gap-3">
            <p className="text-sm font-bold">לסגור את העונה?</p>
            <p className="text-sm text-muted-foreground">
              הליגה תעבור לארכיון, לא יתווספו אליה ניחושים חדשים, והדירוג יינעל
              כפי שהוא. חלוקת הפרסים נעשית מחוץ למערכת.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1 font-bold"
                disabled={pending}
                onClick={() => run("archive")}
              >
                סגור עונה
              </Button>
              <Button
                variant="outline"
                className="flex-1 font-bold"
                disabled={pending}
                onClick={() => setConfirming(null)}
              >
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full font-bold"
            onClick={() => setConfirming("archive")}
          >
            <Flag className="h-4 w-4" />
            סגור עונה וחלק פרסים
          </Button>
        )
      )}

      {!isAdmin &&
        (confirming === "leave" ? (
          <div className="card-kickoff flex flex-col gap-3">
            <p className="text-sm font-bold">לעזוב את הליגה?</p>
            <p className="text-sm text-muted-foreground">
              תוסר מטבלת הדירוג. הניחושים שלך יישמרו, ותוכל לחזור רק עם קוד
              ההזמנה.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1 font-bold"
                disabled={pending}
                onClick={() => run("leave")}
              >
                עזוב ליגה
              </Button>
              <Button
                variant="outline"
                className="flex-1 font-bold"
                disabled={pending}
                onClick={() => setConfirming(null)}
              >
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming("leave")}
            className="flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-destructive transition-opacity hover:opacity-80"
          >
            <LogOut className="h-4 w-4" />
            עזוב ליגה
          </button>
        ))}
    </div>
  );
}
