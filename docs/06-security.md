# מסמך אבטחה בסיסית — DerbyUp

**פרויקט סיום · Internet Technologies · RUNI CS 2026**
**מחבר:** ניר דהן · **גרסה:** 2.0 (תכנון) · **תאריך:** 21.8.2026

> ⚠️ **סטטוס המסמך:** נכתב בשלב התכנון ומנסח **התחייבויות אבטחה** שעל בסיסן נכתב הקוד.
> אחרי המימוש יתווסף סעיף 11 עם **אימות בפועל** — תוצאות בדיקות ה-RLS מ-[04-test-spec.md](04-test-spec.md) §5.

---

## 1. מודל האיום

לפני ההגנות — ממי בדיוק מגנים:

| # | תוקף | מה הוא רוצה | חומרה |
|---|---|---|---|
| 1 | **עובד סקרן** | לראות ניחושים של עמיתים לפני נעילה | 🟡 בינוני |
| 2 | **עובד תחרותי** | לשנות לעצמו נקודות, לשנות ניחוש בדיעבד, או לנחש אחרי הפתיחה | 🔴 גבוה |
| 3 | **עובד שנוגע ב-DevTools** | לעקוף ולידציות של הדפדפן | 🔴 גבוה |
| 4 | **גורם חיצוני** | גישה לנתוני הארגון | 🔴 גבוה |
| 5 | **סורק אוטומטי** | ניצול חולשות גנריות | 🟡 בינוני |

### 1.1 העיקרון המנחה

> **הלקוח לעולם אינו מהימן.** כל מה שרץ בדפדפן ניתן לשינוי. כל הגנה אמיתית יושבת בשרת
> או במסד הנתונים.

---

## 2. Authentication — איך מתבצע האימות

### 2.1 המנגנון

**Supabase Auth** עם אימייל וסיסמה.

| שלב | מה קורה |
|---|---|
| הרשמה | Supabase מגבב את הסיסמה ב-**bcrypt** ושומר ב-`auth.users` |
| | טריגר `on_auth_user_created` יוצר פרופיל (0 נקודות — אין מענק) |
| התחברות | אימות מול Supabase → **JWT** חתום |
| שמירת session | ה-JWT ב-cookie **httpOnly · secure · sameSite** |
| רענון | `middleware.ts` מרענן את ה-token בכל בקשה |
| התנתקות | ביטול ה-session ומחיקת ה-cookie |

### 2.2 החלטות אימות

| החלטה | נימוק |
|---|---|
| **אנחנו לא מנהלים סיסמאות** | Supabase אחראי על גיבוב, אחסון ורענון. פחות קוד = פחות טעויות |
| **cookie ולא localStorage** | `httpOnly` אינו נגיש ל-JavaScript → חסין ל-XSS שגונב token |
| **מינימום 8 תווים** | נאכף ב-Zod ובהגדרות Supabase |
| **אימייל+סיסמה בלבד בשלב זה** | צמצום שטח תקיפה; OAuth יתווסף בהמשך |

### 2.3 למה `httpOnly` חשוב

אם ה-token היה ב-`localStorage`, כל סקריפט שרץ בדף היה יכול לקרוא אותו. עם `httpOnly`
הדפדפן שולח את ה-cookie אוטומטית אך **JavaScript אינו יכול לגשת אליו** — גם אם הצליחה
הזרקת סקריפט, ה-session לא נגנב.

---

## 3. Authorization — איך מתבצעות ההרשאות

### 3.1 שלוש רמות

| רמה | מי | יכול |
|---|---|---|
| **אורח** | לא מחובר | דף נחיתה, הרשמה, התחברות |
| **משתמש רשום** | עובד | הליגות שלו, ניחוש, אתגר, פרופיל |
| **אדמין ליגה** | `leagues.creator_id` | לנהל **רק** את הליגה שיצר |

### 3.2 שתי שכבות אכיפה — הגנה לעומק

```
בקשה
  │
  ├─ שכבה 1: middleware.ts        → מחובר? אחרת הפניה ל-/login
  ├─ שכבה 2: Server Action        → ולידציה + בדיקת בעלות
  │
  ▼
  └─ שכבה 3: RLS ב-Postgres       → 🛡️ קו ההגנה האמיתי
```

