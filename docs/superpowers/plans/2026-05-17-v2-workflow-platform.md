# V2 Workflow-First VO Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform V1 (one-shot demo) into a daily-use VO management platform with project persistence, VO history, subscription billing, and multi-language support.

**Architecture:** Add React Router for page navigation. Split the monolithic `App.tsx` into route-based pages (`DashboardPage`, `ProjectWorkspace`, `SettingsPage`) sharing a common `AppLayout`. All project/file/VO data persists in Supabase (new tables + Storage). Billing moves from one-time credits to Stripe subscriptions. UI strings wrapped with react-i18next for zh/en/ms.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS 4, Vite 6, React Router v7, react-i18next, Supabase (Postgres + Storage + Edge Functions), Stripe Subscriptions, Vitest.

**Existing conventions (from CLAUDE.md):**
- Dark theme: slate-900 bg, slate-800 cards, blue-600 accent
- No `any` types — use `unknown` + instanceof
- React 19 class component cast pattern for ErrorBoundary
- `npm run test` = vitest, `npm run lint` = tsc --noEmit
- Do not modify auth/AuthProvider.tsx without explicit permission

---

## File Structure

### New Files

```
src/
  router.tsx                          — React Router config (BrowserRouter + routes)
  layouts/
    AppLayout.tsx                     — Shared shell: header + sidebar slot + main content
  pages/
    DashboardPage.tsx                 — Project list + quick stats + create project modal
    ProjectWorkspace.tsx              — Evolved from App.tsx: project-scoped VO workspace
    SettingsPage.tsx                  — Account, subscription, language, usage stats
  hooks/
    useProjects.ts                    — Project CRUD (list, create, update, archive)
    useProjectFiles.ts                — File upload to Supabase Storage + metadata CRUD
    useVOHistory.ts                   — VO comparison history (list, save, load)
    useSubscription.ts                — Subscription status + plan limits
  lib/
    storage.ts                        — Supabase Storage upload/download/delete helpers
    i18n.ts                           — i18next initialization + language detector
    plan-limits.ts                    — Plan limit constants + enforcement helpers
  locales/
    zh/translation.json               — Chinese translations (default)
    en/translation.json               — English translations
    ms/translation.json               — Malay translations
  components/
    CreateProjectModal.tsx            — New project form modal
    ProjectCard.tsx                   — Dashboard project card
    ProjectSidebar.tsx                — Project workspace sidebar (files + VO history)
    LanguageSwitcher.tsx              — Language dropdown (zh/en/ms)
    PlanBadge.tsx                     — Subscription plan badge (Free/Pro/Enterprise)
    UpgradePrompt.tsx                 — Plan limit reached prompt (replaces V1 paywall)
supabase/
  sql/
    v2-schema.sql                     — All V2 tables + RLS + indexes
  functions/
    create-subscription/index.ts      — Stripe subscription checkout session
```

### Modified Files

```
src/main.tsx                          — Wrap App with BrowserRouter + i18n provider
src/components/AppHeader.tsx          — Add breadcrumb, plan badge, language switcher
src/components/AppSidebar.tsx         — Minor: only used in ProjectWorkspace now
src/hooks/useCredits.ts              — Minor: add monthly reset awareness
package.json                          — Add react-router-dom, react-i18next, i18next
```

### Unchanged (core engines)

```
src/BimEngine.ts, src/vo-diff-core.ts, src/vo-report.ts
src/audit/*, src/agent/*, src/bq-tools.ts, src/qs-*.ts
src/ifc-step-fallback.ts, src/constants.ts
src/lib/supabase.ts, src/auth/AuthProvider.tsx
src/components/ModelViewer.tsx, src/components/ResultsTable.tsx
src/components/KPIGrid.tsx, src/components/CopilotPanel.tsx
src/components/AuditPanel.tsx, src/components/BQMappingPanel.tsx
src/components/ErrorBoundary.tsx, src/components/ViewerErrorBoundary.tsx
src/components/AuthGuard.tsx
```

---

## Task 1: Install Dependencies + V2 Database Schema

**Files:**
- Modify: `package.json`
- Create: `supabase/sql/v2-schema.sql`

- [ ] **Step 1: Install new npm dependencies**

```bash
cd "D:\VO system"
npm install react-router-dom@^7 react-i18next@^15 i18next@^25 i18next-browser-languagedetector@^8
```

Verify in `package.json` that these 4 packages appear under `dependencies`.

- [ ] **Step 2: Run type check to confirm no conflicts**

```bash
npm run lint
```

Expected: no new errors (existing 0 errors should stay 0).

- [ ] **Step 3: Create V2 database schema SQL**

Create `supabase/sql/v2-schema.sql`:

```sql
-- V2 Schema: Projects, Files, VO History, Exports, Subscriptions
-- Apply via Supabase SQL Editor after V1 tables are set up.
-- Requires: auth.users table (Supabase Auth), pgcrypto extension.

BEGIN;

-- ── 1. Projects ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.projects IS 'User projects. Each project groups IFC files and VO comparisons.';

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects (status);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_own ON public.projects
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY projects_insert_own ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_update_own ON public.projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_delete_own ON public.projects
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY projects_service_role ON public.projects
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 2. Project Files (IFC uploads) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  role text NOT NULL CHECK (role IN ('base', 'revision')),
  storage_path text NOT NULL,
  file_size bigint NOT NULL,
  element_count int,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_files IS 'IFC files uploaded to a project. Stored in Supabase Storage bucket "project-files".';

CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON public.project_files (project_id);

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_files_select_own ON public.project_files
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY project_files_insert_own ON public.project_files
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY project_files_delete_own ON public.project_files
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY project_files_service_role ON public.project_files
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. VO Comparisons ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vo_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  base_file_id uuid NOT NULL REFERENCES public.project_files(id),
  revision_file_id uuid NOT NULL REFERENCES public.project_files(id),
  summary_json jsonb NOT NULL,
  results_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vo_comparisons IS 'Saved VO comparison results. summary_json has counts, results_json has the full diff array.';

CREATE INDEX IF NOT EXISTS idx_vo_comparisons_project_id ON public.vo_comparisons (project_id);

ALTER TABLE public.vo_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY vo_comparisons_select_own ON public.vo_comparisons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY vo_comparisons_insert_own ON public.vo_comparisons
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY vo_comparisons_delete_own ON public.vo_comparisons
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()
  ));

CREATE POLICY vo_comparisons_service_role ON public.vo_comparisons
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4. VO Exports ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vo_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id uuid NOT NULL REFERENCES public.vo_comparisons(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('excel', 'pdf')),
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vo_exports IS 'Exported VO reports (Excel/PDF) stored in Supabase Storage bucket "exports".';

CREATE INDEX IF NOT EXISTS idx_vo_exports_comparison_id ON public.vo_exports (comparison_id);

ALTER TABLE public.vo_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY vo_exports_select_own ON public.vo_exports
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vo_comparisons vc
    JOIN public.projects p ON p.id = vc.project_id
    WHERE vc.id = comparison_id AND p.user_id = auth.uid()
  ));

CREATE POLICY vo_exports_insert_own ON public.vo_exports
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vo_comparisons vc
    JOIN public.projects p ON p.id = vc.project_id
    WHERE vc.id = comparison_id AND p.user_id = auth.uid()
  ));

CREATE POLICY vo_exports_service_role ON public.vo_exports
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 5. User Subscriptions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_subscriptions IS 'User subscription plan. Synced via Stripe webhook.';

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions (user_id);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_subscriptions_select_own ON public.user_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_subscriptions_insert_own ON public.user_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_subscriptions_update_own ON public.user_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_subscriptions_service_role ON public.user_subscriptions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 6. Trigger: auto-create subscription row for new users ──────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
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
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();

COMMIT;
```

- [ ] **Step 4: Run existing tests to verify nothing broke**

```bash
npm run test
```

