"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CANCEL_WINDOW_MINUTES } from "@/lib/domain/prediction-rules";

/**
 * The questions that actually get asked, answered where they get asked.
 *
 * "Is this gambling?" is first on purpose: it is the objection that decides
 * whether an organisation lets this run at all, and burying it under the
 * feature list would be answering the easy questions first.
 */
const QUESTIONS = [
  {
    q: "רגע — זה הימור?",
    a: "לא. אין כסף בשום שלב, אין מה להפקיד ואין מה למשוך, ואי אפשר להפסיד נקודות שכבר צברתם. אנחנו משתמשים ביחסים של בוקמייקרים כמדד לכמה ניחוש היה קשה, ומתרגמים אותו לנקודות — הכסף לא נכנס לתמונה.",
  },
  {
    q: "צריך להבין בכדורגל?",
    a: "לא. דירוג הליגה סופר רק ניחושי „מי ינצח” — שאלה שכל אחד יכול לענות עליה. השאלות המתקדמות יותר קיימות למי שרוצה, אבל הן נספרות רק בלידרבורד הכללי, כך שאף אחד לא נשאר מאחור בטבלה של המשרד.",
  },
  {
    q: "כמה זה עולה?",
    a: "כלום. אין מסלול בתשלום, אין הגבלה על מספר החברים בליגה ואין כרטיס אשראי בשום מקום.",
  },
  {
    q: "מאיפה מגיעים היחסים והתוצאות?",
    a: "מ-API-Football — מחירים ותוצאות של משחקים אמיתיים משבע תחרויות, ביניהן הפרמייר ליג, ליגת האלופות וליגת העל. המשחקים נמשכים אוטומטית מדי יום, והתוצאות נבדקות כל עשר דקות.",
  },
  {
    q: "אפשר לבטל ניחוש?",
    a: `כן, עד ${CANCEL_WINDOW_MINUTES} דקות לפני שריקת הפתיחה. אחרי זה הניחוש נעול — אחרת אפשר היה לשנות בחירה כשהמשחק כבר בעיצומו.`,
  },
  {
    q: "מה קורה אם משחק נדחה או מבוטל?",
    a: "הניחושים עליו מבוטלים: אפס נקודות, אפס עונש, כאילו לא ניחשתם. הם פשוט לא נספרים לאף אחד.",
  },
  {
    q: "איך פותחים ליגה לארגון?",
    a: "נרשמים, לוחצים על „פתיחת ליגה”, בוחרים טורניר אחד ונותנים שם. מקבלים קוד הזמנה ומעבירים אותו לעובדים — מי שיש לו את הקוד מצטרף בעצמו.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-24">
      <div className="flex flex-col gap-2 text-center">
        <span className="section-label">שאלות נפוצות</span>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          לפני שנרשמים
        </h2>
      </div>

      <Accordion type="single" collapsible className="mt-8 card-kickoff px-5 py-1">
        {QUESTIONS.map((item) => (
          <AccordionItem key={item.q} value={item.q} className="last:border-b-0">
            <AccordionTrigger className="text-start text-base font-bold hover:no-underline">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
