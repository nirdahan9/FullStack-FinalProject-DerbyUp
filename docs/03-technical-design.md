# תכנון טכני מפורט — DerbyUp

**פרויקט סיום · Internet Technologies · RUNI CS 2026**
**מחבר:** ניר דהן · **גרסה:** 1.0 · **תאריך:** 21.8.2026
**מסמכים קודמים:** [01-product-spec.md](01-product-spec.md) · [02-architecture.md](02-architecture.md)

> מסמך זה נכתב **לפני** המימוש, והוא המפרט שעל בסיסו נכתב הקוד.

---

## 1. מבנה התיקיות

```
derbyup/
├── app/                              # Next.js App Router
│   ├── (auth)/                       # קבוצת מסלולים — ללא ניווט ראשי
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (app)/                        # קבוצת מסלולים — דורשת התחברות
│   │   ├── layout.tsx                # ניווט + כותרת + בדיקת session
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
│   │   ├── bets/page.tsx
│   │   ├── challenge/page.tsx
│   │   ├── notifications/page.tsx
│   │   └── profile/page.tsx
│   ├── api/cron/
│   │   ├── sync-fixtures/route.ts
│   │   ├── settle/route.ts
│   │   └── publish-puzzle/route.ts
│   ├── layout.tsx                    # root layout — dir="rtl", ThemeProvider
│   ├── page.tsx                      # דף נחיתה
│   ├── error.tsx  ·  not-found.tsx  ·  globals.css
│
├── components/
│   ├── ui/                           # shadcn/ui — קומפוננטות בסיס
│   ├── layout/                       # Navbar · UserMenu · ThemeToggle
│   ├── games/                        # GameCard · BetQuestionCard · PlaceBetForm
│   ├── leagues/                      # LeagueCard · LeaderboardTable · InviteCodeBox
│   ├── bets/                         # BetHistoryRow · BetStatusBadge
│   ├── challenge/                    # PuzzleBoard · PlayerAutocomplete
│   └── shared/                       # EmptyState · ErrorMessage · Pagination
│
├── lib/
│   ├── domain/                       # ⭐ לוגיקה עסקית טהורה — בלי I/O
│   │   ├── betting.ts                # חישוב זכייה, בונוס, כללי הנחה
│   │   ├── settlement.ts             # קביעת תשובה נכונה, יישוב
│   │   ├── standings.ts              # דירוג ומיון
│   │   ├── achievements.ts           # כללי הישגים
│   │   └── puzzle.ts                 # נרמול והשוואת תשובות
│   ├── supabase/
│   │   ├── client.ts                 # לקוח דפדפן
│   │   ├── server.ts                 # לקוח שרת (cookies)
│   │   └── admin.ts                  # service role — cron בלבד
│   ├── actions/                      # Server Actions
│   ├── validation/                   # סכימות Zod
│   ├── football-api/                 # לקוח API-Football
│   └── utils.ts
│
├── supabase/migrations/              # מיגרציות SQL ממוספרות
├── scripts/                          # seed · build-puzzle-bank
├── tests/                            # unit · integration(RLS) · e2e
├── types/database.ts                 # טיפוסים מיוצרים מהסכימה
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

## 2. מבנה בסיס הנתונים

### 2.1 סכימה מלאה

```sql
-- ═══ 1. פרופילים ═══
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       varchar(30) unique not null,
  display_name   varchar(60),
  avatar_url     text,
  points_balance numeric(14,2) not null default 500 check (points_balance >= 0),
  total_bets     integer not null default 0,
  total_wins     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
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
create table bet_questions (
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

-- ═══ 5. ליגות ═══
create table leagues (
  id                 uuid primary key default gen_random_uuid(),
  name               varchar(60) not null,
  description        text,
  creator_id         uuid not null references profiles(id) on delete cascade,
  competition_id     integer references competitions(id),  -- null = כל התחרויות
  invite_code        varchar(8) unique not null,
  min_bet            integer not null default 10 check (min_bet > 0),
  featured_game_id   uuid references games(id) on delete set null,
  featured_bonus_pct smallint not null default 0
                     check (featured_bonus_pct between 0 and 100),
  status             varchar(16) not null default 'active'
                     check (status in ('active','archived')),
  created_at         timestamptz not null default now()
);

-- ═══ 6. חברי ליגה ═══
create table league_members (
  id               uuid primary key default gen_random_uuid(),
  league_id        uuid not null references leagues(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  points_in_league numeric(14,2) not null default 0,
  joined_at        timestamptz not null default now(),
  unique (league_id, user_id)
);

-- ═══ 7. ניחושים ═══
create table bets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  league_id        uuid not null references leagues(id) on delete cascade,
  question_id      uuid not null references bet_questions(id) on delete cascade,
  selected_outcome varchar(20) not null,
  stake            integer not null check (stake > 0),
  odds             numeric(6,2) not null check (odds >= 1),
  bonus_pct        smallint not null default 0,
  potential_payout numeric(14,2) not null,
  actual_payout    numeric(14,2),
  status           varchar(16) not null default 'pending'
                   check (status in ('pending','won','lost','void')),
  placed_at        timestamptz not null default now(),
  settled_at       timestamptz,
  unique (user_id, question_id, league_id)   -- ניחוש אחד לשאלה בכל ליגה
);

-- ═══ 8. ספר תנועות נקודות ═══
create table point_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  amount       numeric(14,2) not null,        -- שלילי = חיוב
  type         varchar(24) not null
               check (type in ('signup_bonus','bet_placed','bet_won',
                               'bet_void','puzzle_reward','admin_adjust')),
  reference_id uuid,
  description  text,
  created_at   timestamptz not null default now()
);

