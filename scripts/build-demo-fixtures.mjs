/**
 * Computes the parts of `lib/demo/fixtures.ts` that are arithmetic, not
 * judgement, and writes them back into the file.
 *
 *   node scripts/build-demo-fixtures.mjs            # rewrite the block
 *   node scripts/build-demo-fixtures.mjs --check    # verify, change nothing
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The demo has to survive being read. Anyone looking at a settled prediction
 * can see the odds, the bonus and the points side by side, and if 7.15 at a 50%
 * bonus does not come to 10.73 then the whole snapshot is revealed as
 * decoration — and with it, implicitly, the scoring engine the project is
 * actually about.
 *
 * So no number below is typed in. This script imports the product's own
 * `settlePrediction()`, `effectiveOdds()` and `resolveOutcome()` and runs them,
 * imports the product's own `newlyEarned()` for the badges, and reproduces
 * `refreshUserTotals()` and `league_standings()` for the totals and the ranks.
 * Changing a scoring rule and re-running this is the only way the dataset moves:
 * there is no second copy of the rule to forget to update.
 *
 * What it generates, in one marked block in `lib/demo/fixtures.ts`:
 *
 *   PREDICTIONS           363 rows, settled where the fixture is settled.
 *   SETTLED_TOTALS        the `profiles.total_*` caches, recomputed from them.
 *   USER_ACHIEVEMENTS     the demo user's badges, replayed in the order the
 *                         real awarder would have granted them.
 *   INSIGHT_CONTEXT_HASH  the digest `insightCacheKey()` would have produced.
 *
 * It also *checks* the hand-written half and refuses to write if it is wrong:
 * every odds triple must imply a bookmaker's overround rather than a free
 * lunch, and no two bridge players may normalise to the same string, because
 * `bridge_players.normalized_name` is unique.
 *
 * ── Why the picks are generated and not written out ───────────────────────
 *
 * Three hundred predictions is more than can be authored by hand without
 * patterns a reader would notice, and far more than can be kept consistent
 * with the odds. They are drawn instead, deterministically:
 *
 *   · Whether a given player answers a given question is a hash of their id
 *     and the question's — so it is stable across runs, and a player who skips
 *     the BTTS market skips it everywhere.
 *   · *What* they answer is drawn from the market's own implied probabilities,
 *     tilted by a per-player `tilt`: below 1 they chase the longer price, above
 *     1 they back favourites. That is what makes one member's history read
 *     differently from another's.
 *   · On a finished match each player gets an `accuracy` roll first — a chance
 *     to land on the outcome that actually happened. Without it twelve people
 *     drawing from the same distribution finish within a few points of each
 *     other and the league table is a dead heat. It is a thumb on the scale,
 *     stated plainly here rather than hidden in a magic number.
 *
 * Nothing about the *scoring* is drawn. Once a pick exists, what it is worth is
 * the product's own function, given the frozen price and the real final score.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 * Node 24 strips the types out of a `.ts` file on import, but it will not
 * resolve `./scoring` to `./scoring.ts`, and it knows nothing about the `@/`
 * alias. The loader registered at the top supplies both, which is what lets
 * this plain `.mjs` import the real domain modules with no build step and no
 * dependency to install. Node warns about `MODULE_TYPELESS_PACKAGE_JSON` on the
 * way in; it is noise, and silencing it would mean declaring the whole package
 * an ES module for the sake of one script.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "lib/demo/fixtures.ts");
const CHECK_ONLY = process.argv.includes("--check");

const START = "// demo:generated:start";
const END = "// demo:generated:end";

// ─── TypeScript import support ─────────────────────────────────────────────

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath, pathToFileURL } from "node:url";
      const ROOT = ${JSON.stringify(ROOT)};
      /** Extensionless relative specifiers, and the "@/" path alias. */
      export async function resolve(specifier, context, next) {
        let target = specifier;
        if (target.startsWith("@/")) {
          target = pathToFileURL(ROOT + "/" + target.slice(2)).href;
        }
        if (!/\\.[a-zA-Z0-9]+$/.test(target)) {
          for (const ext of [".ts", ".tsx", "/index.ts"]) {
            try {
              const url = new URL(target + ext, context.parentURL);
              if (existsSync(fileURLToPath(url))) return next(target + ext, context);
            } catch {}
          }
        }
        return next(target, context);
      }
    `),
  pathToFileURL(ROOT + "/"),
);

const demo = await import(pathToFileURL(TARGET).href);
const settlement = await import(pathToFileURL(path.join(ROOT, "lib/domain/settlement.ts")).href);
const achievements = await import(pathToFileURL(path.join(ROOT, "lib/domain/achievements.ts")).href);
const scoring = await import(pathToFileURL(path.join(ROOT, "lib/domain/scoring.ts")).href);
const puzzle = await import(pathToFileURL(path.join(ROOT, "lib/domain/puzzle.ts")).href);
const { DEMO_NOW } = await import(pathToFileURL(path.join(ROOT, "lib/demo/now.ts")).href);

const { effectiveOdds, resolveOutcome, settlePrediction, voidPrediction } = settlement;
const { newlyEarned } = achievements;
const { round2 } = scoring;
// normalizeName is applied inside fixtures.ts itself, where bridge_players is
// built; the generator only needs the module imported so the check fails loudly
// if that export ever moves.
void puzzle.normalizeName;

const {
  DEMO_USER_ID,
  GAMES,
  QUESTIONS,
  LEAGUES,
  LEAGUE_MEMBERS,
  PROFILES,
  BRIDGE_PLAYERS,
  PUZZLE_ATTEMPTS,
  ADVISOR_INSIGHTS,
} = demo;

// ─── Helpers ───────────────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;

/** An ISO timestamp from the dataset, back as an offset in hours from DEMO_NOW. */
function toOffset(iso) {
  return Math.round(((Date.parse(iso) - DEMO_NOW.getTime()) / HOUR_MS) * 100) / 100;
}

/**
 * FNV-1a, as a float in [0, 1).
 *
 * Any stable hash would do; what matters is that it is a pure function of the
 * ids, so a second run produces byte-identical output and `--check` means
 * something in CI.
 */
function rand(...parts) {
  const key = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 2 ** 32;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

// ─── The hand-written half, checked ────────────────────────────────────────

/**
 * A market's overround: the implied probabilities, summed.
 *
 * A real book prices between about 1.02 and 1.10 — below 1 it is giving money
 * away, far above it nobody would bet into it. Odds invented by hand drift out
 * of that range easily, and a reader who knows football notices immediately.
 */
function overround(odds) {
  return odds.reduce((sum, o) => sum + 1 / o, 0);
}

function checkOdds() {
  const bounds = [1.02, 1.11];
  const seen = [];
  for (const question of QUESTIONS) {
    const odds = question.outcomes.map((o) => o.odds);
    const value = overround(odds);
    seen.push(value);
    if (value < bounds[0] || value > bounds[1]) {
      const game = GAMES.find((g) => g.id === question.game_id);
      fail(
        `overround ${value.toFixed(3)} out of range on ${game.home_team}–${game.away_team} ` +
          `(${question.type}): ${odds.join(" / ")}`,
      );
    }
  }
  const min = Math.min(...seen);
  const max = Math.max(...seen);
  const mean = seen.reduce((a, b) => a + b, 0) / seen.length;
  console.log(
    `odds       ${QUESTIONS.length} markets · overround ${min.toFixed(3)}–${max.toFixed(3)} (mean ${mean.toFixed(3)})`,
  );
}

function checkBridgePlayers() {
  const byNormalized = new Map();
  for (const player of BRIDGE_PLAYERS) {
    const existing = byNormalized.get(player.normalized_name);
    if (existing) fail(`bridge_players collide on "${player.normalized_name}": ${existing} / ${player.name}`);
    else byNormalized.set(player.normalized_name, player.name);
  }
  console.log(`players    ${BRIDGE_PLAYERS.length} names · ${byNormalized.size} distinct after normalisation`);
}

/** Team names must be keys the Hebrew dictionary knows, or clubs render in English. */
async function checkTeamNames() {
  const { TEAM_NAMES_HE } = await import(
    pathToFileURL(path.join(ROOT, "lib/i18n/team-names.ts")).href
  );
  const missing = new Set();
  for (const game of GAMES) {
    for (const name of [game.home_team, game.away_team]) {
      if (!TEAM_NAMES_HE[name]) missing.add(name);
    }
  }
  if (missing.size) fail(`no Hebrew name for: ${[...missing].join(", ")}`);
  else console.log(`teams      every club in ${GAMES.length} fixtures has a Hebrew name`);
}

/** An insight must recommend an outcome the fixture actually offers, at its price. */
function checkInsights() {
  for (const insight of ADVISOR_INSIGHTS) {
    const { question_type, outcome_key, odds } = insight.payload.recommendation;
    const question = QUESTIONS.find(
      (q) => q.game_id === insight.game_id && q.type === question_type,
    );
    if (!question) {
      fail(`insight on ${insight.game_id} recommends a question type the fixture has not got`);
      continue;
    }
    const outcome = question.outcomes.find((o) => o.key === outcome_key);
    if (!outcome) fail(`insight recommends unknown outcome "${outcome_key}"`);
    else if (Number(outcome.odds) !== Number(odds)) {
      fail(`insight quotes ${odds} for ${outcome_key}, the question says ${outcome.odds}`);
    }
  }
  console.log(`advisor    ${ADVISOR_INSIGHTS.length} insights recommend a real outcome at its real price`);
}

// ─── Who predicts what ─────────────────────────────────────────────────────

/**
 * Per-player temperament.
 *
 *   participation — how much of the card they fill in.
 *   accuracy      — chance of landing on the outcome that happened, on top of
 *                   whatever the market would have given them anyway.
 *   tilt          — exponent on the implied probabilities. <1 chases longer
 *                   prices, >1 backs favourites.
 *   exactScore    — how often they add an exact-score call to a winner pick.
 *
 * Spread on purpose: the league table is only interesting if the people in it
 * are different from each other, and a leaderboard where everyone has the same
 * profile is a leaderboard sorted by luck.
 */
const TRAITS = {
  noam_b: { participation: 0.88, accuracy: 0.2, tilt: 0.95, exactScore: 0.4 },
  yael_s: { participation: 0.95, accuracy: 0.24, tilt: 1.35, exactScore: 0.2 },
  itay_l: { participation: 0.8, accuracy: 0.14, tilt: 0.7, exactScore: 0.45 },
  dana_m: { participation: 0.9, accuracy: 0.22, tilt: 1.2, exactScore: 0.25 },
  omer_k: { participation: 0.7, accuracy: 0.16, tilt: 0.85, exactScore: 0.3 },
  shira_a: { participation: 0.85, accuracy: 0.26, tilt: 1.1, exactScore: 0.15 },
  eitan_g: { participation: 0.6, accuracy: 0.12, tilt: 0.75, exactScore: 0.5 },
  maya_f: { participation: 0.78, accuracy: 0.18, tilt: 1.0, exactScore: 0.22 },
  ronen_d: { participation: 0.65, accuracy: 0.1, tilt: 1.45, exactScore: 0.1 },
  tal_h: { participation: 0.82, accuracy: 0.2, tilt: 0.9, exactScore: 0.35 },
  avi_p: { participation: 0.55, accuracy: 0.15, tilt: 1.15, exactScore: 0.18 },
  liat_n: { participation: 0.72, accuracy: 0.17, tilt: 0.8, exactScore: 0.28 },
};

/** How much of a market gets answered at all, before the player's own appetite. */
const TYPE_APPETITE = { match_result: 0.78, over_under_2_5: 0.4, btts: 0.34 };

/**
 * Interest falls off with distance.
 *
 * Nobody fills in a card three weeks early, and a fixture that is still
 * provisionally priced has almost nothing on it — which is exactly why the
 * provisional path needs a fixture of its own to be visible at all.
 */
function recencyFactor(hoursAhead) {
  if (hoursAhead <= 48) return 1;
  if (hoursAhead <= 170) return 0.45;
  if (hoursAhead <= 400) return 0.18;
  return 0.08;
}

/** Plausible scorelines per outcome, for an exact-score call that is not a hit. */
const SCORE_SHAPES = {
  home: [[1, 0], [2, 0], [2, 1], [3, 1], [3, 0], [1, 0], [2, 1], [4, 1]],
  away: [[0, 1], [0, 2], [1, 2], [1, 3], [0, 1], [1, 2], [0, 3]],
  draw: [[0, 0], [1, 1], [2, 2], [1, 1], [1, 1]],
};

/** Draws one outcome from a market, weighted by implied probability ^ tilt. */
function drawOutcome(outcomes, tilt, roll) {
  const weights = outcomes.map((o) => (1 / Number(o.odds)) ** tilt);
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = roll * total;
  for (let i = 0; i < outcomes.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return outcomes[i].key;
  }
  return outcomes[outcomes.length - 1].key;
}

// ─── Index the world ───────────────────────────────────────────────────────

const gameById = new Map(GAMES.map((g) => [g.id, g]));
const questionsByGame = new Map();
for (const question of QUESTIONS) {
  const list = questionsByGame.get(question.game_id) ?? [];
  list.push(question);
  questionsByGame.set(question.game_id, list);
}

const profileById = new Map(PROFILES.map((p) => [p.id, p]));
const leagueById = new Map(LEAGUES.map((l) => [l.id, l]));

/** Which leagues each player belongs to, with the join date the rules depend on. */
const membershipsByUser = new Map();
for (const member of LEAGUE_MEMBERS) {
  const list = membershipsByUser.get(member.user_id) ?? [];
  list.push({ league: leagueById.get(member.league_id), joinedAt: member.joined_at });
  membershipsByUser.set(member.user_id, list);
}

/**
 * Who may predict a fixture at all.
 *
 * `validatePrediction()` refuses a question whose competition no league of
 * yours plays — that rule is what ties a prediction to a league in the first
 * place, and a dataset that ignored it would be a dataset the product could
 * not have produced. So the eligible set per competition is exactly the union
 * of the members of the leagues bound to it.
 */
const eligibleByCompetition = new Map();
for (const [userId, memberships] of membershipsByUser) {
  for (const { league } of memberships) {
    const set = eligibleByCompetition.get(league.competition_id) ?? new Set();
    set.add(userId);
    eligibleByCompetition.set(league.competition_id, set);
  }
}

/**
 * The featured-game bonus, exactly as `makePrediction()` computes it: the
 * highest bonus among *this user's* leagues that have featured *this* fixture.
 * A league someone is not in must never pay out to them.
 */
function bonusFor(userId, game) {
  const memberships = membershipsByUser.get(userId) ?? [];
  const applicable = memberships
    .filter(
      ({ league }) =>
        league.featured_game_id === game.id && league.competition_id === game.competition_id,
    )
    .map(({ league }) => league.featured_bonus_pct);
  return applicable.length ? Math.max(...applicable) : 0;
}

// ─── Generate the predictions ──────────────────────────────────────────────

const predictions = [];
let predictionSeq = 0;

for (const game of GAMES) {
  const eligible = eligibleByCompetition.get(game.competition_id);
  if (!eligible) continue;

  const hoursAhead = toOffset(game.kickoff_at);
  const factor = recencyFactor(hoursAhead);
  const isSettled = game.status === "finished";
  const isVoid = game.status === "postponed" || game.status === "cancelled";
  const isOpen = !isSettled && !isVoid;

  for (const question of questionsByGame.get(game.id) ?? []) {
    for (const userId of eligible) {
      const traits = TRAITS[profileById.get(userId).username];
      const threshold = TYPE_APPETITE[question.type] * traits.participation * factor;
      if (rand("join", userId, question.id) >= threshold) continue;

      const correctOutcome =
        isSettled || game.status === "live"
          ? resolveOutcome(question.type, game.score_home, game.score_away)
          : null;

      // The accuracy thumb only applies where there is something to be right
      // about. On an open fixture everyone draws from the market alone.
      const guided =
        isSettled && rand("hit", userId, question.id) < traits.accuracy
          ? correctOutcome
          : drawOutcome(question.outcomes, traits.tilt, rand("pick", userId, question.id));

      const outcome = question.outcomes.find((o) => o.key === guided);
      const frozenOdds = Number(outcome.odds);
      const bonusPct = bonusFor(userId, game);

      // An exact score rides on a winner call and nothing else, and must agree
      // with the outcome it accompanies — `validateExactScore()` rejects a
      // score that contradicts the pick, because such a prediction could never
      // earn the bonus and accepting it would look like it counts.
      let exactScore = null;
      if (
        question.type === "match_result" &&
        rand("exact", userId, question.id) < traits.exactScore
      ) {
        const realScore =
          game.score_home !== null && game.score_away !== null
            ? [game.score_home, game.score_away]
            : null;
        const realMatchesPick =
          realScore &&
          resolveOutcome("match_result", realScore[0], realScore[1]) === guided;
        if (realMatchesPick && rand("exacthit", userId, question.id) < 0.3) {
          exactScore = `${realScore[0]}-${realScore[1]}`;
        } else {
          const shapes = SCORE_SHAPES[guided];
          const shape = shapes[Math.floor(rand("shape", userId, question.id) * shapes.length)];
          exactScore = `${shape[0]}-${shape[1]}`;
        }
      }

      // Predicted between one and forty-nine hours before kickoff — or before
      // DEMO_NOW, whichever is sooner, since nobody can have predicted in the
      // future.
      const anchor = Math.min(hoursAhead, 0);
      const predictedAt =
        Math.round((anchor - (1 + rand("when", userId, question.id) * 48)) * 100) / 100;

      let status = "pending";
      let pointsEarned = null;
      let settledAt = null;
      let cancelledAt = null;

      if (isSettled) {
        const result = settlePrediction(
          {
            selectedOutcome: guided,
            odds: effectiveOdds({
              odds: frozenOdds,
              currentOdds: frozenOdds,
              oddsProvisional: question.odds_provisional,
            }),
            bonusPct,
            exactScore,
          },
          correctOutcome,
          { home: game.score_home, away: game.score_away },
        );
        status = result.status;
        pointsEarned = result.pointsEarned;
        settledAt = toOffset(game.settled_at);
      } else if (isVoid) {
        const result = voidPrediction();
        status = result.status;
        pointsEarned = result.pointsEarned;
        settledAt = toOffset(game.settled_at);
      } else if (isOpen && hoursAhead > 0 && rand("cancel", userId, question.id) < 0.07) {
        // Cancelled by the user, comfortably inside the ten-minute window that
        // `validateCancellation()` enforces. About one open prediction in
        // fourteen, which is enough that the state is reachable in the demo:
        // a cancelled row scores nothing, counts for nothing, and must not
        // appear in a total — a rule with nowhere else to show itself.
        status = "cancelled";
        cancelledAt = Math.round(Math.min(predictedAt + 3, -0.3) * 100) / 100;
      }

      predictionSeq += 1;
      predictions.push({
        id: `40000000-0000-4000-8000-${String(predictionSeq).padStart(12, "0")}`,
        user_id: userId,
        question_id: question.id,
        game_id: game.id,
        question_type: question.type,
        competition_id: game.competition_id,
        selected_outcome: guided,
        odds: frozenOdds,
        bonus_pct: bonusPct,
        exact_score: exactScore,
        points_earned: pointsEarned,
        status,
        odds_provisional: question.odds_provisional,
        predicted_at: predictedAt,
        settled_at: settledAt,
        cancelled_at: cancelledAt,
      });
    }
  }
}

// Stable order: by the moment the prediction was made, so the emitted block
// reads chronologically and a diff between two runs is empty rather than
// reshuffled.
predictions.sort((a, b) => a.predicted_at - b.predicted_at || a.id.localeCompare(b.id));
predictions.forEach((p, index) => {
  p.id = `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
});

