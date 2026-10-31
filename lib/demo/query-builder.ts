import {
  embedFor,
  isTableName,
  rowsOf,
  type AnyRow,
  type TableName,
} from "./tables";
import { DEMO_NOW } from "./now";

/**
 * PostgREST, reimplemented over eighteen arrays.
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 *
 * The static demo had three ways to go. Rewrite ninety-two call sites to read
 * `fixtures.ts` directly, and lose every page's query as documentation of what
 * the product actually asked the database. Precompute each page's props into
 * the snapshot, and lose the ability to tell whether the page still works.
 * Or stand in for the client, and change one import line per file.
 *
 * The third is the only one where the demo keeps proving something. The pages
 * are untouched, so the query on the dashboard is still the query DerbyUp ran;
 * `rankRows()` still ranks, `settlePrediction()` still settles,
 * `sumLiveByUser()` still projects the live table. What changed is where the
 * rows come from, and nothing else. A demo built the other two ways is a
 * screenshot with extra steps.
 *
 * ── What it has to get right ──────────────────────────────────────────────
 *
 * Not very much, and all of it precisely. The surface measured across the
 * codebase is sixteen filter and transform methods, four writes, and embedded
 * resources. The two places where being approximately right is the same as
 * being wrong:
 *
 *   · **`single()` and `maybeSingle()`.** Nineteen call sites branch on
 *     `maybeSingle()` returning `data: null` and go on to `notFound()`. Six
 *     use `single()` and read the row without checking. PostgREST distinguishes
 *     them by *erroring* on a row count it was not promised, and the error code
 *     is `PGRST116` with the count in `details`. A builder that returned
 *     `rows[0] ?? null` from both would turn a bug into a blank page.
 *
 *   · **Embedded resources.** `select("leagues(id, name, competitions(name))")`
 *     is not a column list; it is a join whose result nests. Seven pages read
 *     two levels deep. Ignoring the parentheses and returning flat rows would
 *     leave `m.leagues` undefined, and the dashboard would render
 *     "join a league to get started" to a member of three.
 *
 * ── Why the column list is honoured rather than ignored ───────────────────
 *
 * The cheap version of this file returns whole rows and lets the extra columns
 * go unread, which is harmless everywhere but one place:
 * `app/(app)/challenge/page.tsx` selects `id, club_a, club_b, play_date` from
 * `daily_puzzles` and says why in a comment — `valid_answers` must not reach
 * the browser, or the page source is the solution to the puzzle. In a Server
 * Component the selected columns are exactly what gets serialised into the RSC
 * payload. So the projection is real: a column nobody asked for is not
 * returned, the answers stay on the server, and the demo keeps a property the
 * product deliberately has.
 *
 * It costs nothing elsewhere, because the generated types already describe the
 * narrowed row — every call site was written against the projection and cannot
 * read a column it did not select.
 *
 * ── Why it is deterministic ───────────────────────────────────────────────
 *
 * No `Math.random()`, no `new Date()`, no mutable module state that a query
 * can reach. Writes synthesise their result from a hash of their own input, so
 * the id handed back for an insert is a function of the insert. Two renders of
 * a page produce byte-identical output, which is what makes the demo safe to
 * serve from a static host and safe to screenshot.
 */

// ─── Results ───────────────────────────────────────────────────────────────

/** The error shape PostgREST returns, and the four fields call sites read. */
export type DemoError = {
  message: string;
  code: string;
  details: string;
  hint: string | null;
};

export type DemoResult<T> = {
  data: T;
  error: DemoError | null;
  count: number | null;
  status: number;
  statusText: string;
};

function ok<T>(data: T, count: number | null = null): DemoResult<T> {
  return { data, error: null, count, status: 200, statusText: "OK" };
}

function failed(error: DemoError, status = 406): DemoResult<null> {
  return { data: null, error, count: null, status, statusText: error.message };
}

