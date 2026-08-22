"use client";

import { useState, useTransition } from "react";
import { Gavel } from "lucide-react";
import { toast } from "sonner";
import { settleGameManually } from "@/lib/actions/admin";
import { translateTeam } from "@/lib/i18n/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Game = { id: string; homeTeam: string; awayTeam: string; kickoffAt: string };

/**
 * The safety net for when the provider is wrong or silent about a result.
 *
 * The action only records the score — the scheduled job then settles it with
 * the same logic every other fixture goes through. Scoring is not reimplemented
 * here, so an admin cannot produce a result the automatic path would not.
 */
export function ManualSettle({ leagueId, games }: { leagueId: string; games: Game[] }) {
  const [gameId, setGameId] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = games.find((g) => g.id === gameId);
  const valid =
    gameId && home !== "" && away !== "" && Number(home) >= 0 && Number(away) >= 0;

  function submit() {
    startTransition(async () => {
      const result = await settleGameManually({
        leagueId,
        gameId,
        scoreHome: Number(home),
        scoreAway: Number(away),
      });
      if (!result.ok) return void toast.error(result.error);
      setGameId("");
      setHome("");
      setAway("");
      toast.success("התוצאה נרשמה. הניחושים יושבו בהרצה הבאה");
    });
  }

  return (
    <section className="card-kickoff flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-1.5 font-bold">
          <Gavel className="h-4 w-4 text-primary" />
          יישוב ידני
        </h2>
        <p className="text-xs text-muted-foreground">
          למקרה שספק הנתונים טעה או לא עדכן. התוצאה נרשמת, והיישוב מתבצע
          אוטומטית תוך כ-10 דקות.
        </p>
      </div>

      {games.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          אין משחקים שהתחילו וטרם יושבו.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settleGame" className="text-sm font-bold">
              המשחק
            </Label>
            <select
              id="settleGame"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">בחרו משחק</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {translateTeam(game.homeTeam)} — {translateTeam(game.awayTeam)}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="scoreHome" className="truncate text-xs font-bold">
                  {translateTeam(selected.homeTeam)}
                </Label>
                <Input
                  id="scoreHome"
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
                <Label htmlFor="scoreAway" className="truncate text-xs font-bold">
                  {translateTeam(selected.awayTeam)}
                </Label>
                <Input
                  id="scoreAway"
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
          )}

          <Button
            variant="destructive"
            className="font-bold"
            disabled={pending || !valid}
            onClick={submit}
          >
            רישום התוצאה
          </Button>
        </>
      )}
    </section>
  );
}
