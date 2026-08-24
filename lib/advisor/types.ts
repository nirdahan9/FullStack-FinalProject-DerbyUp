/**
 * Shapes shared by every layer of the advisor.
 *
 * This file is written to be lifted into the DerbyUp project unchanged, so it
 * deliberately reuses the vocabulary already in `lib/domain/types.ts` there
 * rather than inventing a second name for the same thing.
 */

export type QuestionType = "match_result" | "over_under_2_5" | "btts";

export type Outcome = { key: string; label: string; odds: number };

export type AdvisorQuestion = { type: QuestionType; outcomes: Outcome[] };

export type FormMatch = {
  playedAt: string;
  opponent: string;
  venue: "home" | "away";
  scored: number;
  conceded: number;
  result: "W" | "D" | "L";
};

/**
 * Most recent result first, exactly how a form guide is read.
 *
 * `matches` exists because totals alone invite invention: given only "scored
 * 6, conceded 6", the model reported "conceded in 3 of their last 5" — a
 * reasonable guess, unsupported by anything it was given. Per-match rows make
 * every claim of that shape checkable against the brief.
 */
export type TeamForm = {
  team: string;
  results: ("W" | "D" | "L")[];
  matches: FormMatch[];
  goalsFor: number;
  goalsAgainst: number;
};

export type HeadToHead = {
  playedAt: string;
  homeTeam: string;
  awayTeam: string;
  scoreHome: number;
  scoreAway: number;
};

/**
 * How the league itself has already predicted. Counts only — a per-user
 * breakdown would leak one member's prediction to another.
 */
export type CrowdSplit = {
  type: QuestionType;
  total: number;
  counts: Record<string, number>;
};

/** Everything API-Football adds on top of what we already store. */
export type Enrichment = {
  homeRank: number | null;
  awayRank: number | null;
  homeGoalsAvg: { for: number | null; against: number | null };
  awayGoalsAvg: { for: number | null; against: number | null };
  injuries: { team: string; player: string; reason: string }[];
};

export type GameContext = {
  gameId: string;
  competition: string;
  /** Raw provider spelling — what the odds and the fixtures are keyed by. */
  homeTeamRaw: string;
  awayTeamRaw: string;
  /** Hebrew, for anything a person reads. */
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  kickoffLabel: string;
  questions: AdvisorQuestion[];
  homeForm: TeamForm;
  awayForm: TeamForm;
  headToHead: HeadToHead[];
  crowd: CrowdSplit[];
  enrichment: Enrichment | null;
  /**
   * Where each block of the brief came from. Shown in the lab, and worth
   * keeping in the product: "no form data" and "form data we chose not to
   * fetch" look identical in the output and are different bugs.
   */
  sources: {
    form: "db" | "provider" | "none";
    headToHead: "db" | "provider" | "none";
    provider: { requests: number; cacheHits: number } | null;
  };
};

export type ChatTurn = { role: "user" | "assistant"; content: string };
