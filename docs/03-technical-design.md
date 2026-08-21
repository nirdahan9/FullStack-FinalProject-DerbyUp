# תכנון טכני מפורט — DerbyUp

**פרויקט סיום · Internet Technologies · RUNI CS 2026**
**מחבר:** ניר דהן · **גרסה:** 2.0 · **תאריך:** 21.8.2026
**מסמכים קודמים:** [01-product-spec.md](01-product-spec.md) · [02-architecture.md](02-architecture.md)

> מסמך זה נכתב **לפני** המימוש, והוא המפרט שעל בסיסו נכתב הקוד.

---

## 0. מודל הניקוד — הבסיס לכל השאר

לפני הפרטים, הכלל היחיד שממנו נגזרת כל המערכת:

> **המשתמש מנחש. אם צדק — הוא מקבל את **היחס** כנקודות. אם טעה — הוא מקבל אפס.**

```
ניחשת ניצחון של קבוצה ביחס 7.15  →  הקבוצה ניצחה  →  קיבלת 7.15 נקודות
ניחשת ניצחון של קבוצה ביחס 7.15  →  הקבוצה הפסידה →  קיבלת 0 נקודות
```

### 0.1 מה המודל הזה מבטל

**אין הימור.** המשתמש אינו מסכן דבר. אין יתרה, אין הפסד, אין כלכלת נקודות.

| מה נעלם | למה |
|---|---|
| `stake` (סכום הימור) | אין מה להמר |
| `points_balance` (יתרה) | אין ממה לגרוע |
| `min_bet` (הימור מינימלי) | אין הימור |
| מענק הצטרפות 500 נקודות | אין צורך בהון התחלתי |
| טבלת `point_transactions` | **אין הוצאה — רק צבירה** |
| ההבחנה בין "תשלום" ל"רווח נקי" | הנקודות שנצברו הן הן התוצאה |

> **ביטול ספר התנועות:** ספר תנועות נחוץ כשיש הוצאה והכנסה ויתרה שעלולה להשתבש. כאן
> **נקודות רק נצברות ולעולם לא נגרעות**, וכל צבירה כבר רשומה בטבלה שיצרה אותה
> (`predictions.points_earned` או `puzzle_attempts.points_earned`). ספר נפרד היה כפילות.

### 0.2 מה המודל הזה מרוויח

| יתרון | הסבר |
|---|---|
| **תמריץ לנחש נכון, לא בטוח** | יחס 7.15 שווה פי 4 מיחס 1.80 — משתלם לזהות הפתעות |
| **אין חסם כניסה** | מצטרף חדש מתחיל מאפס כמו כולם; אין "נגמרו לי הנקודות" |
| **אין מכניקת הימורים** | חשוב לעמידה מול רגולציה ולמכירה לארגונים |
| **פשטות** | פחות טבלאות, פחות מצבי קצה, פחות מה שיכול להישבר |

---

## 1. מבנה התיקיות

```
derbyup/
├── app/                              # Next.js App Router
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (app)/                        # דורש התחברות
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── games/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── leagues/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── admin/page.tsx
│   │   ├── join/[code]/page.tsx
│   │   ├── predictions/page.tsx
│   │   ├── challenge/page.tsx
│   │   ├── notifications/page.tsx
│   │   └── profile/page.tsx
│   ├── api/cron/
│   │   ├── sync-fixtures/route.ts
│   │   ├── settle/route.ts
│   │   └── publish-puzzle/route.ts
│   ├── layout.tsx                    # dir="rtl", ThemeProvider
│   ├── page.tsx
│   ├── error.tsx  ·  not-found.tsx  ·  globals.css
│
├── components/
│   ├── ui/                           # shadcn/ui
│   ├── layout/                       # Navbar · UserMenu · ThemeToggle
│   ├── games/                        # GameCard · QuestionCard · PredictForm
│   ├── leagues/                      # LeagueCard · LeaderboardTable · PrizeList
│   ├── predictions/                  # PredictionRow · StatusBadge
│   ├── challenge/                    # PuzzleBoard · PlayerAutocomplete
│   └── shared/                       # EmptyState · ErrorMessage · Pagination
│
├── lib/
│   ├── domain/                       # ⭐ לוגיקה טהורה — בלי I/O
│   │   ├── scoring.ts                # יחס → נקודות
│   │   ├── prediction-rules.ts       # כללי ניחוש וביטול
│   │   ├── settlement.ts             # קביעת תשובה נכונה ויישוב
│   │   ├── standings.ts              # דירוג
│   │   ├── achievements.ts
│   │   └── puzzle.ts
│   ├── supabase/                     # client · server · admin
│   ├── actions/                      # Server Actions
│   ├── validation/                   # סכימות Zod
│   ├── football-api/
│   └── utils.ts
│
├── supabase/migrations/
├── scripts/                          # seed · build-puzzle-bank
├── tests/                            # unit · integration · e2e
├── types/database.ts
└── docs/
```