Expected: 148 tests pass (schema SQL is not executed locally, so no runtime impact).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json supabase/sql/v2-schema.sql
git commit -m "feat(v2): install react-router, i18next deps + V2 database schema SQL"
```

---

## Task 2: i18n Setup + Translation Files

**Files:**
- Create: `src/lib/i18n.ts`
- Create: `src/locales/zh/translation.json`
- Create: `src/locales/en/translation.json`
- Create: `src/locales/ms/translation.json`

- [ ] **Step 1: Create i18next configuration**

Create `src/lib/i18n.ts`:

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zh from '../locales/zh/translation.json';
import en from '../locales/en/translation.json';
import ms from '../locales/ms/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
      ms: { translation: ms },
    },
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'vo-system-language',
      caches: ['localStorage'],
    },
  });

export default i18n;
```

- [ ] **Step 2: Create Chinese translation file (default)**

Create `src/locales/zh/translation.json`:

```json
{
  "app": {
    "name": "Idea Nest · VO Copilot",
    "tagline": "变更单与合约索赔智能体"
  },
  "nav": {
    "dashboard": "项目",
    "settings": "设置",
    "signOut": "退出"
  },
  "dashboard": {
    "title": "我的项目",
    "newProject": "新建项目",
    "noProjects": "还没有项目，点击上方按钮创建第一个。",
    "activeProjects": "活跃项目",
    "comparisonsThisMonth": "本月对比",
    "lastComparison": "最后对比",
    "files": "文件",
    "archived": "已归档"
  },
  "project": {
    "createTitle": "新建项目",
    "name": "项目名称",
    "namePlaceholder": "例：KL Tower Phase 2",
    "description": "描述（可选）",
    "descriptionPlaceholder": "项目简要说明",
    "create": "创建",
    "cancel": "取消",
    "archive": "归档",
    "delete": "删除"
  },
  "workspace": {
    "files": "项目文件",
    "uploadIfc": "上传 IFC",
    "voHistory": "VO 对比历史",
    "noHistory": "暂无对比记录",
    "base": "Base IFC",
    "revision": "Revision IFC",
    "runCompare": "运行 VO 对比",
    "runAudit": "快速算量",
    "exportExcel": "导出 Excel",
    "exportPdf": "导出 PDF",
    "bqTemplate": "BQ 模板"
  },
  "copilot": {
    "title": "IFC Copilot",
    "thinking": "Copilot 正在思考…",
    "toolRunning": "工具调用中，请稍候",
    "analyzing": "分析你的问题并准备回复",
    "send": "发送",
    "reset": "重置",
    "placeholder": "输入问题或指令… (Enter 发送, Shift+Enter 换行)",
    "loginRequired": "请先登录",
    "creditNote": "每次对话消耗 1 个 credit（与 Excel 导出共用同一余额）。"
  },
  "settings": {
    "title": "设置",
    "account": "账户信息",
    "email": "邮箱",
    "subscription": "订阅计划",
    "currentPlan": "当前计划",
    "upgrade": "升级",
    "managePlan": "管理订阅",
    "language": "语言",
    "usage": "使用统计",
    "comparisonsThisMonth": "本月对比次数",
    "storageUsed": "已用存储"
  },
  "plans": {
    "free": "免费版",
    "pro": "专业版",
    "enterprise": "企业版",
    "perMonth": "/月"
  },
  "common": {
    "loading": "加载中…",
    "save": "保存",
    "cancel": "取消",
    "confirm": "确认",
    "error": "出错了",
    "retry": "重试",
    "back": "返回",
    "components": "构件",
    "ready": "就绪",
    "pending": "等待中",
    "parsing": "解析中",
    "noData": "暂无数据"
  },
  "status": {
    "baseIfc": "Base IFC",
    "revisionIfc": "Revision IFC",
    "comparison": "对比"
  },
  "audit": {
    "title": "审计报告",
    "running": "审计中…",
    "complete": "审计完成",
    "failed": "审计失败"
  },
  "billing": {
    "credits": "Credits",
    "noCredits": "额度已用完，请充值。",
    "topUp": "充值 50 Credits - RM 499"
  },
  "toast": {
    "projectCreated": "项目已创建",
    "projectArchived": "项目已归档",
    "fileUploaded": "文件上传成功",
    "comparisonSaved": "对比结果已保存",
    "exportComplete": "导出完成",
    "voComplete": "VO 对比完成",
    "auditComplete": "算量完成",
    "error": "操作失败"
  }
}
```

- [ ] **Step 3: Create English translation file**

Create `src/locales/en/translation.json`:

```json
{
  "app": {
    "name": "Idea Nest · VO Copilot",
    "tagline": "Variation Order & Contract Claim Intelligence"
  },
  "nav": {
    "dashboard": "Projects",
    "settings": "Settings",
    "signOut": "Sign Out"
  },
  "dashboard": {
    "title": "My Projects",
    "newProject": "New Project",
    "noProjects": "No projects yet. Click the button above to create your first one.",
    "activeProjects": "Active Projects",
    "comparisonsThisMonth": "Comparisons This Month",
    "lastComparison": "Last Comparison",
    "files": "files",
    "archived": "Archived"
  },
  "project": {
    "createTitle": "Create Project",
    "name": "Project Name",
    "namePlaceholder": "e.g. KL Tower Phase 2",
    "description": "Description (optional)",
    "descriptionPlaceholder": "Brief project description",
    "create": "Create",
    "cancel": "Cancel",
    "archive": "Archive",
    "delete": "Delete"
  },
  "workspace": {
    "files": "Project Files",
    "uploadIfc": "Upload IFC",
    "voHistory": "VO Comparison History",
    "noHistory": "No comparisons yet",
    "base": "Base IFC",
    "revision": "Revision IFC",
    "runCompare": "Run VO Comparison",
    "runAudit": "Quick Audit",
    "exportExcel": "Export Excel",
    "exportPdf": "Export PDF",
    "bqTemplate": "BQ Template"
  },
  "copilot": {
    "title": "IFC Copilot",
    "thinking": "Copilot is thinking…",
    "toolRunning": "Running tool, please wait",
    "analyzing": "Analyzing your question",
    "send": "Send",
    "reset": "Reset",
    "placeholder": "Type a question or command… (Enter to send, Shift+Enter for new line)",
    "loginRequired": "Please sign in first",
    "creditNote": "Each conversation costs 1 credit (shared with Excel export)."
  },
  "settings": {
    "title": "Settings",
    "account": "Account",
    "email": "Email",
    "subscription": "Subscription",
    "currentPlan": "Current Plan",
    "upgrade": "Upgrade",
    "managePlan": "Manage Subscription",
    "language": "Language",
    "usage": "Usage",
    "comparisonsThisMonth": "Comparisons this month",
    "storageUsed": "Storage used"
  },
  "plans": {
    "free": "Free",
    "pro": "Pro",
    "enterprise": "Enterprise",
    "perMonth": "/mo"
  },
  "common": {
    "loading": "Loading…",
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "error": "Something went wrong",
    "retry": "Retry",
    "back": "Back",
    "components": "components",
    "ready": "Ready",
    "pending": "Pending",
    "parsing": "Parsing",
    "noData": "No data"
  },
  "status": {
    "baseIfc": "Base IFC",
    "revisionIfc": "Revision IFC",
    "comparison": "Comparison"
  },
  "audit": {
    "title": "Audit Report",
    "running": "Auditing…",
    "complete": "Audit Complete",
    "failed": "Audit Failed"
  },
  "billing": {
    "credits": "Credits",
    "noCredits": "No credits remaining. Please top up.",
    "topUp": "Top Up 50 Credits - RM 499"
  },
  "toast": {
    "projectCreated": "Project created",
    "projectArchived": "Project archived",
    "fileUploaded": "File uploaded successfully",
    "comparisonSaved": "Comparison saved",
    "exportComplete": "Export complete",
    "voComplete": "VO comparison complete",
    "auditComplete": "Audit complete",
    "error": "Operation failed"
  }
}
```

- [ ] **Step 4: Create Malay translation file**

Create `src/locales/ms/translation.json`:

