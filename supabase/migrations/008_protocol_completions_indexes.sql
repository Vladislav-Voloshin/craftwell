-- protocol_completions: table definition + performance indexes.
--
-- The table was created directly in production but was missing from migrations.
-- This migration is idempotent (uses IF NOT EXISTS) so it is safe to apply
-- on databases that already have the table.
--
-- Root cause of Disk IO depletion:
--   - Streaks and achievements queries read ALL completions for a user with no
--     date bound, causing sequential scans that grew unboundedly with history.
--   - These queries are now capped at 90 days in application code, but indexes
--     are required for the date-range filter to be selective.

create table if not exists protocol_completions (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  protocol_id    uuid        not null references protocols(id) on delete cascade,
  tool_id        uuid        not null references protocol_tools(id) on delete cascade,
  completed_date date        not null,
  created_at     timestamptz not null default now(),
  unique (user_id, protocol_id, tool_id, completed_date)
);

-- Primary lookup pattern: user + protocol + date range (streaks, dashboard, completions)
create index if not exists idx_protocol_completions_user_protocol_date
  on protocol_completions (user_id, protocol_id, completed_date desc);

-- Achievements query fetches all completions for a user across all protocols
create index if not exists idx_protocol_completions_user_date
  on protocol_completions (user_id, completed_date desc);

-- RLS
alter table protocol_completions enable row level security;

create policy "Users can read own completions"
  on protocol_completions for select
  using (auth.uid() = user_id);

create policy "Users can insert own completions"
  on protocol_completions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own completions"
  on protocol_completions for delete
  using (auth.uid() = user_id);