### 1.1 עקרונות המבנה

| עיקרון | ביטוי |
|---|---|
| הפרדת שכבות | `app/` תצוגה · `lib/actions/` תזמור · `lib/domain/` לוגיקה · `lib/supabase/` נתונים |
| דומיין ללא תלויות | `lib/domain/` לא מייבא Supabase, Next או React |
| קומפוננטות לפי תחום | `components/games/`, לא `components/atoms/` |
| Server by default | `'use client'` רק כשצריך state או event handlers |

---

## 2. מבנה בסיס הנתונים — 12 טבלאות

### 2.1 סכימה מלאה

```sql
-- ═══ 1. פרופילים ═══
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  username          varchar(30) unique not null,
  display_name      varchar(60),
  avatar_url        text,
  total_points      numeric(10,2) not null default 0,   -- מטמון: סך הנקודות שנצברו
  total_predictions integer not null default 0,
  total_correct     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ═══ 2. תחרויות ═══ (id = מזהה הליגה ב-API-Football)
create table competitions (
  id        integer primary key,
  name      varchar(80) not null,
  country   varchar(60) not null,
  logo_url  text,
  season    integer not null,
  is_active boolean not null default true
);

-- ═══ 3. משחקים ═══
create table games (
  id             uuid primary key default gen_random_uuid(),
  fixture_id     integer unique not null,
  competition_id integer not null references competitions(id),
  home_team      varchar(80) not null,
  away_team      varchar(80) not null,
  home_logo      text,
  away_logo      text,
  kickoff_at     timestamptz not null,
  status         varchar(20) not null default 'scheduled'
                 check (status in ('scheduled','live','finished','postponed','cancelled')),
  score_home     smallint,
  score_away     smallint,
  settled_at     timestamptz,
  updated_at     timestamptz not null default now()
);

-- ═══ 4. שאלות ניחוש ═══
create table questions (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references games(id) on delete cascade,
  type            varchar(20) not null
                  check (type in ('match_result','over_under_2_5','btts')),
  outcomes        jsonb not null,   -- [{key,label,odds}]
  correct_outcome varchar(20),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (game_id, type)
);

-- ═══ 5. ניחושים ═══
create table predictions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  question_id      uuid not null references questions(id) on delete cascade,
  selected_outcome varchar(20) not null,
  odds             numeric(6,2) not null check (odds >= 1),  -- מוקפא בזמן הניחוש
  bonus_pct        smallint not null default 0
                   check (bonus_pct between 0 and 100),
  points_earned    numeric(10,2),                            -- null עד ליישוב
  status           varchar(16) not null default 'pending'
                   check (status in ('pending','correct','incorrect','void','cancelled')),
  predicted_at     timestamptz not null default now(),
  settled_at       timestamptz,
  cancelled_at     timestamptz,
  unique (user_id, question_id)      -- ניחוש אחד לשאלה. גלובלי, לא פר-ליגה
);

-- ═══ 6. ליגות ═══
create table leagues (
  id                 uuid primary key default gen_random_uuid(),
  name               varchar(60) not null,
  description        text,
  creator_id         uuid not null references profiles(id) on delete cascade,
  competition_id     integer not null references competitions(id),  -- ⚠️ חובה
  invite_code        varchar(8) unique not null,
  prizes             jsonb,        -- [{place:1, prize:'כרטיס למשחק'}, ...]
  prize_note         text,
  featured_game_id   uuid references games(id) on delete set null,
  featured_bonus_pct smallint not null default 0
                     check (featured_bonus_pct between 0 and 100),
  status             varchar(16) not null default 'active'
                     check (status in ('active','archived')),
  created_at         timestamptz not null default now()
);

-- ═══ 7. חברי ליגה ═══ (⚠️ אין עמודת ניקוד — הדירוג מחושב)
create table league_members (
  id        uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

-- ═══ 8. התראות ═══
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       varchar(24) not null
             check (type in ('prediction_settled','league_joined','achievement','puzzle_available')),
  title      varchar(120) not null,
  body       text,
  link_url   text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ═══ 9. הישגים ═══ (ההגדרות בקוד TS)
create table user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  achievement_key varchar(40) not null,
  earned_at       timestamptz not null default now(),
  unique (user_id, achievement_key)
);

-- ═══ 10. אתגר יומי ═══
create table daily_puzzles (
  id            uuid primary key default gen_random_uuid(),
  play_date     date unique not null,
  club_a        varchar(80) not null,
  club_b        varchar(80) not null,
  valid_answers jsonb not null,      -- שמות מנורמלים
  created_at    timestamptz not null default now()
);

-- ═══ 11. ניסיונות באתגר ═══
create table puzzle_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  puzzle_id      uuid not null references daily_puzzles(id) on delete cascade,
  answer         varchar(80) not null,
  is_correct     boolean not null,
  attempt_number smallint not null check (attempt_number between 1 and 3),
  points_earned  numeric(10,2) not null default 0,
  created_at     timestamptz not null default now(),
  unique (user_id, puzzle_id, attempt_number)
);

-- ═══ 12. מאגר שחקנים ל-autocomplete ═══
create table bridge_players (
  id              uuid primary key default gen_random_uuid(),
  name            varchar(80) not null,
  normalized_name varchar(80) not null unique
);
```

