-- ═══════════════════════════════════════════════════════════════════════════
-- Two loose ends from the achievements work.
--
-- 1. `league_leader` was unreachable. Settlement passed bestRank: null, and the
--    achievement checks `bestRank === 1`, so no user could ever earn it — a
--    badge visible on the profile that nothing could unlock. This adds the
--    function that computes it.
--
-- 2. `puzzle_available` was a notification type nobody ever wrote. The daily
--    challenge is seeded ahead of time and has no scheduled job, so there is
--    no moment at which such a notification would be created. Removed rather
--    than left as a promise in the schema.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Best rank across the user's private leagues ───────────────────────────
-- Mirrors league_standings exactly — the same three filters, because a rank
-- computed on different rules than the table the user is looking at would be
-- worse than no rank at all.
--
-- Public leagues are excluded, matching `leaguesJoined` in the achievement
-- stats: those are open to everyone and topping one says less than topping the
-- league your own organisation opened.
--
-- Ranking is competition-style (equal scores share a rank), so two people tied
-- on top both count as first.
create or replace function public.best_league_rank(p_user uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  with my_leagues as (
    select lm.league_id, lm.joined_at, l.competition_id
    from public.league_members lm
    join public.leagues l on l.id = lm.league_id
    where lm.user_id = p_user
      and l.status = 'active'
      and not l.is_public
  ),
  scored as (
    select
      ml.league_id,
      members.user_id,
      coalesce((
        select sum(pr.points_earned)
        from public.predictions pr
        join public.questions q on q.id = pr.question_id
        join public.games     g on g.id = q.game_id
        where pr.user_id = members.user_id
          and pr.status = 'correct'
          and q.type = 'match_result'
          and g.competition_id = ml.competition_id
          and pr.predicted_at >= members.joined_at
      ), 0) as points
    from my_leagues ml
    join public.league_members members on members.league_id = ml.league_id
  ),
  ranked as (
    select league_id, user_id, rank() over (partition by league_id order by points desc) as position
    from scored
  )
  select min(position)::int from ranked where user_id = p_user;
$$;

-- Called only from the server, never from a browser: revoked from everyone and
-- then granted back to service_role alone. Revoking from PUBLIC removes it for
-- service_role too — the default grant on a new function is to PUBLIC — so the
-- grant has to be named explicitly or the settlement job gets
-- "permission denied for function".
revoke all on function public.best_league_rank(uuid) from public, anon, authenticated;
grant execute on function public.best_league_rank(uuid) to service_role;

-- ─── Drop the notification type that was never produced ────────────────────
alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type in ('prediction_settled', 'league_joined', 'achievement'));
