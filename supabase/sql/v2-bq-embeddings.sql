-- ── BQ Vector Embeddings ──────────────────────────────────────────────────────
-- Requires: pgvector extension (enable in Supabase Dashboard → Database → Extensions)
-- Stores embedding vectors for BQ line item descriptions to enable semantic matching.

create extension if not exists vector with schema extensions;

create table if not exists bq_embeddings (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  item_reference text not null,
  description  text not null,
  unit         text not null,
  contract_rate numeric not null,
  embedding    vector(1024),
  created_at   timestamptz default now()
);

create index if not exists bq_embeddings_project_idx on bq_embeddings(project_id);
create index if not exists bq_embeddings_vector_idx on bq_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 20);

alter table bq_embeddings enable row level security;

create policy "Users can read own project BQ embeddings"
  on bq_embeddings for select
  using (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users can insert own project BQ embeddings"
  on bq_embeddings for insert
  with check (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users can delete own project BQ embeddings"
  on bq_embeddings for delete
  using (project_id in (select id from projects where user_id = auth.uid()));

-- RPC function: semantic search by cosine similarity
create or replace function match_bq_items(
  query_embedding vector(1024),
  match_project_id uuid,
  match_threshold float default 0.3,
  match_count int default 5
)
returns table (
  id uuid,
  item_reference text,
  description text,
  unit text,
  contract_rate numeric,
  similarity float
)
language sql stable
as $$
  select
    bq.id,
    bq.item_reference,
    bq.description,
    bq.unit,
    bq.contract_rate,
    1 - (bq.embedding <=> query_embedding) as similarity
  from bq_embeddings bq
  where bq.project_id = match_project_id
    and 1 - (bq.embedding <=> query_embedding) > match_threshold
  order by bq.embedding <=> query_embedding
  limit match_count;
$$;
