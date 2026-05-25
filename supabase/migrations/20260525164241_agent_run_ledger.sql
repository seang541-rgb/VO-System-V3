-- Persistent task ledger, evidence trail, and human approval gates for Copilot.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid references public.copilot_conversations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_request text not null,
  role_id text,
  status text not null default 'running'
    check (status in ('running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  final_response text,
  error_message text,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists agent_runs_project_started_idx
  on public.agent_runs (project_id, started_at desc);
create index if not exists agent_runs_user_started_idx
  on public.agent_runs (user_id, started_at desc);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  sequence_no integer not null,
  step_type text not null check (step_type in ('tool', 'assistant', 'system')),
  tool_name text,
  status text not null check (status in ('completed', 'failed', 'rejected')),
  input_json jsonb,
  output_json jsonb,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (run_id, sequence_no)
);

create index if not exists agent_steps_run_sequence_idx
  on public.agent_steps (run_id, sequence_no);

create table if not exists public.agent_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  step_id uuid references public.agent_steps(id) on delete set null,
  project_id uuid not null references public.projects(id) on delete cascade,
  evidence_type text not null
    check (evidence_type in ('comparison', 'commercial_summary', 'contract_assessment', 'audit', 'report', 'knowledge_lookup')),
  title text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_evidence_run_created_idx
  on public.agent_evidence (run_id, created_at);
create index if not exists agent_evidence_project_created_idx
  on public.agent_evidence (project_id, created_at desc);

create table if not exists public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default timezone('utc', now()),
  decided_at timestamptz,
  decision_note text
);

create index if not exists agent_approvals_run_requested_idx
  on public.agent_approvals (run_id, requested_at desc);
create index if not exists agent_approvals_user_pending_idx
  on public.agent_approvals (user_id, requested_at desc)
  where status = 'pending';

alter table public.agent_runs enable row level security;
alter table public.agent_steps enable row level security;
alter table public.agent_evidence enable row level security;
alter table public.agent_approvals enable row level security;

drop policy if exists "users_read_own_agent_runs" on public.agent_runs;
drop policy if exists "users_insert_own_agent_runs" on public.agent_runs;
drop policy if exists "users_update_own_agent_runs" on public.agent_runs;
drop policy if exists "service_role_all_agent_runs" on public.agent_runs;
create policy "users_read_own_agent_runs" on public.agent_runs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users_insert_own_agent_runs" on public.agent_runs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and project_id in (select id from public.projects where user_id = (select auth.uid()))
  );
create policy "users_update_own_agent_runs" on public.agent_runs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "service_role_all_agent_runs" on public.agent_runs for all to service_role
  using (true) with check (true);

drop policy if exists "users_read_own_agent_steps" on public.agent_steps;
drop policy if exists "users_insert_own_agent_steps" on public.agent_steps;
drop policy if exists "service_role_all_agent_steps" on public.agent_steps;
create policy "users_read_own_agent_steps" on public.agent_steps for select to authenticated
  using (run_id in (select id from public.agent_runs where user_id = (select auth.uid())));
create policy "users_insert_own_agent_steps" on public.agent_steps for insert to authenticated
  with check (run_id in (select id from public.agent_runs where user_id = (select auth.uid())));
create policy "service_role_all_agent_steps" on public.agent_steps for all to service_role
  using (true) with check (true);

drop policy if exists "users_read_own_agent_evidence" on public.agent_evidence;
drop policy if exists "users_insert_own_agent_evidence" on public.agent_evidence;
drop policy if exists "service_role_all_agent_evidence" on public.agent_evidence;
create policy "users_read_own_agent_evidence" on public.agent_evidence for select to authenticated
  using (run_id in (select id from public.agent_runs where user_id = (select auth.uid())));
create policy "users_insert_own_agent_evidence" on public.agent_evidence for insert to authenticated
  with check (
    run_id in (select id from public.agent_runs where user_id = (select auth.uid()))
    and project_id in (select id from public.projects where user_id = (select auth.uid()))
  );
create policy "service_role_all_agent_evidence" on public.agent_evidence for all to service_role
  using (true) with check (true);

drop policy if exists "users_read_own_agent_approvals" on public.agent_approvals;
drop policy if exists "users_insert_own_agent_approvals" on public.agent_approvals;
drop policy if exists "users_update_own_agent_approvals" on public.agent_approvals;
drop policy if exists "service_role_all_agent_approvals" on public.agent_approvals;
create policy "users_read_own_agent_approvals" on public.agent_approvals for select to authenticated
  using (user_id = (select auth.uid()));
create policy "users_insert_own_agent_approvals" on public.agent_approvals for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and run_id in (select id from public.agent_runs where user_id = (select auth.uid()))
    and project_id in (select id from public.projects where user_id = (select auth.uid()))
  );
create policy "users_update_own_agent_approvals" on public.agent_approvals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "service_role_all_agent_approvals" on public.agent_approvals for all to service_role
  using (true) with check (true);

revoke delete on public.agent_runs, public.agent_steps, public.agent_evidence, public.agent_approvals
  from authenticated;
