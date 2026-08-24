import { resolveClient, type AdvisorClient } from "./db";
import type { Enrichment, HeadToHead, TeamForm } from "./types";

/**
 * The one place the advisor reaches outside our own database.
 *
 * DerbyUp's standing rule is that API-Football is called from cron only, so
 * request volume stays independent of traffic. The advisor bends that rule,
 * and the reason is concrete: our `games` table holds the current season only.
 * In August that is one or two matchweeks, so "last 5 matches" and "previous
 * meetings" are both empty and the advisor has nothing to reason from except
 * the odds it was given — at which point it can only restate the favourite.
 *
 * The bend is bounded:
 *   - Everything is cached by key, so the second person to open a match costs
 *     nothing, and a whole league costs one pull per fixture per 12 hours.
 *   - Every endpoint is settled independently. Any of them can fail and the
 *     advisor still runs on whatever came back, including nothing.
 *   - Our own database always wins. The provider fills gaps, never overwrites.
 *
 * The cache is two-layered. The Map is per-instance and survives only as long
 * as the serverless function that holds it, which is long enough to stop one
 * request asking twice; `api_cache` is the durable layer, and it is what makes
 * the second *visitor* free rather than just the second call.
 *
 * Both read and write go through SECURITY DEFINER functions. The advisor runs
 * as the signed-in user, and no user may write `api_cache` directly — see
 * supabase/migrations/20260823140100_advisor_functions.sql for why that
 * function is safe to expose.
 */

const BASE_URL = process.env.FOOTBALL_API_BASE_URL ?? "https://v3.football.api-sports.io";
const TTL_SECONDS = 12 * 60 * 60;
const TTL_MS = TTL_SECONDS * 1000;
const FORM_MATCHES = 5;
/** Fetched per side before friendlies are dropped, so five competitive remain. */
const FORM_FETCH = 15;
const H2H_MATCHES = 5;

type CacheEntry = { at: number; value: unknown };
const memo = new Map<string, CacheEntry>();

/** Counted per request, so a cold match's real upstream cost stays visible. */
export type ProviderStats = { requests: number; cacheHits: number };

async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
  stats: ProviderStats,
  client?: AdvisorClient,
): Promise<T[]> {
  const key = process.env.FOOTBALL_API_KEY;
  if (!key) throw new Error("FOOTBALL_API_KEY is not set");

  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const cacheKey = `${path}?${query}`;

  const local = memo.get(cacheKey);
  if (local && Date.now() - local.at < TTL_MS) {
    stats.cacheHits += 1;
    return local.value as T[];
  }

  const supabase = await resolveClient(client);
  const { data: cached } = await supabase.rpc("api_cache_get", {
    p_key: cacheKey,
    p_max_age_seconds: TTL_SECONDS,
  });

  if (cached !== null && cached !== undefined) {
    stats.cacheHits += 1;
    const value = cached as T[];
    memo.set(cacheKey, { at: Date.now(), value });
    return value;
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  stats.requests += 1;
  const response = await fetch(url, {
    headers: { "x-apisports-key": key },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`API-Football ${path} responded ${response.status}`);

  const body = (await response.json()) as { errors?: unknown; response?: T[] };
  // A 200 carrying a populated `errors` object is how this provider reports a
  // bad key or an exhausted quota — the status code alone is not enough.
  if (body.errors && !Array.isArray(body.errors) && Object.keys(body.errors).length) {
    throw new Error(`API-Football ${path}: ${JSON.stringify(body.errors)}`);
  }

  const value = body.response ?? [];
  memo.set(cacheKey, { at: Date.now(), value });

  // Best-effort. A cache we failed to write is a slower next request, not a
  // failed this one — and the caller already has the answer in hand. The
  // builder resolves rather than rejects, so the error comes back in `error`.
  await supabase.rpc("api_cache_put", { p_key: cacheKey, p_payload: value as never });

  return value;
}

type ApiFixture = {
  fixture: { id: number; date: string };
  league: { id: number; name: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
};

/**
 * Pre-season friendlies must never reach the model.
 *
 * `/fixtures?last=5` in August returns five friendlies, and the first run of
 * this lab duly reported "Bournemouth scored 22 in their last 5" — true, and
 * built on a 10-1 against Genoa in a warm-up. A form guide drawn from
 * exhibition matches is worse than no form guide, because the model states it
 * with the same confidence as a real one. We over-fetch and filter instead.
 */
const FRIENDLY_PATTERN = /friendl/i;

function isCompetitive(fixture: ApiFixture): boolean {
  return !FRIENDLY_PATTERN.test(fixture.league?.name ?? "");
}

type StandingRow = {
  rank: number;
  team: { id: number; name: string };
  all: { played: number; goals: { for: number; against: number } };
};

type StandingsResponse = { league: { standings: StandingRow[][] } };

type InjuryRow = { player: { name: string; reason: string | null }; team: { name: string } };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Jerusalem",
  });
}

