import Link from "next/link";
import { RANGE_KEYS, type RangeKey } from "@/lib/advisor/context";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "היום",
  tomorrow: "מחר",
  week: "השבוע",
  all: "הכל",
};

/**
 * The advisor tab's two filters, both in the URL.
 *
 * Same reasoning as CompetitionTabs on the fixture list: the selection belongs
 * in the address so a view can be shared and survives a refresh, and the page
 * stays a Server Component. Picking a filter also drops any selected match —
 * the analysis on screen belongs to a fixture that may not be in the new list.
 */
function href(params: { competition: number | null; range: RangeKey }): string {
  const search = new URLSearchParams();
  if (params.competition !== null) search.set("competition", String(params.competition));
  if (params.range !== "week") search.set("range", params.range);
  const query = search.toString();
  return query ? `/advisor?${query}` : "/advisor";
}

function Pill({
  children,
  to,
  active,
}: {
  children: React.ReactNode;
  to: string;
  active: boolean;
}) {
  return (
    <Link
      href={to}
      scroll={false}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </Link>
  );
}

export function AdvisorFilters({
  competitions,
  competition,
  range,
}: {
  competitions: { id: number; name: string }[];
  competition: number | null;
  range: RangeKey;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <Pill to={href({ competition: null, range })} active={competition === null}>
          כל הליגות
        </Pill>
        {competitions.map((item) => (
          <Pill
            key={item.id}
            to={href({ competition: item.id, range })}
            active={competition === item.id}
          >
            {item.name}
          </Pill>
        ))}
      </div>

      <div className="flex gap-2">
        {RANGE_KEYS.map((key) => (
          <Pill key={key} to={href({ competition, range: key })} active={range === key}>
            {RANGE_LABEL[key]}
          </Pill>
        ))}
      </div>
    </div>
  );
}
