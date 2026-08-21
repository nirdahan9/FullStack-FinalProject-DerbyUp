import type { GameStatus } from "@/lib/domain/types";
import type { MarketOdds, Outcome, QuestionSeed } from "./types";

/**
 * API-Football status codes → our five states.
 *
 * The full list is longer than the states we keep, and the collapsing is
 * deliberate: a match abandoned at half time and one called off a week early
 * mean the same thing to a prediction — void it, points neither way.
 */
const STATUS_MAP: Record<string, GameStatus> = {
  TBD: "scheduled",
  NS: "scheduled",
  "1H": "live",
  HT: "live",
  "2H": "live",
  ET: "live",
  BT: "live",
  P: "live",
  LIVE: "live",
  INT: "live",
  FT: "finished",
  AET: "finished",
  PEN: "finished",
  PST: "postponed",
  CANC: "cancelled",
  ABD: "cancelled",
  SUSP: "cancelled",
  AWD: "cancelled",
  WO: "cancelled",
};

/**
 * Unknown codes fall back to "scheduled" rather than throwing: a status we
 * have not seen must not stop a whole sync, and a fixture wrongly left as
 * scheduled is simply never settled — visible, and fixable by hand.
 */
export function mapFixtureStatus(short: string): GameStatus {
  return STATUS_MAP[short] ?? "scheduled";
}

/**
 * Odds used when a bookmaker does not price a market.
 *
 * Chosen to sit near the middle of a typical spread so a missing market can
 * neither be farmed for points nor be worthless. Without them a fixture would
 * arrive with no questions at all, which is worse: the match would simply be
 * missing from the product with no explanation.
 */
export const DEFAULT_ODDS: MarketOdds = {
  home: 2.5,
  draw: 3.2,
  away: 2.8,
  over: 1.9,
  under: 1.9,
  yes: 1.85,
  no: 1.95,
};

type ApiValue = { value: string; odd: string };
type ApiBet = { name: string; values: ApiValue[] };
type ApiBookmaker = { name?: string; bets?: ApiBet[] };

const MARKETS = {
  matchWinner: "Match Winner",
  totals: "Goals Over/Under",
  btts: "Both Teams Score",
} as const;

function pick(bet: ApiBet | undefined, value: string): number | null {
  const found = bet?.values.find((v) => v.value === value);
  if (!found) return null;
  const parsed = Number.parseFloat(found.odd);
  // Decimal odds below 1 would mean a correct prediction scores less than one
  // point, which is never a real price — treat it as absent.
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * Extracts the three markets from a bookmaker list.
 *
 * The DerbyUp app always read `bookmakers[0]`, which is whichever one the API
 * happened to list first — and a response can carry fourteen. Here the first
 * bookmaker pricing **all three** markets wins, so a game does not silently
 * fall back to default odds just because the first entry skipped a market.
 * Anything still missing falls back per value rather than per market.
 */
export function parseOdds(bookmakers: readonly ApiBookmaker[] | undefined): {
  odds: MarketOdds;
  complete: boolean;
} {
  const candidates = (bookmakers ?? []).map((b) => {
    const bets = b.bets ?? [];
    const mw = bets.find((x) => x.name === MARKETS.matchWinner);
    const totals = bets.find((x) => x.name === MARKETS.totals);
    const btts = bets.find((x) => x.name === MARKETS.btts);

    return {
      home: pick(mw, "Home"),
      draw: pick(mw, "Draw"),
      away: pick(mw, "Away"),
      over: pick(totals, "Over 2.5"),
      under: pick(totals, "Under 2.5"),
      yes: pick(btts, "Yes"),
      no: pick(btts, "No"),
    };
  });

  const isComplete = (c: (typeof candidates)[number]) =>
    Object.values(c).every((v) => v !== null);

  const best =
    candidates.find(isComplete) ??
    // Nothing complete: take whichever priced the most values, so we keep as
    // many real prices as the response actually offered.
    candidates.reduce<(typeof candidates)[number] | undefined>((acc, c) => {
      const score = (x: typeof c) =>
        Object.values(x).filter((v) => v !== null).length;
      return !acc || score(c) > score(acc) ? c : acc;
    }, undefined);

  if (!best) return { odds: { ...DEFAULT_ODDS }, complete: false };

  const odds: MarketOdds = {
    home: best.home ?? DEFAULT_ODDS.home,
    draw: best.draw ?? DEFAULT_ODDS.draw,
    away: best.away ?? DEFAULT_ODDS.away,
    over: best.over ?? DEFAULT_ODDS.over,
    under: best.under ?? DEFAULT_ODDS.under,
    yes: best.yes ?? DEFAULT_ODDS.yes,
    no: best.no ?? DEFAULT_ODDS.no,
  };

  return { odds, complete: isComplete(best) };
}

/**
 * The three questions asked about every fixture.
 *
 * Labels are Hebrew for display; the `key` is what a prediction stores and
 * what settlement compares. Team names are interpolated into the match-result
 * labels only — never into a key.
 */
export function buildQuestions(
  odds: MarketOdds,
  teams: { home: string; away: string },
): QuestionSeed[] {
  return [
    {
      type: "match_result",
      outcomes: [
        { key: "home", label: teams.home, odds: odds.home },
        { key: "draw", label: "תיקו", odds: odds.draw },
        { key: "away", label: teams.away, odds: odds.away },
      ],
    },
    {
      type: "over_under_2_5",
      outcomes: [
        { key: "over", label: "מעל 2.5 שערים", odds: odds.over },
        { key: "under", label: "מתחת ל-2.5 שערים", odds: odds.under },
      ],
    },
    {
      type: "btts",
      outcomes: [
        { key: "yes", label: "כן", odds: odds.yes },
        { key: "no", label: "לא", odds: odds.no },
      ],
    },
  ] satisfies { type: string; outcomes: Outcome[] }[] as QuestionSeed[];
}
