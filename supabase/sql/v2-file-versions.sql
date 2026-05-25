-- ── File Version Management ──────────────────────────────────────────────────
-- Tracks version history for project files. Each upload creates a new version.

create table if not exists file_versions (
  id           uuid primary key default gen_random_uuid(),
  file_id      uuid not null references project_files(id) on delete cascade,
  version      int not null default 1,
  storage_path text not null,
  file_size    bigint,
  checksum     text,
  uploaded_by  uuid references auth.users(id),
  notes        text,
  created_at   timestamptz default now(),
  unique(file_id, version)
);

create index if not exists file_versions_file_idx on file_versions(file_id);

alter table file_versions enable row level security;

create policy "Users can read own file versions"
  on file_versions for select
  using (file_id in (
    select pf.id from project_files pf
    join projects p on pf.project_id = p.id
    where p.user_id = auth.uid()
  ));

create policy "Users can insert own file versions"
  on file_versions for insert
  with check (file_id in (
    select pf.id from project_files pf
    join projects p on pf.project_id = p.id
    where p.user_id = auth.uid()
  ));

create policy "Users can delete own file versions"
  on file_versions for delete
  using (file_id in (
    select pf.id from project_files pf
    join projects p on pf.project_id = p.id
    where p.user_id = auth.uid()
  ));

-- Add version tracking column to project_files if not exists
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'project_files' and column_name = 'current_version'
  ) then
    alter table project_files add column current_version int default 1;
  end if;
end $$;
