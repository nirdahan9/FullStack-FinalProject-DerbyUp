import { KeyRound, Target, Trophy } from "lucide-react";
import { CANCEL_WINDOW_MINUTES } from "@/lib/domain/prediction-rules";

/**
 * Three steps, because three is how many there actually are. The step that
 * matters is the last one: the reason a prediction league survives a busy week
 * is that nobody has to run it.
 */
const STEPS = [
  {
    icon: KeyRound,
    title: "פותחים ליגה",
    body: "בוחרים טורניר אחד — פרמייר ליג, ליגת האלופות, ליגת העל — ומקבלים קוד הזמנה. מי שיש לו את הקוד בפנים, בלי אישורים ובלי רשימות.",
    aside: "או מצטרפים לליגה קיימת בקוד",
  },
  {
    icon: Target,
    title: "מנחשים לפני השריקה",
    body: "לכל משחק שלוש שאלות: מי ינצח, האם ייפלו יותר מ-2.5 שערים, והאם שתי הקבוצות יבקיעו. אפשר גם לנחש את התוצאה המדויקת.",
    aside: `אפשר לבטל עד ${CANCEL_WINDOW_MINUTES} דקות לפני השריקה`,
  },
  {
    icon: Trophy,
    title: "הטבלה מתעדכנת לבד",
    body: "המשחק נגמר, התוצאה נמשכת מהשירות, והניחושים מעובדים תוך דקות. אף אחד לא סופר נקודות ואף אחד לא מנהל גיליון.",
    aside: "מקבלים התראה כשהניחוש עובד",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
      <div className="flex flex-col gap-2 text-center">
        <span className="section-label">איך זה עובד</span>
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
          שלושה צעדים, ואז זה רץ לבד
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
          ההקמה לוקחת דקה. מהרגע שהליגה פתוחה אין מה לתחזק — המשחקים נכנסים לבד,
          התוצאות נמשכות לבד, והטבלה מסתדרת לבד.
        </p>
      </div>

      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="card-kickoff flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-black text-primary-foreground">
                {index + 1}
              </span>
              <step.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            </div>

            <h3 className="text-lg font-bold">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>

            <span className="mt-auto w-fit rounded-full bg-secondary px-3 py-1 text-[11px] font-bold text-muted-foreground">
              {step.aside}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
