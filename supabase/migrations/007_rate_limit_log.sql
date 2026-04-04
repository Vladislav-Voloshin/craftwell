-- Rate limit log table for per-user, per-endpoint request counting.
-- Used by checkApiRateLimit() as shared state across serverless instances.
-- Rows older than 1 hour are pruned periodically via the cleanup function.

create table if not exists rate_limit_log (
  id          bigserial primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  endpoint    text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists rate_limit_log_lookup
  on rate_limit_log (user_id, endpoint, created_at desc);

-- Enable RLS — users cannot read/write their own rate limit records
alter table rate_limit_log enable row level security;

-- Only service role can insert/query (routes use supabase client with user JWT,
-- but the insert is done server-side so we use the service role or anon with
-- a server-only policy). For simplicity, deny all client access.
create policy "no_client_access" on rate_limit_log
  as restrictive for all
  using (false);

-- Cleanup function: delete log entries older than 1 hour.
-- Call this from a cron job (e.g. pg_cron or Supabase scheduled function).
create or replace function prune_rate_limit_log()
returns void
language sql
security definer
as $$
  delete from rate_limit_log where created_at < now() - interval '1 hour';
$$;
