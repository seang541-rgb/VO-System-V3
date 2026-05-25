-- ── API Key Management ───────────────────────────────────────────────────────
-- Stores user-generated API keys for programmatic access to the VO System.

create table if not exists api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  key_hash     text not null unique,
  key_prefix   text not null,           -- first 8 chars for display (e.g. "vo_sk_ab")
  scopes       text[] not null default '{read}',
  last_used_at timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz default now()
);

create index if not exists api_keys_user_idx on api_keys(user_id);
create index if not exists api_keys_hash_idx on api_keys(key_hash);

alter table api_keys enable row level security;

create policy "Users manage own API keys"
  on api_keys for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- API usage tracking
create table if not exists api_usage_log (
  id           uuid primary key default gen_random_uuid(),
  api_key_id   uuid not null references api_keys(id) on delete cascade,
  endpoint     text not null,
  method       text not null,
  status_code  int not null,
  response_time_ms int,
  created_at   timestamptz default now()
);

create index if not exists api_usage_key_idx on api_usage_log(api_key_id);
create index if not exists api_usage_created_idx on api_usage_log(created_at);

alter table api_usage_log enable row level security;

create policy "Users read own API usage"
  on api_usage_log for select to authenticated
  using (api_key_id in (select id from api_keys where user_id = auth.uid()));
