-- ═══════════════════════════════════════════════════════════════════════════
-- Who runs the site, as a first-class question.
--
-- The ability to appoint and remove operators has existed since 20260822170000
-- (admin_set_site_admin), but the *view* of who currently holds the role did
-- not: answering "who has dashboard access" meant paging through every account
-- looking for shield icons. For the one role that can delete users and appoint
-- more of itself, that list deserves to be a screen, not a scavenger hunt.
--
-- A separate function rather than a filter parameter on admin_list_users, for
-- the same reason admin_get_user is separate: the list keeps one meaning, and
-- this one has its own — a handful of rows, no search, no paging, served by
-- the partial index idx_profiles_site_admin.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_list_site_admins()
returns table (
  id           uuid,
  username     varchar,
  display_name varchar,
  email        varchar,
  avatar_url   text,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_site_admin() then
    raise exception 'NOT_SITE_ADMIN' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    p.username,
    p.display_name,
    u.email,
    p.avatar_url,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_site_admin
  -- Oldest first: the founding operator reads naturally at the top, and the
  -- order is stable as admins are added — a list that reshuffles on every
  -- appointment reads like a leaderboard, which this is not.
  order by p.created_at asc;
end;
$$;

revoke all on function public.admin_list_site_admins() from public, anon;
grant execute on function public.admin_list_site_admins() to authenticated;
