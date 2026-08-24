import { resolveClient, type AdvisorClient } from "./db";
import { translateTeam } from "@/lib/i18n/teams";
import { fetchProviderHistory } from "./football";
import type {
  AdvisorQuestion,
  CrowdSplit,
  GameContext,
  HeadToHead,
  Outcome,
  QuestionType,
  TeamForm,
} from "./types";

/**
 * Turns rows we already store into the brief the model reads.
 *
 * Everything here is derived, not fetched: form and head-to-head come out of
 * the same `games` table the fixtures sync fills, so a thousand people opening
 * the advisor costs zero upstream requests. Only `fetchEnrichment` leaves the
 * building, and only when asked.
 */

const FORM_MATCHES = 5;
const H2H_MATCHES = 5;
/** Below this many stored results, a form guide is not worth showing. */
const MIN_FORM_MATCHES = 3;
/** Every date here is Israeli local time — the labels and the filters alike. */
const TZ = "Asia/Jerusalem";

export type GameListItem = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffAt: string;
  kickoffLabel: string;
  competition: string;
  competitionId: number;
  competitionLogo: string | null;
};

export type CompetitionItem = {
  id: number;
  name: string;
  country: string;
  logo: string | null;
};

export const RANGE_KEYS = ["today", "tomorrow", "week", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export function isRangeKey(value: string | null): value is RangeKey {
  return value !== null && (RANGE_KEYS as readonly string[]).includes(value);
}

export function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

// ─── Kickoff windows ──────────────────────────────────────────────────────

/**
 * A day boundary here is midnight in Israel, not midnight UTC.
 *
 * "Today" for someone in Tel Aviv ends at 21:00 UTC in winter and 22:00 in
 * summer, so the window cannot be had by rounding a UTC timestamp down. The
 * offset is read back out of the formatter, which already knows about DST.
 */
function israelOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const asIfUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second"),
  );
  // The parts carry no milliseconds, so they come off the instant as well.
  return asIfUtc - (at.getTime() - at.getMilliseconds());
}

/** The instant Israeli midnight falls on, `daysFromToday` days out. */
function israelMidnight(daysFromToday: number, now: Date): Date {
  // Shifted by the offset, the UTC fields read as the Israeli wall clock —
  // which is where adding a day is plain arithmetic.
  const wall = new Date(now.getTime() + israelOffsetMs(now));
  const target = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate() + daysFromToday,
  );
  // Resolved twice, because the boundary can sit on the far side of a clock
  // change from the offset that was used to find it.
  const candidate = new Date(target - israelOffsetMs(now));
  return new Date(target - israelOffsetMs(candidate));
}

/** `[from, to)` in absolute time; `to` stays open for "all". */
function kickoffWindow(range: RangeKey, now = new Date()): { from: Date; to: Date | null } {
  switch (range) {
    // Always from *now*, never from midnight: a match that kicked off two
    // hours ago is not one anybody wants advice on.
    case "today":
      return { from: now, to: israelMidnight(1, now) };
    case "tomorrow":
      return { from: israelMidnight(1, now), to: israelMidnight(2, now) };
    case "week":
      return { from: now, to: israelMidnight(7, now) };
    default:
      return { from: now, to: null };
  }
}

export type GameListPage = {
  games: GameListItem[];
  /** How many matched the filter before `limit`, so the UI can say what it hides. */
  total: number;
};

/**
 * The picker's data source.
 *
 * `games` holds close to two thousand scheduled fixtures, so the filtering has
 * to happen in Postgres. A list of everything truncated to the first N is not
 * the league you asked for; it is whatever kicks off soonest, anywhere.
 */
