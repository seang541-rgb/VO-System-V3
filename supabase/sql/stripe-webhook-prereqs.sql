-- Credit billing, Agent turn charging, and Stripe webhook prerequisites.
-- Safe to re-run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits_balance integer not null default 5 check (credits_balance >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.user_credits is
  'Secure server-managed credit balance. New accounts receive five trial credits.';

alter table public.user_credits enable row level security;

drop policy if exists "users_select_own_credits" on public.user_credits;
drop policy if exists "service_role_all_credits" on public.user_credits;

create policy "users_select_own_credits"
  on public.user_credits for select to authenticated
  using (user_id = auth.uid());
create policy "service_role_all_credits"
  on public.user_credits for all to service_role
  using (true) with check (true);

revoke insert, update, delete on public.user_credits from authenticated;
grant select on public.user_credits to authenticated;

create or replace function public.handle_new_user_credits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_credits (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_credits on auth.users;
create trigger on_auth_user_created_credits
  after insert on auth.users
  for each row execute function public.handle_new_user_credits();

insert into public.user_credits (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create table if not exists public.agent_turn_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_messages_hash text not null,
  hop_count integer not null default 1 check (hop_count between 1 and 10),
  created_at timestamptz not null default timezone('utc', now()),
  last_used_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_turn_charges_user_created_idx
  on public.agent_turn_charges (user_id, created_at desc);

alter table public.agent_turn_charges enable row level security;

drop policy if exists "service_role_all_agent_turn_charges" on public.agent_turn_charges;
create policy "service_role_all_agent_turn_charges"
  on public.agent_turn_charges for all to service_role
  using (true) with check (true);

create or replace function public.consume_credit()
returns public.user_credits
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  updated_row public.user_credits;
begin
  if requester_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.user_credits
  set credits_balance = credits_balance - 1,
      updated_at = timezone('utc', now())
  where user_id = requester_id
    and credits_balance > 0
  returning * into updated_row;

  if updated_row is null then
    raise exception 'NO_CREDITS';
  end if;

  return updated_row;
end;
$$;

revoke all on function public.consume_credit() from public;
grant execute on function public.consume_credit() to authenticated;

create or replace function public.consume_agent_turn_credit(
  p_turn_id uuid default null,
  p_user_messages_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  current_balance integer;
  current_turn_id uuid;
begin
  if requester_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_user_messages_hash is null or length(p_user_messages_hash) < 32 then
    raise exception 'INVALID_AGENT_TURN';
  end if;

  if p_turn_id is null then
    update public.user_credits
    set credits_balance = credits_balance - 1,
        updated_at = timezone('utc', now())
    where user_id = requester_id
      and credits_balance > 0
    returning credits_balance into current_balance;

    if current_balance is null then
      raise exception 'NO_CREDITS';
    end if;

    insert into public.agent_turn_charges (user_id, user_messages_hash)
    values (requester_id, p_user_messages_hash)
    returning id into current_turn_id;
  else
    update public.agent_turn_charges
    set hop_count = hop_count + 1,
        last_used_at = timezone('utc', now())
    where id = p_turn_id
      and user_id = requester_id
      and user_messages_hash = p_user_messages_hash
      and hop_count < 10
    returning id into current_turn_id;

    if current_turn_id is null then
      raise exception 'INVALID_AGENT_TURN';
    end if;

    select credits_balance into current_balance
    from public.user_credits
    where user_id = requester_id;
  end if;

  return jsonb_build_object(
    'credits_balance', current_balance,
    'turn_id', current_turn_id
  );
end;
$$;

revoke all on function public.consume_agent_turn_credit(uuid, text) from public;
grant execute on function public.consume_agent_turn_credit(uuid, text) to authenticated;

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

revoke all on function public.increment_user_credits(uuid, integer) from public;
grant execute on function public.increment_user_credits(uuid, integer) to service_role;
