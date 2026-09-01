# DerbyUp — Football Predictions for Organizations

**Final Project · Internet Technologies: Become a Full-Stack Engineer · RUNI CS 2026**
**Authors:** Nir Dahan & Liav Sarfati

| | |
|---|---|
| 🌐 **Live site** | **https://derbyup-runi-fullstack.vercel.app** |
| 📦 **Repository** | https://github.com/nirdahan9/FullStack-FinalProject-DerbyUp |

---

## What it is

A platform where an organization runs an **internal prediction league**: an admin
opens a league, picks a tournament, and invites employees with a code. Everyone
predicts the outcomes of real football matches, and the standings update on
their own.

**The problem it solves:** team-building that requires coordination — a fun day,
a tournament, a team evening — costs money and time, and happens not so many times a year. A
prediction league runs **in the background every week**, takes no time away from
work, and gives employees a reason to talk to each other.

### The scoring model — the rule everything else derives from

> **You predict. Right — you get the odds as points. Wrong — zero.**
> A correct pick at odds of 7.15 is worth **7.15 points**.

**No wagering, no balance, no losses.** Points only accumulate. This decision
explains half the architecture: there is no transactions table, no
multi-table transaction, and no state in which a user is "stuck" and unable to
participate.

### ✨ AI advisor — an opinion before you pick

Before any prediction you can open the advisor and get a **reasoned opinion in
Hebrew**: what it thinks will happen and why. 
You can also ask it follow-up questions about the same match.

It draws on the odds, recent form, past meetings, and how the league's members
have predicted — and fills in the gaps from API-Football and Gemini.

Three guard layers keep it on topic — deterministic rules (free), a cheap
classifier, and a schema that verifies the recommendation points at a bet that
actually exists in the match. A daily quota protects the API bill.

Every morning one **match per tournament** is also selected — the least
predictable by odds gap — and analysed ahead of time by cron. That match is the
one shown on the dashboard and the landing page, so neither screen costs
anything or waits on a model.

### 🛡️ Two kinds of admin

| | 🏢 League admin | 🛡️ Site admin |
|---|---|---|
| Who | The creator of a private league | Product operators — `profiles.is_site_admin` |
| Where | `/leagues/[id]/admin` | **`/admin`** |
| What | Prizes · choosing the editor · manual settlement in their tournament | Overview · users · games · leagues — across the whole product |

The admin dashboard reads through `SECURITY DEFINER` functions that check the
role themselves — **the service-role key never enters any user-facing path.**

---

## Running locally

### Quick start — for graders

The repository contains no secrets. The submission that accompanies it includes
a ready `.env.local` pointing at the project's live, already-seeded Supabase —
so there is nothing to create, migrate, seed or fill in:

```bash
git clone https://github.com/nirdahan9/FullStack-FinalProject-DerbyUp.git
cd FullStack-FinalProject-DerbyUp
# → copy the provided .env.local into this folder (it's a hidden file:
#   Cmd+Shift+. in Finder, or "Show hidden items" in Explorer)
bash run.sh        # Windows: run.bat
```

The script checks Node 20+, installs, builds, and serves the production build
at **http://localhost:3000** — then opens the browser. Sign in with the
credentials provided in the submission, or sign up as a new user. Fixtures,
odds, live scores and settlement all keep flowing, because the scheduled jobs
run on the Supabase side, not on your machine.

> **Tip:** clone into a folder that is *not* synced by iCloud/OneDrive (e.g.
> your home folder, not Documents/Desktop). Sync services choke on
> `node_modules` and make every step several times slower.

### Full setup from scratch

Everything below creates an independent environment — your own Supabase
project and your own data. It is **not needed for grading**; it documents how
the production environment itself was built.

#### Prerequisites

