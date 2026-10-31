import type { Database, Json } from "@/types/database";
import type { Outcome } from "@/lib/football-api/types";
import { rankRows, type ScoreRow } from "@/lib/domain/standings";
import { validateCancellation } from "@/lib/domain/prediction-rules";
import type { PredictionStatus } from "@/lib/domain/types";
import { DEMO_NOW } from "./now";
import {
  ADVISOR_DAILY_PICK,
  ADVISOR_USAGE,
  COMPETITIONS,
  DAILY_PUZZLES,
  DEMO_USER_ID,
  GAMES,
  LEAGUE_MEMBERS,
  LEAGUES,
  PREDICTIONS,
  PROFILES,
  PUZZLE_ATTEMPTS,
  QUESTIONS,
} from "./fixtures";
import {
  DEMO_TODAY,
  demoEmail,
  type Row,
} from "./tables";
import { DemoRpcError, type DemoResult } from "./query-builder";

/**
 * The twenty-eight database functions, in TypeScript.
 *
 * ── Why these are not stubs ───────────────────────────────────────────────
 *
 * Half the product lives in `supabase/migrations`. `league_standings` is the
 * league table; `admin_overview` is the operator's whole first screen;
 * `landing_fixtures` is what a stranger sees before signing up. A demo that
 * returned `[]` from those would be a demo of the navigation.
 *
 * So each one is reimplemented from the SQL that defines it, filter for
 * filter. Where the answer is a *rule* rather than a query, the rule is not
 * reimplemented — it is called:
 *
 *   · `league_standings` and `get_global_leaderboard` sum the same three
 *     filters the SQL applies and then hand the rows to the real
 *     `rankRows()`. Competition ranking, shared ranks and the `joined_at`
 *     tie-break are therefore the product's, not a second opinion about them.
 *   · `league_live_predictions` returns rows and no total, exactly as the SQL
 *     does and for the reason its own comment gives: the arithmetic belongs to
 *     `lib/domain/live-projection.ts`, which the caller already runs. The
 *     projection a visitor sees during the live match is computed by the same
 *     function that would have settled it.
 *   · `cancel_prediction` asks the real `validateCancellation()` whether the
 *     ten-minute window is open, so the demo refuses a late cancel with the
 *     product's own reason code and the UI shows the product's own Hebrew.
 *
 * That is the whole claim the static demo makes: the data is frozen, the logic
 * is not.
 *
 * ── Which checks survive and which do not ─────────────────────────────────
 *
 * Every function in the migrations is SECURITY DEFINER and checks something
 * before it answers. Those checks divide cleanly, and the demo keeps one half:
 *
 *   · **Dropped: the ones that exist to hide other people's rows.**
 *     `is_league_member()` in `league_standings`, `is_site_admin()` in the
 *     eleven admin functions. There is no RLS here and no second user — there
 *     is one visitor, who is the dataset's own site admin, and twelve people
 *     who are characters. Enforcing a check that protects nobody from nobody
 *     would only close screens the demo exists to show. (It would also be
 *     theatre: with no RLS behind it, a check in this file is a suggestion.)
 *
 *   · **Kept: the ones that are product behaviour.** An invalid invite code,
 *     an invite code you have already used, a score outside 0–99, a result for
 *     a fixture that has not kicked off, a cancel inside the ten-minute
 *     window, a league name of two characters. Those are rules a visitor is
 *     *meant* to run into — each has a Hebrew sentence written for it in
 *     `lib/actions/` — and a demo where every form always succeeds is a demo
 *     of the happy path only.
 *
 * ── Why the mutating ones change nothing ──────────────────────────────────
 *
 * `admin_settle_game`, `settle_game_manually`, `admin_set_site_admin`,
 * `admin_delete_user`, `create_league`, `advisor_publish_insight` and
 * `api_cache_put` validate their input, report success, and write nothing.
 * `fixtures.ts` is compiled source; there is nowhere to write. The snapshot
 * staying identical across renders is the property that lets the demo be
 * served from a static host and screenshotted without surprises.
 *
 * Two of them bend that rule in the only direction that helps. `create_league`
 * and `join_league` have to return an id, because their callers `redirect()`
 * to it — so they return a *real* league from the snapshot rather than an
 * invented uuid that would land on a 404. Opening a league takes you to the
 * one the demo user actually opened; joining with the code the third league
 * advertises takes you to that league. Both are the page the action promised.
 */

type Fn = Database["public"]["Functions"];

