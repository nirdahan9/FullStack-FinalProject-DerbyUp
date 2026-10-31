/**
 * The instant the demo believes it is.
 *
 * A static demo has no database and no cron, so nothing refreshes it: whatever
 * timestamps the dataset ships with are the timestamps it will still carry in
 * two years. Written as absolute dates, the demo rots in a specific and
 * embarrassing way — "upcoming" fixtures drift into the past, the live match
 * finishes without ever being settled, "today's" challenge is dated last
 * spring, and the dashboard greets a visitor with an empty week.
 *
 * So the dataset never states a time. It states an *offset*, and this file is
 * the single fixed point every offset is measured from. `kickoff_at` for a
 * match two days out is `hoursFromNow(48)`, which is a constant string
 * computed once at module load — and the pages that render it compare it to
 * `DEMO_NOW` rather than to the wall clock. The whole snapshot therefore keeps
 * its shape forever: the same eleven matches are finished, the same two are
 * being played, the same eighteen are still open.
 *
 * Why this exact instant: Saturday 21 November 2026, 18:00 UTC — 20:00 in
 * Israel, where the product's users are. It is the busiest hour of a football
 * week, which is what makes the snapshot interesting. The English and Spanish
 * afternoon rounds are over and settled, two matches are in progress, the
 * Sunday fixtures are hours away, and the Champions League midweek round is
 * close enough to be priced but far enough to still be open. Kickoffs in the
 * dataset land on whole or half hours relative to it, so every offset in
 * `fixtures.ts` is a readable number rather than `-262.1667`.
 *
 * It is deliberately NOT derived from `new Date()`. A demo whose "now" moves
 * is a demo whose snapshot stops matching its own narrative — and the point of
 * freezing the data is that the story it tells cannot go stale.
 */
export const DEMO_NOW = new Date("2026-11-21T18:00:00.000Z");

/** Milliseconds in an hour, named because the arithmetic below is otherwise mute. */
const HOUR_MS = 3_600_000;

/**
 * An ISO timestamp `h` hours from `DEMO_NOW`. Negative is the past.
 *
 * Returns a string rather than a `Date` because that is what the row types
 * want: every `timestamptz` column in `types/database.ts` is generated as
 * `string`, and handing a `Date` to one of them is a type error the compiler
 * catches only after the value has been written in forty places.
 *
 * Fractional hours are allowed and used — `-0.5` is the live match that kicked
 * off half an hour ago, `22.5` is tomorrow's 16:30 kickoff.
 */
export function hoursFromNow(h: number): string {
  return new Date(DEMO_NOW.getTime() + h * HOUR_MS).toISOString();
}
