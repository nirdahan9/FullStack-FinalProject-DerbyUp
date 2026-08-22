/**
 * The colour themes carried over from the DerbyUp app, and the tiny store that
 * remembers which one the visitor picked.
 *
 * The choice is a personal preference, not league data: it lives in
 * localStorage under the same key the original app used, so a returning
 * DerbyUp user keeps their theme. Nothing here touches the database.
 *
 * The palettes themselves are in app/globals.css. This module holds only the
 * ids and the Hebrew labels — deliberately no hex values, so there is one
 * place to change a colour.
 */

export const THEME_COLOR_KEY = "derbyup_theme_color";

export const THEME_COLORS = [
  { id: "default", label: "ברירת מחדל" },
  { id: "inter-miami", label: "אינטר מיאמי" },
  { id: "maccabi-ta", label: "מכבי תל אביב" },
  { id: "hapoel-ta", label: "הפועל תל אביב" },
  { id: "beitar", label: "בית״ר ירושלים" },
  { id: "spain", label: "נבחרת ספרד" },
  { id: "brazil", label: "נבחרת ברזיל" },
  { id: "inter", label: "אינטר" },
  { id: "israel", label: "ישראל" },
  { id: "liverpool", label: "ליברפול" },
  { id: "dortmund", label: "דורטמונד" },
  { id: "uruguay", label: "נבחרת אורוגוואי" },
] as const;

export type ThemeColorId = (typeof THEME_COLORS)[number]["id"];

export const DEFAULT_THEME_COLOR: ThemeColorId = "default";

/** Every class the picker may have written, so switching can clear the lot. */
const THEME_CLASSES = THEME_COLORS.filter((theme) => theme.id !== DEFAULT_THEME_COLOR).map(
  (theme) => `theme-${theme.id}`,
);

export function isThemeColorId(value: unknown): value is ThemeColorId {
  return THEME_COLORS.some((theme) => theme.id === value);
}

/**
 * Writes the class onto <html>, beside the `dark` class next-themes manages.
 * Safe to share an element: next-themes only ever removes `light` and `dark`.
 */
export function applyThemeColor(id: ThemeColorId) {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  if (id !== DEFAULT_THEME_COLOR) root.classList.add(`theme-${id}`);
}

// ─── useSyncExternalStore plumbing ──────────────────────────────────────────
// The DOM is the single source of truth for what is currently applied: the
// pre-hydration script in app/layout.tsx sets the class before React ever
// runs, so reading it back beats keeping a second copy in module state.

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeThemeColor(listener: () => void) {
  listeners.add(listener);

  // A change in another tab should land here too, or the two windows disagree
  // about what is selected until one of them reloads.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_COLOR_KEY) return;
    const next = isThemeColorId(event.newValue) ? event.newValue : DEFAULT_THEME_COLOR;
    applyThemeColor(next);
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getThemeColorSnapshot(): ThemeColorId {
  const found = THEME_COLORS.find(
    (theme) =>
      theme.id !== DEFAULT_THEME_COLOR &&
      document.documentElement.classList.contains(`theme-${theme.id}`),
  );
  return found?.id ?? DEFAULT_THEME_COLOR;
}

/** The server cannot know the preference, so it renders the unthemed default. */
export function getThemeColorServerSnapshot(): ThemeColorId {
  return DEFAULT_THEME_COLOR;
}

export function setThemeColor(id: ThemeColorId) {
  try {
    localStorage.setItem(THEME_COLOR_KEY, id);
  } catch {
    // Private-mode Safari and a blocked-cookies profile both throw here. The
    // theme should still apply for this visit, so the write is not fatal.
  }
  applyThemeColor(id);
  emit();
}