-- ═══ 9. התראות ═══
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       varchar(24) not null
             check (type in ('bet_settled','league_joined','achievement','puzzle_available')),
  title      varchar(120) not null,
  body       text,
  link_url   text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ═══ 10. הישגים ═══ (ההגדרות בקוד TS, כאן רק מה שהושג)
create table user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  achievement_key varchar(40) not null,
  earned_at       timestamptz not null default now(),
  unique (user_id, achievement_key)
);

-- ═══ 11. אתגר יומי ═══
create table daily_puzzles (
  id            uuid primary key default gen_random_uuid(),
  play_date     date unique not null,
  club_a        varchar(80) not null,
  club_b        varchar(80) not null,
  valid_answers jsonb not null,     -- ["lionel messi","..."] מנורמל
  reward_points integer not null default 50,
  created_at    timestamptz not null default now()
);

-- ═══ 12. ניסיונות באתגר ═══
create table puzzle_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  puzzle_id      uuid not null references daily_puzzles(id) on delete cascade,
  answer         varchar(80) not null,
  is_correct     boolean not null,
  attempt_number smallint not null default 1 check (attempt_number between 1 and 3),
  points_earned  integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (user_id, puzzle_id, attempt_number)
);

-- ═══ 13. מאגר שחקנים ל-autocomplete ═══
create table bridge_players (
  id              uuid primary key default gen_random_uuid(),
  name            varchar(80) not null,
  normalized_name varchar(80) not null unique
);
```

### 2.2 אינדקסים והנימוק לכל אחד

```sql
create index idx_bets_user_placed     on bets(user_id, placed_at desc);
create index idx_bets_question_status on bets(question_id, status);
create index idx_bets_league          on bets(league_id);
create index idx_members_standings    on league_members(league_id, points_in_league desc);
create index idx_games_kickoff        on games(kickoff_at);
create index idx_games_status_kickoff on games(status, kickoff_at);
create index idx_questions_game       on bet_questions(game_id);
create index idx_notif_user_unread    on notifications(user_id, created_at desc)
                                      where read_at is null;
