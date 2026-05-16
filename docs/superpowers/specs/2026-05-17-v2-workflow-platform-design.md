# V2 Design Spec — Workflow-First VO Platform

> Date: 2026-05-17
> Status: Approved (brainstorming)
> Base: V1 at commit `0f0eae1` on master

---

## 1. Product Vision

Transform V1 (one-shot demo tool) into a daily-use VO management platform for Malaysian SME QS firms. Core thesis: QS professionals switch tools not for flashy 3D, but for workflow efficiency — save time, track history, produce professional reports.

**Target user**: Small-to-medium QS companies in Malaysia (1–15 people), currently using Excel or can't afford CostX (RM 30K+).

**Acquisition**: OpenClaw outbound.

**V1 role**: CIP Spark grant application demo. V2 is the real product.

---

## 2. What Changes (V1 → V2)

| Aspect | V1 | V2 |
|--------|----|----|
| Data lifecycle | In-memory, lost on refresh | Persisted in Supabase |
| Project concept | None | Multi-project with file versioning |
| VO history | Single comparison | Full history per project |
| IFC files | Re-upload every time | Upload once, stored in cloud |
| Billing | Credit-based (one-time RM 499/50 credits) | Monthly subscription tiers |
| Language | Chinese hardcoded | Chinese / English / Malay (react-i18next) |
| Routing | None (single-page) | React Router (dashboard / project / settings) |
| AI | NVIDIA NIM Llama 3.3 70B | No change |
| 3D engine | web-ifc-three + Three.js | No change |
| Core engines | vo-diff-core, audit/, BimEngine | No change |

---

## 3. Architecture

```
/login          → LoginPage (existing, minor style updates)
/dashboard      → ProjectListPage (new)
/project/:id    → ProjectWorkspace (evolved from App.tsx)
/settings       → SettingsPage (new)
```

### 3.1 Dashboard

- Project card grid: name, status (active/archived), last VO date, file count
- "New Project" button → create project modal
- Quick stats bar: active projects, comparisons this month

### 3.2 Project Workspace

Evolution of current App.tsx. Same layout concept but project-scoped:

- **Left sidebar**: Project file list (replaces upload dropzone) + VO comparison history list
- **Center**: 3D viewer (unchanged) + comparison results table
- **Right**: AI Copilot (unchanged, but context bound to current project)
- **Top**: Project name + breadcrumb (Dashboard > Project Name)

Key behaviors:
- Selecting a file from the list loads it into the viewer (fetched from Supabase Storage)
- Selecting a VO comparison from history loads its results into the table
- New comparison: pick base + revision from file list, run comparison, results auto-saved
- Export generates file + saves to `vo_exports` for later download

### 3.3 Settings Page

- Account info (email, display name)
- Subscription management (current plan, upgrade/downgrade via Stripe Customer Portal)
- Language preference (zh / en / ms)
- Usage stats (comparisons this month, storage used)

---

## 4. Data Model

### 4.1 New Tables

