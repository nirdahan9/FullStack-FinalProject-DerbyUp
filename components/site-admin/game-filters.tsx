"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const STATUSES = [
  { value: "all", label: "כל הסטטוסים" },
  { value: "upcoming", label: "קרובים" },
  { value: "unsettled", label: "ממתינים לעיבוד" },
  { value: "live", label: "חי" },
  { value: "finished", label: "הסתיימו" },
  { value: "postponed", label: "נדחו" },
  { value: "cancelled", label: "בוטלו" },
] as const;

type Competition = { id: number; name: string };

/**
 * The three filters on the fixtures table, all of them URL state.
 *
 * The text box is debounced and the two selects navigate at once, which is
 * how each of them is actually used: a name is typed, a status is picked.
 */
export function GameFilters({
  competitions,
  search,
  status,
  competition,
}: {
  competitions: Competition[];
  search: string;
  status: string;
  competition: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(search);

  const urlFor = (next: { q?: string; status?: string; competition?: string }) => {
    const params = new URLSearchParams();
    const q = next.q ?? value.trim();
    const s = next.status ?? status;
    const c = next.competition ?? competition;

    if (q) params.set("q", q);
    if (s && s !== "all") params.set("status", s);
    if (c) params.set("competition", c);

    const query = params.toString();
    return query ? `/admin/games?${query}` : "/admin/games";
  };

  useEffect(() => {
    if (value === search) return;
    const timer = setTimeout(() => router.push(urlFor({ q: value.trim() })), 350);
    return () => clearTimeout(timer);
    // urlFor closes over the current filters, which are exactly the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, search, status, competition, router]);

  const selectClass =
    "h-10 rounded-xl border border-input bg-background px-3 text-sm";

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="חיפוש קבוצה"
          aria-label="חיפוש קבוצה"
          className="rounded-xl pe-9"
        />
      </div>

      <select
        value={status}
        aria-label="סטטוס"
        onChange={(e) => router.push(urlFor({ status: e.target.value }))}
        className={selectClass}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        value={competition}
        aria-label="טורניר"
        onChange={(e) => router.push(urlFor({ competition: e.target.value }))}
        className={selectClass}
      >
        <option value="">כל הטורנירים</option>
        {competitions.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