> **למה כפול:** שכבות 1–2 הן חוויית משתמש והגנה ראשונה. שכבה 3 היא הביטחון האמיתי —
> **גם אם ייכתב באג באפליקציה שמדלג על בדיקה, ה-DB עדיין לא יחזיר את השורות.**

### 3.3 RLS — הליבה

```sql
alter table predictions       enable row level security;
alter table profiles          enable row level security;
alter table leagues           enable row level security;
alter table league_members    enable row level security;
alter table notifications     enable row level security;
alter table puzzle_attempts   enable row level security;
alter table user_achievements enable row level security;
```

**ניחושים — קריאה ויצירה של הבעלים בלבד, ללא שינוי או מחיקה:**

```sql
create policy "predictions_select_own" on predictions
  for select using (auth.uid() = user_id);

create policy "predictions_insert_own" on predictions
  for insert with check (auth.uid() = user_id);

-- אין policy ל-UPDATE ולא ל-DELETE:
-- משתמש אינו יכול לשנות או למחוק ניחוש ישירות.
-- היישוב מתבצע ב-service role; הביטול דרך פונקציית SECURITY DEFINER.
```

**ביטול ניחוש — למה זה לא נעשה ב-policy:**

המוצר מאפשר ביטול ניחוש עד 10 דקות לפני שריקת הפתיחה. היה מתבקש לאפשר זאת דרך
policy ל-`UPDATE`, אך זו הייתה טעות אבטחה:

| הבעיה ב-policy | ההשלכה |
|---|---|
| policy מתירה `UPDATE` על השורה | המשתמש יכול לשנות גם `odds`, `selected_outcome` או `points_earned` |
| אין דרך לאכוף את חלון הזמן ב-policy בלבד | ביטול אחרי שהמשחק התחיל |
| אין אטומיות | מצבי מרוץ בין ביטול לניחוש חדש |

> 🔴 **הסיכון החמור ביותר:** אילו הייתה policy ל-`UPDATE`, משתמש היה יכול לשנות את
> `selected_outcome` **אחרי** שהמשחק הסתיים, או לכתוב לעצמו `points_earned` גבוה.
> **הניקוד הוא הפרס** — ולכן הוא חייב להיות בלתי ניתן לעריכה מצד הלקוח.

לכן `predictions` נותרת **חסומה לחלוטין לכתיבה ישירה**, והביטול מתבצע דרך
`cancel_prediction(id)` — פונקציית `SECURITY DEFINER` שמאמתת בעלות, סטטוס וחלון זמן,
ומשנה **רק את הסטטוס**, עם `FOR UPDATE`. **המשתמש לא יכול לגעת בשורה — רק לבקש
מהמערכת לבטל אותה לפי הכללים.**

**ניסיונות באתגר — קריאה ויצירה של הבעלים; הניקוד נקבע בשרת:**

```sql
create policy "attempts_select_own" on puzzle_attempts
  for select using (auth.uid() = user_id);
-- אין policy ל-INSERT: הניסיון נרשם בשרת אחרי בדיקת התשובה,
-- אחרת המשתמש היה כותב לעצמו points_earned כרצונו.
```

**ליגות — רק ליגות שהמשתמש חבר בהן:**

```sql
create policy "leagues_select_member" on leagues
  for select using (
    exists (select 1 from league_members
            where league_id = leagues.id and user_id = auth.uid())
  );

create policy "leagues_update_creator" on leagues
  for update using (auth.uid() = creator_id);
```

**חברי ליגה — רואים רק חברים בליגות משותפות:**

```sql
create policy "members_select_shared_league" on league_members
  for select using (
    exists (select 1 from league_members m
            where m.league_id = league_members.league_id
              and m.user_id = auth.uid())
  );
```

> זו המדיניות שמאפשרת טבלת דירוג: אתה רואה את כל חברי הליגה **שלך**, ואף אחד מליגה אחרת.

**פרופילים — הפרופיל שלך, ופרופילים בליגות משותפות:**

```sql
create policy "profiles_select_visible" on profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1 from league_members a
      join league_members b on a.league_id = b.league_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);
```

### 3.4 מניעת שינוי ניקוד — נקודה קריטית

ל-`profiles` יש policy ל-`UPDATE` (לעריכת שם ואווטאר), ולכאורה משתמש יכול לשנות גם את
`total_points` שלו. המניעה בטריגר:

