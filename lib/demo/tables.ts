import type { Database } from "@/types/database";
import { DEMO_NOW } from "./now";
import {
  ADVISOR_CONVERSATIONS,
  ADVISOR_DAILY_PICK,
  ADVISOR_INSIGHTS,
  ADVISOR_MESSAGES,
  ADVISOR_USAGE,
  BRIDGE_PLAYERS,
  COMPETITIONS,
  DAILY_PUZZLES,
  GAMES,
  LEAGUE_MEMBERS,
  LEAGUES,
  NOTIFICATIONS,
  PREDICTIONS,
  PROFILES,
  PUZZLE_ATTEMPTS,
  QUESTIONS,
  USER_ACHIEVEMENTS,
} from "./fixtures";

/**
 * The schema, as the demo query layer needs to know it.
 *
 * `fixtures.ts` is a list of rows. That is enough to answer `from("games")`
 * and nothing else — the moment a caller writes
 * `select("question_id, questions(game_id)")` the data layer has to know that
 * `predictions.question_id` points at `questions.id`, and a list of arrays
 * does not know that. PostgREST learns it from the catalogue; this file is
 * that catalogue, written out by hand.
 *
 * ── Why the relationships are a hand-written list ─────────────────────────
 *
 * `types/database.ts` already carries every foreign key, in the
 * `Relationships` array on each table. It is unusable here for one boring
 * reason: it is a *type*, erased before a single line of this runs. The
 * twenty entries below are a transcription of those arrays — same names, same
 * columns, same direction — and the transcription is checked, because
 * `TableName` is `keyof Database["public"]["Tables"]`: a table renamed in the
 * generated types fails `npm run typecheck` here instead of returning `null`
 * for an embed on a page nobody opened before the demo was published.
 *
 * ── Why the arrays are never written to ───────────────────────────────────
 *
 * They are the *same arrays* `fixtures.ts` exports, held by reference rather
 * than copied: a 215 KB snapshot cloned per request would be a quarter of a
 * megabyte of garbage per page render, to defend against writes that this
 * module makes impossible anyway. Every read hands back a fresh array of the
 * matching rows, and every write path (see `query-builder.ts`) synthesises its
 * result instead of storing it. Nothing in `lib/demo` calls `push`, `splice`,
 * `sort` or an assignment on anything reachable from here, which is what keeps
 * two renders of the same page identical.
 */

type Tables = Database["public"]["Tables"];

export type TableName = keyof Tables;

export type Row<T extends TableName> = Tables[T]["Row"];

/** A row with no table in particular — what the query builder passes around. */
export type AnyRow = Record<string, unknown>;

/**
 * Every table in the schema, pointing at its frozen rows.
 *
 * Typed as a total map over `TableName`, so adding a table to the schema and
 * forgetting to seed it is a compile error rather than a `TypeError: Cannot
 * read properties of undefined` the first time a page queries it.
 *
 * `api_cache` is the one deliberate empty: it caches API-Football responses,
 * and a demo that makes no provider calls has nothing to have cached. An empty
 * array is the truthful answer — `api_cache_get()` reports a miss, which is
 * precisely the state a static demo is permanently in.
 */
export const DEMO_TABLES: { readonly [T in TableName]: readonly Row<T>[] } = {
  advisor_conversations: ADVISOR_CONVERSATIONS,
  advisor_daily_pick: ADVISOR_DAILY_PICK,
  advisor_insights: ADVISOR_INSIGHTS,
  advisor_messages: ADVISOR_MESSAGES,
  advisor_usage: ADVISOR_USAGE,
  api_cache: [],
  bridge_players: BRIDGE_PLAYERS,
  competitions: COMPETITIONS,
  daily_puzzles: DAILY_PUZZLES,
  games: GAMES,
  league_members: LEAGUE_MEMBERS,
  leagues: LEAGUES,
  notifications: NOTIFICATIONS,
  predictions: PREDICTIONS,
  profiles: PROFILES,
  puzzle_attempts: PUZZLE_ATTEMPTS,
  questions: QUESTIONS,
  user_achievements: USER_ACHIEVEMENTS,
};

/** True for a name the registry knows, so an unknown table can be reported. */
export function isTableName(name: string): name is TableName {
  return Object.prototype.hasOwnProperty.call(DEMO_TABLES, name);
}

/**
 * Rows of one table, as the plain records the query builder works in.
 *
 * The cast is the first of the two PostgREST-boundary casts in this module.
 * Every generated `Row` is an object of scalars, `Json` and nulls, so reading
 * one as `Record<string, unknown>` is sound — but TypeScript will not take
 * that on trust for a union of eighteen unrelated row types, and the
 * alternative is eighteen copies of the query builder.
 */
export function rowsOf(table: TableName): readonly AnyRow[] {
  return DEMO_TABLES[table] as readonly AnyRow[];
}

// ─── Relationships ─────────────────────────────────────────────────────────

export type ForeignKey = {
  /** The table holding the column. */
  readonly table: TableName;
  readonly column: string;
  /** The table it points at. */
  readonly references: TableName;
  readonly referencedColumn: string;
};