// ─── Profile totals, as refreshUserTotals() computes them ──────────────────

const SETTLED_STATUSES = new Set(["correct", "incorrect", "void"]);

const totals = {};
for (const profile of PROFILES) {
  const settled = predictions.filter(
    (p) => p.user_id === profile.id && SETTLED_STATUSES.has(p.status),
  );
  const correct = settled.filter((p) => p.status === "correct");
  const predictionPoints = correct.reduce((sum, p) => sum + Number(p.points_earned ?? 0), 0);
  const puzzlePoints = PUZZLE_ATTEMPTS.filter(
    (a) => a.user_id === profile.id && a.is_correct,
  ).reduce((sum, a) => sum + Number(a.points_earned ?? 0), 0);

  totals[profile.id] = {
    total_points: Math.round((predictionPoints + puzzlePoints) * 100) / 100,
    total_predictions: settled.length,
    total_correct: correct.length,
  };
}

// ─── Standings, as league_standings() computes them ────────────────────────

/**
 * Three filters, and all three matter: only the winner market counts towards a
 * league, only correct predictions score, and only predictions made after the
 * member joined. The other two markets still move the site-wide leaderboard and
 * the profile total — they are simply not what a league table is about.
 *
 * `asOf` is an offset in hours; a prediction counts only once it has settled,
 * which is what makes the badge timeline below honest rather than retrospective.
 */
