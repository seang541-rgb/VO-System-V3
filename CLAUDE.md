# VO System — IFC Variation Order SaaS

## Project Overview
IFC-based Variation Order (VO) comparison and quantity takeoff SaaS platform.
Targeted at Malaysian construction industry — JKR/SMM2 classification standards.
Dual selling points: (A) instant audit/quantity takeoff, (B) VO comparison with AI copilot.

## Tech Stack
- **Frontend**: React 19 + TypeScript 5.8 + Tailwind CSS 4 + Vite 6
- **Auth & DB**: Supabase (auth + Postgres + RLS)
- **Payments**: Stripe (credit-based billing)
- **IFC Parsing**: web-ifc (client-side, no server upload)
- **3D Viewer**: Three.js + web-ifc-three
- **AI Agent**: DeepSeek V4 Pro via NVIDIA NIM (OpenAI-compatible)
- **Export**: xlsx (Excel), jspdf + jspdf-autotable (PDF)
- **Notifications**: react-hot-toast (dark theme)
- **Tests**: Vitest

## Commands
```bash
npm run dev        # Dev server at localhost:3000
npm run build      # Production build
npm run lint       # TypeScript type-check (tsc --noEmit)
npm run test       # Vitest run
npm run test:watch # Vitest watch mode
```

## Architecture
```
src/
  main.tsx              # Entry: StrictMode > ErrorBoundary > AuthProvider > RouterProvider
  router.tsx            # React Router v7 route definitions
  BimEngine.ts          # IFC loading via web-ifc, getIfcHandle() for audit
  vo-diff-core.ts       # VO comparison engine
  vo-report.ts          # Excel export logic
  bq-tools.ts           # BQ parsing and matching
  constants.ts          # i18n strings, BIM translations, material maps
  lib/
    format.ts           # ActiveTab type, formatting utilities
    supabase.ts         # Supabase client singleton
    plan-limits.ts      # PlanName type, getPlanLimits(), formatStorageSize()
    storage.ts          # Supabase Storage helpers
    i18n.ts             # react-i18next config (zh/en/ms)
  auth/
    AuthProvider.tsx     # Supabase auth context
  audit/
    extractor.ts        # runAudit(input) — synchronous, returns AuditResult
    types.ts            # AuditResult, AuditSummary, BqRow, ElementAuditRecord
    geometry.ts         # Mesh-based geometry calculations
    pset-reader.ts      # IFC property set extraction
    smm2-rules.ts       # SMM2/JKR classification rules
    spatial-index.ts    # Spatial indexing for element lookup
    storey.ts           # Storey detection
    summarize.ts        # Audit result summarization
  agent/
    agent-client.ts     # ReAct AI agent (DeepSeek V4 Pro via NVIDIA NIM)
    tools.ts            # 12 agent tools + dependency router
    context-manager.ts  # Session context tracking across tool hops
    kb-lookups.ts       # Knowledge base lookups (Supabase)
    roles.ts            # Multi-role system (QS, Contract, Compliance, Reporter)
    proactive-discovery.ts  # Workspace analysis → suggestion engine
    training-collector.ts   # Fine-tune data collection pipeline
    batch-processor.ts      # Multi-project batch operations
  ocr/
    ocr-engine.ts       # Tesseract.js OCR with BQ extraction
  report/
    pdf-generator.ts    # jsPDF VO substantiation report
  components/
    AppHeader.tsx        # Top nav bar (V1, sticky, h=57px)
    AppSidebar.tsx       # Left sidebar (V1, w=72, sticky below header)
    AuditPanel.tsx       # Audit report: idle/running/done/error states
    AuthGuard.tsx        # Login gate
    CopilotPanel.tsx     # AI copilot chat interface
    CreateProjectModal.tsx  # New project dialog
    ErrorBoundary.tsx    # React 19 compatible error boundary
    GlobalSidebar.tsx    # Left sidebar navigation (V2, replaces V1 AppSidebar)
    KPIGrid.tsx          # Dashboard KPI cards
    LanguageSwitcher.tsx # i18n language selector
    ModelViewer.tsx      # Three.js 3D model viewer
    PlanBadge.tsx        # Coloured plan label (free/pro/enterprise)
    ResultsTable.tsx     # VO comparison results table
    BQMappingPanel.tsx   # BQ mapping and valuation panel
    UpgradePrompt.tsx    # Modal shown when plan limit is reached
    ViewerErrorBoundary.tsx # 3D viewer error boundary
  layouts/
    AppLayout.tsx        # Authenticated shell (header + sidebar + outlet)
  pages/
    LoginPage.tsx        # Login/signup/forgot-password page
    ResetPasswordPage.tsx # Password reset form (from email link)
    DashboardPage.tsx    # Project list (/dashboard)
    ProjectWorkspace.tsx # IFC compare/audit workspace (/project/:id)
    SettingsPage.tsx     # Account, subscription, language, usage, webhooks, API keys (/settings)
  hooks/
    useCredits.ts        # Credit balance hook
    useProjects.ts       # Project CRUD hook
    useProjectFiles.ts   # Project file upload/list hook (with roles: base/revision/bq/contract)
    useVOHistory.ts      # VO comparison history hook
    useSubscription.ts   # User subscription + plan hook
    useCopilotHistory.ts # Chat message persistence per conversation
    useCopilotConversations.ts  # Conversation CRUD
    useCopilotMemory.ts  # Cross-session memory with RAG search
    useAnalysisResults.ts # Analysis result storage
    useFileVersions.ts   # File version management
    useWebhooks.ts       # Webhook CRUD + dispatch
    useApiKeys.ts        # API key generation + revocation
  locales/
    zh/translation.json  # Chinese translations (default)
    en/translation.json  # English translations
    ms/translation.json  # Bahasa Melayu translations
supabase/
  functions/
    create-checkout/     # Stripe one-time payment checkout session
    create-subscription/ # Stripe subscription checkout session
    stripe-webhook/      # Stripe webhook handler
    agent-proxy/         # DeepSeek V4 Pro agent proxy (NVIDIA NIM)
    embed-bq/            # BQ embedding generation (pgvector)
    dispatch-webhook/    # Webhook event dispatcher
    public-api/          # REST API for programmatic access
```