- **Node.js 20+**
- A **Supabase** project (free tier is fine)
- An **API-Football** key from [api-sports.io](https://www.api-football.com/)

#### Steps

```bash
# 1. Clone and install
git clone https://github.com/nirdahan9/FullStack-FinalProject-DerbyUp.git
cd FullStack-FinalProject-DerbyUp
npm install

# 2. Environment variables
cp .env.example .env.local
#    ← fill in using the table below

# 3. Set up the schema in your Supabase project
npx supabase link --project-ref <project-ref>
npx supabase db push          # runs the 22 migrations in supabase/migrations/

# 4. Seed competitions and fixtures
npm run seed                  # 7 competitions
curl -X POST http://localhost:3000/api/cron/sync-fixtures \
     -H "Authorization: Bearer $CRON_SECRET"   # fixtures + odds from API-Football

# 5. Run
npm run dev                   # http://localhost:3000
```

### Environment variables

| Variable | Required | What it is and where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | The project URL. Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public key, exposed to the browser. **Safe to expose** — RLS is what protects the data, not the key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Bypasses RLS.** Server-side only — cron routes and writes a user is not allowed to make. Never in a Client Component |
| `FOOTBALL_API_KEY` | ✅ | api-sports.io key. Fixtures, results and odds |
| `FOOTBALL_API_BASE_URL` | ✅ | `https://v3.football.api-sports.io` |
| `CRON_SECRET` | ✅ | Shared secret guarding `/api/cron/*`. No valid header → `401` |
| `LIVE_SCORES_ENABLED` | — | `false` turns off the live sync without a deploy. Default: on |
| `GEMINI_API_KEY` | ✅ | Google AI Studio key for the AI advisor. **Server-side only** — read in a Server Action, never reaches the browser |
| `GEMINI_MODEL` | — | Default `gemini-3.5-flash`. The newer model is capped at 20 requests on the free tier |
| `GEMINI_GUARD_MODEL` | — | Default `gemini-3.5-flash-lite` — the cheap classifier that runs before the expensive call |
| `ADVISOR_DAILY_LIMIT` | — | Advisor answers per user per day. Default 10, enforced in Postgres |
| `SUPABASE_PROJECT_REF` | — | Maintenance scripts only (`scripts/db-exec.mjs`). The site runs without it |
| `SUPABASE_ACCESS_TOKEN` | — | Same. Dashboard → Account → Access Tokens |

**How the secrets are kept:** `.env.local` is git-ignored; in production they
are Vercel Environment Variables; and `CRON_SECRET` is also stored in
**Supabase Vault** so pg_cron can call the settlement endpoint. No secret is in
the code or the repository.

---

## Running the tests

```bash
npm test                  # 331 unit and component tests — no network involved
npm run test:integration  # 196 tests against Supabase — requires .env.local
npm run test:e2e          # 27 Playwright tests — requires a local server
npm run test:coverage     # coverage report → coverage/index.html
npm run test:clean        # clean up leftovers from an interrupted run
```

| Suite | Tests | What it proves |
|---|---|---|
| `unit` | 285 | Scoring logic, settlement, **the live layer**, standings, validations **and the advisor's guard layers** |
| `components` | 46 | What the screen **says**: points on a tile, locked state, **live score**, **the opinion card**, who is highlighted in the table |
| `integration` | 196 | Permissions and RLS against a real DB, both leaderboards, **the live layer**, **advisor quotas** and the admin dashboard |
| `e2e` | 27 | The full journey in a browser — sign-up → league → prediction → **live match** → **advisor** → settlement → standings |

**554 tests.** The integration tests build their own disposable world and delete
it at the end.

Of these, 77 tests belong to the advisor — and not one of them calls Gemini.
The deterministic layer is tested exhaustively precisely **because** it can be:
there is no network in it and no model.

---

## The stack

| Layer | Technology | Why |
|---|---|---|
| Framework | **Next.js 16.3** (App Router) | Server Components — data is fetched on the server and not shipped to the client |
| Language | **TypeScript 5** | |
| DB + Auth | **Supabase** (PostgreSQL 17.6) | RLS moves authorization into the DB, so an application bug cannot leak data |
| Hosting | **Vercel** | |
| Styling | **Tailwind 3.4** + shadcn/ui | 49 components carried over from the DerbyUp app to preserve its visual identity, and 9 colour themes for the user to pick from |
| Football data | **API-Football** | Real fixtures, results and odds |
| Testing | **Vitest · RTL · Playwright** | |

---

## How it's built

```
app/                    routes — (auth) public · (app) protected · (admin) site admin · api/cron
components/             UI; components/ui is vendored shadcn
lib/
  domain/               ★ the core — pure functions, no I/O
  actions/              Server Actions — the only write layer
  advisor/              AI advisor: guards, prompt building, schema
  cron/                 fixture sync · live scores · settlement
  live/                 the live layer's read path for the league page
  football-api/         API-Football client and mapping
  validation/           Zod schemas
supabase/migrations/    22 migrations — 18 tables · 26 policies · 35 functions
tests/                  unit · components · integration · e2e
scripts/                seed · puzzle-bank build · maintenance
proxy.ts                runs before every request — refreshes the session, guards the app routes
run.sh · run.bat        one-command local run (install → build → serve on :3000)
```

---

## Scheduling

| Job | Frequency | Scheduler |
|---|---|---|
| `/api/cron/sync-fixtures` | daily `0 4 * * *` | Vercel Cron |
| `/api/cron/settle` | every 10 minutes | **pg_cron** inside Supabase |
| `/api/cron/sync-live` | every minute — and only while a match is live | **pg_cron** inside Supabase |
| `/api/cron/advisor-pick` | daily `0 5 * * *` | Vercel Cron |

Settlement is scheduled from the DB and not from Vercel because the Hobby plan
allows **daily scheduling only**, which is not enough for a match that ends at
22:50. `pg_net` sends the POST and the secret is read from Vault. A daily
Vercel run at 4:30 remains as a backstop.

---

## Documentation

The full submission documents (product spec · architecture · technical design ·
test spec · scale · security) are submitted **separately** and are not in the
repository.