create index idx_tx_user              on point_transactions(user_id, created_at desc);
create index idx_players_trgm         on bridge_players
                                      using gin (normalized_name gin_trgm_ops);
```

| אינדקס | השאילתה שהוא משרת |
|---|---|
| `idx_bets_user_placed` | היסטוריית ניחושים — הנפוצה ביותר |
| `idx_bets_question_status` | היישוב: כל הניחושים הממתינים לשאלה |
| `idx_members_standings` | טבלת דירוג — מיון לפי נקודות. **חוסך sort מלא** |
| `idx_games_status_kickoff` | "משחקים קרובים" ו"משחקים שהסתיימו" ב-cron |
| `idx_notif_user_unread` | אינדקס **חלקי** — רק לא-נקראות. קטן ומהיר |
| `idx_players_trgm` | autocomplete — trigram לחיפוש תת-מחרוזת |

### 2.3 טריגר ליצירת פרופיל

```sql
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id,
          split_part(new.email,'@',1) || '_' || substr(new.id::text,1,4),
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  insert into public.point_transactions (user_id, amount, type, description)
  values (new.id, 500, 'signup_bonus', 'מענק הצטרפות');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();
```

> יצירת הפרופיל בטריגר ולא בקוד — כך אי אפשר לקבל משתמש מאומת בלי פרופיל, גם אם האפליקציה
> קרסה באמצע ההרשמה.

---

## 3. מבנה הקומפוננטות המרכזיות

| קומפוננטה | סוג | תפקיד | Props עיקריים |
|---|---|---|---|
| `GameCard` | Server | תצוגת משחק | `game`, `isFeatured` |
| `BetQuestionCard` | Client | שאלה + אפשרויות | `question`, `existingBet` |
| `PlaceBetForm` | Client | טופס הנחת ניחוש | `questionId`, `leagueId`, `outcomes`, `balance` |
| `LeaderboardTable` | Server | טבלת דירוג | `members`, `page`, `currentUserId` |
| `InviteCodeBox` | Client | הצגה והעתקה של הקוד | `code` |
| `LeagueCard` | Server | תקציר ליגה | `league`, `memberCount`, `myRank` |
| `BetHistoryRow` | Server | שורת היסטוריה | `bet` |
| `PuzzleBoard` | Client | לוח האתגר | `puzzle`, `attemptsUsed` |
| `PlayerAutocomplete` | Client | חיפוש שחקן | `onSelect` |
| `NotificationList` | Client | רשימת התראות | `notifications` |
| `Pagination` | Client | ניווט עמודים | `page`, `totalPages`, `baseUrl` |

### 3.1 חלוקת Server/Client

**Server Component** (ברירת מחדל) — כל מה שרק מציג נתונים.
**Client Component** — רק אם יש state מקומי, event handlers, או שימוש ב-hooks.

דוגמה: `/games/[id]` הוא Server Component ששולף את המשחק והשאלות. הוא מרנדר בתוכו את
`PlaceBetForm` שהוא Client, כי יש בו טופס. **הנתונים נשלפים בשרת; רק האינטראקציה בלקוח.**

---

## 4. פעולות CRUD מרכזיות

| ישות | CREATE | READ | UPDATE | DELETE |
|---|---|---|---|---|
| **פרופיל** | טריגר בהרשמה | `/profile`, `/dashboard` | `updateProfile` | דרך מחיקת חשבון (cascade) |
| **ליגה** | `createLeague` | `/leagues`, `/leagues/[id]` | `setFeaturedGame`, `selectLeagueGames` | ארכוב (`status`), לא מחיקה |
| **חברות** | `joinLeague` | טבלת דירוג | `points_in_league` ביישוב | עזיבת ליגה |
| **ניחוש** | `placeBet` | `/bets`, `/games/[id]` | יישוב (`status`, `actual_payout`) | ❌ **לא ניתן למחיקה** |
| **משחק** | cron sync | `/games` | cron sync (תוצאה) | ❌ |
| **שאלה** | cron sync | `/games/[id]` | יישוב (`correct_outcome`) | cascade עם המשחק |
| **תנועה** | כל שינוי נקודות | `/profile` | ❌ **immutable** | ❌ |
| **התראה** | ביישוב/הצטרפות | `/notifications` | `markNotificationRead` | ניקוי ישנות |
| **ניסיון באתגר** | `submitPuzzleAnswer` | `/challenge` | ❌ | ❌ |

### 4.1 שתי החלטות על מחיקה

**ניחושים אינם נמחקים.** משתמש לא יכול לבטל ניחוש — זה יאפשר לו לחמוק מהפסד. שינוי המצב
היחיד הוא יישוב.

**תנועות נקודות אינן ניתנות לשינוי.** תיקון נעשה בתנועת פיצוי חדשה, לא בעריכה. כך ההיסטוריה
תמיד מסבירה את היתרה.

---

## 5. תיאור ה-API

### 5.1 Server Actions

```ts
// lib/actions/leagues.ts
createLeague(input: { name, description?, competitionId? })
  → { ok: true, leagueId, inviteCode } | { ok: false, error }

