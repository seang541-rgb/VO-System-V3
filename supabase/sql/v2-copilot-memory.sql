-- VO System V2 — Copilot Long-Term Memory Schema
-- Tables: copilot_messages (per-project chat history), copilot_memory (per-user knowledge)
-- Apply after v2-schema.sql

BEGIN;

-- ── 1. copilot_messages ── per-project conversation history ───────────────────
CREATE TABLE IF NOT EXISTS copilot_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content     TEXT,
  tool_calls  JSONB,
  tool_call_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE copilot_messages IS 'Persisted Copilot chat messages per project. Restored when user re-opens a project.';

CREATE INDEX IF NOT EXISTS idx_copilot_messages_project_id ON copilot_messages (project_id);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_created_at ON copilot_messages (created_at);

-- ── 2. copilot_memory ── per-user cross-project knowledge ─────────────────────
CREATE TABLE IF NOT EXISTS copilot_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'preference', 'project_insight', 'domain_knowledge')),
  content     TEXT NOT NULL,
  source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE copilot_memory IS 'Cross-project knowledge memories extracted by Copilot. Injected into system prompt for personalization.';

CREATE INDEX IF NOT EXISTS idx_copilot_memory_user_id  ON copilot_memory (user_id);
CREATE INDEX IF NOT EXISTS idx_copilot_memory_category ON copilot_memory (category);

-- ── Row-Level Security ────────────────────────────────────────────────────────

-- copilot_messages: access via parent project ownership
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

-- copilot_memory: each user owns their memories
ALTER TABLE copilot_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_copilot_memory" ON copilot_memory;
DROP POLICY IF EXISTS "users_insert_own_copilot_memory" ON copilot_memory;
DROP POLICY IF EXISTS "users_update_own_copilot_memory" ON copilot_memory;
DROP POLICY IF EXISTS "users_delete_own_copilot_memory" ON copilot_memory;
DROP POLICY IF EXISTS "service_role_all_copilot_memory" ON copilot_memory;

CREATE POLICY "users_select_own_copilot_memory" ON copilot_memory FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "users_insert_own_copilot_memory" ON copilot_memory FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_update_own_copilot_memory" ON copilot_memory FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_delete_own_copilot_memory" ON copilot_memory FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "service_role_all_copilot_memory" ON copilot_memory FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

SELECT 'Copilot memory schema ready' AS status;
