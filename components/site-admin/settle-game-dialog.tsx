"use client";

import { useState, useTransition } from "react";
import { Gavel } from "lucide-react";
import { toast } from "sonner";
import { settleGameSiteWide } from "@/lib/actions/site-admin";
import { translateTeam } from "@/lib/i18n/teams";
import { FixtureLabel } from "@/components/shared/fixture";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The operator's safety net: a fixture the provider got wrong, or never
 * updated, settled by hand for every league that counts it.
 *
 * It records the score and stops there — settlement itself is the scheduled
 * job's, so what a fixture pays out is decided by one implementation whether
 * the score came from the API or from this dialog.
 */
export function SettleGameDialog({
  gameId,
  homeTeam,
  awayTeam,
  scoreHome,
  scoreAway,
}: {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  scoreHome: number | null;
  scoreAway: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [home, setHome] = useState(scoreHome === null ? "" : String(scoreHome));
  const [away, setAway] = useState(scoreAway === null ? "" : String(scoreAway));
  const [pending, startTransition] = useTransition();

  const valid = home !== "" && away !== "" && Number(home) >= 0 && Number(away) >= 0;

  function submit() {
    startTransition(async () => {
      const result = await settleGameSiteWide({
        gameId,
        scoreHome: Number(home),
        scoreAway: Number(away),
      });
      if (!result.ok) return void toast.error(result.error);
      setOpen(false);
      toast.success("התוצאה נרשמה. הניחושים יעובדו בהרצה הבאה");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 font-bold">
          <Gavel className="h-3.5 w-3.5" />
          תוצאה
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-right">רישום תוצאה</DialogTitle>
          <DialogDescription className="text-right">
            <FixtureLabel home={homeTeam} away={awayTeam} />. התוצאה נרשמת,
            והעיבוד מתבצע אוטומטית תוך כ-10 דקות.
          </DialogDescription>
        </DialogHeader>

        {/* dir="rtl" pins the home field to the right, the side FixtureLabel
            puts the home club on. Without it the row would follow whatever
            direction it inherits. */}
        <div dir="rtl" className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="adminScoreHome" className="truncate text-xs font-bold">
              {translateTeam(homeTeam)}
            </Label>
            <Input
              id="adminScoreHome"
              type="number"
              min={0}
              max={99}
              value={home}
              onChange={(e) => setHome(e.target.value)}
              className="rounded-xl text-center"
              dir="ltr"
            />
          </div>
          <span className="pb-2 font-black text-muted-foreground">—</span>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="adminScoreAway" className="truncate text-xs font-bold">
              {translateTeam(awayTeam)}
            </Label>
            <Input
              id="adminScoreAway"
              type="number"
              min={0}
              max={99}
              value={away}
              onChange={(e) => setAway(e.target.value)}
              className="rounded-xl text-center"
              dir="ltr"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="destructive"
            className="w-full font-bold"
            disabled={pending || !valid}
            onClick={submit}
          >
            רישום התוצאה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