/** The functions this codebase actually calls; `callRpc` refuses the rest. */
type DemoRpcName =
  | "admin_delete_user"
  | "admin_list_games"
  | "admin_list_leagues"
  | "admin_list_site_admins"
  | "admin_list_users"
  | "admin_overview"
  | "admin_set_site_admin"
  | "admin_settle_game"
  | "admin_user_detail"
  | "admin_user_leagues"
  | "admin_user_predictions"
  | "advisor_consume_quota"
  | "advisor_crowd_split"
  | "advisor_publish_insight"
  | "advisor_quota_remaining"
  | "api_cache_get"
  | "api_cache_put"
  | "best_league_rank"
  | "cancel_prediction"
  | "create_league"
  | "get_global_leaderboard"
  | "is_site_admin"
  | "join_league"
  | "landing_advisor_card"
  | "landing_fixtures"
  | "league_live_predictions"
  | "league_standings"
  | "settle_game_manually";

type Args = Record<string, unknown> | undefined;

/**
 * One handler per function, with its return type pinned to the generated one.
 *
 * This is where the file earns its keep as *typed* code rather than a bag of
 * object literals. `Fn[N]["Returns"]` is what `types/database.ts` says the
 * function hands back, so a missing column, a misspelled one or a string where
 * the caller expects a number is a `npm run typecheck` failure here — not a
 * page that renders `undefined` on a host nobody is watching.
 *
 * `Args` is deliberately loose. The generated `Args` for a no-argument
 * function is `never`, which cannot be written as a parameter type, and the
 * values arrive from a `rpc(name, args)` call the compiler has already checked
 * at the call site. They are read through the small coercers below instead.
 */
type Handlers = { [N in DemoRpcName]: (args: Args) => Fn[N]["Returns"] };

// ─── Argument readers ──────────────────────────────────────────────────────

function str(args: Args, key: string): string {
  const value = args?.[key];
  return typeof value === "string" ? value : "";
}

