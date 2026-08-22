"use client";

import { useState, useTransition } from "react";
import { Star, X } from "lucide-react";
import { toast } from "sonner";
import { setFeaturedGame } from "@/lib/actions/admin";
import { translateTeam } from "@/lib/i18n/teams";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Game = { id: string; homeTeam: string; awayTeam: string; kickoffAt: string };

const BONUSES = [25, 50, 75, 100];

/**
 * Marks one upcoming fixture as the week's game, with a percentage bonus that
 * multiplies the points on it.
 *
 * Only fixtures that have not kicked off are offered: a bonus on a match that
 * already started would reward predictions nobody can still make.
 */
export function FeaturedGamePicker({
  leagueId,
  games,
  currentGameId,
  currentBonus,
}: {
  leagueId: string;
  games: Game[];
  currentGameId: string | null;
  currentBonus: number;
}) {
  const [gameId, setGameId] = useState(currentGameId ?? "");
  const [bonus, setBonus] = useState(currentBonus || 50);
  const [pending, startTransition] = useTransition();

  function save(nextGameId: string | null) {
    startTransition(async () => {
      const result = await setFeaturedGame({
        leagueId,
        gameId: nextGameId,
        bonusPct: bonus,
      });
      if (!result.ok) return void toast.error(result.error);
      setGameId(nextGameId ?? "");
      toast.success(nextGameId ? "בחירת העורך עודכנה" : "בחירת העורך בוטלה");
    });
  }

  return (
    <section className="card-kickoff flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-1.5 font-bold">
          <Star className="h-4 w-4 text-primary" />
          בחירת העורך
        </h2>
        <p className="text-xs text-muted-foreground">
          בונוס אחוזי על הניקוד במשחק אחד. חל רק על חברי הליגה הזו.
        </p>
      </div>

      {games.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין משחקים קרובים בטורניר.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="featuredGame" className="text-sm font-bold">
              המשחק
            </Label>
            <select
              id="featuredGame"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">ללא בחירת עורך</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {translateTeam(game.homeTeam)} — {translateTeam(game.awayTeam)} ·{" "}
                  {new Date(game.kickoffAt).toLocaleDateString("he-IL", {
                    day: "numeric",
                    month: "numeric",
                    timeZone: "Asia/Jerusalem",
                  })}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-sm font-bold">גובה הבונוס</Label>
            <div className="grid grid-cols-4 gap-2">
              {BONUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBonus(value)}
                  className={`rounded-xl border-2 py-2 text-sm font-black transition-colors ${
                    bonus === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary hover:border-primary/40"
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 font-bold"
              disabled={pending || !gameId}
              onClick={() => save(gameId)}
            >
              שמירה
            </Button>
            {currentGameId && (
              <Button
                variant="outline"
                className="font-bold"
                disabled={pending}
                onClick={() => save(null)}
              >
                <X className="h-4 w-4" />
                ביטול
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
