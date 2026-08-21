-- ═══════════════════════════════════════════════════════════════════════════
-- Public leagues: one per competition, everybody in them.
--
-- Predicting requires a league — that rule ties the product together and is
-- worth keeping. But it also meant a new account saw nothing at all until it
-- created something, which reads as a broken product. A public league per
-- tournament satisfies the rule without weakening it: every signed-in user is
-- a member of all seven, so every fixture is predictable from the first
-- visit, while private corporate leagues stay exactly as they were.
--
-- Privacy consequence, handled below: shares_league_with() decides who may
-- read whose profile. Once everyone shares seven leagues that predicate is
-- true for every pair of users, which would expose every profile in the
-- product. Both it and the membership policy are narrowed to private leagues,
-- so "the people in my organisation's league" keeps its original meaning.
-- Public standings still show names, but through league_standings(), which is
-- SECURITY DEFINER and returns a display name and a score, nothing more.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.leagues add column if not exists is_public boolean not null default false;
alter table public.leagues alter column creator_id drop not null;
alter table public.leagues drop constraint if exists leagues_creator_matches_visibility;
alter table public.leagues add constraint leagues_creator_matches_visibility
  check ((is_public and creator_id is null) or (not is_public and creator_id is not null));
create index if not exists idx_leagues_public on public.leagues (is_public) where is_public;
create or replace function public.shares_league_with(p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1
    from public.league_members mine
    join public.league_members theirs on theirs.league_id = mine.league_id
    join public.leagues l on l.id = mine.league_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
      and not l.is_public
  );
$$;

drop policy if exists "members_select_shared_league" on public.league_members;
create policy "members_select_shared_league" on public.league_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.leagues l
      where l.id = league_members.league_id
        and not l.is_public
        and public.is_league_member(l.id)
    )
  );
insert into public.leagues (name, description, creator_id, competition_id, invite_code, is_public)
select 'ליגה ציבורית — ' || c.name,
       'כל משתמשי DerbyUp מתחרים כאן על משחקי ' || c.name || '.',
       null, c.id, 'PUBLIC' || lpad(c.id::text, 2, '0'), true
from public.competitions c where c.is_active
on conflict (invite_code) do nothing;

insert into public.league_members (league_id, user_id)
select l.id, p.id from public.leagues l cross join public.profiles p
where l.is_public
on conflict (league_id, user_id) do nothing;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_base varchar(30); v_username varchar(30);
begin
  v_base := left(split_part(new.email, '@', 1), 24);
  v_username := v_base || '_' || substr(new.id::text, 1, 4);
  insert into public.profiles (id, username, display_name)
  values (new.id, v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)));
  insert into public.league_members (league_id, user_id)
  select l.id, new.id from public.leagues l where l.is_public;
  return new;
end; $$;

create or replace function public.join_league(p_invite_code varchar)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_league public.leagues%rowtype;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  select * into v_league from public.leagues where invite_code = upper(trim(p_invite_code));
  if not found or v_league.status <> 'active' or v_league.is_public then
    raise exception 'INVALID_CODE' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.league_members where league_id = v_league.id and user_id = v_user) then
    raise exception 'ALREADY_MEMBER' using errcode = 'P0001';
  end if;
  insert into public.league_members (league_id, user_id) values (v_league.id, v_user);
  return v_league.id;
end; $$;
