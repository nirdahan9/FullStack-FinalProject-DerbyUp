"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { translateTeam } from "@/lib/i18n/teams";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AdvisorPanel } from "@/components/advisor/advisor-panel";

/**
 * The advisor on the match page.
 *
 * A sheet rather than a section, because the advice belongs beside the
 * decision and not above it: the questions stay on screen behind it, and
 * closing the panel puts the user back exactly where they were about to guess.
 *
 * The panel mounts only once the sheet is opened. Mounting it with the page
 * would fire an analysis for every visitor who scrolled past, and most of them
 * never ask.
 */
export function AdvisorSheet({
  gameId,
  homeTeam,
  awayTeam,
}: {
  gameId: string;
  /** Provider spelling, as the rest of the page passes it. Translated here. */
  homeTeam: string;
  awayTeam: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full gap-2 border-primary/40 text-primary">
          <Sparkles className="h-4 w-4" />
          שאל את היועץ
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="flex max-h-[88dvh] flex-col gap-0 overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader className="text-start">
          <SheetTitle dir="auto">
            {translateTeam(homeTeam)} — {translateTeam(awayTeam)}
          </SheetTitle>
          <SheetDescription>
            יועץ ה-AI עונה על המשחק הזה ועל כללי הניקוד של DerbyUp.
          </SheetDescription>
        </SheetHeader>

        <div className="pb-6 pt-4">{open && <AdvisorPanel gameId={gameId} />}</div>
      </SheetContent>
    </Sheet>
  );
}
