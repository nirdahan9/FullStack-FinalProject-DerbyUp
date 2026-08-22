-- ═══════════════════════════════════════════════════════════════════════════
-- Manual settlement, as an admin action.
--
-- Everything else an admin does — the featured game, the prize list — is an
-- update to the leagues row, and the leagues_update_creator policy already
-- restricts that to the creator. Those need no function.
--
-- Settling a fixture by hand is different: it writes to games, questions and
-- predictions, none of which a user may write to at all. It is the product's
-- safety net for when the provider is wrong or silent, and it hands one
-- person the ability to decide what everybody scored — so the checks belong
-- next to the write, not in the caller.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.settle_game_manually(
  p_league_id  uuid,
  p_game_id    uuid,
  p_score_home smallint,
  p_score_away smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- Only the creator of a private league, and only for a fixture in that
  -- league's own competition. Without the second half, any league admin could
  -- settle any match in the product.
  if not exists (
    select 1
    from public.leagues l
    join public.games g on g.id = p_game_id
    where l.id = p_league_id
      and l.creator_id = v_user
      and not l.is_public
      and g.competition_id = l.competition_id
  ) then
    raise exception 'NOT_LEAGUE_ADMIN' using errcode = 'P0001';
  end if;

  select * into v_game from public.games where id = p_game_id;

  if v_game.settled_at is not null then
    raise exception 'ALREADY_SETTLED' using errcode = 'P0001';
  end if;

  -- A fixture that has not started cannot have a result. Allowing it would let
  -- an admin settle a match their members can still predict.
  if v_game.kickoff_at > now() then
    raise exception 'GAME_NOT_STARTED' using errcode = 'P0001';
  end if;

  if p_score_home < 0 or p_score_away < 0 or p_score_home > 99 or p_score_away > 99 then
    raise exception 'INVALID_SCORE' using errcode = 'P0001';
  end if;

  -- The score is recorded and settled_at left null, so the scheduled job picks
  -- the fixture up on its next run and applies the same settlement logic. That
  -- keeps one implementation of scoring rather than a second one here that
  -- could drift from it.
  update public.games
  set status     = 'finished',
      score_home = p_score_home,
      score_away = p_score_away,
      updated_at = now()
  where id = p_game_id;
end;
$$;

revoke all on function public.settle_game_manually(uuid, uuid, smallint, smallint) from public, anon;
grant execute on function public.settle_game_manually(uuid, uuid, smallint, smallint) to authenticated;
