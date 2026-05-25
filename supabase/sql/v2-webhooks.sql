-- ── Webhook & Notification System ────────────────────────────────────────────
-- Stores user-configured webhook endpoints for project event notifications.

create table if not exists webhooks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid references projects(id) on delete cascade,
  url          text not null,
  events       text[] not null default '{}',
  secret       text,
  enabled      boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists webhooks_user_idx on webhooks(user_id);

alter table webhooks enable row level security;

create policy "Users manage own webhooks"
  on webhooks for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Webhook delivery log
create table if not exists webhook_deliveries (
  id           uuid primary key default gen_random_uuid(),
  webhook_id   uuid not null references webhooks(id) on delete cascade,
  event_type   text not null,
  payload      jsonb not null,
  status_code  int,
  response_body text,
  delivered_at timestamptz default now()
);

create index if not exists webhook_deliveries_webhook_idx on webhook_deliveries(webhook_id);

alter table webhook_deliveries enable row level security;

create policy "Users read own webhook deliveries"
  on webhook_deliveries for select to authenticated
  using (webhook_id in (select id from webhooks where user_id = auth.uid()));

-- Notification preferences
create table if not exists notification_preferences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade unique,
  email_on_comparison boolean default true,
  email_on_report    boolean default false,
  email_on_threshold boolean default true,
  threshold_amount   numeric default 50000,
  created_at   timestamptz default now()
);

alter table notification_preferences enable row level security;

create policy "Users manage own notification prefs"
  on notification_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
