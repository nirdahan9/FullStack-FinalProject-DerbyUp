"use client";

import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";

/**
 * Collapsible rules card, as on the DerbyUp league page. It carries real
 * weight here: the scoring model is unusual — the odds *are* the score, and a
 * league counts only match-winner calls — so a member who never reads it will
 * not understand their own standing.
 */
export function LeagueRules({ competitionName }: { competitionName: string }) {
  const [open, setOpen] = useState(false);

  const rules: { title: string; body: string }[] = [
    {
      title: "איך משחקים",
      body: `בכל משחק של ${competitionName} יש שלוש שאלות. בוחרים תשובה בלחיצה אחת — אין סכום להמר ואין מה להפסיד.`,
    },
    {
      title: "איך נספר הניקוד",
      body: "היחס הוא הניקוד. ניחוש נכון ביחס 7.15 שווה 7.15 נקודות; ניחוש שגוי שווה אפס. משתלם לזהות הפתעות.",
    },
    {
      title: "מה נספר בטבלה",
      body: "רק ניחושי המנצח, ורק במשחקי הטורניר של הליגה. שאלות סך השערים ושתי הקבוצות נספרות בלידרבורד הכללי.",
    },
    {
      title: "מאיזה רגע",
      body: "רק ניחושים שהנחת מרגע ההצטרפות לליגה. ניחושים קודמים לא נספרים כאן.",
    },
    {
      title: "דדליין",
      body: "ניחוש נסגר עם שריקת הפתיחה. אפשר לבטל ולנחש מחדש עד 10 דקות לפני.",
    },
    {
      title: "בחירת העורך",
      body: "מנהל הליגה יכול לסמן משחק עם בונוס אחוזי, שמכפיל את הניקוד על אותו משחק.",
    },
  ];

  return (
    <section className="card-kickoff flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-3 text-start"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
          <BookOpen className="h-4 w-4 text-primary" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold">חוקי הליגה</span>
          <span className="truncate text-xs text-muted-foreground">
            איך משחקים · ניקוד · דדליין · בונוסים
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <dl className="flex flex-col gap-3 border-t border-border pt-3">
          {rules.map((rule) => (
            <div key={rule.title} className="flex flex-col gap-0.5">
              <dt className="text-sm font-bold">{rule.title}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{rule.body}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