/**
 * The error `single()` and `maybeSingle()` raise on an unexpected row count.
 *
 * `PGRST116` and this wording are what PostgREST sends, verbatim. It matters
 * because `lib/actions/*` match on `error.message` to decide which Hebrew
 * sentence a user sees, and a message of our own invention would fall through
 * every one of those matches to "אירעה שגיאה. נסה שוב".
 */
function wrongRowCount(rows: number): DemoError {
  return {
    message: "JSON object requested, multiple (or no) rows returned",
    code: "PGRST116",
    details: `The result contains ${rows} rows`,
    hint: null,
  };
}

/**
 * Thrown by an RPC handler to report what `raise exception` would have.
 *
 * Lives here rather than in `rpc.ts` so the builder can raise it too, and
 * carries a Postgres error code because `lib/actions/leagues.ts` and friends
 * read `error.message` for the named exception — `INVALID_CODE`,
 * `ALREADY_MEMBER`, `NOT_LEAGUE_ADMIN` — exactly as it reaches them from
 * PostgREST.
 */
export class DemoRpcError extends Error {
  readonly code: string;

  constructor(message: string, code = "P0001") {
    super(message);
    this.name = "DemoRpcError";
    this.code = code;
  }

  toDemoError(): DemoError {
    return { message: this.message, code: this.code, details: "", hint: null };
  }
}

export function asDemoError(cause: unknown): DemoError {
  if (cause instanceof DemoRpcError) return cause.toDemoError();
  return {
    message: cause instanceof Error ? cause.message : String(cause),
    code: "XX000",
    details: "",
    hint: null,
  };
}

// ─── Select specs ──────────────────────────────────────────────────────────

type SelectSpec = {
  /** `["*"]` for everything; otherwise the named columns. */
  columns: string[];
  embeds: { key: string; table: string; spec: SelectSpec }[];
};

const SELECT_ALL: SelectSpec = { columns: ["*"], embeds: [] };

/**
 * Splits a select list on its top-level commas.
 *
 * Commas inside `competitions(name, country)` belong to the embed, and commas
 * inside a quoted value belong to the value, so neither can be a separator. A
 * regex cannot see nesting; a two-state scanner can.
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === "\\") i += 1;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(input.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Parses a select string into columns and embeds.
 *
 * Supports the two forms this codebase writes — a bare column, and
 * `relation(...)` — plus `alias:relation(...)`, which it does not write but
 * which costs one line to accept and would otherwise fail silently. PostgREST's
 * `!inner` and `!left` hints are stripped: they change which parent rows come
 * back when the embed is empty, and no call site here depends on that.
 */
function parseSelect(spec: string | undefined): SelectSpec {
  const trimmed = (spec ?? "*").trim();
  if (trimmed === "" || trimmed === "*") return SELECT_ALL;

  const columns: string[] = [];
  const embeds: SelectSpec["embeds"] = [];

  for (const token of splitTopLevel(trimmed)) {
    const open = token.indexOf("(");
    if (open === -1) {
      const [left, right] = token.split(":");
      columns.push((right ?? left).trim());
      continue;
    }

    const head = token.slice(0, open).trim();
    const inner = token.slice(open + 1, token.lastIndexOf(")"));
    const [aliasOrName, maybeName] = head.split(":");
    const relation = (maybeName ?? aliasOrName).replace(/!.*$/, "").trim();
    const key = (maybeName ? aliasOrName : relation).trim();

    embeds.push({ key, table: relation, spec: parseSelect(inner) });
  }

  return { columns, embeds };
}

/**
 * Builds the row a caller gets back: the columns they asked for, plus every
 * embed resolved against the registry.
 *
 * An embed whose relation is unknown, or which no foreign key connects to the
 * parent, is returned as `null` rather than thrown. The alternative is a page
 * that 500s on a relation the snapshot happens not to cover — and a missing
 * embed is already a state every call site handles, because the real query
 * returns `null` for a row whose foreign key is null.
 */