function leaguePoints(leagueId, userId, asOf = Infinity) {
  const league = leagueById.get(leagueId);
  const membership = LEAGUE_MEMBERS.find(
    (m) => m.league_id === leagueId && m.user_id === userId,
  );
  if (!membership) return 0;
  const joinedAt = toOffset(membership.joined_at);

  return round2(
    predictions
      .filter(
        (p) =>
          p.user_id === userId &&
          p.status === "correct" &&
          p.question_type === "match_result" &&
          p.competition_id === league.competition_id &&
          p.predicted_at >= joinedAt &&
          p.settled_at !== null &&
          p.settled_at <= asOf,
      )
      .reduce((sum, p) => sum + Number(p.points_earned), 0),
  );
}

/** `best_league_rank()`: competition ranking across the user's private leagues. */
function bestLeagueRank(userId, asOf = Infinity) {
  let best = null;
  for (const { league } of membershipsByUser.get(userId) ?? []) {
    if (league.is_public || league.status !== "active") continue;
    const mine = leaguePoints(league.id, userId, asOf);
    const ahead = LEAGUE_MEMBERS.filter((m) => m.league_id === league.id).filter(
      (m) => leaguePoints(league.id, m.user_id, asOf) > mine,
    ).length;
    const position = ahead + 1;
    best = best === null ? position : Math.min(best, position);
  }
  return best;
}

