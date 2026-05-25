-- VO System V2 — Project Management + VO History + Subscription Schema
-- Tables: projects, project_files, vo_comparisons, vo_exports, user_subscriptions
-- RLS: per-user policies (auth.uid()), service_role full access
-- Apply after stripe-webhook-prereqs.sql

BEGIN;

-- ── 1. projects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE projects IS 'User project containers. Each project holds one or more IFC files and their VO comparisons.';

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status  ON projects (status);

-- ── 2. project_files ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('base', 'revision')),
  storage_path  TEXT NOT NULL,
  file_size     BIGINT NOT NULL,
  element_count INT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE project_files IS 'IFC files uploaded to a project. role=base is the original; role=revision is the updated IFC.';

CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files (project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_role       ON project_files (role);

-- ── 3. vo_comparisons ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vo_comparisons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  base_file_id     UUID NOT NULL REFERENCES project_files(id),
  revision_file_id UUID NOT NULL REFERENCES project_files(id),
  summary_json     JSONB,
  results_json     JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE vo_comparisons IS 'Stored results of a VO diff run between a base and revision IFC file pair.';

CREATE INDEX IF NOT EXISTS idx_vo_comparisons_project_id ON vo_comparisons (project_id);
CREATE INDEX IF NOT EXISTS idx_vo_comparisons_created_at ON vo_comparisons (created_at DESC);

-- ── 4. vo_exports ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vo_exports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES vo_comparisons(id) ON DELETE CASCADE,
  format        TEXT NOT NULL CHECK (format IN ('excel', 'pdf')),
  storage_path  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE vo_exports IS 'Generated export files (Excel/PDF) for a VO comparison result.';

CREATE INDEX IF NOT EXISTS idx_vo_exports_comparison_id ON vo_exports (comparison_id);

-- ── 5. user_subscriptions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  plan                   TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_subscriptions IS 'One subscription row per user. Bootstrapped to free on signup; upgraded via Stripe webhooks.';

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan    ON user_subscriptions (plan);

-- ── Row-Level Security ─────────────────────────────────────────────────────────
-- projects: users own their own rows
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_projects"  ON projects;
DROP POLICY IF EXISTS "users_insert_own_projects"  ON projects;
DROP POLICY IF EXISTS "users_update_own_projects"  ON projects;
DROP POLICY IF EXISTS "users_delete_own_projects"  ON projects;
DROP POLICY IF EXISTS "service_role_all_projects"  ON projects;

CREATE POLICY "users_select_own_projects" ON projects FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "users_insert_own_projects" ON projects FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_update_own_projects" ON projects FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_delete_own_projects" ON projects FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "service_role_all_projects" ON projects FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- project_files: access via parent project ownership
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_project_files"  ON project_files;
DROP POLICY IF EXISTS "users_insert_own_project_files"  ON project_files;
DROP POLICY IF EXISTS "users_update_own_project_files"  ON project_files;
DROP POLICY IF EXISTS "users_delete_own_project_files"  ON project_files;
DROP POLICY IF EXISTS "service_role_all_project_files"  ON project_files;

CREATE POLICY "users_select_own_project_files" ON project_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_insert_own_project_files" ON project_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_update_own_project_files" ON project_files FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_delete_own_project_files" ON project_files FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "service_role_all_project_files" ON project_files FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- vo_comparisons: access via parent project ownership
ALTER TABLE vo_comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_vo_comparisons"  ON vo_comparisons;
DROP POLICY IF EXISTS "users_insert_own_vo_comparisons"  ON vo_comparisons;
DROP POLICY IF EXISTS "users_update_own_vo_comparisons"  ON vo_comparisons;
DROP POLICY IF EXISTS "users_delete_own_vo_comparisons"  ON vo_comparisons;
DROP POLICY IF EXISTS "service_role_all_vo_comparisons"  ON vo_comparisons;

CREATE POLICY "users_select_own_vo_comparisons" ON vo_comparisons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = vo_comparisons.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_insert_own_vo_comparisons" ON vo_comparisons FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = vo_comparisons.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_update_own_vo_comparisons" ON vo_comparisons FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = vo_comparisons.project_id AND projects.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = vo_comparisons.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "users_delete_own_vo_comparisons" ON vo_comparisons FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = vo_comparisons.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "service_role_all_vo_comparisons" ON vo_comparisons FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- vo_exports: access via comparison → project ownership
ALTER TABLE vo_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_vo_exports"  ON vo_exports;
DROP POLICY IF EXISTS "users_insert_own_vo_exports"  ON vo_exports;
DROP POLICY IF EXISTS "users_update_own_vo_exports"  ON vo_exports;
DROP POLICY IF EXISTS "users_delete_own_vo_exports"  ON vo_exports;
DROP POLICY IF EXISTS "service_role_all_vo_exports"  ON vo_exports;

CREATE POLICY "users_select_own_vo_exports" ON vo_exports FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vo_comparisons
    JOIN projects ON projects.id = vo_comparisons.project_id
    WHERE vo_comparisons.id = vo_exports.comparison_id
      AND projects.user_id = auth.uid()
  ));
CREATE POLICY "users_insert_own_vo_exports" ON vo_exports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM vo_comparisons
    JOIN projects ON projects.id = vo_comparisons.project_id
    WHERE vo_comparisons.id = vo_exports.comparison_id
      AND projects.user_id = auth.uid()
  ));
CREATE POLICY "users_update_own_vo_exports" ON vo_exports FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vo_comparisons
    JOIN projects ON projects.id = vo_comparisons.project_id
    WHERE vo_comparisons.id = vo_exports.comparison_id
      AND projects.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM vo_comparisons
    JOIN projects ON projects.id = vo_comparisons.project_id
    WHERE vo_comparisons.id = vo_exports.comparison_id
      AND projects.user_id = auth.uid()
  ));
CREATE POLICY "users_delete_own_vo_exports" ON vo_exports FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM vo_comparisons
    JOIN projects ON projects.id = vo_comparisons.project_id
    WHERE vo_comparisons.id = vo_exports.comparison_id
      AND projects.user_id = auth.uid()
  ));
CREATE POLICY "service_role_all_vo_exports" ON vo_exports FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- user_subscriptions: billing-owned data; users may only read their row
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_subscription"  ON user_subscriptions;
DROP POLICY IF EXISTS "users_insert_own_subscription"  ON user_subscriptions;
DROP POLICY IF EXISTS "users_update_own_subscription"  ON user_subscriptions;
DROP POLICY IF EXISTS "users_delete_own_subscription"  ON user_subscriptions;
DROP POLICY IF EXISTS "service_role_all_subscriptions" ON user_subscriptions;

CREATE POLICY "users_select_own_subscription" ON user_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "service_role_all_subscriptions" ON user_subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Trigger: auto-create free subscription on new user signup ──────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan)
  VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

COMMIT;

-- Verify
SELECT 'V2 schema ready: ' || count(*) || ' tables created' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('projects', 'project_files', 'vo_comparisons', 'vo_exports', 'user_subscriptions');