### 2.2 החלטה: לליגה אין עמודת ניקוד

`league_members` **אינה** מחזיקה `points_in_league`. הדירוג **מחושב בזמן קריאה**:

```sql
-- ניקוד חבר בליגה
select
  lm.user_id,
  p.display_name,
  coalesce(pred.pts, 0) + coalesce(puz.pts, 0) as league_points
from league_members lm
join profiles p on p.id = lm.user_id
left join lateral (
  select sum(pr.points_earned) as pts
  from predictions pr
  join questions q on q.id = pr.question_id
  join games    g on g.id = q.game_id
  where pr.user_id = lm.user_id
    and pr.status  = 'correct'
    and g.competition_id = $1          -- התחרות של הליגה
    and pr.predicted_at >= lm.joined_at
) pred on true
left join lateral (
  select sum(pa.points_earned) as pts
  from puzzle_attempts pa
  where pa.user_id = lm.user_id
    and pa.is_correct
    and pa.created_at >= lm.joined_at
) puz on true
where lm.league_id = $2
order by league_points desc;
```

| השיקול | ההכרעה |
|---|---|
| למה לא לשמור עמודה | עמודה מאוחסנת עלולה לסטות מהאמת; מקור אמת יחיד עדיף |
| למה זה מספיק מהיר | ליגה ארגונית = עשרות עד מאות חברים. אגרגציה זניחה בהיקף הזה |
| מה אם יגדל | `MATERIALIZED VIEW` שמתרענן ביישוב — ראה [05-scale.md](05-scale.md) |

### 2.3 שתי החלטות בנוסחת הדירוג

**1. הדירוג מסונן לפי התחרות של הליגה.** האדמין בוחר טורניר בעת יצירת הליגה
(`competition_id` הוא **חובה**), והחברים מנחשים על משחקי אותו טורניר. ליגת "פרמייר ליג"
סופרת **רק** נקודות ממשחקי הפרמייר ליג.

**2. נספרות רק נקודות מרגע ההצטרפות** (`predicted_at >= joined_at`). בלי התנאי הזה, משתמש
ותיק שמצטרף לליגה חדשה היה מגיע עם צבירה של חודשים ומנצח מיד — מה שהופך את הליגה לחסרת
משמעות עבור שאר החברים.

### 2.4 אינדקסים

```sql
create index idx_pred_user_time      on predictions(user_id, predicted_at desc);
create index idx_pred_question_status on predictions(question_id, status);
create index idx_pred_user_status    on predictions(user_id, status)
                                     where status = 'correct';
create index idx_questions_game      on questions(game_id);
create index idx_games_comp_kickoff  on games(competition_id, kickoff_at);
create index idx_games_status_kickoff on games(status, kickoff_at);
create index idx_members_league      on league_members(league_id);
create index idx_members_user        on league_members(user_id);
create index idx_leagues_code        on leagues(invite_code);
create index idx_notif_user_unread   on notifications(user_id, created_at desc)
                                     where read_at is null;
create index idx_puzzle_user         on puzzle_attempts(user_id, created_at desc);
create index idx_players_trgm        on bridge_players
                                     using gin (normalized_name gin_trgm_ops);
```

| אינדקס | השאילתה שהוא משרת |
|---|---|
| `idx_pred_user_status` | **חלקי** — רק ניחושים נכונים. הבסיס לחישוב הדירוג |
| `idx_pred_question_status` | היישוב: כל הניחושים הממתינים לשאלה |
| `idx_games_comp_kickoff` | משחקי התחרות של הליגה — השאילתה החמה בדירוג |
| `idx_notif_user_unread` | **חלקי** — רק לא-נקראות; נשאר קטן לנצח |
| `idx_players_trgm` | autocomplete — trigram לחיפוש תת-מחרוזת |

