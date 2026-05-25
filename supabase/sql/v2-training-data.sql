-- ── Training Data Collection ─────────────────────────────────────────────────
-- Stores user-validated QS classifications and measurements for future
-- fine-tuning of domain-specific models.

create table if not exists training_samples (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid references projects(id) on delete set null,
  sample_type  text not null check (sample_type in (
    'bq_mapping', 'classification', 'measurement', 'rate_validation', 'clause_assessment'
  )),
  input_data   jsonb not null,
  output_data  jsonb not null,
  validated    boolean default false,
  quality_score float,
  notes        text,
  created_at   timestamptz default now()
);

create index if not exists training_samples_type_idx on training_samples(sample_type);
create index if not exists training_samples_user_idx on training_samples(user_id);
create index if not exists training_samples_validated_idx on training_samples(validated) where validated = true;

alter table training_samples enable row level security;

create policy "Users manage own training samples"
  on training_samples for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Service role reads all validated samples"
  on training_samples for select to service_role
  using (true);
