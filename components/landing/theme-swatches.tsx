"use client";

import { useSyncExternalStore } from "react";
import {
  THEME_COLORS,
  getThemeColorServerSnapshot,
  getThemeColorSnapshot,
  setThemeColor,
  subscribeThemeColor,
} from "@/lib/theme-colors";

/**
 * The colour themes, on the landing page, working.
 *
 * <ThemeColorPicker> is the settings-screen version — a labelled grid. This is
 * the same store driving a row of swatches, because "eleven colour themes" is
 * a bullet point until the page changes colour under the visitor's finger.
 *
 * Same two details as the picker: `useSyncExternalStore` because the selection
 * lives on <html> and is written before hydration, and each swatch wears its
 * own `theme-*` class so the CSS variables cascade in and paint it — no second
 * copy of the palette in TypeScript.
 */
export function ThemeSwatches() {
  const selected = useSyncExternalStore(
    subscribeThemeColor,
    getThemeColorSnapshot,
    getThemeColorServerSnapshot,
  );

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="ערכת צבעים">
      {THEME_COLORS.map((theme) => {
        const isSelected = selected === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setThemeColor(theme.id)}
            aria-pressed={isSelected}
            aria-label={theme.label}
            title={theme.label}
            className={`theme-${theme.id} h-7 w-7 shrink-0 rounded-full ring-2 ring-inset ring-black/10 transition-transform active:scale-90 ${
              isSelected ? "scale-110 ring-foreground" : "hover:scale-105"
            }`}
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary)) 0 50%, hsl(var(--accent)) 50% 100%)",
            }}
          />
        );
      })}
    </div>
  );
}