### 2.5 טריגר ליצירת פרופיל

```sql
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id,
          split_part(new.email,'@',1) || '_' || substr(new.id::text,1,4),
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();
```

> יצירת הפרופיל בטריגר ולא בקוד — כך אי אפשר לקבל משתמש מאומת בלי פרופיל, גם אם האפליקציה
> קרסה באמצע ההרשמה. **אין יותר מענק הצטרפות** — מתחילים מאפס נקודות.

---

## 3. מבנה הקומפוננטות המרכזיות

| קומפוננטה | סוג | תפקיד | Props עיקריים |
|---|---|---|---|
| `GameCard` | Server | תצוגת משחק | `game`, `isFeatured` |
| `QuestionCard` | Client | שאלה + אפשרויות ויחסים | `question`, `existingPrediction` |
| `PredictForm` | Client | בחירת תשובה ושליחה | `questionId`, `outcomes`, `bonusPct` |
| `LeaderboardTable` | Server | טבלת דירוג | `rows`, `page`, `currentUserId` |
| `PrizeList` | Server | פרסי הליגה לפי מקום | `prizes`, `note` |
| `InviteCodeBox` | Client | הצגה והעתקה של הקוד | `code` |
| `LeagueCard` | Server | תקציר ליגה | `league`, `memberCount`, `myRank` |
| `PredictionRow` | Server | שורת היסטוריה | `prediction` |
| `PuzzleBoard` | Client | לוח האתגר | `puzzle`, `attemptsUsed` |
| `PlayerAutocomplete` | Client | חיפוש שחקן | `onSelect` |
| `Pagination` | Client | ניווט עמודים | `page`, `totalPages`, `baseUrl` |

### 3.1 חלוקת Server/Client

**Server Component** (ברירת מחדל) — כל מה שרק מציג נתונים.
**Client Component** — רק אם יש state מקומי, event handlers, או hooks.

דוגמה: `/games/[id]` הוא Server Component ששולף את המשחק והשאלות, ומרנדר בתוכו `PredictForm`
שהוא Client. **הנתונים נשלפים בשרת; רק האינטראקציה בלקוח.**

---

## 4. פעולות CRUD מרכזיות

| ישות | CREATE | READ | UPDATE | DELETE |
|---|---|---|---|---|
| **פרופיל** | טריגר בהרשמה | `/profile`, `/dashboard` | `updateProfile` | cascade ממחיקת חשבון |
| **ליגה** | `createLeague` | `/leagues`, `/leagues/[id]` | `setFeaturedGame`, `updatePrizes` | ארכוב, לא מחיקה |
| **חברות** | `joinLeague` | טבלת דירוג | ❌ אין מה לעדכן | עזיבת ליגה |
| **ניחוש** | `makePrediction` | `/predictions`, `/games/[id]` | יישוב (`status`, `points_earned`) | ✅ ביטול עד **10 דק'** לפני פתיחה |
| **משחק** | cron sync | `/games` | cron sync (תוצאה) | ❌ |
| **שאלה** | cron sync | `/games/[id]` | יישוב (`correct_outcome`) | cascade עם המשחק |
| **התראה** | ביישוב/הצטרפות | `/notifications` | `markNotificationRead` | ניקוי ישנות |
| **ניסיון באתגר** | `submitPuzzleAnswer` | `/challenge` | ❌ | ❌ |

### 4.1 שלוש החלטות על ביטול ומחיקה

**ניחוש ניתן לביטול — עד 10 דקות לפני שריקת הפתיחה.**

| השיקול | ההכרעה |
|---|---|
| למה לאפשר | טעות בבחירה היא אנושית; חסימה מוחלטת מתסכלת |
| למה **לא** עד הרגע האחרון | ברגעים האחרונים מתפרסמים הרכבים ופציעות. ביטול על סמך מידע כזה הופך את הביטול לכלי משחק במקום לתיקון טעות |
| למה **10 דקות** | רחב מספיק לתיקון, צר מספיק כדי שלא ינוצל |

הביטול הוא **שינוי סטטוס ל-`cancelled`**, לא מחיקה — הרשומה נשמרת לתיעוד. **אין החזר**,
כי מלכתחילה לא נגרע דבר. אחרי ביטול ניתן לנחש מחדש באותה שאלה.

**ניחוש מיושב לעולם אינו ניתן לשינוי.**

