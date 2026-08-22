import { Lock } from "lucide-react";
import { translateTeam } from "@/lib/i18n/teams";
import { FixtureLabel } from "@/components/shared/fixture";
import type { LandingGame } from "@/lib/landing/upcoming-games";

/**
 * The hero's proof. Everything else on this page is a claim about how DerbyUp
 * scores; this is the claim rendered as the product renders it — a real
 * fixture, the real price on each side, and the price restated as the points
 * a correct call is worth.
 *
 * The tiles are deliberately the same shape as <QuestionCard>'s, minus the
 * behaviour: a visitor who signs up should recognise the screen they land on.
 * They are not buttons, because the only thing there is to do here is sign up.
 */

/** Shown when the database has no fixtures — a fresh clone, or before seeding. */
const EXAMPLE: LandingGame = {
  homeTeam: "Real Madrid",
  awayTeam: "Barcelona",
  homeLogo: null,
  awayLogo: null,
  kickoffAt: "",
  competitionName: "La Liga",
  // The away side carries the longest price on purpose: the tile the card
  // highlights is the one the line underneath is talking about, and "back the
  // underdog" is the idea worth putting in front of a first-time visitor.
  outcomes: [
    { key: "home", label: "Real Madrid", odds: 1.95 },
    { key: "draw", label: "תיקו", odds: 3.6 },
    { key: "away", label: "Barcelona", odds: 4.2 },
  ],
  provisional: false,
};

function kickoffLabel(iso: string): string {
  const kickoff = new Date(iso);
  const day = kickoff.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Jerusalem",
  });
  const time = kickoff.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
  return `${day} · ${time}`;
}

function Crest({ logo }: { logo: string | null }) {
  if (!logo) return <span className="h-5 w-5 shrink-0 rounded-full bg-secondary" aria-hidden />;
  // Crests come from the provider's CDN at 20px; next/image would mean
  // allow-listing a remote host for no gain at this size.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo} alt="" className="h-5 w-5 shrink-0 object-contain" />;
}

export function FixturePreview({ games }: { games: LandingGame[] }) {
  const isExample = games.length === 0;
  const [featured, ...rest] = isExample ? [EXAMPLE] : games;
  const best = Math.max(...featured.outcomes.map((o) => o.odds));

  return (
    <div className="card-kickoff flex flex-col gap-4 shadow-elevated ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-2">
        <span className="section-label">
          {isExample ? "כך זה נראה" : "המשחקים הקרובים"}
        </span>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
          {isExample ? "משחק לדוגמה" : "יחסים אמיתיים"}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate font-bold" dir="auto">
            {featured.competitionName}
          </span>
          {featured.kickoffAt && <span>{kickoffLabel(featured.kickoffAt)}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          {[
            { name: featured.homeTeam, logo: featured.homeLogo },
            { name: featured.awayTeam, logo: featured.awayLogo },
          ].map((team) => (
            <span key={team.name} className="flex items-center gap-2">
              <Crest logo={team.logo} />
              <span className="truncate text-base font-bold" dir="auto">
                {translateTeam(team.name)}
              </span>
            </span>
          ))}
        </div>

        <p className="text-xs font-bold text-muted-foreground">מי ינצח?</p>

        <div className="grid grid-cols-3 gap-2">
          {featured.outcomes.map((outcome) => (
            <div
              key={outcome.key}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-3 ${
                outcome.odds === best
                  ? "border-primary bg-primary text-primary-foreground shadow-lg"
                  : "border-border bg-secondary"
              }`}
            >
              <span className="text-center text-xs font-bold leading-tight" dir="auto">
                {translateTeam(outcome.label)}
              </span>
              <span
                className={`text-sm font-black ${
                  outcome.odds === best ? "text-primary-foreground/80" : "text-primary"
                }`}
              >
                {outcome.odds} נק׳
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {featured.provisional ? (
            <>
              היחס למשחק הזה עדיין לא פורסם — המספרים הם הערכה, והניקוד ייקבע לפי
              היחס בשריקת הפתיחה, אותו יחס לכולם.
            </>
          ) : (
            <>
              הפתעה שווה יותר. צדקת על המהלך הפחות צפוי —{" "}
              <span className="font-black text-primary">{best} נקודות</span> אצלך בטבלה.
            </>
          )}
        </p>
      </div>

      {rest.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {rest.map((game) => (
            <div
              key={`${game.homeTeam}-${game.kickoffAt}`}
              className="flex items-center gap-2 text-xs"
            >
              <Crest logo={game.homeLogo} />
              <FixtureLabel
                home={game.homeTeam}
                away={game.awayTeam}
                className="min-w-0 flex-1 truncate font-bold"
              />
              <span className="shrink-0 text-muted-foreground">
                {kickoffLabel(game.kickoffAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3 shrink-0" />
        הניחוש נסגר בשריקת הפתיחה
      </p>
    </div>
  );
}
