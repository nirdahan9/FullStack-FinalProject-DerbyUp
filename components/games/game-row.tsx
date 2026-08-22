import Link from "next/link";
import { Star } from "lucide-react";
import { translateTeam } from "@/lib/i18n/teams";

/**
 * A fixture row, matching the shape used in the DerbyUp app: kick-off time on
 * one side, the two teams stacked in the middle, an action on the other.
 */
export function GameRow({
  id,
  homeTeam,
  awayTeam,
  homeLogo,
  awayLogo,
  kickoffAt,
  competitionName,
  isFeatured,
  predictedCount,
}: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffAt: string;
  competitionName?: string;
  isFeatured?: boolean;
  predictedCount: number;
}) {
  const kickoff = new Date(kickoffAt);
  const time = kickoff.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
  const date = kickoff.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Jerusalem",
  });

  return (
    <Link
      href={`/games/${id}`}
      className="card-kickoff flex items-center gap-3 py-3 transition-colors hover:bg-secondary/60"
    >
      <div className="flex min-w-[52px] shrink-0 flex-col items-center text-center">
        <span className="text-sm font-black">{time}</span>
        <span className="text-[11px] text-muted-foreground">{date}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {(competitionName || isFeatured) && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {isFeatured && (
              <span className="flex items-center gap-0.5 font-bold text-primary">
                <Star className="h-3 w-3 fill-current" />
                בחירת העורך
              </span>
            )}
            {competitionName}
          </span>
        )}
        {[
          { name: translateTeam(homeTeam), logo: homeLogo },
          { name: translateTeam(awayTeam), logo: awayLogo },
        ].map((team) => (
          <span key={team.name} className="flex items-center gap-2">
            {/* Crests come from the provider's CDN at 20px; next/image would
                mean allow-listing a remote host for no gain at this size. */}
            {team.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
            )}
            <span className="truncate text-sm font-bold" dir="auto">
              {team.name}
            </span>
          </span>
        ))}
      </div>

      <span
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
          predictedCount > 0
            ? "bg-secondary text-muted-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {predictedCount > 0 ? `${predictedCount}/3` : "נחש"}
      </span>
    </Link>
  );
}
