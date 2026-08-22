import { mapFixtureStatus } from "./mapping";
import type { FixtureDto, MarketOdds } from "./types";
import { parseOdds } from "./mapping";

const BASE_URL =
  process.env.FOOTBALL_API_BASE_URL ?? "https://v3.football.api-sports.io";

/**
 * API-Football client.
 *
 * Only ever called from cron route handlers, never from a page or an action.
 * That keeps request volume independent of how many people use the product:
 * a thousand users cost the same number of upstream calls as one.
 */
async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T[]> {
  const key = process.env.FOOTBALL_API_KEY;
  if (!key) throw new Error("FOOTBALL_API_KEY is not set");

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const response = await fetch(url, {
    headers: { "x-apisports-key": key },
    // Fixtures are written to our own tables; caching the upstream response
    // as well would only add a second place for them to go stale.
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`API-Football ${path} responded ${response.status}`);
  }

  const body = (await response.json()) as {
    errors?: unknown;
    response?: T[];
  };

  // A 200 with a populated `errors` object is how this API reports a bad key
  // or an exhausted quota, so the status code alone is not enough.
  if (body.errors && !Array.isArray(body.errors) && Object.keys(body.errors).length) {
    throw new Error(`API-Football ${path}: ${JSON.stringify(body.errors)}`);
  }

  return body.response ?? [];
}

type ApiFixture = {
  fixture: {
    id: number;
    date: string;
    // `elapsed` is the minute a match in progress has reached. Null for a
    // fixture that has not kicked off, and the provider keeps sending the
    // final minute after the whistle, which is why nothing reads it once a
    // fixture is finished.
    status: { short: string; elapsed: number | null };
  };
  league: { id: number };
  teams: {
    home: { name: string; logo: string | null };
    away: { name: string; logo: string | null };
  };
  goals: { home: number | null; away: number | null };
};

/**
 * One place where a provider fixture becomes ours.
 *
 * Three endpoints return the same payload — the season pull, the settlement
 * lookup and the live poll — and three copies of this mapping is how a field
 * added for one of them silently goes missing from the other two.
 */
function toFixtureDto(f: ApiFixture): FixtureDto {
  const status = mapFixtureStatus(f.fixture.status.short);
  return {
    fixtureId: f.fixture.id,
    competitionId: f.league.id,
    homeTeam: f.teams.home.name,
    awayTeam: f.teams.away.name,
    homeLogo: f.teams.home.logo,
    awayLogo: f.teams.away.logo,
    kickoffAt: f.fixture.date,
    status,
    scoreHome: f.goals.home,
    scoreAway: f.goals.away,
    // Only meaningful while the match is being played. A finished fixture
    // still reports 90, and storing that would leave "90'" on the row forever.
    minute: status === "live" ? f.fixture.status.elapsed : null,
  };
}

/**
 * Fixtures for one competition. Without a date range this returns the whole
 * season in a single request — 380 matches for a league like the Premier
 * League — which is what lets a league page show its full calendar.
 */
export async function fetchFixtures(
  leagueId: number,
  season: number,
  range?: { from: string; to: string },
): Promise<FixtureDto[]> {
  const raw = await apiGet<ApiFixture>("/fixtures", {
    league: leagueId,
    season,
    ...(range ? { from: range.from, to: range.to } : {}),
  });

  return raw.map(toFixtureDto);
}

/** Fixtures by id — used at settlement to read final scores. */
export async function fetchFixturesByIds(ids: number[]): Promise<FixtureDto[]> {
  if (!ids.length) return [];

  const raw = await apiGet<ApiFixture>("/fixtures", { ids: ids.join("-") });

  return raw.map(toFixtureDto);
}

/**
 * Every match in progress across the given competitions, in one request.
 *
 * `live` takes a dash-joined list of league ids, so seven competitions cost
 * one call rather than seven — which is what makes a once-a-minute schedule
 * affordable. The DerbyUp app polls per competition
 * (backend/src/jobs/syncLiveTournaments.js calls fetchLiveByLeague in a loop);
 * batching is free here because all seven are known up front.
 *
 * An empty array short-circuits: `live=` with no value would be a request for
 * every match on earth.
 */
export async function fetchLiveFixtures(leagueIds: readonly number[]): Promise<FixtureDto[]> {
  if (!leagueIds.length) return [];

  const raw = await apiGet<ApiFixture>("/fixtures", { live: leagueIds.join("-") });

  return raw.map(toFixtureDto);
}

type ApiOddsEntry = {
  fixture: { id: number };
  bookmakers?: { name?: string; bets?: { name: string; values: { value: string; odd: string }[] }[] };
};

/** Odds for one competition on one date, keyed by fixture id. */
export async function fetchOdds(
  leagueId: number,
  season: number,
  date: string,
): Promise<Map<number, { odds: MarketOdds; complete: boolean }>> {
  const raw = await apiGet<{
    fixture: { id: number };
    bookmakers?: Parameters<typeof parseOdds>[0];
  }>("/odds", { league: leagueId, season, date });

  const result = new Map<number, { odds: MarketOdds; complete: boolean }>();
  for (const entry of raw) {
    if (!entry.fixture?.id) continue;
    result.set(entry.fixture.id, parseOdds(entry.bookmakers));
  }
  return result;
}

export type { ApiOddsEntry };