function strOrNull(args: Args, key: string): string | null {
  const value = args?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(args: Args, key: string, fallback: number): number {
  const value = args?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numOrNull(args: Args, key: string): number | null {
  const value = args?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `least(greatest(p_limit, 1), ceiling)`, which every paged function applies. */
function clampLimit(value: number, ceiling: number): number {
  return Math.min(Math.max(value, 1), ceiling);
}

// ─── Indexes ───────────────────────────────────────────────────────────────
//
// Built once at module load from the frozen arrays, so the joins below are
// lookups rather than scans. Pure derivations of compiled data: same maps on
// every request, nothing to invalidate.

const gameById = new Map(GAMES.map((game) => [game.id, game]));
const questionById = new Map(QUESTIONS.map((question) => [question.id, question]));
const profileById = new Map(PROFILES.map((profile) => [profile.id, profile]));
const leagueById = new Map(LEAGUES.map((league) => [league.id, league]));
const competitionById = new Map(COMPETITIONS.map((c) => [c.id, c]));

/** The game a prediction is on, through its question. Null if either is gone. */
function gameOf(prediction: Row<"predictions">): Row<"games"> | null {
  const question = questionById.get(prediction.question_id);
  return question ? gameById.get(question.game_id) ?? null : null;
}

const NOW_MS = DEMO_NOW.getTime();

function isFuture(iso: string): boolean {
  return Date.parse(iso) > NOW_MS;
}

const ISRAEL_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `(ts at time zone 'Asia/Jerusalem')::date`, which three counters compare on. */
function israelDate(iso: string): string {
  return ISRAEL_DATE.format(new Date(iso));
}

/**
 * The price a question currently carries for one outcome.
 *
 * `questions.outcomes` is `jsonb`, so the generated type is `Json` and the
 * shape has to be asserted somewhere. It is asserted here, once, rather than
 * at the four call sites that need it — and it is the shape `buildQuestions()`
 * writes and `lib/football-api/types.ts` declares, so the cast is a statement
 * about the schema rather than a guess.
 */
function outcomesOf(question: Row<"questions">): Outcome[] {
  return (question.outcomes as unknown as Outcome[] | null) ?? [];
}

function currentOdds(question: Row<"questions">, outcome: string): number | null {
  return outcomesOf(question).find((o) => o.key === outcome)?.odds ?? null;
}

// ─── Standings ─────────────────────────────────────────────────────────────

type MemberScore = { member: Row<"league_members">; points: number; correct: number };

/**
 * The lateral subquery in `league_standings`, and the identical one in
 * `best_league_rank`.
 *
 * Three filters, and all three change the answer. Only `match_result`, because
 * a league table is the one board that stays legible to a colleague who does
 * not follow the odds; only the league's own competition; and only predictions
 * made at or after the member joined, or a veteran joining a fresh league
 * arrives with a season of points and wins on day one.
 */
function scoreMembers(league: Row<"leagues">, members: readonly Row<"league_members">[]): MemberScore[] {
  return members.map((member) => {
    let points = 0;
    let correct = 0;

    for (const prediction of PREDICTIONS) {
      if (prediction.user_id !== member.user_id) continue;
      if (prediction.status !== "correct") continue;

      const question = questionById.get(prediction.question_id);
      if (!question || question.type !== "match_result") continue;

      const game = gameById.get(question.game_id);
      if (!game || game.competition_id !== league.competition_id) continue;
      if (prediction.predicted_at < member.joined_at) continue;

      points += prediction.points_earned ?? 0;
      correct += 1;
    }

    return { member, points, correct };
  });
}

/**
 * Member scores, ordered by the product's own ranking function.
 *
 * `rankRows()` sorts on points, then correct count, then join date — which is
 * precisely `order by points desc, correct_count desc, lm.joined_at asc` in
 * the SQL. Calling it rather than restating it means the demo's league table
 * cannot disagree with the one the app would have drawn, including the part
 * nobody tests by eye: two members tied on both numbers share a rank.
 */
function rankedMembers(league: Row<"leagues">): (MemberScore & { rank: number })[] {
  const members = LEAGUE_MEMBERS.filter((m) => m.league_id === league.id);
  const scored = scoreMembers(league, members);

  const byUser = new Map(scored.map((entry) => [entry.member.user_id, entry]));
  const rows: ScoreRow[] = scored.map((entry) => ({
    userId: entry.member.user_id,
    displayName: profileById.get(entry.member.user_id)?.display_name ?? "",
    points: entry.points,
    correctCount: entry.correct,
    joinedAt: new Date(entry.member.joined_at),
  }));

  return rankRows(rows).flatMap((ranked) => {
    const entry = byUser.get(ranked.userId);
    return entry ? [{ ...entry, rank: ranked.rank }] : [];
  });
}

// ─── Admin row builders ────────────────────────────────────────────────────

/** How many *private* leagues somebody is in — public ones are automatic. */
function privateLeagueCount(userId: string): number {
  return LEAGUE_MEMBERS.filter((m) => {
    if (m.user_id !== userId) return false;
    return leagueById.get(m.league_id)?.is_public === false;
  }).length;
}

function lastPredictionAt(userId: string): string | null {
  let latest: string | null = null;
  for (const prediction of PREDICTIONS) {
    if (prediction.user_id !== userId) continue;
    if (latest === null || prediction.predicted_at > latest) latest = prediction.predicted_at;
  }
  return latest;
}

/** The row `admin_list_users` and `admin_user_detail` both return. */
function adminUserRow(profile: Row<"profiles">): Fn["admin_user_detail"]["Returns"][number] {
  return {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    email: demoEmail(profile.username),
    avatar_url: profile.avatar_url,
    total_points: profile.total_points,
    total_predictions: profile.total_predictions,
    total_correct: profile.total_correct,
    leagues_count: privateLeagueCount(profile.id),
    last_prediction_at: lastPredictionAt(profile.id),
    is_site_admin: profile.is_site_admin,
    created_at: profile.created_at,
  };
}

/** `ilike '%term%'` over the columns a function says it searches. */
function matchesSearch(term: string | null, ...columns: (string | null)[]): boolean {
  if (term === null) return true;
  const needle = term.trim().toLowerCase();
  if (needle === "") return true;
  return columns.some((column) => (column ?? "").toLowerCase().includes(needle));
}

// ─── Guards reproduced from the migrations ─────────────────────────────────

/**
 * The three refusals both settle functions share, in the order the SQL checks
 * them — a visitor who tries to record 5–120, or a result for tomorrow's
 * fixture, gets the sentence `lib/actions/` already has written for it.
 */
function assertSettleable(gameId: string, scoreHome: number, scoreAway: number): void {
  const game = gameById.get(gameId);
  if (!game) throw new DemoRpcError("NOT_FOUND", "P0002");
  if (game.settled_at !== null) throw new DemoRpcError("ALREADY_SETTLED");
  if (isFuture(game.kickoff_at)) throw new DemoRpcError("GAME_NOT_STARTED");
  if (scoreHome < 0 || scoreAway < 0 || scoreHome > 99 || scoreAway > 99) {
    throw new DemoRpcError("INVALID_SCORE");
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────────

const HANDLERS: Handlers = {
  // ── Leagues ──

  league_standings: (args) => {
    const league = leagueById.get(str(args, "p_league_id"));
    if (!league) return [];

    const limit = clampLimit(num(args, "p_limit", 20), 100);
    const offset = Math.max(num(args, "p_offset", 0), 0);

    return rankedMembers(league)
      .slice(offset, offset + limit)
      .map((entry) => {
        const profile = profileById.get(entry.member.user_id);
        return {
          user_id: entry.member.user_id,
          // The generated signature says these two are non-null. They are not:
          // `profiles.display_name` and `avatar_url` are both nullable, eight
          // of the twelve people in the snapshot have no avatar, and the page
          // writes `r.display_name ?? "משתמש"` because it knows. The generator
          // cannot see nullability through `returns table`, so the honest value
          // goes out with a cast rather than an empty string that would render
          // as a broken <img>.
          display_name: profile?.display_name as string,
          avatar_url: profile?.avatar_url as string,
          points: entry.points,
          correct_count: entry.correct,
          joined_at: entry.member.joined_at,
        };
      });
  },

  /**
   * Rows for the live layer, with no total — the SQL's own decision, kept.
   * `getLeagueLive()` sums them through `sumLiveByUser()`, which calls
   * `settlePrediction()`, so the points climbing on screen during the match
   * are the points that would be credited after it.
   */
  league_live_predictions: (args) => {
    const league = leagueById.get(str(args, "p_league_id"));
    if (!league) return [];

    const rows: Fn["league_live_predictions"]["Returns"] = [];

    for (const member of LEAGUE_MEMBERS) {
      if (member.league_id !== league.id) continue;

      for (const prediction of PREDICTIONS) {
        if (prediction.user_id !== member.user_id) continue;
        if (prediction.status !== "pending") continue;
        if (prediction.predicted_at < member.joined_at) continue;

        const question = questionById.get(prediction.question_id);
        if (!question || question.type !== "match_result") continue;

        const game = gameById.get(question.game_id);
        if (!game || game.competition_id !== league.competition_id) continue;

        // 'live' is obvious; 'finished' with settled_at still null is the
        // subtle half — settlement runs on a schedule, and a live layer that
        // stopped at the whistle would drop every member to zero for ten
        // minutes and then hand the points back.
        const inPlay =
          game.status === "live" || (game.status === "finished" && game.settled_at === null);
        if (!inPlay) continue;
        if (game.score_home === null || game.score_away === null) continue;

        rows.push({
          user_id: prediction.user_id,
          question_type: question.type,
          selected_outcome: prediction.selected_outcome,
          odds: prediction.odds,
          current_odds: currentOdds(question, prediction.selected_outcome),
          odds_provisional: prediction.odds_provisional,
          bonus_pct: prediction.bonus_pct,
          exact_score: prediction.exact_score,
          score_home: game.score_home,
          score_away: game.score_away,
        });
      }
    }

    return rows;
  },

  /**
   * Validates like the real function and then hands back the league the demo
   * user already opened, so the `redirect()` that follows lands on a league
   * page that exists — with the invite box showing, because they created it.
   */
  create_league: (args) => {
    const name = str(args, "p_name").trim();
    if (name.length < 3) throw new DemoRpcError("INVALID_NAME");

    const competition = competitionById.get(num(args, "p_competition_id", -1));
    if (!competition || !competition.is_active) {
      throw new DemoRpcError("INVALID_COMPETITION");
    }

    const own = LEAGUES.find((league) => league.creator_id === DEMO_USER_ID);
    if (!own) throw new DemoRpcError("INVALID_COMPETITION");

    return [{ league_id: own.id, league_code: own.invite_code }];
  },

  /**
   * The one write path that is genuinely reachable end to end.
   *
   * The snapshot has a third league the demo user is deliberately *not* in,
   * with a real invite code, so typing that code resolves, redirects, and
   * shows a league table. An unknown code raises `INVALID_CODE` and a code the
   * user is already in raises `ALREADY_MEMBER`, both of which the join form has
   * Hebrew for — the demo therefore shows all three outcomes of the flow and
   * stores none of them.
   */
  join_league: (args) => {
    const code = str(args, "p_invite_code").trim().toUpperCase();
    const league = LEAGUES.find((candidate) => candidate.invite_code === code);

    // An archived league is reported the same as a missing one, so the code
    // cannot be used to probe which leagues exist.
    if (!league || league.status !== "active") {
      throw new DemoRpcError("INVALID_CODE", "P0002");
    }

    const already = LEAGUE_MEMBERS.some(
      (m) => m.league_id === league.id && m.user_id === DEMO_USER_ID,
    );
    if (already) throw new DemoRpcError("ALREADY_MEMBER");

    return league.id;
  },

  /**
   * Asks the product's own rule, so a cancel the app would refuse is refused
   * here with the same reason code and therefore the same Hebrew sentence.
   * A cancel the app would allow reports success and changes nothing.
   */
  cancel_prediction: (args) => {
    const prediction = PREDICTIONS.find((p) => p.id === str(args, "p_id"));
    if (!prediction) throw new DemoRpcError("NOT_FOUND", "P0002");

    const game = gameOf(prediction);
    if (!game) throw new DemoRpcError("NOT_FOUND", "P0002");

    const verdict = validateCancellation({
      prediction: {
        userId: prediction.user_id,
        status: prediction.status as PredictionStatus,
      },
      game: { kickoffAt: new Date(game.kickoff_at) },
      requesterId: DEMO_USER_ID,
      now: DEMO_NOW,
    });

    if (!verdict.ok) throw new DemoRpcError(verdict.reason);
    return undefined;
  },

  settle_game_manually: (args) => {
    const league = leagueById.get(str(args, "p_league_id"));
    const gameId = str(args, "p_game_id");
    const game = gameById.get(gameId);

    // Kept, because it is product behaviour rather than data hiding: a league
    // admin may settle a fixture their league actually counts, and nothing
    // else. Without the competition half, one admin could settle every match
    // in the product.
    const allowed =
      league !== undefined &&
      game !== undefined &&
      !league.is_public &&
      league.creator_id === DEMO_USER_ID &&
      game.competition_id === league.competition_id;

    if (!allowed) throw new DemoRpcError("NOT_LEAGUE_ADMIN");

    assertSettleable(gameId, num(args, "p_score_home", -1), num(args, "p_score_away", -1));
    return undefined;
  },

  // ── Site-wide board ──

  /**
   * `order by total_points desc, created_at asc`, which is what `rankRows()`
   * reduces to when every row carries the same correct count — so the ordering
   * is the product's function rather than a second sort that agrees with it
   * today.
   */
  get_global_leaderboard: (args) => {
    const limit = clampLimit(num(args, "p_limit", 20), 100);
    const offset = Math.max(num(args, "p_offset", 0), 0);

    const rows: ScoreRow[] = PROFILES.map((profile) => ({
      userId: profile.id,
      displayName: profile.display_name ?? "",
      points: profile.total_points,
      correctCount: 0,
      joinedAt: new Date(profile.created_at),
    }));

    return rankRows(rows)
      .slice(offset, offset + limit)
      .flatMap((ranked) => {
        const profile = profileById.get(ranked.userId);
        if (!profile) return [];
        // Non-null in the generated signature, nullable in the table; see
        // `league_standings` above for why the cast is the honest option.
        return [{
          display_name: profile.display_name as string,
          avatar_url: profile.avatar_url as string,
          total_points: profile.total_points,
        }];
      });
  },

  best_league_rank: (args) => {
    const userId = str(args, "p_user");

    const ranks = LEAGUE_MEMBERS.filter((m) => m.user_id === userId)
      .flatMap((membership) => {
        const league = leagueById.get(membership.league_id);
        if (!league || league.is_public || league.status !== "active") return [];
        const mine = rankedMembers(league).find((e) => e.member.user_id === userId);
        return mine ? [mine.rank] : [];
      });

    // `min()` over no rows is SQL NULL, which the generated signature flattens
    // to `number`. `lib/achievements/award.ts` already tests for null — the
    // achievement is "ranked first", and zeroth is not a rank — so the honest
    // value goes out with a cast.
    return (ranks.length ? Math.min(...ranks) : null) as number;
  },

  // ── Landing page ──

  landing_fixtures: () => {
    const rows = GAMES.flatMap((game) => {
      const open = game.status === "scheduled" && isFuture(game.kickoff_at);
      if (!open && game.status !== "live") return [];

      // An inner join on the winner market: a fixture the sync has not priced
      // yet has no question and does not appear, which is the SQL's behaviour
      // and the right one — the card's whole content is a price.
      const question = QUESTIONS.find(
        (q) => q.game_id === game.id && q.type === "match_result",
      );
      if (!question) return [];

      return [{
        home_team: game.home_team,
        away_team: game.away_team,
        home_logo: game.home_logo,
        away_logo: game.away_logo,
        kickoff_at: game.kickoff_at,
        competition_name: competitionById.get(game.competition_id)?.name ?? "",
        outcomes: question.outcomes,
        odds_provisional: question.odds_provisional,
        status: game.status,
        score_away: game.score_away,
        score_home: game.score_home,
        minute: game.minute,
      }];
    });

    // A match on the pitch first, then priced fixtures before provisional
    // ones, then by kickoff — the three-key order the migration spells out.
    return rows
      .sort(
        (a, b) =>
          Number(b.status === "live") - Number(a.status === "live") ||
          Number(a.odds_provisional) - Number(b.odds_provisional) ||
          a.kickoff_at.localeCompare(b.kickoff_at),
      )
      .slice(0, 3);
  },

  landing_advisor_card: () => {
    return ADVISOR_DAILY_PICK.flatMap((pick) => {
      if (pick.pick_date !== DEMO_TODAY) return [];

      const game = gameById.get(pick.game_id);
      if (!game || game.status !== "scheduled" || !isFuture(game.kickoff_at)) return [];

      return [{
        home_team: game.home_team,
        away_team: game.away_team,
        // Declared non-null by the generator although the column is nullable.
        // Every fixture a daily pick names is a top-flight European club with a
        // crest in the snapshot, so the fallback is unreachable — and an empty
        // string is a better failure than `src="null"` if that ever changes.
        home_logo: game.home_logo ?? "",
        away_logo: game.away_logo ?? "",
        kickoff_at: game.kickoff_at,
        competition_name: competitionById.get(pick.competition_id)?.name ?? "",
        payload: pick.payload,
      }];
    })
      .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
      .slice(0, 1);
  },

  // ── Advisor ──

  advisor_crowd_split: (args) => {
    const gameId = str(args, "p_game_id");
    const counts = new Map<string, number>();

    for (const prediction of PREDICTIONS) {
      if (prediction.status === "cancelled") continue;
      const question = questionById.get(prediction.question_id);
      if (!question || question.game_id !== gameId) continue;
      const key = `${question.type}\u0000${prediction.selected_outcome}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // `group by` makes no promise about order and neither does the SQL, but a
    // static demo must render the same bars every time, so the groups are
    // sorted before they go out.
    return [...counts.entries()]
      .map(([key, picks]) => {
        const [question_type, selected_outcome] = key.split("\u0000");
        return { question_type, selected_outcome, picks };
      })
      .sort(
        (a, b) =>
          a.question_type.localeCompare(b.question_type) ||
          a.selected_outcome.localeCompare(b.selected_outcome),
      );
  },

  /**
   * Reports what the allowance *would* be after this question, and spends
   * nothing. The counter in the advisor panel therefore shows a believable
   * mid-week number that is the same on every open, instead of a figure that
   * walks down as a visitor clicks and resets when the host recycles.
   */
  advisor_consume_quota: (args) => {
    const limit = num(args, "p_limit", 0);
    if (limit <= 0) return -1;

    const used = ADVISOR_USAGE.find(
      (row) => row.user_id === DEMO_USER_ID && row.usage_date === DEMO_TODAY,
    )?.question_count ?? 0;

    if (used >= limit) return -1;
    return limit - (used + 1);
  },

  advisor_quota_remaining: (args) => {
    const limit = num(args, "p_limit", 0);
    const used = ADVISOR_USAGE.find(
      (row) => row.user_id === DEMO_USER_ID && row.usage_date === DEMO_TODAY,
    )?.question_count ?? 0;

    return Math.max(0, limit - used);
  },

  advisor_publish_insight: () => undefined,

  /**
   * A permanent cache miss, which is the truth rather than a stub: `api_cache`
   * holds API-Football responses, the demo makes no provider calls, and the
   * snapshot ships the analyses it needs in `advisor_insights` instead.
   */
  api_cache_get: (): Json => null,

  api_cache_put: () => undefined,

  // ── Site administration ──

  is_site_admin: () => profileById.get(DEMO_USER_ID)?.is_site_admin ?? false,

  admin_overview: () => {
    const correct = PREDICTIONS.filter((p) => p.status === "correct");
    const thirtyDaysAgo = new Date(NOW_MS - 30 * 24 * 3600_000).toISOString();

    const puzzleToday = new Set(
      DAILY_PUZZLES.filter((puzzle) => puzzle.play_date === DEMO_TODAY).map((p) => p.id),
    );

    return [{
      users_total: PROFILES.length,
      users_new_today: PROFILES.filter((p) => israelDate(p.created_at) === DEMO_TODAY).length,
      users_new_30d: PROFILES.filter((p) => p.created_at > thirtyDaysAgo).length,
      predictions_total: PREDICTIONS.length,
      predictions_pending: PREDICTIONS.filter((p) => p.status === "pending").length,
      predictions_correct: correct.length,
      predictions_incorrect: PREDICTIONS.filter((p) => p.status === "incorrect").length,
      points_awarded: correct.reduce((sum, p) => sum + (p.points_earned ?? 0), 0),
      leagues_total: LEAGUES.length,
      leagues_private: LEAGUES.filter((l) => !l.is_public).length,
      leagues_archived: LEAGUES.filter((l) => l.status === "archived").length,
      // Public-league membership is automatic and would only count the user
      // base twice; the number worth watching is how many people an
      // organisation actually brought in.
      members_private: LEAGUE_MEMBERS.filter(
        (m) => leagueById.get(m.league_id)?.is_public === false,
      ).length,
      games_total: GAMES.length,
      games_live: GAMES.filter((g) => g.status === "live").length,
      games_upcoming: GAMES.filter(
        (g) => g.status === "scheduled" && isFuture(g.kickoff_at),
      ).length,
      // The operational number: kicked off, still unsettled.
      games_awaiting: GAMES.filter(
        (g) => g.settled_at === null && !isFuture(g.kickoff_at) && g.status !== "cancelled",
      ).length,
      puzzle_attempts_today: PUZZLE_ATTEMPTS.filter((a) => puzzleToday.has(a.puzzle_id)).length,
    }];
  },

  admin_list_users: (args) => {
    const search = strOrNull(args, "p_search");
    const limit = clampLimit(num(args, "p_limit", 50), 200);
    const offset = Math.max(num(args, "p_offset", 0), 0);

    return [...PROFILES]
      .filter((profile) =>
        matchesSearch(search, profile.username, profile.display_name, demoEmail(profile.username)),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(offset, offset + limit)
      .map(adminUserRow);
  },

  admin_user_detail: (args) => {
    const profile = profileById.get(str(args, "p_user_id"));
    return profile ? [adminUserRow(profile)] : [];
  },

  admin_list_site_admins: () => {
    return [...PROFILES]
      .filter((profile) => profile.is_site_admin)
      // Oldest first: the founding operator reads naturally at the top, and
      // the order is stable as admins are added.
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((profile) => ({
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        email: demoEmail(profile.username),
        avatar_url: profile.avatar_url,
        created_at: profile.created_at,
      }));
  },

  admin_user_leagues: (args) => {
    const userId = str(args, "p_user_id");

    return LEAGUE_MEMBERS.filter((m) => m.user_id === userId)
      .flatMap((membership) => {
        const league = leagueById.get(membership.league_id);
        if (!league) return [];
        return [{
          id: league.id,
          name: league.name,
          is_public: league.is_public,
          status: league.status,
          is_creator: league.creator_id === userId,
          joined_at: membership.joined_at,
        }];
      })
      .sort(
        (a, b) =>
          Number(a.is_public) - Number(b.is_public) ||
          b.joined_at.localeCompare(a.joined_at),
      );
  },

  admin_user_predictions: (args) => {
    const userId = str(args, "p_user_id");
    const limit = clampLimit(num(args, "p_limit", 50), 200);

    return PREDICTIONS.filter((p) => p.user_id === userId)
      .flatMap((prediction) => {
        const question = questionById.get(prediction.question_id);
        const game = question ? gameById.get(question.game_id) : undefined;
        if (!question || !game) return [];

        return [{
          id: prediction.id,
          game_id: game.id,
          home_team: game.home_team,
          away_team: game.away_team,
          kickoff_at: game.kickoff_at,
          question_type: question.type,
          selected_outcome: prediction.selected_outcome,
          correct_outcome: question.correct_outcome,
          odds: prediction.odds,
          bonus_pct: prediction.bonus_pct,
          exact_score: prediction.exact_score,
          status: prediction.status,
          points_earned: prediction.points_earned,
          predicted_at: prediction.predicted_at,
        }];
      })
      .sort((a, b) => b.predicted_at.localeCompare(a.predicted_at))
      .slice(0, limit);
  },

  admin_list_games: (args) => {
    const search = strOrNull(args, "p_search");
    const status = strOrNull(args, "p_status") ?? "all";
    const competition = numOrNull(args, "p_competition");
    const limit = clampLimit(num(args, "p_limit", 50), 200);
    const offset = Math.max(num(args, "p_offset", 0), 0);

    const rows = GAMES.filter((game) => {
      if (competition !== null && game.competition_id !== competition) return false;
      if (!matchesSearch(search, game.home_team, game.away_team)) return false;

      // Two of the seven filters are questions about time rather than columns:
      // 'upcoming' is scheduled and still ahead, 'unsettled' is the queue an
      // operator is meant to act on.
      if (status === "all") return true;
      if (status === "upcoming") return game.status === "scheduled" && isFuture(game.kickoff_at);
      if (status === "unsettled") {
        return (
          game.settled_at === null && !isFuture(game.kickoff_at) && game.status !== "cancelled"
        );
      }
      return game.status === status;
    }).map((game) => {
      const questions = QUESTIONS.filter((q) => q.game_id === game.id);
      const questionIds = new Set(questions.map((q) => q.id));
      const predictions = PREDICTIONS.filter(
        (p) => questionIds.has(p.question_id) && p.status !== "cancelled",
      );

      return {
        id: game.id,
        fixture_id: game.fixture_id,
        competition_id: game.competition_id,
        competition_name: competitionById.get(game.competition_id)?.name ?? "",
        home_team: game.home_team,
        away_team: game.away_team,
        kickoff_at: game.kickoff_at,
        status: game.status,
        score_home: game.score_home,
        score_away: game.score_away,
        settled_at: game.settled_at,
        question_count: questions.length,
        prediction_count: predictions.length,
        player_count: new Set(predictions.map((p) => p.user_id)).size,
      };
    });

    // Fixtures still to come read forwards, everything else backwards, so the
    // most relevant row is first under either filter.
    return rows
      .sort((a, b) => {
        const aFuture = isFuture(a.kickoff_at);
        const bFuture = isFuture(b.kickoff_at);
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        return aFuture
          ? a.kickoff_at.localeCompare(b.kickoff_at)
          : b.kickoff_at.localeCompare(a.kickoff_at);
      })
      .slice(offset, offset + limit);
  },

  admin_list_leagues: (args) => {
    const search = strOrNull(args, "p_search");
    const limit = clampLimit(num(args, "p_limit", 50), 200);
    const offset = Math.max(num(args, "p_offset", 0), 0);

    return LEAGUES.map((league) => {
      const creator = league.creator_id ? profileById.get(league.creator_id) : undefined;
      return {
        id: league.id,
        name: league.name,
        is_public: league.is_public,
        status: league.status,
        invite_code: league.invite_code,
        competition_name: competitionById.get(league.competition_id)?.name ?? "",
        creator_id: league.creator_id,
        creator_name: creator?.display_name ?? null,
        member_count: LEAGUE_MEMBERS.filter((m) => m.league_id === league.id).length,
        created_at: league.created_at,
      };
    })
      .filter((row) => matchesSearch(search, row.name, row.creator_name))
      .sort(
        (a, b) =>
          Number(a.is_public) - Number(b.is_public) ||
          b.created_at.localeCompare(a.created_at),
      )
      .slice(offset, offset + limit);
  },

  admin_settle_game: (args) => {
    assertSettleable(
      str(args, "p_game_id"),
      num(args, "p_score_home", -1),
      num(args, "p_score_away", -1),
    );
    return undefined;
  },

  admin_set_site_admin: (args) => {
    const userId = str(args, "p_user_id");
    // Accident guards rather than security, and both are things a visitor can
    // actually trigger from the operators card, so both are kept.
    if (userId === DEMO_USER_ID) throw new DemoRpcError("CANNOT_CHANGE_SELF");
    if (!profileById.has(userId)) throw new DemoRpcError("NOT_FOUND", "P0002");
    return undefined;
  },

  admin_delete_user: (args) => {
    const userId = str(args, "p_user_id");
    if (userId === DEMO_USER_ID) throw new DemoRpcError("CANNOT_DELETE_SELF");
    const profile = profileById.get(userId);
    if (!profile) throw new DemoRpcError("NOT_FOUND", "P0002");
    if (profile.is_site_admin) throw new DemoRpcError("CANNOT_DELETE_ADMIN");
    return undefined;
  },
};

// ─── Dispatch ──────────────────────────────────────────────────────────────

function isDemoRpcName(name: string): name is DemoRpcName {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name);
}

/**
 * Runs one function and reports it the way PostgREST would.
 *
 * A `raise exception` becomes an `error` on the result rather than a rejected
 * promise, because that is the contract every caller is written against:
 * `lib/actions/leagues.ts` reads `error.message` looking for `INVALID_CODE`,
 * and a thrown error would bypass all of it and surface as an unhandled
 * exception in a Server Action.
 *
 * An unknown name reports `PGRST202` — "could not find the function" — which
 * is what a real project says when a migration has not been applied. It is the
 * honest answer: the demo genuinely does not have that function, and a silent
 * `null` would be debugged for an hour.
 */
export function callRpc(name: string, args?: Record<string, unknown>): DemoResult<unknown> {
  if (!isDemoRpcName(name)) {
    return {
      data: null,
      error: {
        message: `Could not find the function public.${name} in the schema cache`,
        code: "PGRST202",
        details: "",
        hint: null,
      },
      count: null,
      status: 404,
      statusText: "Not Found",
    };
  }

  try {
    const data = HANDLERS[name](args);
    return { data, error: null, count: null, status: 200, statusText: "OK" };
  } catch (cause) {
    const error =
      cause instanceof DemoRpcError
        ? cause.toDemoError()
        : {
            message: cause instanceof Error ? cause.message : String(cause),
            code: "XX000",
            details: "",
            hint: null,
          };

    return { data: null, error, count: null, status: 400, statusText: "Bad Request" };
  }
}