/** Provider fixtures for one side, newest first, folded into a form guide. */
function toForm(
  teamId: number,
  teamName: string,
  fixtures: ApiFixture[],
  translate: (name: string) => string,
): TeamForm | null {
  const played = fixtures
    .filter(isCompetitive)
    .filter((f) => f.goals.home !== null && f.goals.away !== null)
    .sort((a, b) => Date.parse(b.fixture.date) - Date.parse(a.fixture.date))
    .slice(0, FORM_MATCHES);

  if (!played.length) return null;

  const form: TeamForm = { team: teamName, results: [], matches: [], goalsFor: 0, goalsAgainst: 0 };
  for (const fixture of played) {
    const atHome = fixture.teams.home.id === teamId;
    const scored = (atHome ? fixture.goals.home : fixture.goals.away) as number;
    const conceded = (atHome ? fixture.goals.away : fixture.goals.home) as number;
    const result = scored > conceded ? "W" : scored === conceded ? "D" : "L";

    form.goalsFor += scored;
    form.goalsAgainst += conceded;
    form.results.push(result);
    form.matches.push({
      playedAt: shortDate(fixture.fixture.date),
      opponent: translate(atHome ? fixture.teams.away.name : fixture.teams.home.name),
      venue: atHome ? "home" : "away",
      scored,
      conceded,
      result,
    });
  }
  return form;
}

function toHeadToHead(fixtures: ApiFixture[], translate: (name: string) => string): HeadToHead[] {
  return fixtures
    .filter(isCompetitive)
    .filter((f) => f.goals.home !== null && f.goals.away !== null)
    .sort((a, b) => Date.parse(b.fixture.date) - Date.parse(a.fixture.date))
    .slice(0, H2H_MATCHES)
    .map((f) => ({
      playedAt: new Date(f.fixture.date).toLocaleDateString("he-IL", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        timeZone: "Asia/Jerusalem",
      }),
      homeTeam: translate(f.teams.home.name),
      awayTeam: translate(f.teams.away.name),
      scoreHome: f.goals.home as number,
      scoreAway: f.goals.away as number,
    }));
}

export type ProviderHistory = {
  homeForm: TeamForm | null;
  awayForm: TeamForm | null;
  headToHead: HeadToHead[];
  enrichment: Enrichment | null;
  stats: ProviderStats;
};

