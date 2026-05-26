# VO System V3 — VO Copilot with AI Agent

## Project Overview
IFC-based Variation Order (VO) comparison and quantity takeoff SaaS platform with embedded AI agent.
Targeted at Malaysian construction industry — JKR/SMM2 classification standards.
Core value: (A) instant audit/quantity takeoff, (B) VO comparison with an evidence-grounded AI copilot, (C) PDF/scanned document reading for QS workflows.

## Tech Stack
- **Frontend**: React 19 + TypeScript 5.8 + Tailwind CSS 4 + Vite 6
- **Auth & DB**: Supabase (auth + Postgres + RLS)
- **Payments**: Stripe (credit-based billing)
- **IFC Parsing**: web-ifc (client-side, no server upload)
- **3D Viewer**: Three.js + web-ifc-three
- **AI Agent**: DeepSeek V4 Pro through NVIDIA NIM (OpenAI-compatible, ReAct pattern)
- **Document Reading**: PDF.js text/page rendering + Tesseract.js OCR fallback for scanned BQ/contracts
- **Export**: xlsx (Excel), jspdf + jspdf-autotable (PDF)
- **i18n**: react-i18next (zh/en/ms)
- **Routing**: React Router v7
- **Notifications**: react-hot-toast (dark theme)
- **Tests**: Vitest

## Commands
```bash
npm run dev        # Dev server at localhost:3000
npm run build      # Production build
npm run lint       # TypeScript type-check (tsc --noEmit)
npm run test       # Vitest run
npm run test:watch # Vitest watch mode
npm run compare    # CLI IFC comparison (basin test fixtures)
```

## Architecture
```
src/
  main.tsx              # Entry: StrictMode > ErrorBoundary > AuthProvider > RouterProvider
  router.tsx            # React Router v7 route definitions
  App.tsx               # V1 single-page workspace (used inside ProjectWorkspace)
  BimEngine.ts          # IFC loading via web-ifc, 3D engine, comparison
  vo-diff-core.ts       # VO comparison engine
  vo-report.ts          # Excel export logic
  bq-tools.ts           # BQ parsing and matching
  bq-vector-match.ts    # Semantic BQ matching via embed-bq edge function
  qs-helpers.ts         # QS label construction
  qs-config.ts          # QS measurement configuration
  qs-project-config.ts  # Project-level QS overrides
  ifc-step-fallback.ts  # STEP fallback parser
  lib/
    format.ts           # ActiveTab type, formatting utilities
    supabase.ts         # Supabase client singleton
    i18n.ts             # react-i18next config (zh/en/ms)
    plan-limits.ts      # PlanName type, getPlanLimits(), formatStorageSize()
    storage.ts          # Supabase Storage helpers
  auth/
    AuthProvider.tsx     # Supabase auth context
  audit/                # Full audit engine + tests
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
    tools.ts            # Agent tool definitions + dependency router
    kb-lookups.ts       # Knowledge base lookups (Supabase)
    context-manager.ts  # Session context tracking across tool hops
    proactive-discovery.ts  # Workspace analysis → suggestion engine
  ocr/
    ocr-engine.ts       # PDF text extraction / OCR with BQ extraction
  report/
    pdf-generator.ts    # jsPDF VO substantiation report
  components/
    AppHeader.tsx        # Top nav bar (logo + credits + plan + i18n + sign out)
    AppSidebar.tsx       # Left sidebar (V1 workspace, file upload, actions)
    GlobalSidebar.tsx    # Left sidebar navigation (V2, route-aware)
    AuditPanel.tsx       # Audit report: idle/running/done/error states
    AuthGuard.tsx        # Login gate
    BQMappingPanel.tsx   # BQ mapping and valuation panel
    CopilotPanel.tsx     # AI copilot chat interface (agent interaction)
    CreateProjectModal.tsx  # New project dialog
    ErrorBoundary.tsx    # React 19 compatible error boundary
    ViewerErrorBoundary.tsx # 3D viewer error boundary
    KPIGrid.tsx          # Dashboard KPI cards
    LanguageSwitcher.tsx # i18n language selector
    ModelViewer.tsx      # Three.js 3D model viewer
    PlanBadge.tsx        # Coloured plan label (free/pro/enterprise)
    ResultsTable.tsx     # VO comparison results table
  layouts/
    AppLayout.tsx        # Authenticated shell (header + sidebar + outlet)
  pages/
    LoginPage.tsx        # Login/signup/forgot-password page
    ResetPasswordPage.tsx # Password reset form (from email link)
    DashboardPage.tsx    # Project list (/dashboard)
    ProjectWorkspace.tsx # IFC compare/audit workspace (/project/:id)
    SettingsPage.tsx     # Account, subscription, language, usage, webhooks, API keys
  hooks/
    useCredits.ts        # Credit balance hook
    useProjects.ts       # Project CRUD hook
    useProjectFiles.ts   # Project file upload/list hook
    useVOHistory.ts      # VO comparison history hook
    useSubscription.ts   # User subscription + plan hook
    useCopilotHistory.ts # Chat message persistence per conversation
    useCopilotConversations.ts  # Conversation creation for message persistence
    useCopilotMemory.ts  # Cross-session memory with RAG search
    useWebhooks.ts       # Webhook CRUD + dispatch
    useApiKeys.ts        # API key generation + revocation
  locales/
    zh/translation.json  # Chinese translations (default)
    en/translation.json  # English translations
    ms/translation.json  # Bahasa Melayu translations
supabase/
  config.toml            # Supabase CLI config
  seed/                  # Knowledge base seed data (agent KB)
  sql/                   # Database migration scripts (all preserved)
  functions/
    agent-proxy/         # DeepSeek V4 Pro / NVIDIA NIM agent proxy
    create-checkout/     # Stripe one-time payment checkout session
    stripe-webhook/      # Stripe webhook handler
    embed-bq/            # BQ embedding generation (pgvector)
```