```json
{
  "app": {
    "name": "Idea Nest · VO Copilot",
    "tagline": "Perintah Variasi & Perisikan Tuntutan Kontrak"
  },
  "nav": {
    "dashboard": "Projek",
    "settings": "Tetapan",
    "signOut": "Log Keluar"
  },
  "dashboard": {
    "title": "Projek Saya",
    "newProject": "Projek Baharu",
    "noProjects": "Tiada projek lagi. Klik butang di atas untuk mencipta projek pertama.",
    "activeProjects": "Projek Aktif",
    "comparisonsThisMonth": "Perbandingan Bulan Ini",
    "lastComparison": "Perbandingan Terakhir",
    "files": "fail",
    "archived": "Diarkibkan"
  },
  "project": {
    "createTitle": "Cipta Projek",
    "name": "Nama Projek",
    "namePlaceholder": "cth. KL Tower Phase 2",
    "description": "Penerangan (pilihan)",
    "descriptionPlaceholder": "Penerangan ringkas projek",
    "create": "Cipta",
    "cancel": "Batal",
    "archive": "Arkib",
    "delete": "Padam"
  },
  "workspace": {
    "files": "Fail Projek",
    "uploadIfc": "Muat Naik IFC",
    "voHistory": "Sejarah Perbandingan VO",
    "noHistory": "Tiada perbandingan lagi",
    "base": "IFC Asas",
    "revision": "IFC Semakan",
    "runCompare": "Jalankan Perbandingan VO",
    "runAudit": "Audit Pantas",
    "exportExcel": "Eksport Excel",
    "exportPdf": "Eksport PDF",
    "bqTemplate": "Templat BQ"
  },
  "copilot": {
    "title": "IFC Copilot",
    "thinking": "Copilot sedang berfikir…",
    "toolRunning": "Menjalankan alat, sila tunggu",
    "analyzing": "Menganalisis soalan anda",
    "send": "Hantar",
    "reset": "Set Semula",
    "placeholder": "Taip soalan atau arahan… (Enter untuk hantar, Shift+Enter baris baharu)",
    "loginRequired": "Sila log masuk dahulu",
    "creditNote": "Setiap perbualan menggunakan 1 kredit (dikongsi dengan eksport Excel)."
  },
  "settings": {
    "title": "Tetapan",
    "account": "Akaun",
    "email": "Emel",
    "subscription": "Langganan",
    "currentPlan": "Pelan Semasa",
    "upgrade": "Naik Taraf",
    "managePlan": "Urus Langganan",
    "language": "Bahasa",
    "usage": "Penggunaan",
    "comparisonsThisMonth": "Perbandingan bulan ini",
    "storageUsed": "Storan digunakan"
  },
  "plans": {
    "free": "Percuma",
    "pro": "Pro",
    "enterprise": "Perusahaan",
    "perMonth": "/bulan"
  },
  "common": {
    "loading": "Memuatkan…",
    "save": "Simpan",
    "cancel": "Batal",
    "confirm": "Sahkan",
    "error": "Sesuatu tidak kena",
    "retry": "Cuba Lagi",
    "back": "Kembali",
    "components": "komponen",
    "ready": "Sedia",
    "pending": "Menunggu",
    "parsing": "Mengurai",
    "noData": "Tiada data"
  },
  "status": {
    "baseIfc": "IFC Asas",
    "revisionIfc": "IFC Semakan",
    "comparison": "Perbandingan"
  },
  "audit": {
    "title": "Laporan Audit",
    "running": "Mengaudit…",
    "complete": "Audit Selesai",
    "failed": "Audit Gagal"
  },
  "billing": {
    "credits": "Kredit",
    "noCredits": "Tiada kredit lagi. Sila tambah nilai.",
    "topUp": "Tambah 50 Kredit - RM 499"
  },
  "toast": {
    "projectCreated": "Projek dicipta",
    "projectArchived": "Projek diarkibkan",
    "fileUploaded": "Fail berjaya dimuat naik",
    "comparisonSaved": "Perbandingan disimpan",
    "exportComplete": "Eksport selesai",
    "voComplete": "Perbandingan VO selesai",
    "auditComplete": "Audit selesai",
    "error": "Operasi gagal"
  }
}
```

- [ ] **Step 5: Run type check**

```bash
npm run lint
```

Expected: 0 errors. The i18n module is imported but not yet used — no compilation errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n.ts src/locales/
git commit -m "feat(v2): add i18n setup with zh/en/ms translation files"
```

---

## Task 3: Plan Limits + Supabase Storage Helpers

**Files:**
- Create: `src/lib/plan-limits.ts`
- Create: `src/lib/storage.ts`

- [ ] **Step 1: Create plan limits module**

Create `src/lib/plan-limits.ts`:

```typescript
export type PlanName = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  maxProjects: number;
  maxComparisonsPerMonth: number;
  maxCopilotPerMonth: number;
  maxStorageBytes: number;
  allowPdfExport: boolean;
}

const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxProjects: 3,
    maxComparisonsPerMonth: 5,
    maxCopilotPerMonth: 5,
    maxStorageBytes: 500 * 1024 * 1024, // 500 MB
    allowPdfExport: false,
  },
  pro: {
    maxProjects: Infinity,
    maxComparisonsPerMonth: Infinity,
    maxCopilotPerMonth: 100,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    allowPdfExport: true,
  },
  enterprise: {
    maxProjects: Infinity,
    maxComparisonsPerMonth: Infinity,
    maxCopilotPerMonth: Infinity,
    maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
    allowPdfExport: true,
  },
};

export function getPlanLimits(plan: PlanName): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function canCreateProject(plan: PlanName, currentCount: number): boolean {
  const limits = getPlanLimits(plan);
  return currentCount < limits.maxProjects;
}

export function canRunComparison(plan: PlanName, monthlyCount: number): boolean {
  const limits = getPlanLimits(plan);
  return monthlyCount < limits.maxComparisonsPerMonth;
}

export function canUseCopilot(plan: PlanName, monthlyCount: number): boolean {
  const limits = getPlanLimits(plan);
  return monthlyCount < limits.maxCopilotPerMonth;
}

export function canUploadFile(plan: PlanName, currentStorageBytes: number, newFileBytes: number): boolean {
  const limits = getPlanLimits(plan);
  return (currentStorageBytes + newFileBytes) <= limits.maxStorageBytes;
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
```

- [ ] **Step 2: Create Supabase Storage helpers**

Create `src/lib/storage.ts`:

```typescript
import { supabase } from './supabase';

const PROJECT_FILES_BUCKET = 'project-files';
const EXPORTS_BUCKET = 'exports';
const MAX_IFC_SIZE = 100 * 1024 * 1024; // 100 MB

export interface UploadResult {
  storagePath: string;
  fileSize: number;
}

export async function uploadProjectFile(
  userId: string,
  projectId: string,
  fileId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_IFC_SIZE) {
    throw new Error(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 100 MB.`);
  }

  const storagePath = `${userId}/${projectId}/${fileId}.ifc`;

  const { error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return { storagePath, fileSize: file.size };
}

export async function downloadProjectFile(storagePath: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Download failed: ${error?.message ?? 'No data returned'}`);
  }

  return data.arrayBuffer();
}

export async function deleteProjectFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

export async function uploadExport(
  userId: string,
  projectId: string,
  exportId: string,
  blob: Blob,
  format: 'xlsx' | 'pdf',
): Promise<string> {
  const storagePath = `${userId}/${projectId}/${exportId}.${format}`;

  const { error } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .upload(storagePath, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf',
    });

  if (error) {
    throw new Error(`Export upload failed: ${error.message}`);
  }

  return storagePath;
}

export async function getExportDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate download URL: ${error?.message ?? 'Unknown error'}`);
  }

  return data.signedUrl;
}

export async function getUserStorageUsage(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('project_files')
    .select('file_size')
    .eq('project_id', supabase.from('projects').select('id').eq('user_id', userId));

  if (error) {
    // Fallback: query through projects join
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId);

    if (!projects || projects.length === 0) return 0;

    const projectIds = projects.map((p) => p.id);
    const { data: files } = await supabase
      .from('project_files')
      .select('file_size')
      .in('project_id', projectIds);

    if (!files) return 0;
    return files.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
  }

  if (!data) return 0;
  return data.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
}
```

- [ ] **Step 3: Run type check**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/plan-limits.ts src/lib/storage.ts
git commit -m "feat(v2): add plan limits module and Supabase Storage helpers"
```

---

## Task 4: Data Hooks — useProjects, useProjectFiles, useVOHistory, useSubscription

**Files:**
- Create: `src/hooks/useProjects.ts`
- Create: `src/hooks/useProjectFiles.ts`
- Create: `src/hooks/useVOHistory.ts`
- Create: `src/hooks/useSubscription.ts`

- [ ] **Step 1: Create useProjects hook**

Create `src/hooks/useProjects.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  file_count?: number;
  last_comparison_at?: string | null;
}