**ניקוד לעולם אינו נערך ידנית.** `points_earned` נקבע פעם אחת ביישוב ולא נוגעים בו.

---

## 5. תיאור ה-API

### 5.1 Server Actions

```ts
// lib/actions/leagues.ts
createLeague(input: { name, description?, competitionId })
  → { ok: true, leagueId, inviteCode } | { ok: false, error }

joinLeague(input: { inviteCode })
  → { ok: true, leagueId } | { ok: false, error }

updatePrizes(input: { leagueId, prizes, note? })      // אדמין ליגה

// lib/actions/predictions.ts
makePrediction(input: { questionId, outcome })
  → { ok: true, predictionId, potentialPoints } | { ok: false, error, code }

cancelPrediction(input: { predictionId })
  → { ok: true } | { ok: false, error, code }

// lib/actions/admin.ts
setFeaturedGame(input: { leagueId, gameId, bonusPct })
settleGameManually(input: { gameId, scoreHome, scoreAway })

// lib/actions/challenge.ts
submitPuzzleAnswer(input: { puzzleId, answer })
  → { ok: true, isCorrect, pointsEarned, attemptsLeft } | { ok: false, error }
```

> שים לב: `makePrediction` **אינה מקבלת `leagueId`**. הניחוש גלובלי — הליגות מדרגות אותו
> לפי התחרות שלהן.

כל Action מחזירה **תוצאה מפורשת** ולא זורקת חריגה, כדי שה-UI יציג הודעה מדויקת.

### 5.2 Route Handlers (cron)

| Endpoint | תזמון | פעולה |
|---|---|---|
| `POST /api/cron/sync-fixtures` | `0 4 * * *` | משחקים 7 ימים קדימה + יחסים + בניית שאלות |
| `POST /api/cron/settle` | `0 * * * *` | יישוב משחקים שהסתיימו |
| `POST /api/cron/publish-puzzle` | `5 0 * * *` | פרסום אתגר היום |

אימות: `Authorization: Bearer ${CRON_SECRET}`. ללא header תקין → `401`.

### 5.3 API-Football

| Endpoint | פרמטרים | שימוש |
|---|---|---|
| `GET /fixtures` | `league`, `season`, `from`, `to` | משחקים ותוצאות |
| `GET /odds` | `league`, `season`, `date` | יחסים |

שווקים: `Match Winner` → `match_result` · `Goals Over/Under` (2.5) → `over_under_2_5` ·
`Both Teams Score` → `btts`. אם שוק חסר — **יחסי ברירת מחדל**.

> **היחסים הם הניקוד**, ולכן איכותם קריטית. יחס שגוי = ניקוד שגוי. משחק שהגיע בלי יחסים
> מקבל ערכי ברירת מחדל שמרניים, ולא נשאר בלי שאלות.

---

## 6. הלוגיקה העסקית המרכזית

כל הפונקציות בסעיף זה ב-`lib/domain/` — **טהורות, בלי גישה ל-DB או לרשת**.

### 6.1 חישוב נקודות

```ts
// lib/domain/scoring.ts
export function pointsForCorrectPrediction(odds: number, bonusPct = 0): number {
  return round2(odds * (1 + bonusPct / 100));
}
```

| דוגמה | חישוב | תוצאה |
|---|---|---|
| יחס 7.15, בלי בונוס | `7.15 × 1.00` | **7.15** |
| יחס 2.10, בלי בונוס | `2.10 × 1.00` | **2.10** |
| יחס 7.15, משחק שבוע 50% | `7.15 × 1.50` | **10.73** |
| ניחוש שגוי | — | **0** |

היחס **מוקפא בזמן הניחוש** (`predictions.odds`) — שינוי מאוחר יותר אינו משפיע.

### 6.2 כללי ניחוש

```ts
// lib/domain/prediction-rules.ts
export function validatePrediction(ctx: {
  game: { kickoffAt: Date; status: string; competitionId: number };
  hasExisting: boolean;
  userCompetitions: number[];    // התחרויות של הליגות שהמשתמש חבר בהן
  now: Date;
}): { ok: true } | { ok: false; reason: PredictionRejection }
```

| # | כלל | קוד דחייה |
|---|---|---|
| 1 | המשחק טרם התחיל | `GAME_STARTED` |
| 2 | סטטוס `scheduled` בלבד | `GAME_NOT_OPEN` |
| 3 | אין ניחוש קיים לשאלה | `ALREADY_PREDICTED` |
| 4 | המשתמש חבר בליגה של התחרות | `NO_LEAGUE_FOR_COMPETITION` |