function project(row: AnyRow, spec: SelectSpec, table: TableName): AnyRow {
  const out: AnyRow = {};

  if (spec.columns.includes("*")) {
    Object.assign(out, row);
  } else {
    for (const column of spec.columns) {
      if (column in row) out[column] = row[column];
    }
  }

  for (const embed of spec.embeds) {
    out[embed.key] = resolveEmbed(row, embed, table);
  }

  return out;
}

function resolveEmbed(
  row: AnyRow,
  embed: SelectSpec["embeds"][number],
  parent: TableName,
): AnyRow | AnyRow[] | null {
  const child = embed.table;
  if (!isTableName(child)) return null;

  const relation = embedFor(parent, child);
  if (!relation) return null;

  const key = row[relation.parentColumn];
  const children = rowsOf(child);

  if (relation.kind === "to-one") {
    if (key === null || key === undefined) return null;
    const match = children.find((candidate) => candidate[relation.childColumn] === key);
    return match ? project(match, embed.spec, child) : null;
  }

  return children
    .filter((candidate) => candidate[relation.childColumn] === key)
    .map((candidate) => project(candidate, embed.spec, child));
}

// ─── Filters ───────────────────────────────────────────────────────────────

type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in" | "cs";

type Predicate =
  | { kind: "cmp"; op: Op; column: string; value: unknown }
  | { kind: "and" | "or"; children: Predicate[] };

/**
 * Orders two values the way Postgres would.
 *
 * Numbers compare numerically and everything else as a string, which covers
 * every ordered column in the schema: the timestamps are all `toISOString()`
 * output, and ISO-8601 in a fixed offset sorts lexicographically in the same
 * order it sorts chronologically. That equivalence is the only reason this is
 * three lines instead of a date parser, and it holds because `now.ts` produces
 * every timestamp in the snapshot through one function.
 */