export async function listUpcomingGames(
  options: {
    competitionId?: number | null;
    range?: RangeKey;
    limit?: number;
    client?: AdvisorClient;
  } = {},
): Promise<GameListPage> {
  const { competitionId = null, range = "week", limit = 60, client } = options;
  const bounds = kickoffWindow(range);

  // Every filter goes on before `order`/`limit`: PostgREST's builder stops
  // accepting them once the query crosses into its transform stage.
  const supabase = await resolveClient(client);
  let query = supabase
    .from("games")
    .select(
      "id, home_team, away_team, home_logo, away_logo, kickoff_at, competition_id, competitions(name, logo_url)",
      { count: "exact" },
    )
    .eq("status", "scheduled")
    .gte("kickoff_at", bounds.from.toISOString());

  if (bounds.to) query = query.lt("kickoff_at", bounds.to.toISOString());
  if (competitionId !== null) query = query.eq("competition_id", competitionId);

  const { data, error, count } = await query
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Supabase: ${error.message}`);

  // Crests are already ours: the fixtures sync stores the provider's URL on
  // every row, so showing them costs no upstream request.
  const games = (data ?? []).map((row) => {
    const competitions = row.competitions as
      | { name?: string; logo_url?: string }
      | { name?: string; logo_url?: string }[]
      | null;
    const meta = Array.isArray(competitions) ? competitions[0] : competitions;
    return {
      id: row.id as string,
      homeTeam: translateTeam(row.home_team as string),
      awayTeam: translateTeam(row.away_team as string),
      homeLogo: (row.home_logo as string | null) ?? null,
      awayLogo: (row.away_logo as string | null) ?? null,
      kickoffAt: row.kickoff_at as string,
      kickoffLabel: kickoffLabel(row.kickoff_at as string),
      competition: meta?.name ?? "—",
      competitionId: row.competition_id as number,
      competitionLogo: meta?.logo_url ?? null,
    };
  });

  return { games, total: count ?? games.length };
}

/** The leagues the filter offers — the same rows the fixtures sync fills. */
export async function listCompetitions(client?: AdvisorClient): Promise<CompetitionItem[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("competitions")
    .select("id, name, country, logo_url")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(`Supabase: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as number,
    name: row.name as string,
    country: (row.country as string | null) ?? "",
    logo: (row.logo_url as string | null) ?? null,
  }));
}

type FinishedRow = {
  home_team: string;
  away_team: string;
  score_home: number | null;
  score_away: number | null;
  kickoff_at: string;
};

/**
 * PostgREST parses `or=(...)` as a comma-separated list, so a team whose name
 * contains a comma would split the filter in two. Quoting the value is what
 * keeps "Brighton & Hove Albion" one argument.
 */
function quoted(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function fetchRecentFinished(
  team: string,
  before: string,
  client?: AdvisorClient,
): Promise<FinishedRow[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("games")
    .select("home_team, away_team, score_home, score_away, kickoff_at")
    .eq("status", "finished")
    .lt("kickoff_at", before)
    .or(`home_team.eq.${quoted(team)},away_team.eq.${quoted(team)}`)
    .order("kickoff_at", { ascending: false })
    .limit(FORM_MATCHES);

  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data ?? []) as FinishedRow[];
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    timeZone: TZ,
  });
}

export function toForm(team: string, rows: FinishedRow[]): TeamForm {
  const form: TeamForm = { team, results: [], matches: [], goalsFor: 0, goalsAgainst: 0 };

  for (const row of rows) {
    if (row.score_home === null || row.score_away === null) continue;
    const atHome = row.home_team === team;
    const scored = atHome ? row.score_home : row.score_away;
    const conceded = atHome ? row.score_away : row.score_home;
    const result = scored > conceded ? "W" : scored === conceded ? "D" : "L";

    form.goalsFor += scored;
    form.goalsAgainst += conceded;
    form.results.push(result);
    form.matches.push({
      playedAt: shortDate(row.kickoff_at),
      opponent: translateTeam(atHome ? row.away_team : row.home_team),
      venue: atHome ? "home" : "away",
      scored,
      conceded,
      result,
    });
  }

  return form;
}

async function fetchHeadToHead(
  home: string,
  away: string,
  before: string,
  client?: AdvisorClient,
): Promise<HeadToHead[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("games")
    .select("home_team, away_team, score_home, score_away, kickoff_at")
    .eq("status", "finished")
    .lt("kickoff_at", before)
    .or(
      `and(home_team.eq.${quoted(home)},away_team.eq.${quoted(away)}),` +
        `and(home_team.eq.${quoted(away)},away_team.eq.${quoted(home)})`,
    )
    .order("kickoff_at", { ascending: false })
    .limit(H2H_MATCHES);

  if (error) throw new Error(`Supabase: ${error.message}`);

  return ((data ?? []) as FinishedRow[])
    .filter((row) => row.score_home !== null && row.score_away !== null)
    .map((row) => ({
      playedAt: new Date(row.kickoff_at).toLocaleDateString("he-IL", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        timeZone: TZ,
      }),
      homeTeam: translateTeam(row.home_team),
      awayTeam: translateTeam(row.away_team),
      scoreHome: row.score_home as number,
      scoreAway: row.score_away as number,
    }));
}