## Routing (React Router v7)
- `/login` → LoginPage
- `/reset-password` → ResetPasswordPage
- `/dashboard` → DashboardPage (project list)
- `/project/:id` → ProjectWorkspace
- `/settings` → SettingsPage

## Key Types
```typescript
type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit';
type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error';
type AuditState = 'idle' | 'running' | 'done' | 'error';
type PlanName = 'free' | 'pro' | 'enterprise';
```

## V3 Cleanup — What Was Removed
Only genuinely unused artifacts were removed in the V3 cleanup:
- Large IFC sample files (3 files, ~2.7M lines) — small test fixtures retained
- Legacy planning docs (9 files) and V2 docs directory
- `.superpowers/` and `.claude/` AI tool working directories
- `src/agent/batch-processor.ts` — unused multi-project batch
- `src/agent/training-collector.ts` — unused fine-tune pipeline
- `supabase/functions/create-subscription/` — unused Stripe subscription
- npm deps: `@google/genai`, `better-sqlite3`, `express`, `dotenv`, `motion`

`supabase/functions/dispatch-webhook/` and `public-api/` are active product
capabilities required by the Settings UI. Keep their UI, schema, and functions
together if changing this product surface.

## Conventions

### Language
- Respond to user in Chinese (中文)
- UI labels: English primary with Chinese subtitles
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
- Test fixtures: `basin-tessellation.ifc` (base), `V2_basin.ifc` (revision)

### Audit Engine
- `runAudit({ api, modelID, config? })` is synchronous — wrap in setTimeout for UI
- Returns `AuditResult { records, bqRows, summary, quantityModeUsed }`
- Classification uses SMM2/JKR rules from smm2-rules.ts

## Do Not
- Do not change auth/AuthProvider.tsx without explicit permission
- Treat Supabase RLS policies as security-critical: change them only with an explicit migration and review
- Do not add new npm dependencies without discussing first
- Do not use `any` type — use proper interfaces or `unknown`
- Do not remove the ErrorBoundary wrapper in main.tsx
- Do not delete SQL migration files without confirming the new architecture doesn't need them