> **כלל 4** קושר את המוצר: מנחשים כי חברים בליגה. משתמש בלי ליגה רלוונטית לא רואה
> את המשחקים מלכתחילה.

### 6.3 כללי ביטול

```ts
export const CANCEL_WINDOW_MINUTES = 10;

export function validateCancellation(ctx: {
  prediction: { userId: string; status: string };
  game: { kickoffAt: Date };
  requesterId: string;
  now: Date;
}): { ok: true } | { ok: false; reason: CancelRejection }
```

| # | כלל | קוד דחייה |
|---|---|---|
| 1 | המבקש הוא בעל הניחוש | `NOT_OWNER` |
| 2 | הסטטוס `pending` | `ALREADY_SETTLED` |
| 3 | נותרו **יותר** מ-10 דקות עד הפתיחה | `CANCEL_WINDOW_CLOSED` |

הביטול מבוצע בפונקציית `SECURITY DEFINER`:

```sql
create function cancel_prediction(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pred predictions%rowtype; v_kickoff timestamptz;
begin
  select * into v_pred from predictions where id = p_id for update;
  if not found                    then raise exception 'NOT_FOUND';            end if;
  if v_pred.user_id <> auth.uid() then raise exception 'NOT_OWNER';            end if;
  if v_pred.status  <> 'pending'  then raise exception 'ALREADY_SETTLED';      end if;

  select g.kickoff_at into v_kickoff
  from questions q join games g on g.id = q.game_id
  where q.id = v_pred.question_id;

  if v_kickoff <= now() + interval '10 minutes'
                                  then raise exception 'CANCEL_WINDOW_CLOSED'; end if;

  update predictions set status = 'cancelled', cancelled_at = now() where id = p_id;
end; $$;
```

> **למה פונקציה ולא policy ל-UPDATE:** policy הייתה מתירה למשתמש לשנות גם את `odds` או
> `selected_outcome` — כלומר לשנות ניחוש בדיעבד. הפונקציה מתירה **פעולה אחת בלבד**, לפי
> כללים שהמשתמש אינו יכול לעקוף.

### 6.4 קביעת התשובה הנכונה

```ts
// lib/domain/settlement.ts
export function resolveOutcome(
  type: QuestionType, scoreHome: number, scoreAway: number
): string {
  switch (type) {
    case 'match_result':
      return scoreHome > scoreAway ? 'home' : scoreHome < scoreAway ? 'away' : 'draw';
    case 'over_under_2_5':
      return scoreHome + scoreAway > 2.5 ? 'over' : 'under';
    case 'btts':
      return scoreHome > 0 && scoreAway > 0 ? 'yes' : 'no';
  }
}
```

### 6.5 יישוב ניחוש

```ts
export function settlePrediction(
  pred: Prediction, correctOutcome: string
): { status: 'correct' | 'incorrect'; pointsEarned: number } {
  const isCorrect = pred.selectedOutcome === correctOutcome;
  return {
    status: isCorrect ? 'correct' : 'incorrect',
    pointsEarned: isCorrect
      ? pointsForCorrectPrediction(pred.odds, pred.bonusPct)
      : 0,
  };
}
```

> **פשטות המודל בולטת כאן:** אין חישוב רווח, אין עדכון יתרה, אין החזר. ניחוש נכון מקבל את
> היחס; ניחוש שגוי מקבל אפס.

### 6.6 משחק שבוטל

משחק ב-`cancelled` או `postponed` → כל הניחושים ל-`void` ו-`points_earned = 0`.
המשתמש אינו נפגע ואינו מרוויח מאירוע שאינו בשליטתו.

### 6.7 דירוג

```ts
// lib/domain/standings.ts
export function rankMembers(rows: MemberScore[]): RankedMember[]
```

מיון לפי נקודות יורד; שובר שוויון: מספר ניחושים נכונים, ואז תאריך הצטרפות.
**דירוג תחרותי** — שני שווים מקבלים את אותו מקום, והבא אחריהם מדלג (100/100/90 → 1, 1, 3).

### 6.8 הישגים

```ts
// lib/domain/achievements.ts
export const ACHIEVEMENTS = [
  { key: 'first_prediction', title: 'ניחוש ראשון',   check: s => s.totalPredictions >= 1 },
  { key: 'ten_predictions',  title: '10 ניחושים',     check: s => s.totalPredictions >= 10 },
  { key: 'first_correct',    title: 'פגיעה ראשונה',   check: s => s.totalCorrect >= 1 },
  { key: 'streak_three',     title: 'רצף 3 נכונים',   check: s => s.currentStreak >= 3 },
  { key: 'underdog',         title: 'ניחוש הפתעה',    check: s => s.bestOdds >= 5 },
  { key: 'first_puzzle',     title: 'אתגר ראשון',     check: s => s.puzzlesSolved >= 1 },
  { key: 'league_joined',    title: 'הצטרפת לליגה',   check: s => s.leaguesJoined >= 1 },
  { key: 'league_leader',    title: 'מקום ראשון',     check: s => s.bestRank === 1 },
] as const;
```

