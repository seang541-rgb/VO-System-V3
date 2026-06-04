# IdeaNest V1 — IFC Audit & VO Copilot

## Project Overview
IFC-based audit, VO comparison, and quantity takeoff platform. Supports IFC, DWG, and RVT files.
Targeted at Malaysian construction industry — JKR/SMM2 classification standards.
Dual selling points: (A) instant audit/quantity takeoff, (B) VO comparison with AI copilot.

## Tech Stack
- **Frontend**: React 19 + TypeScript 5.8 + Tailwind CSS 4 + Vite 6
- **Auth & DB**: Supabase (auth + Postgres + RLS)
- **Payments**: Stripe (credit-based billing)
- **IFC Parsing**: web-ifc (client-side, no server upload)
- **3D Viewer**: Three.js + web-ifc-three
- **AI Agent**: NVIDIA NIM / Llama 3.3 70B (OpenAI-compatible via Supabase Edge Function proxy)
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
  main.tsx              # Entry: StrictMode > ErrorBoundary > AuthProvider > App
  App.tsx               # Main orchestrator — state, file uploads, comparison, audit
  BimEngine.ts          # IFC loading via web-ifc, getIfcHandle() for audit
  vo-diff-core.ts       # VO comparison engine
  vo-report.ts          # Excel export logic
  bq-tools.ts           # BQ parsing and matching
  constants.ts          # i18n strings, BIM translations, material maps
  lib/
    format.ts           # ActiveTab type, formatting utilities
    supabase.ts         # Supabase client singleton
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
    agent-client.ts     # Gemini AI agent client
    tools.ts            # Agent tool definitions
    kb-lookups.ts       # Knowledge base lookups
  components/
    AppHeader.tsx        # Top nav bar (sticky, h=57px)
    AppSidebar.tsx       # Left sidebar (w=72, sticky below header)
    AuditPanel.tsx       # Audit report: idle/running/done/error states
    AuthGuard.tsx        # Login gate
    CopilotPanel.tsx     # AI copilot chat interface
    ErrorBoundary.tsx    # React 19 compatible error boundary
    KPIGrid.tsx          # Dashboard KPI cards
    ModelViewer.tsx      # Three.js 3D model viewer
    ResultsTable.tsx     # VO comparison results table
    BQMappingPanel.tsx   # BQ mapping and valuation panel
  pages/
    LoginPage.tsx        # Login/signup page
  hooks/
    useCredits.ts        # Credit balance hook
```

## Key Types
```typescript
type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit';
type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error';
type AuditState = 'idle' | 'running' | 'done' | 'error';
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
