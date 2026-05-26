-- Make the Agent ledger append-only from the browser and support resumable approvals.

alter table public.agent_approvals
  add column if not exists claimed_at timestamptz;

alter table public.agent_approvals
  drop constraint if exists agent_approvals_decision_state_check;
alter table public.agent_approvals
  add constraint agent_approvals_decision_state_check check (
    (status = 'pending' and decided_at is null and claimed_at is null)
    or (status = 'rejected' and decided_at is not null and claimed_at is null)
    or (status = 'approved' and decided_at is not null)
  );

create unique index if not exists agent_approvals_one_pending_per_run_idx
  on public.agent_approvals (run_id)
  where status = 'pending';

drop policy if exists "users_insert_own_agent_runs" on public.agent_runs;
drop policy if exists "users_update_own_agent_runs" on public.agent_runs;
drop policy if exists "users_insert_own_agent_steps" on public.agent_steps;
drop policy if exists "users_insert_own_agent_evidence" on public.agent_evidence;
drop policy if exists "users_insert_own_agent_approvals" on public.agent_approvals;
drop policy if exists "users_update_own_agent_approvals" on public.agent_approvals;

revoke insert, update, delete on public.agent_runs from authenticated;
revoke insert, update, delete on public.agent_steps from authenticated;
revoke insert, update, delete on public.agent_evidence from authenticated;
revoke insert, update, delete on public.agent_approvals from authenticated;

-- Writes are performed by the authenticated agent-ledger Edge Function after
-- it verifies the caller and enforces the allowed state transition.