כולם נגזרים מנתונים קיימים — **אין מנגנון מעקב נפרד**. נבדקים בסוף ה-cron של היישוב.
`underdog` מתאפשר רק במודל הזה: הוא מתגמל ניחוש נכון ביחס גבוה.

### 6.9 אתגר יומי

```ts
// lib/domain/puzzle.ts
export const PUZZLE_POINTS = [50, 30, 15] as const;   // לפי מספר הניסיון

export function normalizeName(raw: string): string   // lowercase, בלי ניקוד, רווח יחיד
export function checkAnswer(answer: string, validAnswers: string[]): boolean
```

עד **3 ניסיונות**. הנקודות נספרות בכל הליגות של המשתמש (מרגע ההצטרפות).

> **הערה על האיזון:** 50 נקודות הן משמעותית יותר מניחוש טיפוסי (2–10 נקודות). זו **בחירה
> מכוונת** — האתגר היומי אמור להיות תמריץ חזק לכניסה יומית, גם בימים שאין בהם משחקים.
> מי שמתמיד באתגר יכול להוביל בטבלה גם בלי לנחש הרבה.

---

## 7. ניהול State

| סוג State | היכן | מנגנון |
|---|---|---|
| נתוני שרת | בשרת | Server Components + `revalidatePath()` |
| Session | cookies | `@supabase/ssr` + `middleware.ts` |
| טפסים | לקוח | `useActionState` + `useFormStatus` |
| UI מקומי | לקוח | `useState` |
| ערכת נושא | localStorage | `next-themes` |
| מסננים ועמודים | URL | `searchParams` |

### 7.1 החלטה: בלי ספריית state גלובלי

אין Redux, אין Zustand, אין React Query:

- **הנתונים נטענים בשרת** — אין צורך במטמון בלקוח
- **`revalidatePath()` הוא מנגנון הרענון** — אחרי כל Action
- **State ב-URL** (מסננים, עמוד) — ניתן לשיתוף וחוזר אחרי refresh

הפחתת מורכבות מכוונת, לא חיסכון בעבודה.

---

## 8. טיפול בשגיאות

### 8.1 שלוש רמות

| רמה | מנגנון | מה המשתמש רואה |
|---|---|---|
| **צפויה** (המשחק התחיל) | `{ ok: false, error }` | הודעה בטופס |
| **לא צפויה** בעמוד | `error.tsx` | מסך שגיאה + "נסה שוב" |
| **גלובלית** | `global-error.tsx` | מסך שגיאה כללי |

### 8.2 החלטה: Actions מחזירות שגיאות ולא זורקות

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };
```

שגיאה עסקית היא **תוצאה תקינה של הזרימה**, לא תקלה. `throw` שמור לתקלות אמיתיות.

### 8.3 מיפוי קודי דחייה להודעות

| קוד | הודעה למשתמש |
|---|---|
| `GAME_STARTED` | המשחק כבר התחיל, לא ניתן לנחש |
| `GAME_NOT_OPEN` | המשחק אינו פתוח לניחושים |
| `ALREADY_PREDICTED` | כבר ניחשת בשאלה הזו |
| `NO_LEAGUE_FOR_COMPETITION` | אינך חבר בליגה של התחרות הזו |
| `CANCEL_WINDOW_CLOSED` | לא ניתן לבטל — נותרו פחות מ-10 דקות לפתיחה |
| `ALREADY_SETTLED` | הניחוש כבר יושב |
| `NOT_OWNER` | הניחוש אינו שלך |
| `INVALID_CODE` | קוד הזמנה לא תקין |

### 8.4 כשל בספק החיצוני

אם API-Football לא זמין: ה-cron **נכשל בשקט ומתועד**, ולא מוחק נתונים קיימים.
האדמין יכול ליישב ידנית — רשת הביטחון.

---

## 9. ולידציה של קלטים

### 9.1 סכימות Zod

```ts
// lib/validation/schemas.ts
export const signUpSchema = z.object({
  email:       z.string().email('כתובת אימייל לא תקינה'),
  password:    z.string().min(8, 'סיסמה באורך 8 תווים לפחות'),
  displayName: z.string().min(2).max(60),
});

