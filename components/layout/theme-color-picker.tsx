"use client";

import { useSyncExternalStore } from "react";
import { Check, Palette } from "lucide-react";
import {
  THEME_COLORS,
  getThemeColorServerSnapshot,
  getThemeColorSnapshot,
  setThemeColor,
  subscribeThemeColor,
} from "@/lib/theme-colors";

/**
 * The colour-theme grid, ported from the DerbyUp settings screen.
 *
 * Two details worth naming:
 *
 * 1. `useSyncExternalStore` rather than `useState` + an effect. The selection
 *    lives outside React (a class on <html>, written before hydration), and
 *    this is the API built for exactly that: it renders the server snapshot
 *    while hydrating, so there is no markup mismatch and no setState in an
 *    effect for the lint rule to object to.
 *
 * 2. Each swatch wears its own `theme-*` class, so the CSS variables cascade
 *    into it and `bg-primary`/`bg-accent` paint the real palette. The
 *    alternative — a hex table in TypeScript — would be a second copy of every
 *    colour to keep in step with globals.css.
 */
export function ThemeColorPicker() {
  const selected = useSyncExternalStore(
    subscribeThemeColor,
    getThemeColorSnapshot,
    getThemeColorServerSnapshot,
  );

  return (
    <section className="card-kickoff flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Palette size={18} className="shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-bold">ערכת צבעים</p>
          <p className="text-xs text-muted-foreground">
            בוחרים את צבעי האתר. ההעדפה נשמרת בדפדפן הזה.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEME_COLORS.map((theme) => {
          const isSelected = selected === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setThemeColor(theme.id)}
              aria-pressed={isSelected}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-start text-xs font-black transition-all active:scale-95 ${
                isSelected
                  ? "scale-[1.02] border-primary bg-primary/10 text-primary shadow-sm"
                  : "border-border bg-background text-foreground/80 hover:bg-secondary/40"
              }`}
            >
              <span
                aria-hidden
                className={`theme-${theme.id} h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10`}
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--primary)) 0 50%, hsl(var(--accent)) 50% 100%)",
                }}
              />
              <span className="truncate">{theme.label}</span>
              {isSelected && <Check size={12} className="ms-auto shrink-0" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