// ─── The demo user's badges, replayed ──────────────────────────────────────

/**
 * Achievements are not a snapshot of the final state: they are a log of when
 * each one was earned, and the product writes a row at the moment the condition
 * first holds — settlement, a league join and a solved puzzle all call the same
 * awarder.
 *
 * So the timeline is replayed rather than evaluated once. Every moment that
 * could have granted something is visited in order, the stats are computed from
 * what had happened *by then*, and `newlyEarned()` decides. That is why
 * `ten_predictions` carries an earlier timestamp than `underdog` even though
 * both are held now — and why `league_leader` is absent unless the demo user
 * genuinely led a league at some point.
 */
function demoAchievements() {
  const mine = predictions.filter((p) => p.user_id === DEMO_USER_ID);
  const myPuzzles = PUZZLE_ATTEMPTS.filter((a) => a.user_id === DEMO_USER_ID && a.is_correct);
  const myMemberships = membershipsByUser.get(DEMO_USER_ID) ?? [];

  const moments = new Set();
  for (const p of mine) if (p.settled_at !== null) moments.add(p.settled_at);
  for (const a of myPuzzles) moments.add(toOffset(a.created_at));
  for (const m of myMemberships) moments.add(toOffset(m.joinedAt));

  const held = [];
  const rows = [];

  for (const at of [...moments].sort((a, b) => a - b)) {
    const settled = mine
      .filter((p) => SETTLED_STATUSES.has(p.status) && p.settled_at !== null && p.settled_at <= at)
      // Most recent first, which is the order the streak is read in.
      .sort((a, b) => b.settled_at - a.settled_at);
    const correct = settled.filter((p) => p.status === "correct");

    let streak = 0;
    for (const p of settled) {
      if (p.status === "void") continue;
      if (p.status !== "correct") break;
      streak += 1;
    }

    const stats = {
      totalPredictions: settled.length,
      totalCorrect: correct.length,
      currentStreak: streak,
      bestOdds: correct.reduce((best, p) => Math.max(best, Number(p.odds)), 0),
      puzzlesSolved: myPuzzles.filter((a) => toOffset(a.created_at) <= at).length,
      leaguesJoined: myMemberships.filter(
        (m) => !m.league.is_public && toOffset(m.joinedAt) <= at,
      ).length,
      bestRank: held.includes("league_leader") ? null : bestLeagueRank(DEMO_USER_ID, at),
    };

    for (const earned of newlyEarned(stats, held)) {
      held.push(earned.key);
      rows.push({ key: earned.key, at });
    }
  }

  return rows;
}