```sql
-- Projects
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Project files (IFC uploads)
CREATE TABLE project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,              -- e.g. "Base Rev 0", "Revision Rev 3"
  role text NOT NULL CHECK (role IN ('base', 'revision')),
  storage_path text NOT NULL,       -- Supabase Storage path
  file_size bigint NOT NULL,
  element_count int,                -- IFC element count (parsed on upload)
  uploaded_at timestamptz DEFAULT now()
);

-- VO comparison records
CREATE TABLE vo_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  base_file_id uuid REFERENCES project_files(id) NOT NULL,
  revision_file_id uuid REFERENCES project_files(id) NOT NULL,
  summary_json jsonb NOT NULL,      -- {additions: N, omissions: N, changes: N, ...}
  results_json jsonb NOT NULL,      -- Full VO diff results array
  created_at timestamptz DEFAULT now()
);

-- Export history
CREATE TABLE vo_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id uuid REFERENCES vo_comparisons(id) ON DELETE CASCADE NOT NULL,
  format text NOT NULL CHECK (format IN ('excel', 'pdf')),
  storage_path text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Subscriptions (extends existing user_credits)
CREATE TABLE user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) UNIQUE NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 4.2 RLS Policies

All new tables: users can only CRUD their own rows (via `user_id` or join through `projects.user_id`). Service role has full access.

### 4.3 Supabase Storage

- Bucket: `project-files` (private, RLS per user)
- Path convention: `{user_id}/{project_id}/{file_id}.ifc`
- Max file size: 100MB (same as V1)
- Bucket: `exports` (private, RLS per user)
- Path convention: `{user_id}/{project_id}/{export_id}.{xlsx|pdf}`

### 4.4 Existing Tables — No Changes

- `user_credits` — keep for Copilot usage limits
- `stripe_webhook_events` — keep, extend webhook handler for subscription events
- 8 knowledge base tables — no changes

---

## 5. Billing: Credit → Subscription

### 5.1 Plans

| Plan | Price | Projects | VO Comparisons | Copilot | Exports | Storage |
|------|-------|----------|---------------|---------|---------|---------|
| Free | RM 0 | 3 | 5/month | 5/month | Excel only | 500MB |
| Pro | RM 149/month | Unlimited | Unlimited | 100/month | Excel + PDF | 5GB |
| Enterprise | RM 599/month | Unlimited | Unlimited | Unlimited | Excel + PDF | 50GB |

### 5.2 Stripe Integration Changes

- Replace one-time Checkout with Stripe Subscription (monthly recurring)
- New Edge Function: `create-subscription` (creates Stripe Checkout in subscription mode)
- Update `stripe-webhook` to handle: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
- Stripe Customer Portal for self-service plan changes
- `user_subscriptions` table synced via webhook

### 5.3 Enforcement

- Project count limit: checked on project creation
- VO comparison limit: count `vo_comparisons` for current month
- Copilot limit: keep existing `user_credits` system, reset monthly via Supabase pg_cron (1st of each month)
- Storage limit: sum `project_files.file_size` per user

---

## 6. Internationalization (i18n)

### 6.1 Stack

- `react-i18next` + `i18next`
- JSON translation files: `src/locales/{zh,en,ms}/translation.json`
- Language stored in `user_subscriptions` or localStorage for non-auth users
- Default: Chinese (zh)

### 6.2 Scope

- All UI strings (buttons, labels, headers, tooltips, error messages)
- Sample prompts in Copilot panel
- Audit report labels
- Export templates (Excel column headers, PDF titles)
- NOT translated: IFC property names (industry standard English), AI Copilot responses (model decides language)

---

## 7. Migration Strategy (V1 → V2 Codebase)

### 7.1 Keep Unchanged

- `vo-diff-core.ts` — VO comparison algorithm
- `BimEngine.ts` — Three.js 3D engine
- `audit/*` — Audit engine + tests
- `agent/*` — AI agent client + tools
- `bq-tools.ts`, `qs-helpers.ts`, `qs-config.ts` — QS logic
- `ifc-step-fallback.ts` — STEP parser
- `constants.ts` — i18n will wrap but not replace
- `lib/supabase.ts` — Supabase client

### 7.2 Refactor

- `App.tsx` (1050 lines) → split into:
  - `pages/DashboardPage.tsx`
  - `pages/ProjectWorkspace.tsx` (inherits most App.tsx logic)
  - `pages/SettingsPage.tsx`
  - `layouts/AppLayout.tsx` (shared shell: header + sidebar)
- `components/AppSidebar.tsx` → project-aware sidebar
- `components/AppHeader.tsx` → add breadcrumb, plan badge
- `hooks/useCredits.ts` → extend or add `useSubscription.ts`

### 7.3 New Files

- `src/router.tsx` — React Router config
- `src/pages/DashboardPage.tsx`
- `src/pages/ProjectWorkspace.tsx`
- `src/pages/SettingsPage.tsx`
- `src/layouts/AppLayout.tsx`
- `src/hooks/useProjects.ts` — project CRUD hook
- `src/hooks/useProjectFiles.ts` — file upload/list hook
- `src/hooks/useVOHistory.ts` — VO comparison history hook
- `src/hooks/useSubscription.ts` — subscription status hook
- `src/locales/zh/translation.json`
- `src/locales/en/translation.json`
- `src/locales/ms/translation.json`
- `src/lib/i18n.ts` — i18next config
- `src/lib/storage.ts` — Supabase Storage helpers
- `supabase/functions/create-subscription/index.ts`
- `supabase/sql/v2-schema.sql` — all new tables + RLS

---

## 8. Out of Scope (YAGNI)

- ❌ 3D measurement tools, clipping planes, annotations
- ❌ Team collaboration / multi-tenancy
- ❌ Offline mode
- ❌ Mobile responsive layout
- ❌ AI model change (keep NVIDIA NIM)
- ❌ 3D engine change (keep web-ifc-three + Three.js)
- ❌ Public API
- ❌ Model tree / element navigator in 3D viewer
- ❌ Real-time collaboration
- ❌ Custom branding per tenant

---

## 9. Tech Stack Summary

| Layer | V2 Technology |
|-------|--------------|
| Frontend | React 19 + TypeScript 5.8 + Tailwind CSS 4 + Vite 6 (unchanged) |
| Routing | React Router v7 (new) |
| State | Zustand or React Context (new, lightweight) |
| i18n | react-i18next (new) |
| Auth & DB | Supabase (unchanged) |
| File Storage | Supabase Storage (new usage) |
| Payments | Stripe Subscriptions (changed from one-time) |
| IFC Parsing | web-ifc + web-ifc-three (unchanged) |
| 3D Viewer | Three.js (unchanged) |
| AI Copilot | NVIDIA NIM Llama 3.3 70B via Edge Function (unchanged) |
| Excel Export | xlsx library (unchanged) |
| PDF Export | jspdf + jspdf-autotable (unchanged) |
| Tests | Vitest (unchanged, extend for new features) |
