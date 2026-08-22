"use client";

import { useCallback, useEffect, useRef } from "react";
import { MAX_GOALS } from "@/lib/domain/exact-score";

/**
 * The exact-score picker from the DerbyUp app (`src/components/ScoreDrumPicker.tsx`),
 * carried over as-is: two scroll drums of 0–9 either side of a colon, the
 * centred number in amber, and the rest faded out.
 *
 * A pair of drums rather than two number inputs because this is a phone-first
 * product and a score is two small numbers — spinning to them beats summoning
 * a keyboard twice.
 */

const NUMBERS = Array.from({ length: MAX_GOALS + 1 }, (_, i) => i);
const ITEM_H = 46;
const VISIBLE_ITEMS = 3;
const SCROLL_H = ITEM_H * VISIBLE_ITEMS;
/** One item's height above and below, so the centred item is index 0. */
const PAD = ITEM_H;

function DrumColumn({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: number;
  onSelect: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const suppress = useRef(false);
  const suppressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(false);

  // Scrolling the drum reports a number, and a number scrolls the drum. The
  // suppress flag breaks that loop: while a programmatic scroll is in flight
  // its own scroll events are ignored.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    clearTimeout(suppressTimer.current);

    if (!mounted.current) {
      // First paint: jump, do not animate.
      mounted.current = true;
      suppress.current = true;
      el.scrollTop = selected * ITEM_H;
      suppressTimer.current = setTimeout(() => (suppress.current = false), 150);
      return;
    }

    // Already there means this change came from this drum's own scroll.
    if (Math.round(el.scrollTop / ITEM_H) === selected) return;

    suppress.current = true;
    el.scrollTo({ top: selected * ITEM_H, behavior: "smooth" });
    suppressTimer.current = setTimeout(() => (suppress.current = false), 400);
  }, [selected]);

  const onScroll = useCallback(() => {
    if (suppress.current) return;
    clearTimeout(settleTimer.current);
    // Debounced: report the number the drum came to rest on, not every number
    // that passed under the marker on the way.
    settleTimer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const index = Math.round(el.scrollTop / ITEM_H);
      onSelect(Math.max(0, Math.min(MAX_GOALS, index)));
    }, 80);
  }, [onSelect]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="max-w-[80px] truncate text-[11px] font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="relative" style={{ height: SCROLL_H }}>
        <div
          ref={ref}
          onScroll={onScroll}
          role="listbox"
          aria-label={label}
          className="h-full overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-secondary/80 [&::-webkit-scrollbar]:hidden"
          style={{
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            width: 60,
            touchAction: "pan-y",
            overscrollBehavior: "contain",
          }}
        >
          <div style={{ height: PAD }} />
          {NUMBERS.map((n) => (
            <div
              key={n}
              role="option"
              aria-selected={n === selected}
              style={{ height: ITEM_H, scrollSnapAlign: "center" }}
              className={`flex select-none items-center justify-center text-2xl font-black transition-all ${
                n === selected ? "scale-110 text-amber-500" : "text-muted-foreground/40"
              }`}
            >
              {n}
            </div>
          ))}
          <div style={{ height: PAD }} />
        </div>

        {/* Marks the row that counts. */}
        <div
          className="pointer-events-none absolute left-1 right-1 rounded-xl border-2 border-amber-500/30"
          style={{ top: ITEM_H, height: ITEM_H }}
        />
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 rounded-t-2xl"
          style={{
            height: ITEM_H,
            background: "linear-gradient(to bottom, hsl(var(--card)), transparent)",
          }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 rounded-b-2xl"
          style={{
            height: ITEM_H,
            background: "linear-gradient(to top, hsl(var(--card)), transparent)",
          }}
        />
      </div>
    </div>
  );
}

export function ScoreDrumPicker({
  homeTeam,
  awayTeam,
  value,
  onChange,
  isDraw = false,
}: {
  homeTeam: string;
  awayTeam: string;
  /** "home-away" */
  value: string;
  onChange: (value: string) => void;
  /** Locks the drums together: a draw has to be an equal score. */
  isDraw?: boolean;
}) {
  const [rawHome, rawAway] = value.split("-").map(Number);
  const home = Number.isNaN(rawHome) ? 0 : rawHome;
  const away = Number.isNaN(rawAway) ? 0 : rawAway;

  // Covers switching the outcome to "draw" after picking 2-1: the score is
  // levelled rather than left in a state the form would refuse.
  useEffect(() => {
    if (isDraw && home !== away) onChange(`${home}-${home}`);
  }, [isDraw, home, away, onChange]);

  return (
    <div className="flex items-center justify-center gap-3">
      <DrumColumn
        label={homeTeam}
        selected={home}
        onSelect={(n) => onChange(isDraw ? `${n}-${n}` : `${n}-${away}`)}
      />
      <span className="mt-5 text-2xl font-black text-muted-foreground/40">:</span>
      <DrumColumn
        label={awayTeam}
        selected={away}
        onSelect={(n) => onChange(isDraw ? `${n}-${n}` : `${home}-${n}`)}
      />
    </div>
  );
}
