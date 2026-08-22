import { THEME_COLOR_KEY, THEME_COLORS, DEFAULT_THEME_COLOR } from "@/lib/theme-colors";

const IDS = THEME_COLORS.filter((theme) => theme.id !== DEFAULT_THEME_COLOR).map(
  (theme) => theme.id,
);

/**
 * Applies the saved colour theme before the first paint.
 *
 * The class cannot come from the server — the preference lives in localStorage
 * and the layout is rendered once for everyone — so without this the page
 * paints in the default green and then snaps to the chosen palette. This is
 * the same trick next-themes uses one element over for `dark`: a blocking
 * inline script at the top of <body>, where document.documentElement already
 * exists but nothing has been painted yet.
 *
 * Not a client component: it renders static markup and never hydrates, so it
 * costs nothing in the client bundle.
 */
export function ThemeColorScript() {
  const script = `(function(){try{var v=${JSON.stringify(IDS)};var k=localStorage.getItem(${JSON.stringify(
    THEME_COLOR_KEY,
  )});if(v.indexOf(k)>-1){document.documentElement.classList.add("theme-"+k)}}catch(e){}})()`;

  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: script }} />;
}