/**
 * How everyone else predicted — the one signal the advisor has that no odds
 * feed does.
 *
 * Through an RPC rather than a select, because RLS on `predictions` correctly
 * returns only the caller's own rows: a direct query here would report that
 * every match has exactly one prediction, which is worse than reporting none.
 * `advisor_crowd_split` is SECURITY DEFINER and returns grouped counts, so
 * nothing that identifies a person crosses the boundary.
 */
async function fetchCrowd(
  gameId: string,
  questions: { type: QuestionType }[],
  client?: AdvisorClient,
): Promise<CrowdSplit[]> {
  if (!questions.length) return [];

  const supabase = await resolveClient(client);
  const { data, error } = await supabase.rpc("advisor_crowd_split", {
    p_game_id: gameId,
  });

  // The crowd is colour, not substance. A failure here loses one section of
  // the brief; it must not lose the analysis.
  if (error) return questions.map((q) => ({ type: q.type, total: 0, counts: {} }));

  const rows = (data ?? []) as {
    question_type: string;
    selected_outcome: string;
    picks: number;
  }[];

  return questions.map((question) => {
    const mine = rows.filter((row) => row.question_type === question.type);
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of mine) {
      const picks = Number(row.picks);
      counts[row.selected_outcome] = picks;
      total += picks;
    }
    return { type: question.type, total, counts };
  });
}

/**
 * The provider-facing identifiers for one game.
 *
 * Split out so a follow-up question can reach the player endpoints without
 * rebuilding the whole brief it already has.
 */
export async function loadGameMeta(
  gameId: string,
  client?: AdvisorClient,
): Promise<{ fixtureId: number; competitionId: number; season: number }> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("games")
    .select("fixture_id, competition_id, kickoff_at, competitions(season)")
    .eq("id", gameId)
    .maybeSingle();

  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!data) throw new Error("המשחק לא נמצא");

  const competitions = data.competitions as
    | { season?: number }
    | { season?: number }[]
    | null;
  const meta = Array.isArray(competitions) ? competitions[0] : competitions;

  return {
    fixtureId: data.fixture_id as number,
    competitionId: data.competition_id as number,
    season: meta?.season ?? new Date(data.kickoff_at as string).getUTCFullYear(),
  };
}

