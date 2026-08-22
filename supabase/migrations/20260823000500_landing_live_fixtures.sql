-- ═══════════════════════════════════════════════════════════════════════════
-- The landing strip learns about matches in progress.
--
-- 20260822233000 gave an anonymous visitor three upcoming fixtures. It could
-- not show a match being played, and it excluded one twice over: the filter
-- asked for `status = 'scheduled'` and for a kick-off still ahead, and a live
-- fixture is neither.
--
-- A live match is the best thing this page has to show. Everything else on it
-- is a claim about how DerbyUp scores; a score moving while you read is the
-- claim happening. So the function now admits live fixtures, returns the three
-- columns needed to draw one, and orders them first — the card at the top of
-- the page is the match on the pitch when there is one.
--
-- What does NOT change is the shape of the opening. It still takes no
-- arguments, still returns at most three rows, and still hands back nothing
-- that identifies anybody: two clubs, a score, a minute and a price. The
-- policies on `games`, `questions` and `competitions` stay shut to `anon`.
--
-- Replaces landing_upcoming_games(), which is dropped: the name stopped being
-- true the moment a live fixture could come back from it.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.landing_upcoming_games();

create or replace function public.landing_fixtures()
returns table (
  home_team        varchar,
  away_team        varchar,
  home_logo        text,
  away_logo        text,
  kickoff_at       timestamptz,
  competition_name varchar,
  outcomes         jsonb,
  odds_provisional boolean,
  status           varchar,
  score_home       smallint,
  score_away       smallint,
  minute           smallint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    g.home_team,
    g.away_team,
    g.home_logo,
    g.away_logo,
    g.kickoff_at,
    c.name,
    q.outcomes,
    q.odds_provisional,
    g.status,
    g.score_home,
    g.score_away,
    g.minute
  from public.games g
  join public.competitions c on c.id = g.competition_id
  -- Only the winner market. It is the question every league table counts and
  -- the only one that needs no explaining, which is the whole job here.
  join public.questions q on q.game_id = g.id and q.type = 'match_result'
  where (g.status = 'scheduled' and g.kickoff_at > now())
     or g.status = 'live'
  order by
    -- A match on the pitch first, whatever else is coming up.
    (g.status = 'live') desc,
    -- Then priced fixtures. A provisional price is a placeholder shown to
    -- users as an estimate, and a landing page that quoted one as if it were
    -- real would be advertising a number the product does not stand behind.
    -- Ordering rather than filtering, so an unpriced week still shows
    -- something.
    q.odds_provisional asc,
    g.kickoff_at asc
  limit 3;
$$;

-- The default grant on a new function is to PUBLIC, so the revoke has to come
-- first and the grants have to be named — the same shape as every other
-- definer function here.
revoke all on function public.landing_fixtures() from public, anon, authenticated;
grant execute on function public.landing_fixtures() to anon, authenticated;
