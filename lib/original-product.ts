/**
 * The original DerbyUp — the production product this project was rebuilt from.
 *
 * This repository is a rebuild on a different stack (Next + Supabase instead of
 * a long-running Node process on Railway + Postgres). The product it rebuilds
 * was a real one: it ran in production for about seven months, shipped to both
 * app stores, and was used by employees of several companies.
 *
 * Every number below was measured directly against the original production
 * database on 2026-10-27, the week it was shut down. Nothing here is rounded up
 * or estimated, and nothing describes THIS project — the landing copy is careful
 * to keep the two apart, because conflating them would be dishonest.
 *
 * They live in one module, rather than inline in the copy, for the same reason
 * the scoring constants do: a number that appears in three sections must not be
 * able to disagree with itself.
 */

/** The window the original product was live and taking predictions. */
export const ORIGIN_PERIOD = {
  from: "2026-03-20",
  to: "2026-10-24",
  months: 7,
} as const;

/** Headline usage, measured from the production database. */
export const ORIGIN_SCALE = [
  { value: "2,239", label: "משתמשים רשומים" },
  { value: "131,893", label: "ניחושים" },
  { value: "159", label: "ליגות" },
  { value: "3,218", label: "משחקים" },
] as const;

/** The World Cup peak — the week the product carried its real load. */
export const ORIGIN_PEAK = [
  { value: "1,325", label: "מנחשים בשבוע", note: "בשבוע של 8 ביוני" },
  { value: "9,471", label: "ניחושים ביום", note: "ב-10 ביוני, מ-769 משתמשים" },
  { value: "108,375", label: "ניחושים בחודש", note: "יוני 2026 לבדו" },
  { value: "626,143", label: "התראות שנשלחו", note: "לאורך כל התקופה" },
] as const;

/** Engineering scope of the original codebase. */
export const ORIGIN_ENGINEERING = [
  { value: "85,309", label: "שורות קוד" },
  { value: "351", label: "נקודות קצה" },
  { value: "119", label: "טבלאות" },
  { value: "17", label: "ג'ובים מתוזמנים" },
] as const;

/**
 * Organisations that ran an internal league. Named in the product overview
 * document; the employee counts behind them are visible in the production
 * database as corporate email domains.
 */
export const ORIGIN_CUSTOMERS = [
  "Check Point",
  "הבנק הבינלאומי",
  "Island",
  "Fiverr",
  "NoTraffic",
] as const;

/** Where the original product ran. */
export const ORIGIN_PLATFORMS = [
  { name: "iOS", detail: "פורסם ב-App Store" },
  { name: "Android", detail: "פורסם ב-Google Play" },
  { name: "Web", detail: "אפליקציית React" },
  { name: "WhatsApp", detail: "בוט ניחושים בקבוצה" },
  { name: "Telegram", detail: "בוט ניחושים בקבוצה" },
  { name: "Slack · Teams", detail: "אינטגרציה לארגונים" },
] as const;

/**
 * Product screenshots, taken from the Google Play store listing of the original
 * app. They are the real thing — Hebrew UI, dark theme, production data.
 */
export const ORIGIN_SCREENSHOTS = [
  {
    src: "/product/screenshot-01.png",
    alt: "מסך הבית של DerbyUp: משחק מונדיאל נבחר, טיימר לסגירת הניחושים ורשימת משחקים קרובים",
    title: "מסך הבית",
    caption: "משחק נבחר עם בונוס, טיימר לסגירה ורשימת המשחקים הקרובים",
  },
  {
    src: "/product/screenshot-05.png",
    alt: "מסך ניחוש משחק: ברזיל נגד מרוקו עם יחסים של 1.63, 3.9 ו-5.75",
    title: "ניחוש משחק",
    caption: "היחסים הוקפאו ברגע הפרסום, כך שכל מי שניחש אותה תוצאה קיבל אותו ניקוד",
  },
  {
    src: "/product/screenshot-02.png",
    alt: "מסך הליגות שלי עם כרטיסי ליגה, מספר משתתפים וניקוד",
    title: "הליגות שלי",
    caption: "ליגות פרטיות וציבוריות, עם מאגר נקודות ומספר משתתפים",
  },
  {
    src: "/product/screenshot-04.png",
    alt: "טופס הניחושים וגלגל הבוסט היומי עם מכפילים",
    title: "גלגל הבוסט",
    caption: "סיבוב יומי אחד שמעניק מכפיל על הניחוש הבא",
  },
  {
    src: "/product/screenshot-03.png",
    alt: "מסך החידות היומיות: גשר הכדורגל, נתיב הקריירה, ניחוש המועדון וההרכב החסר",
    title: "החידות היומיות",
    caption: "ארבעה אתגרים יומיים שהחזיקו את המשתמשים גם בימים בלי משחקים",
  },
] as const;