joinLeague(input: { inviteCode })
  → { ok: true, leagueId } | { ok: false, error }

// lib/actions/bets.ts
placeBet(input: { questionId, leagueId, outcome, stake })
  → { ok: true, betId, potentialPayout } | { ok: false, error }

// lib/actions/admin.ts
setFeaturedGame(input: { leagueId, gameId, bonusPct })
settleGameManually(input: { gameId, scoreHome, scoreAway })

// lib/actions/challenge.ts
submitPuzzleAnswer(input: { puzzleId, answer })
  → { ok: true, isCorrect, pointsEarned, attemptsLeft } | { ok: false, error }
```

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

שווקים נדרשים: `Match Winner` → `match_result` · `Goals Over/Under` (2.5) → `over_under_2_5` ·
`Both Teams Score` → `btts`. אם שוק חסר — **יחסי ברירת מחדל** (`2.50 / 3.20 / 2.80` וכו').

---

## 6. הלוגיקה העסקית המרכזית

כל הפונקציות בסעיף זה ב-`lib/domain/` — **טהורות, בלי גישה ל-DB או לרשת**.

### 6.1 חישוב זכייה פוטנציאלית

```ts
// lib/domain/betting.ts
export function calcPotentialPayout(stake: number, odds: number, bonusPct = 0): number {
  const effectiveOdds = odds * (1 + bonusPct / 100);
  return round2(stake * effectiveOdds);
}
```

הבונוס מגיע ממשחק השבוע. היחס **מוקפא בזמן ההנחה** — שינוי מאוחר יותר לא משפיע על ניחושים קיימים.

### 6.2 כללי הנחת ניחוש

```ts
export function validateBetPlacement(ctx: {
  game: { kickoffAt: Date; status: string };
  stake: number; minBet: number; balance: number;
  existingBet: boolean; isMember: boolean;
  now: Date;
}): { ok: true } | { ok: false; reason: BetRejection }
```

| # | כלל | קוד דחייה |
|---|---|---|
| 1 | המשתמש חבר בליגה | `NOT_A_MEMBER` |
| 2 | המשחק טרם התחיל | `GAME_STARTED` |
| 3 | סטטוס `scheduled` בלבד | `GAME_NOT_OPEN` |
| 4 | `stake >= league.min_bet` | `BELOW_MIN_BET` |
| 5 | `stake <= balance` | `INSUFFICIENT_BALANCE` |
| 6 | אין ניחוש קיים לשאלה בליגה | `ALREADY_BET` |
| 7 | `stake` שלם וחיובי | `INVALID_STAKE` |

### 6.3 קביעת התשובה הנכונה

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

### 6.4 יישוב ניחוש

```ts
export function settleBet(bet: Bet, correctOutcome: string): SettlementResult {
  const won = bet.selectedOutcome === correctOutcome;
  return {
    status: won ? 'won' : 'lost',
    actualPayout: won ? bet.potentialPayout : 0,
    leagueDelta: won ? bet.potentialPayout - bet.stake : -bet.stake,
  };
}
```

> **`leagueDelta` הוא הרווח הנקי**, לא התשלום. מי שהימר 100 וקיבל 250 הרוויח 150 — הסכום
> שנכנס לדירוג הליגה. זו הגדרה שחייבים לבדוק בבדיקות יחידה.

### 6.5 משחק שבוטל

משחק ב-`cancelled` או `postponed` → כל הניחושים ל-`void`, החזר מלא של ה-`stake`,
`leagueDelta = 0`. המשתמש לא נענש על אירוע שאינו בשליטתו.

### 6.6 דירוג

```ts
// lib/domain/standings.ts
export function rankMembers(members: LeagueMember[]): RankedMember[]
```

מיון לפי `points_in_league` יורד; שובר שוויון: מספר ניחושים שזכו, ואז תאריך הצטרפות.
**דירוג תחרותי** — שני שווים מקבלים את אותו מקום, והבא אחריהם מדלג.

### 6.7 הישגים

```ts
// lib/domain/achievements.ts
export const ACHIEVEMENTS = [
  { key: 'first_bet',      title: 'ניחוש ראשון',        check: s => s.totalBets >= 1 },
  { key: 'ten_bets',       title: '10 ניחושים',          check: s => s.totalBets >= 10 },
  { key: 'first_win',      title: 'זכייה ראשונה',        check: s => s.totalWins >= 1 },
  { key: 'streak_three',   title: 'רצף 3 נכונים',        check: s => s.currentStreak >= 3 },
  { key: 'first_puzzle',   title: 'אתגר ראשון',          check: s => s.puzzlesSolved >= 1 },
  { key: 'league_joined',  title: 'הצטרפת לליגה',        check: s => s.leaguesJoined >= 1 },
  { key: 'league_leader',  title: 'מקום ראשון',          check: s => s.bestRank === 1 },
] as const;
```

כולם נגזרים מנתונים שכבר קיימים — **אין מנגנון מעקב נפרד**. נבדקים בסוף ה-cron של היישוב.

### 6.8 אתגר יומי

```ts
// lib/domain/puzzle.ts
export function normalizeName(raw: string): string   // lowercase, בלי ניקוד, רווח יחיד
export function checkAnswer(answer: string, validAnswers: string[]): boolean
```

עד **3 ניסיונות**. ניקוד יורד: `50 / 30 / 15`.

**החלטה — לאן הולכות הנקודות:** הזכייה נזקפת ליתרה הגלובלית **וגם** ל-`points_in_league` של
**כל** הליגות שהמשתמש חבר בהן. ההצדקה: לכל חברי הליגה אותה הזדמנות לפתור את אותו אתגר, ולכן
זה הוגן ומשמר את הכלל שדירוג הליגה משקף פעילות כוללת.

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

אין Redux, אין Zustand, אין React Query. הנימוק:

- **הנתונים נטענים בשרת** — אין צורך במטמון בלקוח
- **`revalidatePath()` הוא מנגנון הרענון** — אחרי כל Action
- **State ב-URL** (מסננים, עמוד) — ניתן לשיתוף וחוזר אחרי refresh

זו הפחתת מורכבות מכוונת, לא חיסכון בעבודה.

---

## 8. טיפול בשגיאות

### 8.1 שלוש רמות

| רמה | מנגנון | מה המשתמש רואה |
|---|---|---|
| **צפויה** (יתרה חסרה) | `{ ok: false, error }` | הודעה בטופס |
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
| `INSUFFICIENT_BALANCE` | אין לך מספיק נקודות |
| `BELOW_MIN_BET` | הסכום נמוך מהמינימום בליגה |
| `ALREADY_BET` | כבר ניחשת בשאלה הזו |
| `NOT_A_MEMBER` | אינך חבר בליגה הזו |
| `INVALID_CODE` | קוד הזמנה לא תקין |

### 8.4 כשל בספק החיצוני

אם API-Football לא זמין: ה-cron **נכשל בשקט ומתועד**, ולא מוחק נתונים קיימים. משחקים
שכבר במערכת נשארים. האדמין יכול ליישב ידנית — רשת הביטחון.

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
  competitionId: z.number().int().positive().optional(),
});

export const placeBetSchema = z.object({
  questionId: z.string().uuid(),
  leagueId:   z.string().uuid(),
  outcome:    z.string().min(1).max(20),
  stake:      z.number().int().positive().max(1_000_000),
});

export const joinLeagueSchema = z.object({
  inviteCode: z.string().length(8).regex(/^[A-Z0-9]+$/),
});
```