export const createLeagueSchema = z.object({
  name:          z.string().min(3).max(60),
  description:   z.string().max(500).optional(),
  competitionId: z.number().int().positive(),        // חובה
});

export const makePredictionSchema = z.object({
  questionId: z.string().uuid(),
  outcome:    z.string().min(1).max(20),
});

export const joinLeagueSchema = z.object({
  inviteCode: z.string().length(8).regex(/^[A-Z0-9]+$/),
});

export const prizesSchema = z.object({
  leagueId: z.string().uuid(),
  prizes:   z.array(z.object({
    place: z.number().int().min(1).max(20),
    prize: z.string().min(1).max(120),
  })).max(20),
  note:     z.string().max(500).optional(),
});
```

> **שים לב כמה הצטמצם:** `makePredictionSchema` היא שני שדות. אין `stake` לוודא, אין
> טווח סכומים, אין `leagueId`. שטח התקיפה קטן בהתאם.

### 9.2 שלוש שכבות

| שכבה | מה נבדק | ניתן לעקיפה? | תפקיד |
|---|---|---|---|
| HTML | `required`, `type` | ✅ כן | UX |
| **Zod בשרת** | טיפוס, טווח, פורמט | ❌ **לא** | **ההגנה** |
| **אילוצי DB** | `CHECK`, `UNIQUE`, FK | ❌ **לא** | רשת אחרונה |

> **העיקרון:** ולידציית לקוח היא נוחות. **ולידציית השרת היא האמת.**

### 9.3 למה גם וגם

`bonus_pct between 0 and 100` נבדק ב-Zod **וגם** ב-`CHECK`. הכפילות מכוונת: אם ייכתב בעתיד
סקריפט שכותב ל-DB ישירות, ה-DB עדיין מגן.

---

## 10. תכנון חוויית המשתמש

### 10.1 עקרונות

| עיקרון | ביטוי |
|---|---|
| **RTL מלידה** | `dir="rtl"`; logical properties (`ms-`/`me-`) ולא `ml-`/`mr-` |
| **מובייל תחילה** | רוב העובדים יגיעו מהטלפון |
| **מצב טעינה תמיד** | `loading.tsx` + skeleton |
| **מצב ריק מדבר** | "אין עדיין ניחושים — התחל מהמשחקים" + כפתור |
| **משוב מיידי** | `useFormStatus` נועל את הכפתור תוך כדי שליחה |
| **נגישות** | ניגודיות AA, ניווט מקלדת, `aria-label` |

### 10.2 המסע הקריטי — הנחת ניחוש

```
/dashboard → משחקי התחרות של הליגה שלי
     │ לחיצה על משחק
     ▼
/games/[id]
     │  3 שאלות; לכל אפשרות מוצג היחס = הנקודות שתקבל
     │  משחק שבוע מסומן עם הבונוס
     ▼
בחירת אפשרות
     │  "אם תצדק תקבל 7.15 נקודות"   ← מיידי, בלי טופס סכום
     ▼
"נחש" → כפתור נעול + spinner
     ▼
הצלחה → toast + השאלה עוברת למצב "ניחשת" + כפתור "בטל"
```

> **הבדל מהותי מהתכנון הקודם:** אין שדה סכום. הניחוש הוא **לחיצה אחת**. זה מקצר את המסע
> דרמטית ומוריד את החיכוך — קריטי במוצר שמיועד לעובדים שאינם מהמרים.

### 10.3 החלטת UX: היחס מוצג כנקודות

מוצג **"7.15 נקודות"** ולא "×7.15" ולא "+615". במודל הזה היחס **הוא** הניקוד, ולכן
אין סיבה להציג אותו כמכפיל — זה רק היה מבלבל.

### 10.4 מצב כהה

טוקנים של Tailwind (`--background`, `--foreground`) עם `next-themes`.
**בלי צבעים קשיחים בקוד** — כל צבע דרך טוקן.

---

## 11. מיפוי לדרישות ההנחיות

| דרישה בסעיף 4 להנחיות | היכן במסמך |
|---|---|
| מבנה התיקיות | §1 |
| מבנה הקומפוננטות המרכזיות | §3 |
| מבנה בסיס הנתונים | §2 |
| פעולות CRUD מרכזיות | §4 |
| תיאור ה-API | §5 |
| הלוגיקה העסקית המרכזית | §6 |
| ניהול State | §7 |
| טיפול בשגיאות | §8 |
| ולידציות של קלטים | §9 |
| תכנון חוויית המשתמש | §10 |
