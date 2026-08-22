-- Internal SECURITY DEFINER functions must never be exposed through PostgREST
-- RPC. Revoking named API roles alone is insufficient because PostgreSQL grants
-- EXECUTE to PUBLIC by default and those roles inherit the PUBLIC privilege.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prune_rate_limit_log() from public, anon, authenticated;

-- Preserve explicit server-side administration access. Trigger execution of
-- handle_new_user() does not depend on client EXECUTE privileges.
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.prune_rate_limit_log() to service_role;