export function useProjects(userId?: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setProjects([]);
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setProjects(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createProject = useCallback(async (name: string, description?: string): Promise<Project | null> => {
    if (!userId) return null;

    const { data, error: insertError } = await supabase
      .from('projects')
      .insert({ user_id: userId, name, description: description || null })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return null;
    }

    setProjects((prev) => [data, ...prev]);
    return data;
  }, [userId]);

  const archiveProject = useCallback(async (projectId: string): Promise<boolean> => {
    const { error: updateError } = await supabase
      .from('projects')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    if (updateError) {
      setError(updateError.message);
      return false;
    }

    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, status: 'archived' as const } : p)),
    );
    return true;
  }, []);

  const activeProjects = projects.filter((p) => p.status === 'active');
  const archivedProjects = projects.filter((p) => p.status === 'archived');

  return {
    projects,
    activeProjects,
    archivedProjects,
    loading,
    error,
    refresh,
    createProject,
    archiveProject,
  };
}
```

- [ ] **Step 2: Create useProjectFiles hook**

Create `src/hooks/useProjectFiles.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadProjectFile, deleteProjectFile as deleteStorageFile } from '../lib/storage';

export interface ProjectFile {
  id: string;
  project_id: string;
  label: string;
  role: 'base' | 'revision';
  storage_path: string;
  file_size: number;
  element_count: number | null;
  uploaded_at: string;
}

export function useProjectFiles(projectId?: string) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!projectId) {
      setFiles([]);
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setFiles(data ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(async (
    userId: string,
    file: File,
    label: string,
    role: 'base' | 'revision',
    elementCount?: number,
  ): Promise<ProjectFile | null> => {
    if (!projectId) return null;

    setError('');
    const fileId = crypto.randomUUID();

    try {
      const { storagePath, fileSize } = await uploadProjectFile(userId, projectId, fileId, file);

      const { data, error: insertError } = await supabase
        .from('project_files')
        .insert({
          id: fileId,
          project_id: projectId,
          label,
          role,
          storage_path: storagePath,
          file_size: fileSize,
          element_count: elementCount ?? null,
        })
        .select()
        .single();

      if (insertError) {
        // Cleanup storage on DB insert failure
        await deleteStorageFile(storagePath).catch(() => {});
        setError(insertError.message);
        return null;
      }

      setFiles((prev) => [data, ...prev]);
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      return null;
    }
  }, [projectId]);

  const deleteFile = useCallback(async (fileId: string): Promise<boolean> => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return false;

    const { error: deleteError } = await supabase
      .from('project_files')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      setError(deleteError.message);
      return false;
    }

    await deleteStorageFile(file.storage_path).catch(() => {});
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    return true;
  }, [files]);

  const baseFiles = files.filter((f) => f.role === 'base');
  const revisionFiles = files.filter((f) => f.role === 'revision');

  return {
    files,
    baseFiles,
    revisionFiles,
    loading,
    error,
    refresh,
    upload,
    deleteFile,
  };
}
```

- [ ] **Step 3: Create useVOHistory hook**

Create `src/hooks/useVOHistory.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface VOComparison {
  id: string;
  project_id: string;
  base_file_id: string;
  revision_file_id: string;
  summary_json: {
    added: number;
    deleted: number;
    modified: number;
    totalChanges: number;
    netValue?: number;
  };
  results_json: unknown;
  created_at: string;
}

