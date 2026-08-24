-- ═══════════════════════════════════════════════════════════════════════════
-- The nightly pick runs the same advisor code as the app, with one difference:
-- no user session. It therefore reads through the service role, and the two
-- cache functions it calls on the way have to be reachable from there.
--
-- 20260823140100 revoked these from PUBLIC, which is where service_role would
-- otherwise have inherited them. Granting explicitly is the point: the set of
-- roles that may call a SECURITY DEFINER function should be written down, not
-- arrived at by inheritance.
--
-- Only the two cache helpers. advisor_consume_quota() and
-- advisor_publish_insight() are deliberately left alone — both are about a
-- signed-in person, and cron is not one.
-- ═══════════════════════════════════════════════════════════════════════════

grant execute on function public.api_cache_get(varchar, integer) to service_role;
grant execute on function public.api_cache_put(varchar, jsonb) to service_role;
grant execute on function public.advisor_crowd_split(uuid) to service_role;
