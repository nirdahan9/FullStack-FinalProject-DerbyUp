-- ═══════════════════════════════════════════════════════════════════════════
-- Indexes. Mirrors docs/03-technical-design.md §2.4.
-- Each one exists for a query we identified, not on principle: every index
-- costs write throughput and storage.
-- ═══════════════════════════════════════════════════════════════════════════

-- Prediction history, the most frequent read.
create index idx_pred_user_time on public.predictions (user_id, predicted_at desc);

-- Settlement: every pending prediction for a question.
create index idx_pred_question_status on public.predictions (question_id, status);

-- Partial: league standings only ever sum correct predictions, so incorrect
-- ones are kept out of the index entirely and it stays small as the table grows.
create index idx_pred_user_status on public.predictions (user_id, status)
  where status = 'correct';

-- Site-wide leaderboard reads rows already ordered, with no sort and no
-- aggregation — the cheap counterpart to the computed league table.
create index idx_profiles_leaderboard on public.profiles (total_points desc);

-- Standings filter questions by type; games by competition.
create index idx_questions_game on public.questions (game_id);
create index idx_games_comp_kickoff on public.games (competition_id, kickoff_at);

-- Upcoming and just-finished fixtures, used by the pages and by cron.
create index idx_games_status_kickoff on public.games (status, kickoff_at);

create index idx_members_league on public.league_members (league_id);
create index idx_members_user on public.league_members (user_id);

-- Join-by-code lookup.
create index idx_leagues_code on public.leagues (invite_code);

-- Partial: in a mature product most notifications are read, so restricting the
-- index to unread ones keeps it permanently small.
create index idx_notif_user_unread on public.notifications (user_id, created_at desc)
  where read_at is null;

create index idx_puzzle_user on public.puzzle_attempts (user_id, created_at desc);

-- Trigram GIN so the autocomplete can match on a substring rather than only
-- on a prefix — a btree index cannot serve `%text%`.
create index idx_players_trgm on public.bridge_players
  using gin (normalized_name extensions.gin_trgm_ops);
