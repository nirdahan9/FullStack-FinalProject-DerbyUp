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
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number };
  teams: {
    home: { name: string; logo: string | null };
    away: { name: string; logo: string | null };
  };
  goals: { home: number | null; away: number | null };
};

/** Fixtures for one competition between two dates (inclusive, YYYY-MM-DD). */
export async function fetchFixtures(
  leagueId: number,
  season: number,
  from: string,
  to: string,
): Promise<FixtureDto[]> {
  const raw = await apiGet<ApiFixture>("/fixtures", {
    league: leagueId,
    season,
    from,
    to,
  });

  return raw.map((f) => ({
    fixtureId: f.fixture.id,
    competitionId: f.league.id,
    homeTeam: f.teams.home.name,
    awayTeam: f.teams.away.name,
    homeLogo: f.teams.home.logo,
    awayLogo: f.teams.away.logo,
    kickoffAt: f.fixture.date,
    status: mapFixtureStatus(f.fixture.status.short),
    scoreHome: f.goals.home,
    scoreAway: f.goals.away,
  }));
}

/** Fixtures by id — used at settlement to read final scores. */
export async function fetchFixturesByIds(ids: number[]): Promise<FixtureDto[]> {
  if (!ids.length) return [];

  const raw = await apiGet<ApiFixture>("/fixtures", { ids: ids.join("-") });

  return raw.map((f) => ({
    fixtureId: f.fixture.id,
    competitionId: f.league.id,
    homeTeam: f.teams.home.name,
    awayTeam: f.teams.away.name,
    homeLogo: f.teams.home.logo,
    awayLogo: f.teams.away.logo,
    kickoffAt: f.fixture.date,
    status: mapFixtureStatus(f.fixture.status.short),
    scoreHome: f.goals.home,
    scoreAway: f.goals.away,
  }));
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