export async function fetchProviderHistory(args: {
  fixtureId: number;
  competitionId: number;
  season: number;
  homeTeam: string;
  awayTeam: string;
  /** Which of the two gaps still need filling — an empty set skips the calls. */
  need: { form: boolean; headToHead: boolean };
  translate: (name: string) => string;
  /** Omitted in an action; the cron passes its service-role client. */
  client?: AdvisorClient;
}): Promise<ProviderHistory> {
  const stats: ProviderStats = { requests: 0, cacheHits: 0 };
  const empty: ProviderHistory = {
    homeForm: null,
    awayForm: null,
    headToHead: [],
    enrichment: null,
    stats,
  };

  // Team ids gate the form and head-to-head lookups, and the fixture we
  // already store is the exact way to get them — no name matching involved.
  let homeId: number | null = null;
  let awayId: number | null = null;
  try {
    const [fixture] = await apiGet<ApiFixture>("/fixtures", { id: args.fixtureId }, stats, args.client);
    homeId = fixture?.teams?.home?.id ?? null;
    awayId = fixture?.teams?.away?.id ?? null;
  } catch {
    // Without ids only the name-keyed endpoints are reachable; carry on.
  }

  const wantForm = args.need.form && homeId !== null && awayId !== null;
  const wantH2H = args.need.headToHead && homeId !== null && awayId !== null;

  const [standings, injuries, homeFixtures, awayFixtures, h2h] = await Promise.allSettled([
    apiGet<StandingsResponse>("/standings", { league: args.competitionId, season: args.season }, stats, args.client),
    apiGet<InjuryRow>("/injuries", { fixture: args.fixtureId }, stats, args.client),
    wantForm
      ? apiGet<ApiFixture>("/fixtures", { team: homeId as number, last: FORM_FETCH }, stats, args.client)
      : Promise.resolve([]),
    wantForm
      ? apiGet<ApiFixture>("/fixtures", { team: awayId as number, last: FORM_FETCH }, stats, args.client)
      : Promise.resolve([]),
    wantH2H
      ? apiGet<ApiFixture>(
          "/fixtures/headtohead",
          { h2h: `${homeId}-${awayId}`, last: H2H_MATCHES + 5 },
          stats,
        )
      : Promise.resolve([]),
  ]);

  const table = settled(standings, [] as StandingsResponse[])[0]?.league?.standings?.[0] ?? [];
  const find = (team: string) => table.find((row) => row.team?.name === team) ?? null;
  const home = find(args.homeTeam);
  const away = find(args.awayTeam);

  const avg = (row: StandingRow | null) =>
    row && row.all?.played > 0
      ? {
          for: round1(row.all.goals.for / row.all.played),
          against: round1(row.all.goals.against / row.all.played),
        }
      : { for: null, against: null };

  const seen = new Set<string>();
  const injuryList = settled(injuries, [] as InjuryRow[])
    .map((row) => ({
      team: args.translate(row.team?.name ?? "—"),
      player: row.player?.name ?? "—",
      reason: row.player?.reason ?? "לא צוין",
    }))
    // The provider repeats entries; the same player listed twice reads to the
    // model as two separate absences.
    .filter((injury) => {
      const key = `${injury.team}|${injury.player}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const enrichment: Enrichment | null =
    home || away || injuryList.length
      ? {
          homeRank: home?.rank ?? null,
          awayRank: away?.rank ?? null,
          homeGoalsAvg: avg(home),
          awayGoalsAvg: avg(away),
          injuries: injuryList,
        }
      : null;

  return {
    ...empty,
    enrichment,
    homeForm:
      homeId !== null
        ? toForm(homeId, args.homeTeam, settled(homeFixtures, [] as ApiFixture[]), args.translate)
        : null,
    awayForm:
      awayId !== null
        ? toForm(awayId, args.awayTeam, settled(awayFixtures, [] as ApiFixture[]), args.translate)
        : null,
    headToHead: toHeadToHead(settled(h2h, [] as ApiFixture[]), args.translate),
    stats,
  };
}

// ─── Player data, fetched only when a question asks for it ─────────────────

export type PlayerContext = {
  /** Which season the scorer list is from — may be last season early on. */
  scorerSeason: number | null;
  topScorers: { team: string; player: string; goals: number; assists: number }[];
  lineups: { team: string; formation: string; startXI: string[] }[];
};

type TopScorerRow = {
  player: { name: string };
  statistics: {
    team: { id: number; name: string };
    goals: { total: number | null; assists: number | null };
  }[];
};

type LineupRow = {
  team: { name: string };
  formation: string | null;
  startXI: { player: { name: string; pos: string | null } }[];
};

/**
 * Squad-level colour, behind a router flag.
 *
 * "Who do you think will stand out?" is an ordinary thing to ask a football
 * adviser, and the base brief has nothing to answer it with — the first
 * version simply said it did not know. These calls are not made for every
 * question, only for the ones the classifier says need them, so the common
 * case keeps costing what it did.
 *
 * The scorer list falls back to the previous season. In August the current
 * one is two matchweeks old and ranks whoever scored on the opening day.
 */
export async function fetchPlayerContext(args: {
  fixtureId: number;
  competitionId: number;
  season: number;
  homeTeam: string;
  awayTeam: string;
  wantLineups: boolean;
  translate: (name: string) => string;
  client?: AdvisorClient;
}): Promise<{ players: PlayerContext | null; stats: ProviderStats }> {
  const stats: ProviderStats = { requests: 0, cacheHits: 0 };

  let homeId: number | null = null;
  let awayId: number | null = null;
  try {
    // Cached from the history pull in the common case, so usually free.
    const [fixture] = await apiGet<ApiFixture>("/fixtures", { id: args.fixtureId }, stats, args.client);
    homeId = fixture?.teams?.home?.id ?? null;
    awayId = fixture?.teams?.away?.id ?? null;
  } catch {
    // Falls through to name matching below.
  }

  async function scorersFor(season: number): Promise<TopScorerRow[]> {
    try {
      return await apiGet<TopScorerRow>(
        "/players/topscorers",
        { league: args.competitionId, season },
        stats,
      );
    } catch {
      return [];
    }
  }

  const [scorersNow, lineupsResult] = await Promise.allSettled([
    scorersFor(args.season),
    args.wantLineups
      ? apiGet<LineupRow>("/fixtures/lineups", { fixture: args.fixtureId }, stats, args.client)
      : Promise.resolve([] as LineupRow[]),
  ]);

  const belongsToThisMatch = (row: TopScorerRow) =>
    row.statistics?.some(
      (stat) =>
        stat.team?.id === homeId ||
        stat.team?.id === awayId ||
        stat.team?.name === args.homeTeam ||
        stat.team?.name === args.awayTeam,
    );

  let scorerSeason: number | null = args.season;
  let relevant = settled(scorersNow, [] as TopScorerRow[]).filter(belongsToThisMatch);

  if (!relevant.length) {
    const previous = await scorersFor(args.season - 1);
    const fromPrevious = previous.filter(belongsToThisMatch);
    if (fromPrevious.length) {
      relevant = fromPrevious;
      scorerSeason = args.season - 1;
    } else {
      scorerSeason = null;
    }
  }

  const topScorers = relevant.slice(0, 10).map((row) => {
    const stat =
      row.statistics?.find(
        (s) =>
          s.team?.id === homeId ||
          s.team?.id === awayId ||
          s.team?.name === args.homeTeam ||
          s.team?.name === args.awayTeam,
      ) ?? row.statistics?.[0];
    return {
      team: args.translate(stat?.team?.name ?? "—"),
      player: row.player?.name ?? "—",
      goals: stat?.goals?.total ?? 0,
      assists: stat?.goals?.assists ?? 0,
    };
  });

  const lineups = settled(lineupsResult, [] as LineupRow[]).map((row) => ({
    team: args.translate(row.team?.name ?? "—"),
    formation: row.formation ?? "—",
    startXI: (row.startXI ?? []).map(
      (entry) => `${entry.player?.name ?? "—"}${entry.player?.pos ? ` (${entry.player.pos})` : ""}`,
    ),
  }));

  if (!topScorers.length && !lineups.length) return { players: null, stats };
  return { players: { scorerSeason, topScorers, lineups }, stats };
}