/**
 * Every foreign key in `public`, transcribed from the `Relationships` arrays
 * in `types/database.ts` and in the same order they appear there.
 *
 * Order is load-bearing in exactly one case: two tables can be joined by more
 * than one key — `leagues` reaches `games` through `featured_game_id`, and
 * `games` reaches `leagues` back the other way through the same key — and
 * `embedFor()` below takes the first match. PostgREST refuses an ambiguous
 * embed and demands the constraint name instead; no call site in this
 * codebase writes one, because none of them are ambiguous.
 */
export const FOREIGN_KEYS: readonly ForeignKey[] = [
  { table: "advisor_conversations", column: "game_id", references: "games", referencedColumn: "id" },
  { table: "advisor_conversations", column: "user_id", references: "profiles", referencedColumn: "id" },
  { table: "advisor_daily_pick", column: "competition_id", references: "competitions", referencedColumn: "id" },
  { table: "advisor_daily_pick", column: "game_id", references: "games", referencedColumn: "id" },
  { table: "advisor_insights", column: "game_id", references: "games", referencedColumn: "id" },
  { table: "advisor_messages", column: "conversation_id", references: "advisor_conversations", referencedColumn: "id" },
  { table: "advisor_usage", column: "user_id", references: "profiles", referencedColumn: "id" },
  { table: "games", column: "competition_id", references: "competitions", referencedColumn: "id" },
  { table: "league_members", column: "league_id", references: "leagues", referencedColumn: "id" },
  { table: "league_members", column: "user_id", references: "profiles", referencedColumn: "id" },
  { table: "leagues", column: "competition_id", references: "competitions", referencedColumn: "id" },
  { table: "leagues", column: "creator_id", references: "profiles", referencedColumn: "id" },
  { table: "leagues", column: "featured_game_id", references: "games", referencedColumn: "id" },
  { table: "notifications", column: "user_id", references: "profiles", referencedColumn: "id" },
  { table: "predictions", column: "question_id", references: "questions", referencedColumn: "id" },
  { table: "predictions", column: "user_id", references: "profiles", referencedColumn: "id" },
  { table: "puzzle_attempts", column: "puzzle_id", references: "daily_puzzles", referencedColumn: "id" },
  { table: "puzzle_attempts", column: "user_id", references: "profiles", referencedColumn: "id" },
  { table: "questions", column: "game_id", references: "games", referencedColumn: "id" },
  { table: "user_achievements", column: "user_id", references: "profiles", referencedColumn: "id" },
];

/**
 * Which way an embed goes, and on which columns.
 *
 * `to-one` means the parent holds the key — `games.competition_id` — and the
 * embed renders as an object or `null`. `to-many` means the child holds it —
 * `questions.game_id` — and it renders as an array, possibly empty. Getting
 * this backwards is the difference between `game.competitions.name` and
 * `game.competitions[0].name`, and the pages read both forms, so it has to
 * come from the keys rather than from a convention about plurals.
 */
export type Embed =
  | { readonly kind: "to-one"; readonly parentColumn: string; readonly childColumn: string }
  | { readonly kind: "to-many"; readonly parentColumn: string; readonly childColumn: string };

export function embedFor(parent: TableName, child: TableName): Embed | null {
  const outgoing = FOREIGN_KEYS.find(
    (fk) => fk.table === parent && fk.references === child,
  );
  if (outgoing) {
    return {
      kind: "to-one",
      parentColumn: outgoing.column,
      childColumn: outgoing.referencedColumn,
    };
  }

  const incoming = FOREIGN_KEYS.find(
    (fk) => fk.table === child && fk.references === parent,
  );
  if (incoming) {
    return {
      kind: "to-many",
      parentColumn: incoming.referencedColumn,
      childColumn: incoming.column,
    };
  }

  return null;
}

// ─── auth.users ────────────────────────────────────────────────────────────

/**
 * The email column the admin screens read.
 *
 * `profiles` has no email. `admin_list_users`, `admin_user_detail` and
 * `admin_list_site_admins` all join `auth.users` for it, and its own comment
 * explains why: it is the identifier support is handed when somebody writes
 * in. `fixtures.ts` has no `auth.users` to join — that table belongs to
 * Supabase rather than to the product schema, so it is not in
 * `types/database.ts` and was never part of the snapshot.
 *
 * So it is derived here instead, from the username, under `.example` — the TLD
 * RFC 2606 reserves for documentation. The addresses are therefore
 * well-formed, obviously fictional, and permanently undeliverable, which is
 * the only responsible shape for twelve invented people whose email addresses
 * are printed on a public demo's admin screen.
 */
export function demoEmail(username: string): string {
  return `${username}@derbyup.example`;
}

// ─── The demo clock ────────────────────────────────────────────────────────

/**
 * `current_date` as the demo's Postgres would have evaluated it.
 *
 * Four functions compare against it — `advisor_consume_quota`,
 * `advisor_quota_remaining`, `landing_advisor_card` and the two `today`
 * counters in `admin_overview` — and all four were written to mean "today in
 * Asia/Jerusalem", which is where the product's users are. `en-CA` is the
 * shortest way to get `YYYY-MM-DD` out of `Intl`.
 *
 * Computed once, from `DEMO_NOW` and never from `new Date()`, so the answer is
 * the same on every render for as long as the demo is online.
 */
export const DEMO_TODAY: string = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(DEMO_NOW);
