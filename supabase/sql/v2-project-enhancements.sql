-- VO System V2 — Project Management Enhancements
-- Extends project_files roles + adds analysis_results table
-- Apply after v2-schema.sql

BEGIN;

-- ── 1. Extend project_files role to support BQ, contract, and other files ────
ALTER TABLE project_files DROP CONSTRAINT IF EXISTS project_files_role_check;
ALTER TABLE project_files ADD CONSTRAINT project_files_role_check
  CHECK (role IN ('base', 'revision', 'bq', 'contract', 'other'));

-- ── 2. analysis_results — persistent storage for audit & commercial analyses ─
CREATE TABLE IF NOT EXISTS analysis_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('audit', 'commercial', 'contract_clause')),
  source_file_id UUID REFERENCES project_files(id) ON DELETE SET NULL,
  comparison_id  UUID REFERENCES vo_comparisons(id) ON DELETE SET NULL,
  result_json   JSONB NOT NULL,
  summary_text  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE analysis_results IS 'Persistent analysis outputs (audits, commercial breakdowns, clause assessments). Referenced by Agent context.';

CREATE INDEX IF NOT EXISTS idx_analysis_results_project_id ON analysis_results (project_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_type ON analysis_results (analysis_type);
CREATE INDEX IF NOT EXISTS idx_analysis_results_created_at ON analysis_results (created_at DESC);

-- ── Row-Level Security ───────────────────────────────────────────────────────
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_analysis" ON analysis_results;
DROP POLICY IF EXISTS "users_insert_own_analysis" ON analysis_results;
DROP POLICY IF EXISTS "users_delete_own_analysis" ON analysis_results;
DROP POLICY IF EXISTS "service_role_all_analysis" ON analysis_results;

CREATE POLICY "users_select_own_analysis" ON analysis_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = analysis_results.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_insert_own_analysis" ON analysis_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = analysis_results.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_delete_own_analysis" ON analysis_results FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = analysis_results.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "service_role_all_analysis" ON analysis_results FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

SELECT 'Project enhancements ready' AS status;