### 9.2 שלוש שכבות

| שכבה | מה נבדק | אפשר לעקוף? |
|---|---|---|
| HTML | `required`, `type`, `min` | כן — UX בלבד |
| **Zod ב-Server Action** | טיפוס, טווח, פורמט | **לא** |
| **DB constraints** | `CHECK`, `UNIQUE`, FK | **לא** |

> **העיקרון:** ולידציית לקוח היא נוחות. **ולידציית השרת היא האמת.** כל Action מריצה `parse`
> על הקלט לפני שהיא נוגעת בנתונים. אילוצי ה-DB הם הרשת האחרונה.

### 9.3 למה גם וגם

`stake > 0` נבדק ב-Zod **וגם** ב-`CHECK (stake > 0)`. הכפילות מכוונת: אם ייכתב בעתיד סקריפט
שכותב ל-DB ישירות ועוקף את ה-Action, ה-DB עדיין מגן.

---

## 10. תכנון חוויית המשתמש

### 10.1 עקרונות

| עיקרון | ביטוי |
|---|---|
| **RTL מלידה** | `dir="rtl"`; לוגי properties (`ms-`/`me-`) ולא `ml-`/`mr-` |
| **מובייל תחילה** | רוב העובדים יגיעו מהטלפון |
| **מצב טעינה תמיד** | `loading.tsx` + skeleton |
| **מצב ריק מדבר** | "אין עדיין ניחושים — התחל מהמשחקים" + כפתור |
| **משוב מיידי** | `useFormStatus` נועל את הכפתור תוך כדי שליחה |
| **נגישות** | ניגודיות AA, ניווט מקלדת, `aria-label` |

### 10.2 המסע הקריטי — הנחת ניחוש

```
/dashboard → משחקים קרובים
     │ לחיצה על משחק
     ▼
/games/[id]
     │  3 שאלות; לכל אחת אפשרויות עם יחסים
     │  משחק שבוע מסומן בבירור עם הבונוס
     ▼
בחירת אפשרות → הטופס נפתח
     │  הזנת סכום; "זכייה אפשרית" מתעדכן חי
     │  היתרה מוצגת; סכום גבוה מדי → הכפתור נעול
     ▼
"הנח ניחוש" → כפתור נעול + spinner
     ▼
הצלחה → toast + השאלה עוברת למצב "ניחשת"
```

### 10.3 החלטת UX: היחס מוצג כמכפיל

מוצג `×2.10` ולא `+110` (פורמט אמריקאי). המכפיל אינטואיטיבי לקהל שאינו מהמר:
"100 נקודות × 2.10 = 210".

### 10.4 מצב כהה

מיושם בטוקנים של Tailwind (`--background`, `--foreground`) עם `next-themes`.
**בלי צבעים קשיחים בקוד** — כל צבע דרך טוקן, כדי ששתי הערכות יעבדו.

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
