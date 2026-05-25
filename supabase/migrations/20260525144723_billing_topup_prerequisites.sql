-- Stripe top-up processing is service-owned and idempotent.

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  stripe_session_id text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  credits_added integer not null check (credits_added > 0),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

alter table public.stripe_webhook_events enable row level security;
drop policy if exists "service_role_all_stripe_webhook_events" on public.stripe_webhook_events;
create policy "service_role_all_stripe_webhook_events"
  on public.stripe_webhook_events for all to service_role
  using (true) with check (true);

create or replace function public.increment_user_credits(p_user_id uuid, p_delta integer)
returns public.user_credits
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_row public.user_credits;
begin
  if p_delta <= 0 then
    raise exception 'p_delta must be positive';
  end if;

  update public.user_credits
  set credits_balance = credits_balance + p_delta,
      updated_at = timezone('utc', now())
  where user_id = p_user_id
  returning * into updated_row;

  if updated_row is null then
    raise exception 'USER_CREDITS_ROW_NOT_FOUND';
  end if;

  return updated_row;
end;
$$;

revoke all on function public.increment_user_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_user_credits(uuid, integer) to service_role;