export async function buildGameContext(
  gameId: string,
  options: { enrich: boolean; client?: AdvisorClient } = { enrich: false },
): Promise<GameContext> {
  const client = options.client;
  const supabase = await resolveClient(client);
  const { data: game, error } = await supabase
    .from("games")
    .select(
      "id, fixture_id, home_team, away_team, kickoff_at, competition_id, competitions(name, season), questions(id, type, outcomes)",
    )
    .eq("id", gameId)
    .maybeSingle();

  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!game) throw new Error("המשחק לא נמצא");

  const homeRaw = game.home_team as string;
  const awayRaw = game.away_team as string;
  const kickoffAt = game.kickoff_at as string;

  const rawQuestions = (game.questions ?? []) as {
    id: string;
    type: QuestionType;
    outcomes: Outcome[];
  }[];

  // Winner first — the question everyone understands and the only one a league
  // table counts. Same order the game page uses.
  const ORDER: QuestionType[] = ["match_result", "over_under_2_5", "btts"];
  const sorted = [...rawQuestions].sort(
    (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type),
  );

  const questions: AdvisorQuestion[] = sorted.map((q) => ({
    type: q.type,
    outcomes: (q.outcomes ?? []).map((o) => ({
      key: o.key,
      // Outcome labels carry the provider's spelling for the two teams; the
      // reader wants the Hebrew one everywhere else on the page.
      label: o.label === homeRaw || o.label === awayRaw ? translateTeam(o.label) : o.label,
      odds: Number(o.odds),
    })),
  }));

  const competitions = game.competitions as
    | { name?: string; season?: number }
    | { name?: string; season?: number }[]
    | null;
  const meta = Array.isArray(competitions) ? competitions[0] : competitions;
  const competition = meta?.name ?? "—";
  // Falling back to the kickoff year keeps enrichment working if a competition
  // row is ever missing its season, which is how a European season straddling
  // two years is stored anyway.
  const season = meta?.season ?? new Date(kickoffAt).getUTCFullYear();

  const [homeRows, awayRows, dbHeadToHead, crowd] = await Promise.all([
    fetchRecentFinished(homeRaw, kickoffAt, client),
    fetchRecentFinished(awayRaw, kickoffAt, client),
    fetchHeadToHead(homeRaw, awayRaw, kickoffAt, client),
    fetchCrowd(gameId, sorted.map((q) => ({ type: q.type })), client),
  ]);

  let homeForm = toForm(homeRaw, homeRows);
  let awayForm = toForm(awayRaw, awayRows);
  let headToHead = dbHeadToHead;
  let enrichment = null as GameContext["enrichment"];
  const sources: GameContext["sources"] = {
    form: homeForm.results.length || awayForm.results.length ? "db" : "none",
    headToHead: headToHead.length ? "db" : "none",
    provider: null,
  };

  // Our table holds the current season only. Two matchweeks in, "last 5" and
  // "previous meetings" are both empty for everyone — which is precisely when
  // the advisor has nothing to say beyond repeating the odds. The provider is
  // asked for exactly the gaps, and never for what we already have.
  const needForm = homeForm.results.length < MIN_FORM_MATCHES || awayForm.results.length < MIN_FORM_MATCHES;
  const needHeadToHead = headToHead.length === 0;

  if (options.enrich) {
    const provider = await fetchProviderHistory({
      fixtureId: game.fixture_id as number,
      competitionId: game.competition_id as number,
      season,
      homeTeam: homeRaw,
      awayTeam: awayRaw,
      need: { form: needForm, headToHead: needHeadToHead },
      translate: translateTeam,
      client,
    });

    enrichment = provider.enrichment;
    sources.provider = provider.stats;

    if (needForm && (provider.homeForm || provider.awayForm)) {
      homeForm = provider.homeForm ?? homeForm;
      awayForm = provider.awayForm ?? awayForm;
      sources.form = "provider";
    }
    if (needHeadToHead && provider.headToHead.length) {
      headToHead = provider.headToHead;
      sources.headToHead = "provider";
    }
  }

  return {
    gameId: game.id as string,
    competition,
    homeTeamRaw: homeRaw,
    awayTeamRaw: awayRaw,
    homeTeam: translateTeam(homeRaw),
    awayTeam: translateTeam(awayRaw),
    kickoffAt,
    kickoffLabel: kickoffLabel(kickoffAt),
    questions,
    homeForm,
    awayForm,
    headToHead,
    crowd,
    enrichment,
    sources,
  };
}

/**
 * The cache key for a match's analysis, and deliberately the cheapest thing in
 * this file: one row, no provider calls.
 *
 * That ordering is the point. The hash has to be computable *before* we decide
 * whether to build the full brief, because building it reaches out to
 * API-Football — and paying for that on a cache hit would defeat the cache.
 * So the key is drawn only from what makes an analysis stale:
 *
 *   - the odds, because advice about a price that has moved is wrong advice;
 *   - the status, because a match that kicked off is no longer open;
 *   - `updated_at`, which the fixtures sync touches whenever anything else
 *     about the row changes.
 *
 * Form and head-to-head are deliberately *not* in the key. They change only
 * when one of these teams plays again, and that bumps `updated_at` on this
 * fixture's competition sync anyway; hashing them would mean loading them,
 * which is the cost we are avoiding.
 */
export async function insightCacheKey(
  gameId: string,
  client?: AdvisorClient,
): Promise<{ hash: string; status: string; kickoffAt: string } | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("games")
    .select("status, kickoff_at, updated_at, questions(type, outcomes)")
    .eq("id", gameId)
    .maybeSingle();

  if (error || !data) return null;

  const questions = (data.questions ?? []) as { type: string; outcomes: Outcome[] }[];
  const priced = [...questions]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((q) => {
      const outcomes = (q.outcomes ?? [])
        .map((o) => `${o.key}:${Number(o.odds)}`)
        .sort()
        .join(",");
      return `${q.type}(${outcomes})`;
    })
    .join("|");

  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256")
    .update(`${data.status}|${data.updated_at}|${priced}`)
    .digest("hex");

  return {
    hash,
    status: data.status as string,
    kickoffAt: data.kickoff_at as string,
  };
}
