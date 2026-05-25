-- ═══════════════════════════════════════════════════════════════════════════════
-- VO System V2 — COMBINED AGENT MIGRATION
-- Run this ONCE in Supabase SQL Editor to apply all agent-related schema changes.
-- Prerequisites: v2-schema.sql must have been applied (projects, project_files, etc.)
--
-- Included migrations (in dependency order):
--   1. copilot_messages + copilot_memory
--   2. copilot_conversations
--   3. project_files role extension + analysis_results
--   4. unit_rates + seed data
--   5. bq_embeddings (pgvector) + match_bq_items RPC
--   6. file_versions
--   7. webhooks + webhook_deliveries + notification_preferences
--   8. training_samples
--   9. api_keys + api_usage_log
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── STEP 0: Enable pgvector extension ────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. COPILOT MESSAGES & MEMORY
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS copilot_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content     TEXT,
  tool_calls  JSONB,
  tool_call_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_project_id ON copilot_messages (project_id);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_created_at ON copilot_messages (created_at);

CREATE TABLE IF NOT EXISTS copilot_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'preference', 'project_insight', 'domain_knowledge')),
  content     TEXT NOT NULL,
  source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copilot_memory_user_id  ON copilot_memory (user_id);
CREATE INDEX IF NOT EXISTS idx_copilot_memory_category ON copilot_memory (category);

ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_own_copilot_messages" ON copilot_messages;
DROP POLICY IF EXISTS "users_insert_own_copilot_messages" ON copilot_messages;
DROP POLICY IF EXISTS "users_delete_own_copilot_messages" ON copilot_messages;
DROP POLICY IF EXISTS "service_role_all_copilot_messages" ON copilot_messages;
CREATE POLICY "users_select_own_copilot_messages" ON copilot_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = copilot_messages.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_insert_own_copilot_messages" ON copilot_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = copilot_messages.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_delete_own_copilot_messages" ON copilot_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = copilot_messages.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "service_role_all_copilot_messages" ON copilot_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE copilot_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_own_copilot_memory" ON copilot_memory;
DROP POLICY IF EXISTS "users_insert_own_copilot_memory" ON copilot_memory;
DROP POLICY IF EXISTS "users_update_own_copilot_memory" ON copilot_memory;
DROP POLICY IF EXISTS "users_delete_own_copilot_memory" ON copilot_memory;
DROP POLICY IF EXISTS "service_role_all_copilot_memory" ON copilot_memory;
CREATE POLICY "users_select_own_copilot_memory" ON copilot_memory FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users_insert_own_copilot_memory" ON copilot_memory FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_update_own_copilot_memory" ON copilot_memory FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_delete_own_copilot_memory" ON copilot_memory FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "service_role_all_copilot_memory" ON copilot_memory FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. CONVERSATIONS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS copilot_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New Conversation',
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copilot_conversations_project_id ON copilot_conversations (project_id);
CREATE INDEX IF NOT EXISTS idx_copilot_conversations_updated_at ON copilot_conversations (updated_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'copilot_messages' AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE copilot_messages ADD COLUMN conversation_id UUID REFERENCES copilot_conversations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation_id ON copilot_messages (conversation_id);
  END IF;
END $$;

ALTER TABLE copilot_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_own_conversations" ON copilot_conversations;
DROP POLICY IF EXISTS "users_insert_own_conversations" ON copilot_conversations;
DROP POLICY IF EXISTS "users_update_own_conversations" ON copilot_conversations;
DROP POLICY IF EXISTS "users_delete_own_conversations" ON copilot_conversations;
DROP POLICY IF EXISTS "service_role_all_conversations" ON copilot_conversations;
CREATE POLICY "users_select_own_conversations" ON copilot_conversations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = copilot_conversations.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_insert_own_conversations" ON copilot_conversations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = copilot_conversations.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_update_own_conversations" ON copilot_conversations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = copilot_conversations.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = copilot_conversations.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_delete_own_conversations" ON copilot_conversations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = copilot_conversations.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "service_role_all_conversations" ON copilot_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.copilot_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_copilot_message_inserted ON copilot_messages;
CREATE TRIGGER on_copilot_message_inserted
  AFTER INSERT ON copilot_messages FOR EACH ROW
  WHEN (NEW.conversation_id IS NOT NULL)
  EXECUTE FUNCTION update_conversation_timestamp();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. PROJECT ENHANCEMENTS
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE project_files DROP CONSTRAINT IF EXISTS project_files_role_check;
ALTER TABLE project_files ADD CONSTRAINT project_files_role_check
  CHECK (role IN ('base', 'revision', 'bq', 'contract', 'other'));

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
CREATE INDEX IF NOT EXISTS idx_analysis_results_project_id ON analysis_results (project_id);
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_crud_own_analysis" ON analysis_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = analysis_results.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = analysis_results.project_id AND projects.user_id = auth.uid()));

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. UNIT RATES
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS unit_rates (
  id            BIGSERIAL PRIMARY KEY,
  category      TEXT NOT NULL,
  item_code     TEXT,
  description   TEXT NOT NULL,
  description_cn TEXT,
  unit          TEXT NOT NULL,
  rate_myr      NUMERIC NOT NULL,
  region        TEXT NOT NULL DEFAULT 'national',
  rate_year     INT NOT NULL DEFAULT 2025,
  source        TEXT,
  min_rate      NUMERIC,
  max_rate      NUMERIC,
  notes         TEXT,
  verified      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unit_rates_category ON unit_rates (category);
ALTER TABLE unit_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_unit_rates" ON unit_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role_all_unit_rates" ON unit_rates FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO unit_rates (category, item_code, description, description_cn, unit, rate_myr, region, rate_year, source, min_rate, max_rate, verified) VALUES
  ('concrete', 'G.10', 'Grade 30 reinforced concrete (columns/beams)', '30级钢筋混凝土（柱/梁）', 'm3', 450, 'national', 2025, 'JKR_SOR_2024', 380, 520, true),
  ('concrete', 'G.10', 'Grade 30 reinforced concrete (slabs)', '30级钢筋混凝土（板）', 'm3', 420, 'national', 2025, 'JKR_SOR_2024', 360, 480, true),
  ('concrete', 'G.10', 'Grade 40 reinforced concrete', '40级钢筋混凝土', 'm3', 500, 'national', 2025, 'JKR_SOR_2024', 430, 570, true),
  ('reinforcement', 'F.10', 'High yield steel reinforcement (T10-T32)', '高强度钢筋（T10-T32）', 'kg', 4.20, 'national', 2025, 'JKR_SOR_2024', 3.80, 4.80, true),
  ('reinforcement', 'F.10', 'Mild steel reinforcement (R6-R10)', '普通钢筋（R6-R10）', 'kg', 4.50, 'national', 2025, 'JKR_SOR_2024', 4.00, 5.20, true),
  ('formwork', 'F.20', 'Formwork to columns (plywood)', '柱模板（胶合板）', 'm2', 55, 'national', 2025, 'JKR_SOR_2024', 45, 70, true),
  ('formwork', 'F.20', 'Formwork to slabs (plywood)', '板模板（胶合板）', 'm2', 42, 'national', 2025, 'JKR_SOR_2024', 35, 55, true),
  ('formwork', 'F.20', 'Formwork to beams (plywood)', '梁模板（胶合板）', 'm2', 60, 'national', 2025, 'JKR_SOR_2024', 48, 75, true),
  ('brickwork', 'H.10', 'Half brick wall (100mm clay brick)', '半砖墙（100mm红砖）', 'm2', 85, 'national', 2025, 'JKR_SOR_2024', 70, 100, true),
  ('brickwork', 'H.10', 'One brick wall (215mm clay brick)', '一砖墙（215mm红砖）', 'm2', 135, 'national', 2025, 'JKR_SOR_2024', 110, 160, true),
  ('plasterwork', 'M.10', 'Cement sand plaster (13mm to walls)', '水泥砂浆抹灰（13mm墙面）', 'm2', 18, 'national', 2025, 'JKR_SOR_2024', 14, 24, true),
  ('painting', 'N.10', 'Emulsion paint (2 coats to walls)', '乳胶漆（墙面2道）', 'm2', 12, 'national', 2025, 'JKR_SOR_2024', 8, 16, true),
  ('roofing', 'J.10', 'Concrete roof tiles on battens', '混凝土瓦片屋顶', 'm2', 95, 'national', 2025, 'JKR_SOR_2024', 75, 120, true),
  ('drainage', 'R.10', '150mm PVC pipe (underground)', '150mm PVC管（地下）', 'm', 45, 'national', 2025, 'JKR_SOR_2024', 35, 60, true),
  ('earthwork', 'D.10', 'Bulk excavation (max 1.5m deep)', '土方开挖（最深1.5m）', 'm3', 12, 'national', 2025, 'JKR_SOR_2024', 8, 18, true),
  ('earthwork', 'D.20', 'Backfilling with compaction', '回填压实', 'm3', 15, 'national', 2025, 'JKR_SOR_2024', 10, 22, true)
ON CONFLICT DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. BQ EMBEDDINGS (pgvector)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bq_embeddings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_reference TEXT NOT NULL,
  description  TEXT NOT NULL,
  unit         TEXT NOT NULL,
  contract_rate NUMERIC NOT NULL,
  embedding    vector(1024),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bq_embeddings_project_idx ON bq_embeddings(project_id);

ALTER TABLE bq_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_bq_embeddings" ON bq_embeddings FOR SELECT USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "users_insert_own_bq_embeddings" ON bq_embeddings FOR INSERT WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "users_delete_own_bq_embeddings" ON bq_embeddings FOR DELETE USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION match_bq_items(
  query_embedding vector(1024),
  match_project_id UUID,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 5
) RETURNS TABLE (
  id UUID, item_reference TEXT, description TEXT, unit TEXT, contract_rate NUMERIC, similarity FLOAT
) LANGUAGE sql STABLE AS $$
  SELECT bq.id, bq.item_reference, bq.description, bq.unit, bq.contract_rate,
         1 - (bq.embedding <=> query_embedding) AS similarity
  FROM bq_embeddings bq
  WHERE bq.project_id = match_project_id
    AND 1 - (bq.embedding <=> query_embedding) > match_threshold
  ORDER BY bq.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. FILE VERSIONS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS file_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      UUID NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
  version      INT NOT NULL DEFAULT 1,
  storage_path TEXT NOT NULL,
  file_size    BIGINT,
  checksum     TEXT,
  uploaded_by  UUID REFERENCES auth.users(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(file_id, version)
);
CREATE INDEX IF NOT EXISTS file_versions_file_idx ON file_versions(file_id);

ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_crud_own_file_versions" ON file_versions FOR ALL TO authenticated
  USING (file_id IN (SELECT pf.id FROM project_files pf JOIN projects p ON pf.project_id = p.id WHERE p.user_id = auth.uid()))
  WITH CHECK (file_id IN (SELECT pf.id FROM project_files pf JOIN projects p ON pf.project_id = p.id WHERE p.user_id = auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_files' AND column_name = 'current_version') THEN
    ALTER TABLE project_files ADD COLUMN current_version INT DEFAULT 1;
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. WEBHOOKS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS webhooks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  events       TEXT[] NOT NULL DEFAULT '{}',
  secret       TEXT,
  enabled      BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhooks_user_idx ON webhooks(user_id);
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_manage_own_webhooks" ON webhooks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id   UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  status_code  INT,
  response_body TEXT,
  delivered_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_idx ON webhook_deliveries(webhook_id);
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_deliveries" ON webhook_deliveries FOR SELECT TO authenticated
  USING (webhook_id IN (SELECT id FROM webhooks WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS notification_preferences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email_on_comparison BOOLEAN DEFAULT TRUE,
  email_on_report    BOOLEAN DEFAULT FALSE,
  email_on_threshold BOOLEAN DEFAULT TRUE,
  threshold_amount   NUMERIC DEFAULT 50000,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_manage_own_notif_prefs" ON notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. TRAINING DATA
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS training_samples (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  sample_type  TEXT NOT NULL CHECK (sample_type IN ('bq_mapping', 'classification', 'measurement', 'rate_validation', 'clause_assessment')),
  input_data   JSONB NOT NULL,
  output_data  JSONB NOT NULL,
  validated    BOOLEAN DEFAULT FALSE,
  quality_score FLOAT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_samples_type_idx ON training_samples(sample_type);
ALTER TABLE training_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_manage_own_training" ON training_samples FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. API KEYS
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{read}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_manage_own_api_keys" ON api_keys FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS api_usage_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id   UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  method       TEXT NOT NULL,
  status_code  INT NOT NULL,
  response_time_ms INT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_usage_key_idx ON api_usage_log(api_key_id);
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_api_usage" ON api_usage_log FOR SELECT TO authenticated
  USING (api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid()));

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═════════════════════════════════════════════════════════════════════════════
SELECT 'All agent migrations applied successfully' AS status,
  (SELECT count(*) FROM unit_rates) AS seed_rates,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
    'copilot_messages','copilot_memory','copilot_conversations',
    'analysis_results','unit_rates','bq_embeddings','file_versions',
    'webhooks','webhook_deliveries','notification_preferences',
    'training_samples','api_keys','api_usage_log'
  )) AS tables_created;
