import { Info } from "lucide-react";

/**
 * The banner that says this is a demo.
 *
 * It exists because the alternative is a lie. Every screen behind it renders
 * real UI driven by a frozen snapshot: you can open a match, place a
 * prediction, watch a table reorder. None of it is written anywhere, no account
 * exists, and the matches are not real upcoming fixtures. A visitor who works
 * that out for themselves, after trying to sign in, has been misled by us.
 *
 * So it is stated once, plainly, at the top of the page, and then the demo is
 * allowed to be as convincing as it can be. Honest and impressive are not in
 * tension here — the frozen data is what makes the site free to run forever,
 * and saying so is part of the engineering story, not an apology for it.
 *
 * Rendered inside the page flow rather than fixed to the viewport: a sticky
 * bar would follow the reader around nagging, and this only needs saying once.
 */
export function DemoNotice() {
  return (
    <div className="border-b border-border bg-secondary/60">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3 px-5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-bold text-foreground">זוהי הדגמה.</span>{" "}
          כל המסכים עובדים על תצלום נתונים קפוא — אפשר להתהלך, לנחש ולראות
          טבלאות מתעדכנות, אבל שום דבר לא נשמר ואין חשבונות אמיתיים. המוצר שעליו
          זה מבוסס נסגר באוקטובר 2026.
        </p>
      </div>
    </div>
  );
}
