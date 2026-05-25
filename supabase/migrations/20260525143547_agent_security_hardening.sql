-- Secure agent billing and remove client-side writes to billing-owned rows.

create extension if not exists pgcrypto;

alter table public.user_credits enable row level security;

drop policy if exists "insert own credits row" on public.user_credits;
drop policy if exists "read own credits" on public.user_credits;
drop policy if exists "users_select_own_credits" on public.user_credits;
drop policy if exists "service_role_all_credits" on public.user_credits;

create policy "users_select_own_credits"
  on public.user_credits for select to authenticated
  using (user_id = (select auth.uid()));
create policy "service_role_all_credits"
  on public.user_credits for all to service_role
  using (true) with check (true);

revoke insert, update, delete on public.user_credits from authenticated;
grant select on public.user_credits to authenticated;

alter table public.user_subscriptions enable row level security;

drop policy if exists "users_select_own_subscription" on public.user_subscriptions;
drop policy if exists "users_insert_own_subscription" on public.user_subscriptions;
drop policy if exists "users_update_own_subscription" on public.user_subscriptions;
drop policy if exists "users_delete_own_subscription" on public.user_subscriptions;
drop policy if exists "service_role_all_subscriptions" on public.user_subscriptions;

create policy "users_select_own_subscription"
  on public.user_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "service_role_all_subscriptions"
  on public.user_subscriptions for all to service_role
  using (true) with check (true);

revoke insert, update, delete on public.user_subscriptions from authenticated;
grant select on public.user_subscriptions to authenticated;

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

revoke all on function public.consume_credit() from public, anon;
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

revoke all on function public.consume_agent_turn_credit(uuid, text) from public, anon;
grant execute on function public.consume_agent_turn_credit(uuid, text) to authenticated;

alter function public.handle_new_user_credits() set search_path = '';
alter function public.handle_new_user_subscription() set search_path = '';
alter function public.update_conversation_timestamp() set search_path = '';
alter function public.set_updated_at() set search_path = '';
alter function public.match_bq_items(vector, uuid, double precision, integer)
  set search_path = public, extensions;

revoke all on function public.handle_new_user_credits() from public, anon, authenticated;
revoke all on function public.handle_new_user_subscription() from public, anon, authenticated;
revoke all on function public.update_conversation_timestamp() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.match_bq_items(vector, uuid, double precision, integer) from public, anon;
grant execute on function public.match_bq_items(vector, uuid, double precision, integer)
  to authenticated, service_role;
