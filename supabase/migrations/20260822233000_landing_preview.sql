-- ═══════════════════════════════════════════════════════════════════════════
-- The fixture strip on the landing page.
--
-- The landing page is the one route an anonymous visitor sees, and until now
-- it could only describe the product in words. Showing three real fixtures
-- with their real prices is the difference between "we score by the odds" and
-- watching what that means on a match being played this week.
--
-- The problem: `games`, `competitions` and `questions` are readable by
-- `authenticated` only. Widening those policies to `anon` would hand every
-- visitor the whole fixture table, every price, and every question id — far
-- more than a three-row preview needs, and a policy that would then have to be
-- reasoned about on every future query.
--
-- Same answer as the global leaderboard (docs/06-security.md §3.4): the
-- policies stay as they are, and the one thing the page needs comes through a
-- narrow function. This one takes no arguments at all, so there is no limit to
-- raise and no filter to bend — `anon` can ask exactly one question and gets
-- exactly three rows back.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.landing_upcoming_games()
returns table (
  home_team        varchar,
  away_team        varchar,
  home_logo        text,
  away_logo        text,
  kickoff_at       timestamptz,
  competition_name varchar,
  outcomes         jsonb,
  odds_provisional boolean
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
    q.odds_provisional
  from public.games g
  join public.competitions c on c.id = g.competition_id
  -- Only the winner market. It is the question every league table counts and
  -- the only one that needs no explaining, which is the whole job here.
  join public.questions q on q.game_id = g.id and q.type = 'match_result'
  where g.status = 'scheduled'
    and g.kickoff_at > now()
  -- Priced fixtures first. A provisional price is a placeholder shown to users
  -- as an estimate, and a landing page that quoted one as if it were real
  -- would be advertising a number the product itself does not stand behind.
  -- Ordering rather than filtering, so an unpriced week still shows something.
  order by q.odds_provisional asc, g.kickoff_at asc
  limit 3;
$$;

-- The default grant on a new function is to PUBLIC, so the revoke has to come
-- first and the grants have to be named — the same shape as every other
-- definer function here.
revoke all on function public.landing_upcoming_games() from public, anon, authenticated;
grant execute on function public.landing_upcoming_games() to anon, authenticated;