function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `%term%` as a regex, with every other metacharacter taken literally. */
function likeMatcher(pattern: string, insensitive: boolean): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${body}$`, insensitive ? "i" : "");
}

function test(row: AnyRow, predicate: Predicate): boolean {
  if (predicate.kind !== "cmp") {
    return predicate.kind === "and"
      ? predicate.children.every((child) => test(row, child))
      : predicate.children.some((child) => test(row, child));
  }

  const actual = row[predicate.column];
  const expected = predicate.value;

  switch (predicate.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "is":
      // `is` is identity against null or a boolean, never a value comparison —
      // `.is("read_at", null)` must not match an empty string.
      return actual === expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "gt":
      return actual !== null && actual !== undefined && compare(actual, expected) > 0;
    case "gte":
      return actual !== null && actual !== undefined && compare(actual, expected) >= 0;
    case "lt":
      return actual !== null && actual !== undefined && compare(actual, expected) < 0;
    case "lte":
      return actual !== null && actual !== undefined && compare(actual, expected) <= 0;
    case "like":
    case "ilike":
      return (
        typeof actual === "string" &&
        likeMatcher(String(expected), predicate.op === "ilike").test(actual)
      );
    case "cs":
      return containsAll(actual, expected);
  }
}

/**
 * `@>` for the two shapes a jsonb column in this schema can hold: an array of
 * scalars (`daily_puzzles.valid_answers`) and an object of them
 * (`questions.outcomes` elements). Deep containment of nested structures is
 * not implemented because no call site asks for it.
 */
function containsAll(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    const wanted = Array.isArray(expected) ? expected : [expected];
    return wanted.every((value) => actual.includes(value));
  }
  if (actual && typeof actual === "object" && expected && typeof expected === "object") {
    const haystack = actual as AnyRow;
    return Object.entries(expected as AnyRow).every(
      ([key, value]) => haystack[key] === value,
    );
  }
  return false;
}

// ─── or() strings ──────────────────────────────────────────────────────────

const OPS = new Set<string>([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "cs",
]);

/**
 * Reads the filter language `.or()` takes, because `.or()` takes a string
 * rather than arguments.
 *
 * Three call sites write one, and between them they use every feature of it:
 * `lib/advisor/context.ts` writes a flat list of `eq`s for team form, a pair of
 * `and(...)` groups for head-to-head, and quotes its values because a club
 * name can contain a comma; `lib/cron/sync-live.ts` nests an `and(...)` with
 * two timestamp comparisons inside an `or`.
 *
 * Values are coerced from text, since that is all a URL carries: `null` and
 * the two booleans by name, anything fully numeric to a number — so
 * `fixture_id.eq.1412301` compares as an integer — and everything else as a
 * string. A double-quoted value is *always* a string, which is what makes
 * `quoted()` in `context.ts` safe for a club called "1860".
 */
function parseOr(input: string): Predicate {
  return { kind: "or", children: splitTopLevel(input).map(parseFilterTerm) };
}

function parseFilterTerm(term: string): Predicate {
  // `[\s\S]` rather than `.` with the `s` flag: the tsconfig targets ES2017,
  // where dotAll does not exist, and a group's body can contain a newline.
  const group = /^(and|or)\(([\s\S]*)\)$/.exec(term.trim());
  if (group) {
    const kind = group[1] === "and" ? "and" : "or";
    return { kind, children: splitTopLevel(group[2]).map(parseFilterTerm) };
  }

  const first = term.indexOf(".");
  const second = term.indexOf(".", first + 1);
  if (first === -1 || second === -1) {
    // Unparseable rather than invalid: matching nothing is the conservative
    // answer, and it cannot silently widen a result set.
    return { kind: "cmp", op: "eq", column: "__unparsed__", value: Symbol("unparsed") };
  }

  const column = term.slice(0, first).trim();
  const rawOp = term.slice(first + 1, second).trim();
  const rawValue = term.slice(second + 1);
  const op = (OPS.has(rawOp) ? rawOp : "eq") as Op;

  return { kind: "cmp", op, column, value: coerce(rawValue, op) };
}

function coerce(raw: string, op: Op): unknown {
  const value = raw.trim();

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  if (op === "in") {
    return splitTopLevel(value.replace(/^\(|\)$/g, "")).map((part) => coerce(part, "eq"));
  }
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

// ─── Synthesised writes ────────────────────────────────────────────────────

/**
 * An id for a row the demo pretends to have written.
 *
 * Four hashes of the same input with different FNV offset bases, concatenated
 * to the thirty-two hex digits a UUID needs, then stamped with the version and
 * variant nibbles that make it a *valid* v4 — `lib/validation/schemas.ts`
 * rejects anything else with `z.string().uuid()` before an action looks at it,
 * so a readable placeholder would fail at the door.
 *
 * Pure, so determinism survives: the same insert produces the same id on every
 * render, and there is no counter for a second request to advance.
 */
function syntheticId(seed: string): string {
  const bases = [0x811c9dc5, 0x01000193, 0x7fffffff, 0x9e3779b9];
  const hex = bases
    .map((base) => {
      let hash = base >>> 0;
      for (let i = 0; i < seed.length; i += 1) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, "0");
    })
    .join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

const NOW_ISO = DEMO_NOW.toISOString();

/**
 * The columns a trigger or a default would have filled in.
 *
 * Only the ones a caller reads back. `lib/actions/predictions.ts` reads `id`
 * off its insert and shows the number in a toast; `lib/actions/advisor.ts`
 * reads `id` off a conversation and threads it through two more calls. The
 * timestamps are here because they are cheap and because a row missing
 * `created_at` looks like a bug to anyone reading the result in a debugger.
 */
function synthesise(table: TableName, values: AnyRow): AnyRow {
  const seed = `${table}:${JSON.stringify(values)}`;
  return {
    id: syntheticId(seed),
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    predicted_at: NOW_ISO,
    ...values,
  };
}

// ─── The builder ───────────────────────────────────────────────────────────

type Mode = "select" | "insert" | "update" | "upsert" | "delete";

/**
 * One chainable, awaitable query.
 *
 * Every method returns `this` rather than a copy, which is what PostgREST's
 * own builder does and what `lib/advisor/context.ts` relies on when it writes
 * `query = query.lt(...)` in a conditional.
 *
 * It is a thenable rather than a `Promise` subclass. `await` and `Promise.all`
 * both accept one, and nothing in the codebase calls `.catch()` on a query —
 * PostgREST reports failure in `error` rather than by rejecting, which is the
 * contract every call site here is written against.
 */
export class DemoQueryBuilder<T = AnyRow[]> implements PromiseLike<DemoResult<T>> {
  private readonly table: TableName | null;
  private readonly preset: readonly AnyRow[] | null;

  private mode: Mode = "select";
  private spec: SelectSpec | null = null;
  private predicates: Predicate[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private offset = 0;
  private wantCount = false;
  private headOnly = false;
  private cardinality: "many" | "one" | "maybe" = "many";
  private payload: AnyRow[] = [];

  constructor(source: TableName | readonly AnyRow[]) {
    if (typeof source === "string") {
      this.table = source;
      this.preset = null;
    } else {
      this.table = null;
      this.preset = source;
    }
  }

  // ── Reads ──

  select(spec?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    this.spec = parseSelect(spec);
    if (options?.count) this.wantCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.push({ kind: "cmp", op: "eq", column, value });
  }

  neq(column: string, value: unknown): this {
    return this.push({ kind: "cmp", op: "neq", column, value });
  }

  gt(column: string, value: unknown): this {
    return this.push({ kind: "cmp", op: "gt", column, value });
  }

  gte(column: string, value: unknown): this {
    return this.push({ kind: "cmp", op: "gte", column, value });
  }

  lt(column: string, value: unknown): this {
    return this.push({ kind: "cmp", op: "lt", column, value });
  }

  lte(column: string, value: unknown): this {
    return this.push({ kind: "cmp", op: "lte", column, value });
  }

  is(column: string, value: null | boolean): this {
    return this.push({ kind: "cmp", op: "is", column, value });
  }

  in(column: string, values: readonly unknown[]): this {
    return this.push({ kind: "cmp", op: "in", column, value: [...values] });
  }

  like(column: string, pattern: string): this {
    return this.push({ kind: "cmp", op: "like", column, value: pattern });
  }

  ilike(column: string, pattern: string): this {
    return this.push({ kind: "cmp", op: "ilike", column, value: pattern });
  }

  contains(column: string, value: unknown): this {
    return this.push({ kind: "cmp", op: "cs", column, value });
  }

  or(filters: string): this {
    return this.push(parseOr(filters));
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  /**
   * PostgREST's `Range` header is inclusive at both ends, so `.range(0, 20)`
   * is twenty-one rows. Two pages depend on that exact arithmetic: they ask
   * for `PAGE_SIZE + 1` and read the extra row as "there is a next page".
   */
  range(from: number, to: number): this {
    this.offset = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single(): DemoQueryBuilder<AnyRow> {
    this.cardinality = "one";
    return this as unknown as DemoQueryBuilder<AnyRow>;
  }

  maybeSingle(): DemoQueryBuilder<AnyRow | null> {
    this.cardinality = "maybe";
    return this as unknown as DemoQueryBuilder<AnyRow | null>;
  }

  // ── Writes ──
  //
  // Nothing below changes anything. The demo has no database to write to and,
  // more to the point, no business having one: the snapshot is what makes two
  // renders of a page identical, and a write that stuck would mean the first
  // visitor's prediction shows up for the second. So each of these reports the
  // success the caller's happy path needs and synthesises a plausible row for
  // it to read back, and `fixtures.ts` is left exactly as it was compiled.
  //
  // The visible consequence is honest and small: an action succeeds, the page
  // revalidates, and the data is unchanged. A demo that faked persistence in
  // memory would be worse — it would work until the serverless instance
  // recycled, and then lose it in front of whoever was looking.

  insert(values: AnyRow | AnyRow[]): this {
    this.mode = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  /**
   * The `{ onConflict, ignoreDuplicates }` options the fixtures sync passes
   * are accepted by the caller's signature and go unread here: with nothing
   * stored there is no row to conflict with, so every upsert is an insert.
   */
  upsert(values: AnyRow | AnyRow[]): this {
    this.mode = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: AnyRow): this {
    this.mode = "update";
    this.payload = [values];
    return this;
  }

  delete(): this {
    this.mode = "delete";
    this.payload = [];
    return this;
  }

  // ── Resolution ──

  then<R1 = DemoResult<T>, R2 = never>(
    onFulfilled?: ((value: DemoResult<T>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private push(predicate: Predicate): this {
    this.predicates.push(predicate);
    return this;
  }

  private run(): DemoResult<T> {
    try {
      return this.resolve() as DemoResult<T>;
    } catch (cause) {
      return failed(asDemoError(cause), 500) as DemoResult<T>;
    }
  }

  private resolve(): DemoResult<unknown> {
    const table = this.table;
    const spec = this.spec;

    // A write with no `.select()` returns no body, exactly as PostgREST does
    // without a `Prefer: return=representation` header.
    if (this.mode !== "select") {
      const rows = this.writtenRows();
      if (!spec || this.headOnly) return ok(null);
      const projected = table ? rows.map((row) => project(row, spec, table)) : rows;
      return this.shape(projected, projected.length);
    }

    const source = this.preset ?? (table ? rowsOf(table) : []);
    const matched = this.predicates.length
      ? source.filter((row) => this.predicates.every((p) => test(row, p)))
      : [...source];

    const sorted = this.orders.length ? this.sort(matched) : matched;
    const total = matched.length;

    // head:true is a count with no body — the one use of it in the codebase is
    // the unread-notification badge in the app layout.
    if (this.headOnly) return ok(null, this.wantCount ? total : null);

    const window = this.limitCount === null
      ? sorted.slice(this.offset)
      : sorted.slice(this.offset, this.offset + this.limitCount);

    const projected =
      spec && table ? window.map((row) => project(row, spec, table)) : [...window];

    return this.shape(projected, this.wantCount ? total : null);
  }

  /**
   * The rows a write hands back.
   *
   * An update returns what the matched rows *would* look like, merged rather
   * than written, so a caller that reads the result sees the value it just
   * set. A delete returns the rows it would have removed. Neither array shares
   * an object with the registry: `{ ...row, ...values }` is a new object every
   * time, which is what keeps the snapshot immutable even if a caller mutates
   * what it is given.
   */
  private writtenRows(): AnyRow[] {
    const table = this.table;
    if (!table) return [];

    if (this.mode === "insert" || this.mode === "upsert") {
      return this.payload.map((values) => synthesise(table, values));
    }

    const matched = rowsOf(table).filter((row) =>
      this.predicates.every((p) => test(row, p)),
    );

    if (this.mode === "delete") return matched.map((row) => ({ ...row }));
    return matched.map((row) => ({ ...row, ...this.payload[0] }));
  }

  private sort(rows: readonly AnyRow[]): AnyRow[] {
    return [...rows].sort((a, b) => {
      for (const { column, ascending } of this.orders) {
        const left = a[column];
        const right = b[column];

        const leftNull = left === null || left === undefined;
        const rightNull = right === null || right === undefined;
        if (leftNull || rightNull) {
          if (leftNull && rightNull) continue;
          // Postgres defaults: NULLS LAST ascending, NULLS FIRST descending.
          const nullsLast = ascending;
          if (leftNull) return nullsLast ? 1 : -1;
          return nullsLast ? -1 : 1;
        }

        const order = compare(left, right);
        if (order !== 0) return ascending ? order : -order;
      }
      return 0;
    });
  }

  /** Applies `single()` / `maybeSingle()` to a resolved set of rows. */
  private shape(rows: AnyRow[], count: number | null): DemoResult<unknown> {
    if (this.cardinality === "many") return ok(rows, count);

    if (rows.length === 1) return ok(rows[0], count);
    if (rows.length === 0 && this.cardinality === "maybe") return ok(null, count);

    return failed(wrongRowCount(rows.length));
  }
}
