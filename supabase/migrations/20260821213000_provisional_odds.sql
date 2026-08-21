-- ═══════════════════════════════════════════════════════════════════════════
-- Provisional odds, so the whole season can be predicted.
--
-- Fixtures were only predictable once a bookmaker had priced them, which for
-- Ligat Ha'al is about three days out — so most of the season could not be
-- predicted at all. Opening everything at a default price instead would have
-- been worse than unfair: the default home price is 2.50 while a real one for
-- a heavy favourite is nearer 1.20, so predicting an obvious result months
-- ahead would pay double what waiting pays, and every table would reward it.
--
-- Instead a prediction made before a price exists is marked provisional and
-- scored at the real price when the match kicks off. Everyone who predicts an
-- unpriced fixture gets the same number, whether they did it today or in
-- March, and predicting early stops being an edge.
-- ═══════════════════════════════════════════════════════════════════════════

-- True until a bookmaker has priced the fixture. The odds carried on the row
-- until then are placeholders and are shown to users as estimates.
alter table public.questions
  add column if not exists odds_provisional boolean not null default true;

-- Copied from the question at the moment of predicting. Settlement uses it to
-- decide whether the frozen odds count or the price at kickoff does.
alter table public.predictions
  add column if not exists odds_provisional boolean not null default false;

-- The sync refreshes prices for fixtures still marked provisional, so this
-- index keeps that lookup off a sequential scan as the table grows past a
-- few thousand questions.
create index if not exists idx_questions_provisional
  on public.questions (game_id)
  where odds_provisional;