const badges = demoAchievements();

// ─── Insight cache keys, as insightCacheKey() computes them ────────────────

/**
 * sha256 over the fixture's status, its row version and every price it carries.
 * No TTL: staleness here is not a function of time, it is a function of whether
 * the inputs moved — and in a frozen dataset they never do, which is why the
 * demo's cache always hits.
 */
function contextHash(gameId) {
  const game = gameById.get(gameId);
  const priced = [...(questionsByGame.get(gameId) ?? [])]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((q) => {
      const outcomes = q.outcomes
        .map((o) => `${o.key}:${Number(o.odds)}`)
        .sort()
        .join(",");
      return `${q.type}(${outcomes})`;
    })
    .join("|");
  return createHash("sha256")
    .update(`${game.status}|${game.updated_at}|${priced}`)
    .digest("hex");
}

const insightHashes = [...new Set(ADVISOR_INSIGHTS.map((i) => i.game_id))].map((gameId) => [
  gameId,
  contextHash(gameId),
]);

// ─── Emit ──────────────────────────────────────────────────────────────────

const q = (value) => (value === null ? "null" : JSON.stringify(value));
const t = (offset) => (offset === null ? "null" : `hoursFromNow(${offset})`);

function renderBlock() {
  const predictionRows = predictions
    .map(
      (p) =>
        `  { id: ${q(p.id)}, user_id: ${q(p.user_id)}, question_id: ${q(p.question_id)}, ` +
        `selected_outcome: ${q(p.selected_outcome)}, odds: ${p.odds}, bonus_pct: ${p.bonus_pct}, ` +
        `exact_score: ${q(p.exact_score)}, points_earned: ${p.points_earned === null ? "null" : p.points_earned}, ` +
        `status: ${q(p.status)}, odds_provisional: ${p.odds_provisional}, ` +
        `predicted_at: ${t(p.predicted_at)}, settled_at: ${t(p.settled_at)}, cancelled_at: ${t(p.cancelled_at)} },`,
    )
    .join("\n");

  const totalRows = PROFILES.map(
    (p) =>
      `  ${q(p.id)}: { total_points: ${totals[p.id].total_points}, ` +
      `total_predictions: ${totals[p.id].total_predictions}, total_correct: ${totals[p.id].total_correct} },`,
  ).join("\n");

  const badgeRows = badges
    .map(
      (b, index) =>
        `  { id: ${q(`80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`)}, ` +
        `user_id: ${q(DEMO_USER_ID)}, achievement_key: ${q(b.key)}, earned_at: ${t(b.at)} },`,
    )
    .join("\n");

  const hashRows = insightHashes.map(([id, hash]) => `  ${q(id)}: ${q(hash)},`).join("\n");

  return [
    START,
    "const SETTLED_TOTALS: Record<string, { total_points: number; total_predictions: number; total_correct: number }> = {",
    totalRows,
    "};",
    "",
    "export const PREDICTIONS: Row<\"predictions\">[] = [",
    predictionRows,
    "];",
    "",
    "export const USER_ACHIEVEMENTS: Row<\"user_achievements\">[] = [",
    badgeRows,
    "];",
    "",
    "const INSIGHT_CONTEXT_HASH: Record<string, string> = {",
    hashRows,
    "};",
    END,
  ].join("\n");
}

