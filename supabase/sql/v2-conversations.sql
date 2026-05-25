-- VO System V2 — Conversation Management Schema
-- Adds conversation grouping to copilot_messages.
-- Apply after v2-copilot-memory.sql

BEGIN;

-- ── 1. copilot_conversations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copilot_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New Conversation',
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE copilot_conversations IS 'Groups copilot messages into conversations per project. Users can have multiple conversations per project.';

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_project_id ON copilot_conversations (project_id);
CREATE INDEX IF NOT EXISTS idx_copilot_conversations_updated_at ON copilot_conversations (updated_at DESC);

-- ── 2. Add conversation_id to copilot_messages ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'copilot_messages' AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE copilot_messages
      ADD COLUMN conversation_id UUID REFERENCES copilot_conversations(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation_id ON copilot_messages (conversation_id);
  END IF;
END $$;

-- ── Row-Level Security for copilot_conversations ─────────────────────────────
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
CREATE POLICY "service_role_all_conversations" ON copilot_conversations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Auto-update updated_at trigger ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.copilot_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_copilot_message_inserted ON copilot_messages;
CREATE TRIGGER on_copilot_message_inserted
  AFTER INSERT ON copilot_messages
  FOR EACH ROW
  WHEN (NEW.conversation_id IS NOT NULL)
  EXECUTE FUNCTION update_conversation_timestamp();

COMMIT;

SELECT 'Conversations schema ready' AS status;
