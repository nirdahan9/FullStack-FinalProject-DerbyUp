import Link from "next/link";

/**
 * Tournament filter. With public leagues every user can predict all seven
 * competitions, so the fixture list would otherwise be sixty matches deep.
 *
 * The selection lives in the URL rather than in state, so a filtered view can
 * be shared and survives a refresh — and the page stays a server component.
 */
export function CompetitionTabs({
  competitions,
  active,
}: {
  competitions: { id: number; name: string }[];
  active: number | null;
}) {
  const tabs = [{ id: null as number | null, name: "הכל" }, ...competitions];

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id ?? "all"}
            href={tab.id ? `/games?competition=${tab.id}` : "/games"}
            scroll={false}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}