// ─── Report ────────────────────────────────────────────────────────────────

console.log("");
await checkTeamNames();
checkOdds();
checkBridgePlayers();
checkInsights();
console.log("");

const byStatus = {};
for (const p of predictions) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
const exactCalls = predictions.filter((p) => p.exact_score);
const exactHits = exactCalls.filter((p) => {
  const game = gameById.get(p.game_id);
  return (
    p.status === "correct" && p.exact_score === `${game.score_home}-${game.score_away}`
  );
});
const bonused = predictions.filter((p) => p.bonus_pct > 0);

console.log(`predictions ${predictions.length} rows · ${JSON.stringify(byStatus)}`);
console.log(`exact score ${exactCalls.length} calls · ${exactHits.length} hits, each tripled`);
console.log(`bonus       ${bonused.length} rows carry a featured-game bonus`);
console.log(`badges      ${badges.map((b) => b.key).join(", ")}`);
console.log("");

console.log("league tables");
for (const league of LEAGUES) {
  const rows = LEAGUE_MEMBERS.filter((m) => m.league_id === league.id)
    .map((m) => ({
      name: profileById.get(m.user_id).display_name,
      points: leaguePoints(league.id, m.user_id),
    }))
    .sort((a, b) => b.points - a.points);
  console.log(`  ${league.name} (${rows.length})`);
  for (const [index, row] of rows.entries()) {
    console.log(`    ${String(index + 1).padStart(2)}. ${row.points.toFixed(2).padStart(7)}  ${row.name}`);
  }
}
console.log("");

