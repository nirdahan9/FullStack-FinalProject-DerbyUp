-- ═══════════════════════════════════════════════════════════════════════════
-- api_cache_put() refused the one caller that needs it most.
--
-- As written in 20260823140100 it raised when auth.uid() was null, which is
-- precisely the nightly pick: cron runs under the service role with no user
-- session, so every cache write it attempted would have been rejected and the
-- provider re-queried on the next visitor.
--
-- The check was redundant anyway. `anon` cannot reach this function — the
-- grant list is the gate, and the revoke in 20260823140100 already closed it.
-- An authentication test inside a function whose EXECUTE privilege is the real
-- boundary adds nothing except this bug.
--
-- The two checks that do matter are kept: the key has to look like an endpoint
-- we actually call, and the payload has to be a plausible size. Those bound
-- what a signed-in user can do by calling it directly from PostgREST.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.api_cache_put(p_key varchar, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key !~ '^/(fixtures|standings|injuries|players)' then
    raise exception 'unsupported cache key';
  end if;

  if length(p_payload::text) > 262144 then
    raise exception 'payload too large';
  end if;

  insert into public.api_cache (cache_key, payload, fetched_at)
  values (p_key, p_payload, now())
  on conflict (cache_key) do update
    set payload = excluded.payload, fetched_at = now();
end;
$$;

revoke all on function public.api_cache_put(varchar, jsonb) from public, anon;
grant execute on function public.api_cache_put(varchar, jsonb) to authenticated, service_role;
