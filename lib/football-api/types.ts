import type { GameStatus, QuestionType } from "@/lib/domain/types";

/** The seven tournaments the product supports, keyed by API-Football league id. */
export const COMPETITIONS = [
  { id: 383, name: "ליגת העל", country: "ישראל" },
  { id: 39, name: "פרמייר ליג", country: "אנגליה" },
  { id: 140, name: "לה ליגה", country: "ספרד" },
  { id: 135, name: "סרייה A", country: "איטליה" },
  { id: 78, name: "בונדסליגה", country: "גרמניה" },
  { id: 61, name: "ליג 1", country: "צרפת" },
  { id: 2, name: "ליגת האלופות", country: "אירופה" },
] as const;

export type CompetitionId = (typeof COMPETITIONS)[number]["id"];

export type FixtureDto = {
  fixtureId: number;
  competitionId: number;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffAt: string;
  status: GameStatus;
  scoreHome: number | null;
  scoreAway: number | null;
  /**
   * Elapsed minutes while a match is in progress, null otherwise. Carried by
   * every fixture read so the live sync and the daily sync share one shape;
   * only the live sync has anything to put in it.
   */
  minute: number | null;
};

/** Decimal odds for the three markets we score on. */
export type MarketOdds = {
  home: number;
  draw: number;
  away: number;
  over: number;
  under: number;
  yes: number;
  no: number;
};

export type Outcome = { key: string; label: string; odds: number };

export type QuestionSeed = {
  type: QuestionType;
  outcomes: Outcome[];
};