// Per-fixture summary for the demo user, in the exact shape settle.ts puts into
// a notification body — so the hand-written `NOTIFICATIONS` rows can quote real
// numbers instead of invented ones.
console.log("demo user settled fixtures (for notification bodies)");
const mineByGame = new Map();
for (const p of predictions) {
  if (p.user_id !== DEMO_USER_ID || !SETTLED_STATUSES.has(p.status)) continue;
  const acc = mineByGame.get(p.game_id) ?? { correct: 0, points: 0 };
  if (p.status === "correct") acc.correct += 1;
  acc.points += Number(p.points_earned);
  mineByGame.set(p.game_id, acc);
}
for (const [gameId, acc] of [...mineByGame].sort(
  (a, b) => toOffset(gameById.get(b[0]).kickoff_at) - toOffset(gameById.get(a[0]).kickoff_at),
)) {
  const game = gameById.get(gameId);
  console.log(
    `  ${game.home_team} — ${game.away_team}`.padEnd(48) +
      ` ${acc.correct} hit(s), ${(Math.round(acc.points * 100) / 100).toFixed(2)} pts`,
  );
}
console.log("");

// ─── Write ─────────────────────────────────────────────────────────────────

const source = readFileSync(TARGET, "utf8");
const from = source.indexOf(START);
const to = source.indexOf(END);
if (from === -1 || to === -1) {
  fail(`markers ${START} / ${END} not found in ${path.relative(ROOT, TARGET)}`);
  process.exit(1);
}

const next = source.slice(0, from) + renderBlock() + source.slice(to + END.length);

if (process.exitCode === 1) {
  console.error("refusing to write: the checks above failed");
  process.exit(1);
}

if (CHECK_ONLY) {
  if (next === source) {
    console.log("✓ the committed block matches what these rules produce");
  } else {
    console.error("✗ the committed block is stale — run without --check");
    process.exit(1);
  }
} else {
  writeFileSync(TARGET, next);
  console.log(`✓ wrote the generated block into ${path.relative(ROOT, TARGET)}`);
}