```sql
create function prevent_score_tampering() returns trigger
language plpgsql as $$
begin
  if new.total_points      is distinct from old.total_points
  or new.total_predictions is distinct from old.total_predictions
  or new.total_correct     is distinct from old.total_correct then
    raise exception 'score columns cannot be modified directly';
  end if;
  return new;
end; $$;

create trigger profiles_protect_score
  before update on profiles for each row
  execute function prevent_score_tampering();
```

המשתמש יכול לעדכן **שם ואווטאר בלבד**. עמודות הניקוד מתעדכנות אך ורק ביישוב, שרץ
ב-service role ועוקף את הטריגר.

> **למה זה מספיק:** גם אם משתמש ישנה את `total_points`, זהו רק **מטמון**. הדירוג בליגה
> **מחושב מהניחושים עצמם** ולא מהעמודה הזו — ולכן זיוף המטמון לא ישנה את הטבלה.
> זו הגנת עומק שנובעת מהחלטה ארכיטקטונית, לא מהגנה נקודתית.

---

## 4. פעולות המותרות רק למשתמש מחובר

| פעולה | אורח | מחובר | אדמין ליגה |
|---|---|---|---|
| צפייה בדף נחיתה | ✅ | ✅ | ✅ |
| הרשמה / התחברות | ✅ | — | — |
| צפייה במשחקים | ❌ | ✅ | ✅ |
| **הנחת ניחוש** | ❌ | ✅ | ✅ |
| **ביטול ניחוש** (עד 10 דק') | ❌ | ✅ (רק שלו) | ✅ (רק שלו) |
| יצירה / הצטרפות לליגה | ❌ | ✅ | ✅ |
| צפייה בטבלת דירוג | ❌ | ✅ (בליגות שלו) | ✅ |
| אתגר יומי | ❌ | ✅ | ✅ |
| **בחירת משחקים לליגה** | ❌ | ❌ | ✅ (בליגה שלו) |
| **סימון משחק שבוע** | ❌ | ❌ | ✅ (בליגה שלו) |
| **עדכון פרסי הליגה** | ❌ | ❌ | ✅ (בליגה שלו) |
| **יישוב ידני** | ❌ | ❌ | ✅ (בליגה שלו) |
| הרצת cron | ❌ | ❌ | ❌ (secret בלבד) |

---

## 5. מניעת גישה למידע של משתמש אחר

> זו השאלה המפורשת בהנחיות. התשובה בשלושה מנגנונים.

### 5.1 מנגנון 1 — RLS מסנן בשאילתה עצמה

הבקשה נשלחת עם ה-JWT של המשתמש. Postgres **מוסיף את תנאי ה-policy לכל שאילתה**.

```
משתמש א' מבקש:      select * from predictions
Postgres מריץ בפועל: select * from predictions where auth.uid() = user_id
תוצאה:              רק הניחושים של א'
```

**אין דרך לעקוף.** גם `select * from predictions` ידני יחזיר רק את השורות המותרות. זו הגנה
ב**שכבת הנתונים**, לא באפליקציה.

### 5.2 מנגנון 2 — הנתונים לא עוזבים את השרת

Server Components מרנדרים בשרת ושולחים **HTML**. אין endpoint שמחזיר JSON גולמי,
ואין payload שאפשר לפתוח ב-DevTools ולמצוא בו נתוני משתמש אחר.

### 5.3 מנגנון 3 — בדיקת בעלות ב-Actions

כל Action שנוגעת במשאב מאמתת בעלות **לפני** הפעולה — גם אם RLS ממילא היה חוסם.
זה מייצר הודעת שגיאה ברורה במקום תוצאה ריקה מבלבלת.

### 5.4 מקרה מיוחד: ניחושים לפני נעילה

עובד סקרן (איום #1) לא אמור לראות ניחושים של עמיתים לפני שהמשחק ננעל.
במוצר הנוכחי **אין בכלל מסך שמציג ניחושים של אחרים** — הפיצ'ר הוצא מההיקף במכוון.
`predictions_select_own` מבטיח שגם ניסיון ישיר לא יחזיר דבר.

### 5.5 מה כן נחשף — ובכוונה

טבלת הדירוג חושפת לחברי הליגה את **הניקוד** של שאר החברים. זו חשיפה מכוונת ומהותית
למוצר — בלעדיה אין תחרות. מה שלא נחשף: **על מה** הם ניחשו, ומתי.

---

## 6. ולידציה של קלטים

### 6.1 שלוש שכבות

| שכבה | מה נבדק | ניתן לעקיפה? | תפקיד |
|---|---|---|---|
| HTML | `required`, `type`, `min` | ✅ כן | UX |
| **Zod בשרת** | טיפוס, טווח, פורמט | ❌ **לא** | **ההגנה** |
| **אילוצי DB** | `CHECK`, `UNIQUE`, FK | ❌ **לא** | רשת אחרונה |

### 6.2 בשרת, לא בלקוח

```ts
export async function makePrediction(input: unknown) {
  const parsed = makePredictionSchema.safeParse(input);  // ← בשרת
  if (!parsed.success) return { ok: false, error: 'קלט לא תקין' };
  // ...
}
```

הקלט מוגדר `unknown` בכוונה — **שום דבר לא נחשב מהימן עד שעבר `parse`.**

### 6.3 SQL Injection

**לא רלוונטי בארכיטקטורה הזו.** ה-Supabase client בונה שאילתות פרמטריות; אין שרשור מחרוזות
לתוך SQL. הפונקציות ב-PL/pgSQL מקבלות פרמטרים מוקלדים.

### 6.4 XSS

React **מסמן (escapes) כל טקסט אוטומטית**. `<script>alert(1)</script>` בשם תצוגה יוצג
כטקסט ולא יורץ. `dangerouslySetInnerHTML` **אינו בשימוש בשום מקום בפרויקט** — זה כלל מפורש.

### 6.5 CSRF

Server Actions מוגנות מובנית: Next.js מאמת origin ומשתמש ב-tokens חד-פעמיים.
ה-cookies מוגדרים `sameSite`.

---

## 7. הגנה על קריאות ל-API

### 7.1 Server Actions

| הגנה | מימוש |
|---|---|
| רצות בשרת בלבד | הקוד לא נשלח ללקוח |
| אימות session | כל Action מאמתת בתחילתה |
| ולידציה | Zod על כל קלט |
| בדיקת בעלות | לפני כל פעולה על משאב |
| CSRF | מובנה ב-Next.js |

### 7.2 Route Handlers של cron

```ts
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ...
}
```

> ה-endpoints האלה משתמשים ב-**service role** ועוקפים RLS — ולכן הם **המסוכנים ביותר
> במערכת**. הגנת ה-secret כאן היא קריטית.

### 7.3 חשיפת שגיאות

הודעות שגיאה למשתמש הן **גנריות ולא חושפות מבנה פנימי**:

```
❌  "column bets.user_id does not exist"
✅  "אירעה שגיאה, נסה שוב"
```

הפרטים המלאים נרשמים בלוג בשרת בלבד.

---

## 8. שמירת סודות

### 8.1 סיווג

| משתנה | סיווג | חשוף ללקוח? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ציבורי | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ציבורי — **כפוף ל-RLS** | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 **סוד — עוקף RLS וטריגרים** | ❌ |
| `FOOTBALL_API_KEY` | 🔴 סוד | ❌ |
| `CRON_SECRET` | 🔴 סוד | ❌ |

### 8.2 הכללים

1. **`.env*` ב-`.gitignore` מהקומיט הראשון**
2. סודות מוגדרים ב-**Vercel Environment Variables** בלבד
3. רק משתנים ציבוריים באמת מקבלים תחילית `NEXT_PUBLIC_`
4. **`SUPABASE_SERVICE_ROLE_KEY` מיובא אך ורק ב-`lib/supabase/admin.ts`**, שנקרא רק
   מ-Route Handlers של cron — **לעולם לא מ-Server Component או Action של משתמש**
5. `.env.example` בריפו עם **שמות בלבד, בלי ערכים**

### 8.3 למה ה-anon key יכול להיות ציבורי

מפתח ה-anon מזהה את **הפרויקט**, לא את המשתמש. הוא אינו מעניק הרשאות בפני עצמו — כל בקשה
עדיין עוברת דרך RLS לפי ה-JWT. **בלי ה-JWT הוא לא מחזיר כלום.**

מפתח ה-service role, לעומת זאת, **עוקף RLS לחלוטין**. דליפה שלו = חשיפת כל בסיס הנתונים.

### 8.4 לקח מהפרויקט המקורי

בריפו שממנו נגזר המוצר נמצאו קבצי סוד שהוקומטו: מפתחות `.p8` ושני קובצי service account
של Firebase. **הריפו הנוכחי נפתח מאפס עם `.gitignore` מוקשח לפני הקומיט הראשון**, בדיוק
כדי למנוע את זה.

---

## 9. סיכונים שעדיין קיימים

הצגה כנה של הפערים:

| # | סיכון | חומרה | למה נותר | מה הייתי עושה |
|---|---|---|---|---|
| 1 | **אין rate limiting** | 🔴 גבוה | לא נדרש בהיקף | Upstash Redis על Actions |
| 2 | **אין אימות אימייל** | 🟡 בינוני | חסם הצטרפות בארגון | הפעלה + דומיין ארגוני מורשה |
| 3 | **אין 2FA** | 🟡 בינוני | מעבר להיקף | Supabase MFA |
| 4 | **אין נעילה אחרי כשלונות** | 🟡 בינוני | ברירת מחדל של Supabase | נעילה מדורגת |
| 5 | **אין audit log לפעולות אדמין** | 🟡 בינוני | לא נדרש | טבלת `admin_action_log` |
| 6 | סיסמה 8 תווים בלי דרישת מורכבות | 🟢 נמוך | איזון מול UX | בדיקה מול HIBP |
| 7 | **אין CSP headers** | 🟡 בינוני | לא הוגדר | CSP ב-`next.config.js` |
| 8 | **`service_role` בסביבת האפליקציה** | 🔴 גבוה | ה-cron זקוק לו | הפרדה לשירות נפרד |
| 9 | אין הצפנה ברמת השדה | 🟢 נמוך | אין מידע רגיש במיוחד | pgcrypto לפי צורך |
| 10 | אין סריקת תלויות | 🟡 בינוני | לא הוגדר | Dependabot + `npm audit` ב-CI |
| 11 | **אין מחיקת חשבון (GDPR)** | 🟡 בינוני | מעבר להיקף | מחיקה + ייצוא נתונים |

### 9.1 סדר הטיפול אילו היה זמן

1. **Rate limiting** (#1) — הפער המנוצל ביותר בפועל
2. **CSP headers** (#7) — הגנת עומק זולה מול XSS
3. **אימות אימייל** (#2) — מונע הרשמות מזויפות
4. **Audit log** (#5) — נדרש לאמון ארגוני
5. **הפרדת ה-service role** (#8) — צמצום נזק בדליפה

---

## 10. סיכום ההגנות

| איום (§1) | ההגנה |
|---|---|
| עובד סקרן | RLS + הפיצ'ר לא קיים במוצר |
| עובד תחרותי | טריגר על עמודות הניקוד · אין policy ל-UPDATE על ניחושים · ביטול רק דרך פונקציה מבוקרת · **הדירוג מחושב מהנתונים ולא מעמודה** |
| DevTools | כל ולידציה חוזרת בשרת · הנתונים לא עוזבים אותו |
| גורם חיצוני | JWT ב-cookie httpOnly · RLS · סודות בשרת |
| סורק אוטומטי | שאילתות פרמטריות · escaping של React · CSRF מובנה |

---

## 11. אימות בפועל

> 🔲 **סעיף זה יושלם אחרי המימוש.** יכיל את תוצאות הרצת בדיקות ההרשאות מ-§5
> ב-[04-test-spec.md](04-test-spec.md) — 10 בדיקות בידוד נתונים, 6 בדיקות אדמין,
> 6 בדיקות הגנת מסלולים. **נדרש כדי לסמן את המסמך כגרסה 2.0.**

---

## 12. מיפוי לדרישות ההנחיות

| דרישה בסעיף 9 להנחיות | היכן |
|---|---|
| איך מתבצע Authentication | §2 |
| איך מתבצע Authorization | §3 |
| פעולות המותרות רק למשתמש מחובר | §4 |
| מניעת גישה למידע של משתמש אחר | §5 |
| ולידציה של קלטים | §6 |
| הגנה על קריאות ל-API | §7 |
| שמירת סודות כמו API keys | §8 |
| סיכונים שנותרו ומה הייתי משפר | §9 |