## Key Types
```typescript
type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit';
type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error';
type AuditState = 'idle' | 'running' | 'done' | 'error';
```

## V2 Architecture

### Routing (React Router v7)
- `/login` → LoginPage (includes forgot password flow)
- `/reset-password` → ResetPasswordPage (set new password after email link)
- `/dashboard` → DashboardPage (project list)
- `/project/:id` → ProjectWorkspace (evolved from V1 App.tsx)
- `/settings` → SettingsPage

### New Data Layer
- `projects` table → `useProjects` hook
- `project_files` table + Supabase Storage → `useProjectFiles` hook
- `vo_comparisons` table → `useVOHistory` hook
- `user_subscriptions` table → `useSubscription` hook
- Plan limits: `src/lib/plan-limits.ts` (free/pro/enterprise)
- Storage helpers: `src/lib/storage.ts`

### i18n (react-i18next)
- Languages: zh (default), en, ms
- Translation files: `src/locales/{zh,en,ms}/translation.json`
- Config: `src/lib/i18n.ts`

### Key V2 Types
```typescript
type PlanName = 'free' | 'pro' | 'enterprise';
```

## Conventions

### Language
- Respond to user in Chinese (中文)
- UI labels: English primary with Chinese subtitles (e.g. "Run Audit" + "快速算量")
- Code comments in English

### Styling
- Dark theme only: slate-900 bg, slate-800 cards, slate-700 borders
- Primary accent: blue-600 (buttons, active states)
- Audit accent: amber-400/600
- Success: emerald-400, Error: red-400
- Rounded corners: rounded-xl (cards), rounded-lg (buttons)
- Font sizes: text-xs body, text-[10px] labels, text-[11px] status
- Never use zinc, sky, gray — always slate + blue

### React 19 Workarounds
- Class components (ErrorBoundary) need cast pattern:
  ```tsx
  extends (React.Component as new (props: P) => React.Component<P, S>)
  ```
  Plus `declare state: S` and `declare props: P`

### IFC Files
- Max upload size: 100MB (MAX_IFC_SIZE in App.tsx)
- Parsing is client-side via web-ifc WASM
- `BimEngine.getIfcHandle()` returns `{ api, modelID }` for audit

### Audit Engine
- `runAudit({ api, modelID, config? })` is synchronous — wrap in setTimeout for UI
- Returns `AuditResult { records, bqRows, summary, quantityModeUsed }`
- Classification uses SMM2/JKR rules from smm2-rules.ts

## Do Not
- Do not change auth/AuthProvider.tsx without explicit permission
- Do not modify Supabase RLS policies
- Do not add new npm dependencies without discussing first
- Do not use `any` type — use proper interfaces or `unknown`
- Do not remove the ErrorBoundary wrapper in main.tsx
