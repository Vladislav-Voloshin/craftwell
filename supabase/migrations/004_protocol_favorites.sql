-- Protocol favorites: users can bookmark/favorite protocols
-- NOTE: supersedes 003_protocol_favorites.sql which was accidentally committed
-- alongside 003_protocol_notes.sql causing a sequence conflict.
-- Uses idempotent DDL so it is safe to apply on DBs that already ran the old 003 file.
create table if not exists protocol_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  protocol_id uuid not null references protocols(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, protocol_id)
);

-- RLS: users can only access their own favorites
alter table protocol_favorites enable row level security;

create policy "Users can read own favorites"
  on protocol_favorites for select
  using (auth.uid() = user_id);

create policy "Users can insert own favorites"
  on protocol_favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on protocol_favorites for delete
  using (auth.uid() = user_id);

-- Index for fast lookups
create index if not exists idx_protocol_favorites_user
  on protocol_favorites(user_id);
