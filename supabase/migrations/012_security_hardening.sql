-- ---------------------------------------------------------------------------
-- 012_security_hardening.sql
-- Clears Supabase security advisors:
--   * pin function search_path (prevents search_path injection)
--   * revoke public REST/RPC execute on internal-only functions
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.set_updated_at()          SET search_path = public;
ALTER FUNCTION public.set_waitlist_updated_at() SET search_path = public;
ALTER FUNCTION public.prune_rate_limit_log()    SET search_path = public;

-- A trigger fn and a cron-only cleanup — not meant to be callable from the API.
REVOKE EXECUTE ON FUNCTION public.prune_rate_limit_log() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()      FROM anon, authenticated;