export function useVOHistory(projectId?: string) {
  const [comparisons, setComparisons] = useState<VOComparison[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!projectId) {
      setComparisons([]);
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('vo_comparisons')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setComparisons(data ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveComparison = useCallback(async (
    baseFileId: string,
    revisionFileId: string,
    summaryJson: VOComparison['summary_json'],
    resultsJson: unknown,
  ): Promise<VOComparison | null> => {
    if (!projectId) return null;

    const { data, error: insertError } = await supabase
      .from('vo_comparisons')
      .insert({
        project_id: projectId,
        base_file_id: baseFileId,
        revision_file_id: revisionFileId,
        summary_json: summaryJson,
        results_json: resultsJson,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return null;
    }

    setComparisons((prev) => [data, ...prev]);
    return data;
  }, [projectId]);

  const deleteComparison = useCallback(async (comparisonId: string): Promise<boolean> => {
    const { error: deleteError } = await supabase
      .from('vo_comparisons')
      .delete()
      .eq('id', comparisonId);

    if (deleteError) {
      setError(deleteError.message);
      return false;
    }

    setComparisons((prev) => prev.filter((c) => c.id !== comparisonId));
    return true;
  }, []);

  return {
    comparisons,
    loading,
    error,
    refresh,
    saveComparison,
    deleteComparison,
  };
}
```

- [ ] **Step 4: Create useSubscription hook**

Create `src/hooks/useSubscription.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { PlanName } from '../lib/plan-limits';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: PlanName;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export function useSubscription(userId?: string) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setSubscription(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const plan: PlanName = subscription?.plan ?? 'free';
  const isActive = subscription?.current_period_end
    ? new Date(subscription.current_period_end) > new Date()
    : plan === 'free';

  return {
    subscription,
    plan,
    isActive,
    loading,
    error,
    refresh,
  };
}
```

- [ ] **Step 5: Run type check**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useProjects.ts src/hooks/useProjectFiles.ts src/hooks/useVOHistory.ts src/hooks/useSubscription.ts
git commit -m "feat(v2): add data hooks for projects, files, VO history, subscription"
```

---

## Task 5: React Router + AppLayout + Updated main.tsx

**Files:**
- Create: `src/router.tsx`
- Create: `src/layouts/AppLayout.tsx`
- Create: `src/components/LanguageSwitcher.tsx`
- Create: `src/components/PlanBadge.tsx`
- Modify: `src/main.tsx`
- Modify: `src/components/AppHeader.tsx`

- [ ] **Step 1: Create LanguageSwitcher component**

Create `src/components/LanguageSwitcher.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ms', label: 'Bahasa Melayu' },
] as const;

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <Globe className="h-3.5 w-3.5 text-slate-400" />
      <select
        value={i18n.language}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="appearance-none rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:border-slate-600 focus:border-blue-600/60 focus:outline-none"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Create PlanBadge component**

Create `src/components/PlanBadge.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import type { PlanName } from '../lib/plan-limits';

interface PlanBadgeProps {
  plan: PlanName;
}

const PLAN_STYLES: Record<PlanName, string> = {
  free: 'border-slate-600 bg-slate-800 text-slate-300',
  pro: 'border-blue-500/30 bg-blue-600/10 text-blue-300',
  enterprise: 'border-amber-500/30 bg-amber-600/10 text-amber-300',
};

export default function PlanBadge({ plan }: PlanBadgeProps) {
  const { t } = useTranslation();

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLAN_STYLES[plan]}`}>
      {t(`plans.${plan}`)}
    </span>
  );
}
```

- [ ] **Step 3: Update AppHeader with breadcrumb, plan badge, language switcher**

Modify `src/components/AppHeader.tsx` — full replacement:

```tsx
import { useTranslation } from 'react-i18next';
import { Coins, LogOut } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import LanguageSwitcher from './LanguageSwitcher';
import PlanBadge from './PlanBadge';
import type { PlanName } from '../lib/plan-limits';

interface AppHeaderProps {
  creditsBalance: number | null;
  creditsLoading: boolean;
  plan: PlanName;
  onSignOut: () => void;
  projectName?: string;
}

export default function AppHeader({
  creditsBalance,
  creditsLoading,
  plan,
  onSignOut,
  projectName,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/';
  const isSettings = location.pathname === '/settings';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="flex h-12 items-center justify-center rounded-lg bg-white/95 px-1.5 py-1 shadow-sm ring-1 ring-white/20 transition hover:ring-white/40">
            <img
              src="/ideanest-logo.png"
              alt={t('app.name')}
              className="h-full w-auto object-contain"
            />
          </Link>
          <div className="flex items-center gap-2 leading-tight">
            <div>
              <div className="text-[11px] font-medium tracking-wide text-slate-400">
                {t('app.tagline')}
              </div>
            </div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              {!isDashboard && (
                <>
                  <span className="text-slate-600">/</span>
                  <Link to="/dashboard" className="hover:text-slate-300">{t('nav.dashboard')}</Link>
                </>
              )}
              {projectName && (
                <>
                  <span className="text-slate-600">/</span>
                  <span className="text-slate-300">{projectName}</span>
                </>
              )}
              {isSettings && (
                <>
                  <span className="text-slate-600">/</span>
                  <span className="text-slate-300">{t('nav.settings')}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PlanBadge plan={plan} />
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
            <Coins className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">{t('billing.credits')}</span>
            <span className="text-sm font-bold text-white">{creditsLoading ? '...' : creditsBalance ?? '-'}</span>
          </div>
          <LanguageSwitcher />
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:border-slate-600 hover:text-white"
          >
            {t('nav.settings')}
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:border-slate-600 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create AppLayout (shared shell)**

Create `src/layouts/AppLayout.tsx`:

```tsx
import { Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppHeader from '../components/AppHeader';
import AuthGuard from '../components/AuthGuard';
import { useAuth } from '../auth/AuthProvider';
import { useCredits } from '../hooks/useCredits';
import { useSubscription } from '../hooks/useSubscription';

interface AppLayoutProps {
  projectName?: string;
}

export default function AppLayout({ projectName }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const { balance: creditsBalance, loading: creditsLoading } = useCredits(user?.id);
  const { plan } = useSubscription(user?.id);

  return (
    <AuthGuard>
      <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' } }} />
      <div className="min-h-screen w-full overflow-x-hidden bg-slate-900 font-sans text-slate-300">
        <AppHeader
          creditsBalance={creditsBalance}
          creditsLoading={creditsLoading}
          plan={plan}
          onSignOut={signOut}
          projectName={projectName}
        />
        <Outlet />
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 5: Create router configuration**

Create `src/router.tsx`:

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';

// Lazy-loaded pages for code splitting
const DashboardPage = () => import('./pages/DashboardPage').then((m) => ({ default: m.default }));
const ProjectWorkspace = () => import('./pages/ProjectWorkspace').then((m) => ({ default: m.default }));
const SettingsPage = () => import('./pages/SettingsPage').then((m) => ({ default: m.default }));

// Placeholder pages (will be replaced in later tasks)
function DashboardPlaceholder() {
  return <div className="p-8 text-slate-300">Dashboard — coming in Task 6</div>;
}

function ProjectPlaceholder() {
  return <div className="p-8 text-slate-300">Project Workspace — coming in Task 7</div>;
}

function SettingsPlaceholder() {
  return <div className="p-8 text-slate-300">Settings — coming in Task 10</div>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPlaceholder /> },
      { path: 'project/:projectId', element: <ProjectPlaceholder /> },
      { path: 'settings', element: <SettingsPlaceholder /> },
    ],
  },
]);
```

- [ ] **Step 6: Update main.tsx to use router + i18n**

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { router } from './router';
import './lib/i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
```

- [ ] **Step 7: Run type check and dev server**

```bash
npm run lint
npm run dev
```

Expected: type check passes. Dev server starts. Navigating to `http://localhost:3000` redirects to `/dashboard` and shows placeholder text. Login page still works at `/login`.

- [ ] **Step 8: Commit**

```bash
git add src/router.tsx src/layouts/AppLayout.tsx src/components/LanguageSwitcher.tsx src/components/PlanBadge.tsx src/components/AppHeader.tsx src/main.tsx
git commit -m "feat(v2): add React Router, AppLayout shell, i18n-enabled header"
```

---

## Task 6: Dashboard Page + CreateProjectModal

**Files:**
- Create: `src/pages/DashboardPage.tsx`
- Create: `src/components/CreateProjectModal.tsx`
- Create: `src/components/ProjectCard.tsx`
- Modify: `src/router.tsx`

- [ ] **Step 1: Create ProjectCard component**

Create `src/components/ProjectCard.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { FolderOpen, Clock, FileBox, Archive } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Project } from '../hooks/useProjects';

interface ProjectCardProps {
  project: Project;
  onArchive: (projectId: string) => void;
}

export default function ProjectCard({ project, onArchive }: ProjectCardProps) {
  const { t } = useTranslation();
  const isArchived = project.status === 'archived';

  return (
    <div className={`group rounded-2xl border p-5 transition ${isArchived ? 'border-slate-700/50 bg-slate-800/30 opacity-60' : 'border-slate-700 bg-slate-800/60 hover:border-blue-600/30 hover:bg-slate-800/80'}`}>
      <div className="flex items-start justify-between">
        <Link
          to={`/project/${project.id}`}
          className="flex items-center gap-3 text-left"
        >
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isArchived ? 'bg-slate-700/50' : 'bg-blue-600/10'}`}>
            <FolderOpen className={`h-5 w-5 ${isArchived ? 'text-slate-500' : 'text-blue-400'}`} />
          </div>
          <div>
            <div className="text-sm font-bold text-white group-hover:text-blue-300">{project.name}</div>
            {project.description && (
              <div className="mt-0.5 text-[11px] text-slate-400 line-clamp-1">{project.description}</div>
            )}
          </div>
        </Link>
        {!isArchived && (
          <button
            type="button"
            onClick={() => onArchive(project.id)}
            className="rounded-lg p-1.5 text-slate-500 opacity-0 transition hover:bg-slate-700 hover:text-slate-300 group-hover:opacity-100"
            title={t('project.archive')}
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <FileBox className="h-3 w-3" />
          {project.file_count ?? 0} {t('dashboard.files')}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(project.updated_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CreateProjectModal component**

Create `src/components/CreateProjectModal.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2 } from 'lucide-react';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string) => Promise<unknown>;
}

export default function CreateProjectModal({ open, onClose, onCreate }: CreateProjectModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;

    setCreating(true);
    await onCreate(name.trim(), description.trim() || undefined);
    setCreating(false);
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900/95 p-6 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{t('project.createTitle')}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('project.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('project.namePlaceholder')}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-600/60 focus:outline-none"
              autoFocus
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('project.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('project.descriptionPlaceholder')}
              rows={3}
              className="mt-1.5 w-full resize-none rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-600/60 focus:outline-none"
              maxLength={500}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('project.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create DashboardPage**

Create `src/pages/DashboardPage.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, BarChart3 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useProjects } from '../hooks/useProjects';
import { useSubscription } from '../hooks/useSubscription';
import { canCreateProject } from '../lib/plan-limits';
import ProjectCard from '../components/ProjectCard';
import CreateProjectModal from '../components/CreateProjectModal';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { activeProjects, archivedProjects, loading, createProject, archiveProject } = useProjects(user?.id);
  const { plan } = useSubscription(user?.id);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreate = async (name: string, description?: string) => {
    if (!canCreateProject(plan, activeProjects.length)) {
      toast.error(t('billing.noCredits'));
      return;
    }

    const project = await createProject(name, description);
    if (project) {
      toast.success(t('toast.projectCreated'));
      navigate(`/project/${project.id}`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">{t('dashboard.title')}</h1>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          {t('dashboard.newProject')}
        </button>
      </div>

      {/* Quick Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <FolderOpen className="h-3.5 w-3.5" />
            {t('dashboard.activeProjects')}
          </div>
          <div className="mt-2 text-2xl font-black text-white">{activeProjects.length}</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <BarChart3 className="h-3.5 w-3.5" />
            {t('dashboard.comparisonsThisMonth')}
          </div>
          <div className="mt-2 text-2xl font-black text-white">—</div>
        </div>
      </div>

      {/* Project Grid */}
      {loading ? (
        <div className="mt-8 text-center text-sm text-slate-500">{t('common.loading')}</div>
      ) : activeProjects.length === 0 && archivedProjects.length === 0 ? (
        <div className="mt-12 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-slate-600" />
          <p className="mt-4 text-sm text-slate-400">{t('dashboard.noProjects')}</p>
        </div>
      ) : (
        <>
          {activeProjects.length > 0 && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onArchive={archiveProject} />
              ))}
            </div>
          )}
          {archivedProjects.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {t('dashboard.archived')} ({archivedProjects.length})
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {archivedProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} onArchive={archiveProject} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <CreateProjectModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
```

- [ ] **Step 4: Update router to use DashboardPage**

In `src/router.tsx`, replace the `DashboardPlaceholder` import and usage:

Replace the placeholder function and route with:

```tsx
import DashboardPage from './pages/DashboardPage';
```

And update the route:

```tsx
{ path: 'dashboard', element: <DashboardPage /> },
```

Remove the `DashboardPlaceholder` function.

- [ ] **Step 5: Run type check + dev server test**

```bash
npm run lint
npm run dev
```

Expected: type check passes. Dashboard renders with empty state message and "New Project" button.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx src/components/CreateProjectModal.tsx src/components/ProjectCard.tsx src/router.tsx
git commit -m "feat(v2): add Dashboard page with project list and create modal"
```

---

## Task 7: ProjectWorkspace — Migrate App.tsx to Project-Scoped Page

This is the largest task. `App.tsx` (1060 lines) becomes `ProjectWorkspace.tsx` — the same workspace but scoped to a project with persistent files and VO history.

**Files:**
- Create: `src/pages/ProjectWorkspace.tsx`
- Create: `src/components/ProjectSidebar.tsx`
- Modify: `src/router.tsx`

- [ ] **Step 1: Create ProjectSidebar**

Create `src/components/ProjectSidebar.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import {
  FileBox,
  FileSpreadsheet,
  Plus,
  Play,
  Download,
  Sparkles,
  Layers3,
  ClipboardList,
  BarChart3,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Zap,
  Clock,
  Trash2,
} from 'lucide-react';
import type { ModelLoadState, ActiveTab } from '../lib/format';
import type { AuditState } from './AuditPanel';
import type { ProjectFile } from '../hooks/useProjectFiles';
import type { VOComparison } from '../hooks/useVOHistory';

interface ProjectSidebarProps {
  // File state
  baseFile: ProjectFile | null;
  revisionFile: ProjectFile | null;
  baseState: ModelLoadState;
  revisionState: ModelLoadState;
  baseComponentCount: number;
  revisionComponentCount: number;
  // BQ
  bqFileName: string;
  bqItemCount: number;
  // Actions
  voResults: unknown;
  isRunning: boolean;
  isExporting: boolean;
  activeTab: ActiveTab;
  auditState: AuditState;
  // VO History
  comparisons: VOComparison[];
  selectedComparisonId: string | null;
  // Callbacks
  onUploadBase: () => void;
  onUploadRevision: () => void;
  onUploadBq: () => void;
  onRunCompare: () => void;
  onExportExcel: () => void;
  onExportBqTemplate: () => void;
  onTabChange: (tab: ActiveTab) => void;
  onRunAudit: () => void;
  onSelectComparison: (id: string) => void;
}

export default function ProjectSidebar({
  baseFile, revisionFile,
  baseState, revisionState,
  baseComponentCount, revisionComponentCount,
  bqFileName, bqItemCount,
  voResults, isRunning, isExporting, activeTab, auditState,
  comparisons, selectedComparisonId,
  onUploadBase, onUploadRevision, onUploadBq,
  onRunCompare, onExportExcel, onExportBqTemplate,
  onTabChange, onRunAudit, onSelectComparison,
}: ProjectSidebarProps) {
  const { t } = useTranslation();
  const canCompare = baseState === 'ready' && revisionState === 'ready' && !isRunning;
  const canAudit = (baseState === 'ready' || revisionState === 'ready') && auditState !== 'running';

  return (
    <aside className="sticky top-[57px] flex h-[calc(100vh-57px)] w-72 flex-col gap-4 overflow-y-auto border-r border-slate-700 bg-slate-900 px-4 py-4">
      {/* Project Files */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {t('workspace.files')}
        </div>
        <div className="space-y-2">
          <button type="button" onClick={onUploadBase} disabled={isRunning || baseState === 'loading'}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${baseState === 'loading' ? 'border-blue-500/40 bg-blue-600/10' : baseComponentCount > 0 ? 'border-blue-600/30 bg-blue-600/5' : baseState === 'error' ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed`}>
            {baseState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : baseState === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" /> : <FileBox className={`h-4 w-4 ${baseComponentCount > 0 ? 'text-blue-400' : 'text-slate-500'}`} />}
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('workspace.base')}</div>
              <div className={`truncate text-xs ${baseComponentCount > 0 ? 'text-white' : 'text-slate-400'}`}>
                {baseFile ? baseFile.label : t('workspace.uploadIfc')}
              </div>
              {baseComponentCount > 0 && <div className="text-[10px] text-slate-500">{baseComponentCount} {t('common.components')}</div>}
            </div>
          </button>
          <button type="button" onClick={onUploadRevision} disabled={isRunning || revisionState === 'loading'}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${revisionState === 'loading' ? 'border-blue-500/40 bg-blue-600/10' : revisionComponentCount > 0 ? 'border-blue-600/30 bg-blue-600/5' : revisionState === 'error' ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed`}>
            {revisionState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : revisionState === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" /> : <FileBox className={`h-4 w-4 ${revisionComponentCount > 0 ? 'text-blue-400' : 'text-slate-500'}`} />}
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('workspace.revision')}</div>
              <div className={`truncate text-xs ${revisionComponentCount > 0 ? 'text-white' : 'text-slate-400'}`}>
                {revisionFile ? revisionFile.label : t('workspace.uploadIfc')}
              </div>
              {revisionComponentCount > 0 && <div className="text-[10px] text-slate-500">{revisionComponentCount} {t('common.components')}</div>}
            </div>
          </button>
          <button type="button" onClick={onUploadBq} disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${bqItemCount > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FileSpreadsheet className={`h-4 w-4 ${bqItemCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Awarded BQ</div>
              <div className={`truncate text-xs ${bqItemCount > 0 ? 'text-white' : 'text-slate-400'}`}>
                {bqFileName || 'Built-in Test BQ Library'}
              </div>
              <div className="text-[10px] text-slate-500">{bqItemCount} line items</div>
            </div>
          </button>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Quick Actions</div>
        <div className="space-y-1.5">
          <button type="button" onClick={onRunAudit} disabled={!canAudit}
            className="group flex w-full items-center gap-2.5 rounded-lg bg-amber-600 px-3 py-2 text-left text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40">
            {auditState === 'running' ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" /> : <Zap className="h-4 w-4 flex-shrink-0" />}
            <div className="text-xs font-semibold">{auditState === 'running' ? t('audit.running') : t('workspace.runAudit')}</div>
          </button>
          <button type="button" onClick={onRunCompare} disabled={!canCompare}
            className="group flex w-full items-center gap-2.5 rounded-lg bg-blue-600 px-3 py-2 text-left text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-4 w-4 flex-shrink-0" />
            <div className="text-xs font-semibold">{t('workspace.runCompare')}</div>
          </button>
          <button type="button" onClick={onExportExcel} disabled={!voResults || isExporting}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Download className="h-4 w-4 flex-shrink-0 text-slate-500" />
            <div className="text-xs font-semibold">{t('workspace.exportExcel')}</div>
          </button>
        </div>
      </section>

      {/* VO History */}
      {comparisons.length > 0 && (
        <section>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {t('workspace.voHistory')}
          </div>
          <div className="space-y-1">
            {comparisons.slice(0, 10).map((comp) => (
              <button
                key={comp.id}
                type="button"
                onClick={() => onSelectComparison(comp.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition ${
                  selectedComparisonId === comp.id
                    ? 'bg-blue-600/20 text-blue-200'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Clock className="h-3 w-3 flex-shrink-0 text-slate-600" />
                <div className="flex-1 overflow-hidden">
                  <div className="truncate text-[11px]">
                    +{comp.summary_json.added} -{comp.summary_json.deleted} ~{comp.summary_json.modified}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(comp.created_at).toLocaleString()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Views */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Views</div>
        <div className="space-y-1">
          <button type="button" onClick={() => onTabChange('copilot')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${activeTab === 'copilot' ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${activeTab === 'copilot' ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">IFC Copilot</span>
          </button>
          <button type="button" onClick={() => onTabChange('audit')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${activeTab === 'audit' ? 'bg-amber-600/20 text-amber-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <BarChart3 className={`h-3.5 w-3.5 flex-shrink-0 ${activeTab === 'audit' ? 'text-amber-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('audit.title')}</span>
          </button>
          <button type="button" onClick={() => onTabChange('overview')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${activeTab === 'overview' ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Layers3 className={`h-3.5 w-3.5 flex-shrink-0 ${activeTab === 'overview' ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">3D Model & Diff</span>
          </button>
          <button type="button" onClick={() => onTabChange('valuation')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${activeTab === 'valuation' ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <ClipboardList className={`h-3.5 w-3.5 flex-shrink-0 ${activeTab === 'valuation' ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">BQ Mapping & Valuation</span>
          </button>
        </div>
      </section>

      {/* Status */}
      <section className="mt-auto rounded-xl border border-slate-700 bg-slate-800/50 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('status.baseIfc')}</div>
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('status.baseIfc')}</span>
            <span className="flex items-center gap-1">
              {baseComponentCount > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">{t('common.ready')}</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('common.pending')}</span></>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('status.revisionIfc')}</span>
            <span className="flex items-center gap-1">
              {revisionComponentCount > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">{t('common.ready')}</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('common.pending')}</span></>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('status.comparison')}</span>
            <span className="flex items-center gap-1">
              {voResults ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Done</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('common.pending')}</span></>}
            </span>
          </div>
        </div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 2: Create ProjectWorkspace page**

Create `src/pages/ProjectWorkspace.tsx`.

This file is a refactored version of `src/App.tsx`. The key changes:
1. Reads `projectId` from URL params via `useParams()`
2. Uses `useProjectFiles` for file metadata
3. Uses `useVOHistory` to save/load comparisons
4. Downloads IFC from Supabase Storage instead of requiring fresh upload
5. All existing logic (BimEngine, comparison, audit, BQ mapping, copilot) stays the same

Due to the size of this component (~1100 lines), the implementer should:
- Copy the entire body of `App.tsx` (lines 66–1062) into `ProjectWorkspace.tsx`
- Add `useParams` import from `react-router-dom` to get `projectId`
- Add `useProjectFiles` and `useVOHistory` hook calls
- Modify file upload handlers to also call `useProjectFiles.upload()` after parsing
- After VO comparison completes, call `useVOHistory.saveComparison()` to persist results
- Replace `AppSidebar` with `ProjectSidebar` and pass VO history props
- Add a `onSelectComparison` handler that loads results from `useVOHistory.comparisons`
- Keep all BQ, Copilot, Audit, Export logic exactly as-is

The essential additions (add near top of component):

```tsx
import { useParams } from 'react-router-dom';
import { useProjectFiles, type ProjectFile } from '../hooks/useProjectFiles';
import { useVOHistory } from '../hooks/useVOHistory';
import { downloadProjectFile } from '../lib/storage';
import ProjectSidebar from '../components/ProjectSidebar';

// Inside the component:
const { projectId } = useParams<{ projectId: string }>();
const projectFiles = useProjectFiles(projectId);
const voHistory = useVOHistory(projectId);
const [selectedComparisonId, setSelectedComparisonId] = useState<string | null>(null);
const [activeBaseFile, setActiveBaseFile] = useState<ProjectFile | null>(null);
const [activeRevisionFile, setActiveRevisionFile] = useState<ProjectFile | null>(null);
```

After successful IFC parse in `handleIFCUpload`:

```tsx
// After components are set and state is 'ready':
if (user && projectId) {
  const savedFile = await projectFiles.upload(
    user.id, file, file.name, version === 'v1' ? 'base' : 'revision', components.length,
  );
  if (savedFile) {
    if (version === 'v1') setActiveBaseFile(savedFile);
    else setActiveRevisionFile(savedFile);
  }
}
```

After VO comparison completes in `runVOComparison`:

```tsx
// After setVoResults(results) and setCompareState('success'):
if (activeBaseFile && activeRevisionFile) {
  const saved = await voHistory.saveComparison(
    activeBaseFile.id,
    activeRevisionFile.id,
    {
      added: results.added.length,
      deleted: results.deleted.length,
      modified: results.modified.length,
      totalChanges: results.added.length + results.deleted.length + results.modified.length,
    },
    results,
  );
  if (saved) setSelectedComparisonId(saved.id);
}
```

Comparison history loader:

```tsx
const handleSelectComparison = (compId: string) => {
  const comp = voHistory.comparisons.find((c) => c.id === compId);
  if (!comp) return;
  setSelectedComparisonId(compId);
  setVoResults(comp.results_json as VoComparisonResults);
  setCompareState('success');
};
```

- [ ] **Step 3: Update router to use ProjectWorkspace**

In `src/router.tsx`, replace the project placeholder:

```tsx
import ProjectWorkspace from './pages/ProjectWorkspace';

// In routes:
{ path: 'project/:projectId', element: <ProjectWorkspace /> },
```

Remove `ProjectPlaceholder`.

- [ ] **Step 4: Run type check**

```bash
npm run lint
```

Expected: 0 errors. Some unused imports in the old `App.tsx` may surface — they are fine since `App.tsx` is no longer the entry point.

- [ ] **Step 5: Run tests**

```bash
npm run test
```

Expected: All 148 existing tests still pass (they test audit engine, not UI).

- [ ] **Step 6: Commit**

```bash
git add src/pages/ProjectWorkspace.tsx src/components/ProjectSidebar.tsx src/router.tsx
git commit -m "feat(v2): add ProjectWorkspace page with persistent files and VO history"
```

---

## Task 8: Stripe Subscription Edge Function

**Files:**
- Create: `supabase/functions/create-subscription/index.ts`

- [ ] **Step 1: Create subscription checkout Edge Function**

Create `supabase/functions/create-subscription/index.ts`:

```typescript
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed. Use POST.' });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const configuredSiteUrl = Deno.env.get('SITE_URL');

    if (!stripeSecretKey) {
      return jsonResponse(500, { error: 'Missing STRIPE_SECRET_KEY secret.' });
    }

    const payload = await request.json().catch(() => null) as {
      user_id?: string;
      price_id?: string;
      plan?: string;
    } | null;

    const userId = payload?.user_id?.trim();
    const priceId = payload?.price_id?.trim();

    if (!userId) {
      return jsonResponse(400, { error: 'Missing user_id in request body.' });
    }

    if (!priceId) {
      return jsonResponse(400, { error: 'Missing price_id in request body.' });
    }

    const requestOrigin = request.headers.get('origin') || undefined;
    const siteUrl = configuredSiteUrl || requestOrigin || 'http://localhost:3000';
    const successUrl = `${siteUrl}/settings?subscription=success`;
    const cancelUrl = `${siteUrl}/settings?subscription=cancelled`;

    const form = new URLSearchParams();
    form.set('mode', 'subscription');
    form.set('success_url', successUrl);
    form.set('cancel_url', cancelUrl);
    form.set('client_reference_id', userId);
    form.set('line_items[0][price]', priceId);
    form.set('line_items[0][quantity]', '1');
    form.set('metadata[user_id]', userId);
    form.set('metadata[plan]', payload?.plan || 'pro');

    const stripeResponse = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const stripeJson = await stripeResponse.json().catch(() => null) as Record<string, unknown> | null;

    if (!stripeResponse.ok) {
      const stripeMessage =
        typeof stripeJson?.error === 'object' && stripeJson?.error && typeof (stripeJson.error as Record<string, unknown>).message === 'string'
          ? String((stripeJson.error as Record<string, unknown>).message)
          : 'Stripe subscription session creation failed.';

      return jsonResponse(stripeResponse.status, { error: stripeMessage });
    }

    const url = typeof stripeJson?.url === 'string' ? stripeJson.url : '';
    const sessionId = typeof stripeJson?.id === 'string' ? stripeJson.id : null;

    if (!url) {
      return jsonResponse(502, { error: 'Stripe returned no checkout URL.' });
    }

    return jsonResponse(200, {
      url,
      session_id: sessionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return jsonResponse(500, { error: message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/create-subscription/index.ts
git commit -m "feat(v2): add Stripe subscription checkout Edge Function"
```

---

## Task 9: UpgradePrompt Component

**Files:**
- Create: `src/components/UpgradePrompt.tsx`

- [ ] **Step 1: Create UpgradePrompt component**

Create `src/components/UpgradePrompt.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { X, Sparkles } from 'lucide-react';
import type { PlanName, PlanLimits } from '../lib/plan-limits';
import { getPlanLimits, formatStorageSize } from '../lib/plan-limits';

interface UpgradePromptProps {
  open: boolean;
  currentPlan: PlanName;
  limitReached: 'projects' | 'comparisons' | 'copilot' | 'storage' | 'pdf';
  onUpgrade: (plan: PlanName) => void;
  onClose: () => void;
}

const LIMIT_MESSAGES: Record<string, { zh: string; en: string }> = {
  projects: { zh: '已达项目数上限', en: 'Project limit reached' },
  comparisons: { zh: '本月 VO 对比次数已用完', en: 'Monthly comparison limit reached' },
  copilot: { zh: '本月 Copilot 次数已用完', en: 'Monthly Copilot limit reached' },
  storage: { zh: '存储空间已满', en: 'Storage limit reached' },
  pdf: { zh: 'PDF 导出需要 Pro 计划', en: 'PDF export requires Pro plan' },
};

export default function UpgradePrompt({ open, currentPlan, limitReached, onUpgrade, onClose }: UpgradePromptProps) {
  const { t, i18n } = useTranslation();

  if (!open) return null;

  const lang = i18n.language === 'zh' ? 'zh' : 'en';
  const message = LIMIT_MESSAGES[limitReached]?.[lang] ?? LIMIT_MESSAGES[limitReached]?.en ?? '';
  const proLimits = getPlanLimits('pro');

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900/95 p-8 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">{message}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-blue-500/20 bg-blue-600/5 p-4">
          <div className="text-sm font-bold text-blue-300">{t('plans.pro')} — RM 149{t('plans.perMonth')}</div>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
            <li>✓ {t('dashboard.activeProjects')}: ∞</li>
            <li>✓ VO {t('dashboard.comparisonsThisMonth')}: ∞</li>
            <li>✓ Copilot: {proLimits.maxCopilotPerMonth}/月</li>
            <li>✓ {t('workspace.exportPdf')}</li>
            <li>✓ {t('settings.storageUsed')}: {formatStorageSize(proLimits.maxStorageBytes)}</li>
          </ul>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => onUpgrade('pro')}
            className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
          >
            {t('settings.upgrade')} → {t('plans.pro')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-600 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/UpgradePrompt.tsx
git commit -m "feat(v2): add UpgradePrompt component for plan limit enforcement"
```

---

## Task 10: Settings Page

**Files:**
- Create: `src/pages/SettingsPage.tsx`
- Modify: `src/router.tsx`

- [ ] **Step 1: Create SettingsPage**

Create `src/pages/SettingsPage.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useSubscription } from '../hooks/useSubscription';
import { useCredits } from '../hooks/useCredits';
import { getPlanLimits, formatStorageSize } from '../lib/plan-limits';
import PlanBadge from '../components/PlanBadge';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { plan, subscription } = useSubscription(user?.id);
  const { balance: creditsBalance } = useCredits(user?.id);
  const limits = getPlanLimits(plan);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-black text-white">{t('settings.title')}</h1>

      {/* Account */}
      <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">{t('settings.account')}</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{t('settings.email')}</span>
            <span className="text-sm text-white">{user?.email ?? '-'}</span>
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">{t('settings.subscription')}</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{t('settings.currentPlan')}</span>
            <PlanBadge plan={plan} />
          </div>
          {subscription?.current_period_end && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Renewal</span>
              <span className="text-sm text-white">
                {new Date(subscription.current_period_end).toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{t('billing.credits')}</span>
            <span className="text-sm font-bold text-white">{creditsBalance ?? 0}</span>
          </div>
        </div>
        {plan === 'free' && (
          <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-600/5 p-4">
            <div className="text-xs text-slate-300">
              {t('plans.free')}: {limits.maxProjects} {t('dashboard.activeProjects').toLowerCase()}, {limits.maxComparisonsPerMonth} VO/月, {formatStorageSize(limits.maxStorageBytes)}
            </div>
            <button
              type="button"
              className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
              onClick={() => {
                // TODO: invoke create-subscription edge function
              }}
            >
              {t('settings.upgrade')} → {t('plans.pro')} (RM 149{t('plans.perMonth')})
            </button>
          </div>
        )}
        {plan !== 'free' && (
          <button
            type="button"
            className="mt-4 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={() => {
              // TODO: open Stripe Customer Portal
            }}
          >
            {t('settings.managePlan')}
          </button>
        )}
      </section>

      {/* Language */}
      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">{t('settings.language')}</h2>
        <div className="mt-4">
          <LanguageSwitcher />
        </div>
      </section>

      {/* Usage */}
      <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">{t('settings.usage')}</h2>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{t('settings.comparisonsThisMonth')}</span>
            <span className="text-sm text-white">—</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{t('settings.storageUsed')}</span>
            <span className="text-sm text-white">—</span>
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Update router to use SettingsPage**

In `src/router.tsx`, replace the settings placeholder:

```tsx
import SettingsPage from './pages/SettingsPage';

// In routes:
{ path: 'settings', element: <SettingsPage /> },
```

Remove `SettingsPlaceholder`.

- [ ] **Step 3: Run type check**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx src/router.tsx
git commit -m "feat(v2): add Settings page with subscription, language, usage"
```

---

## Task 11: Update CLAUDE.md for V2

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md to reflect V2 architecture**

Update the Architecture section to include new pages, hooks, and routing. Add:

```markdown
## V2 Changes (from V1)
- React Router v7 for page navigation (/dashboard, /project/:id, /settings)
- Project persistence (Supabase tables: projects, project_files, vo_comparisons, vo_exports, user_subscriptions)
- IFC files stored in Supabase Storage (bucket: project-files)
- Subscription billing via Stripe (replaces one-time credits)
- i18n via react-i18next (zh/en/ms, files in src/locales/)
- AppLayout shared shell (src/layouts/AppLayout.tsx)
```

Add new key types:

```typescript
type PlanName = 'free' | 'pro' | 'enterprise';
```

Add new hooks to architecture tree:

```
  hooks/
    useCredits.ts        # Credit balance hook (V1, kept)
    useProjects.ts       # Project CRUD hook (V2)
    useProjectFiles.ts   # File upload/list hook (V2)
    useVOHistory.ts      # VO comparison history hook (V2)
    useSubscription.ts   # Subscription status hook (V2)
```

- [ ] **Step 2: Run all checks**

```bash
npm run lint
npm run test
```

Expected: 0 type errors, 148 tests pass.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for V2 architecture"
```

---

## Self-Review Checklist

### Spec Coverage
- ✅ Section 3 (Architecture/Routes): Task 5 (router), Task 6 (dashboard), Task 7 (workspace), Task 10 (settings)
- ✅ Section 4 (Data Model): Task 1 (v2-schema.sql with all 5 tables + RLS + trigger)
- ✅ Section 5 (Billing): Task 8 (create-subscription), Task 9 (UpgradePrompt), Task 3 (plan-limits.ts)
- ✅ Section 6 (i18n): Task 2 (i18n setup + 3 language files)
- ✅ Section 7 (Migration): Task 7 (App.tsx → ProjectWorkspace.tsx), Task 5 (new layout/header)
- ✅ Supabase Storage: Task 3 (storage.ts helpers), Task 4 (useProjectFiles hook)
- ✅ VO History: Task 4 (useVOHistory hook), Task 7 (integration in ProjectWorkspace)

### Placeholder Scan
- Task 10 SettingsPage has `// TODO: invoke create-subscription` and `// TODO: open Stripe Customer Portal` — these are intentional stubs that connect to the Edge Function from Task 8. The Stripe portal URL needs to come from a new Edge Function (not in spec scope) or be generated client-side. These are acceptable minimal stubs.

### Type Consistency
- `PlanName` defined in `plan-limits.ts`, used in `PlanBadge`, `UpgradePrompt`, `useSubscription`, `AppHeader` — consistent.
- `ProjectFile` defined in `useProjectFiles.ts`, used in `ProjectSidebar`, `ProjectWorkspace` — consistent.
- `VOComparison` defined in `useVOHistory.ts`, used in `ProjectSidebar` — consistent.
- `Project` defined in `useProjects.ts`, used in `ProjectCard`, `DashboardPage` — consistent.
- `ActiveTab`, `ModelLoadState` from `lib/format.ts` — unchanged from V1.
