-- ═══════════════════════════════════════════════════════════════════════════
-- Exact-score calls, ported from the DerbyUp app's `bets.exact_score_prediction`.
--
-- An optional companion to a winner prediction: name the final score, and a
-- correct call is worth three times the odds. Getting the winner right and the
-- score wrong still pays the full odds — the bonus can only ever add, never
-- take away, which is what makes it safe to offer on every fixture.
--
-- Deliberately a column on `predictions` and not a fourth question type. It is
-- not a separate thing to be right about: it is the same match_result call,
-- made more precisely. Modelling it as its own question would have put it into
-- the league standings twice, and would have let a user "predict the score"
-- while contradicting their own winner pick.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.predictions
  add column if not exists exact_score varchar(3);

-- "H-A", single digits, matching the picker's two 0–9 drums. The CHECK is the
-- last line of defence behind the Zod schema and the domain validator; a value
-- outside this shape could never be compared against a real score.
alter table public.predictions
  add constraint predictions_exact_score_format
  check (exact_score is null or exact_score ~ '^[0-9]-[0-9]$');

comment on column public.predictions.exact_score is
  'Optional "home-away" call attached to a match_result prediction. A hit pays '
  'EXACT_SCORE_MULTIPLIER (3) times the odds; a miss pays the plain odds.';
