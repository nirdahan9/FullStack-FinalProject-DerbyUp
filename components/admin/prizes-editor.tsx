"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updatePrizes } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Prize = { place: number; prize: string };

export function PrizesEditor({
  leagueId,
  initialPrizes,
  initialNote,
}: {
  leagueId: string;
  initialPrizes: Prize[];
  initialNote: string;
}) {
  const [prizes, setPrizes] = useState<Prize[]>(
    initialPrizes.length ? initialPrizes : [{ place: 1, prize: "" }],
  );
  const [note, setNote] = useState(initialNote);
  const [pending, startTransition] = useTransition();

  function save() {
    // Blank rows are dropped rather than rejected: an admin adding a row and
    // changing their mind should not have to delete it to save.
    const cleaned = prizes
      .filter((p) => p.prize.trim())
      .map((p, i) => ({ place: i + 1, prize: p.prize.trim() }));

    startTransition(async () => {
      const result = await updatePrizes({ leagueId, prizes: cleaned, note });
      if (!result.ok) return void toast.error(result.error);
      setPrizes(cleaned.length ? cleaned : [{ place: 1, prize: "" }]);
      toast.success("הפרסים נשמרו");
    });
  }

  return (
    <section className="card-kickoff flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-bold">פרסים</h2>
        <p className="text-xs text-muted-foreground">
          טקסט חופשי. הארגון מחלק את הפרסים בעצמו — המערכת רק מנהלת את הדירוג.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {prizes.map((prize, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-sm font-bold text-muted-foreground">
              {index + 1}.
            </span>
            <Input
              value={prize.prize}
              maxLength={120}
              placeholder="כרטיס למשחק"
              className="rounded-xl"
              onChange={(e) =>
                setPrizes((prev) =>
                  prev.map((p, i) => (i === index ? { ...p, prize: e.target.value } : p)),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`מחיקת פרס ${index + 1}`}
              className="shrink-0 text-muted-foreground"
              onClick={() => setPrizes((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {prizes.length < 20 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start font-bold"
          onClick={() => setPrizes((prev) => [...prev, { place: prev.length + 1, prize: "" }])}
        >
          <Plus className="h-4 w-4" />
          הוספת פרס
        </Button>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prizeNote" className="text-sm font-bold">
          הערה (אופציונלי)
        </Label>
        <Input
          id="prizeNote"
          value={note}
          maxLength={500}
          placeholder="הפרסים מחולקים בסוף העונה"
          className="rounded-xl"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Button onClick={save} disabled={pending} className="font-bold">
        שמירת פרסים
      </Button>
    </section>
  );
}
