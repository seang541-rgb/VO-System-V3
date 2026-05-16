# VO System V1 — Deployment Handoff

> Last updated: 2026-05-16 | Git HEAD: `a4be1d3`
> 13 commits on master, all tests passing (148/148)

---

## 1. Project Summary

**Product**: Idea Nest VO Copilot — IFC-based Variation Order comparison and quantity takeoff SaaS.

**Target Market**: Malaysian construction industry (QS professionals). JKR/SMM2 classification standards.

**Two Demo Paths**:
- **Path A (Audit)**: Upload IFC -> Run Audit -> instant quantity takeoff report (speed showcase)
- **Path B (VO Comparison)**: Upload 2 IFCs -> VO comparison -> results table -> AI Copilot -> Export Excel

**Business Model**: Freemium with credit-based billing via Stripe. 5 free premium audits, then RM 499 for 50 credits.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript 5.8 + Tailwind CSS 4 + Vite 6 |
| Auth & DB | Supabase (Auth + Postgres + RLS) |
| Payments | Stripe (checkout session + webhook) |
| IFC Parsing | web-ifc + web-ifc-three (client-side WASM, no server upload) |
| 3D Viewer | Three.js |
| AI Copilot | NVIDIA NIM (Llama 3.3 70B) via Supabase Edge Function proxy |
| Excel Export | xlsx library |
| PDF Export | jspdf + jspdf-autotable |
| Toast | react-hot-toast |
| Tests | Vitest (148 tests) |

---

## 3. Repository Structure

```
D:\VO system\
├── index.html                  # Entry HTML
├── package.json                # npm dependencies
├── vite.config.ts              # Vite build config
├── tsconfig.json               # TypeScript config
├── CLAUDE.md                   # Claude Code project config
├── .env.local                  # Local env vars (NOT committed)
├── .env.example                # Env template
├── .gitignore
│
├── public/                     # Static assets (web-ifc WASM files go here)
│
├── src/
│   ├── main.tsx                # Entry: StrictMode > ErrorBoundary > AuthProvider > App
│   ├── App.tsx                 # Main orchestrator (~1050 lines)
│   ├── BimEngine.ts            # Three.js + web-ifc 3D engine (~1080 lines)
│   ├── vo-diff-core.ts         # VO comparison algorithm
│   ├── vo-report.ts            # Excel export logic
│   ├── bq-tools.ts             # BQ parsing, matching, template export
│   ├── qs-helpers.ts           # QS label building, SMM2 inference
│   ├── qs-config.ts            # QS measurement config
│   ├── qs-project-config.ts    # Project-specific QS overrides
│   ├── ifc-step-fallback.ts    # STEP text parser fallback
│   ├── constants.ts            # i18n, BIM translations, material maps
│   │
│   ├── lib/
│   │   ├── format.ts           # ActiveTab, ModelLoadState, formatting utils
│   │   └── supabase.ts         # Supabase client singleton
│   │
│   ├── auth/
│   │   └── AuthProvider.tsx    # Supabase auth context + hooks
│   │
│   ├── audit/
│   │   ├── extractor.ts        # runAudit() — main audit engine (synchronous)
│   │   ├── types.ts            # AuditResult, AuditSummary, BqRow, etc.
│   │   ├── geometry.ts         # Mesh geometry calculations
│   │   ├── pset-reader.ts      # IFC property set extraction
│   │   ├── smm2-rules.ts       # SMM2/JKR classification rules
│   │   ├── spatial-index.ts    # Spatial indexing
│   │   ├── storey.ts           # Storey detection
│   │   ├── summarize.ts        # Audit summarization
│   │   └── *.test.ts           # Test files (5 suites, 148 tests)
│   │
│   ├── agent/
│   │   ├── agent-client.ts     # AgentSession — NVIDIA NIM proxy client
│   │   ├── tools.ts            # 9 agent tools (query_ifc, compare_ifc, etc.)
│   │   └── kb-lookups.ts       # Supabase knowledge base queries
│   │
│   ├── components/
│   │   ├── AppHeader.tsx       # Top nav (sticky, 57px height)
│   │   ├── AppSidebar.tsx      # Left sidebar (w-72, sticky)
│   │   ├── AuditPanel.tsx      # Audit report (4 states: idle/running/done/error)
│   │   ├── AuthGuard.tsx       # Login gate wrapper
│   │   ├── BQMappingPanel.tsx  # BQ mapping & valuation
│   │   ├── CopilotPanel.tsx    # AI chat interface
│   │   ├── ErrorBoundary.tsx   # Global React error boundary
│   │   ├── ViewerErrorBoundary.tsx  # 3D viewer error boundary
│   │   ├── KPIGrid.tsx         # Dashboard KPI cards
│   │   ├── ModelViewer.tsx     # Three.js 3D viewer
│   │   └── ResultsTable.tsx    # VO comparison results table
│   │
│   ├── pages/
│   │   └── LoginPage.tsx       # Login/signup page
│   │
│   └── hooks/
│       └── useCredits.ts       # Credit balance hook
│
├── supabase/
│   ├── config.toml             # Supabase CLI config
│   ├── seed/
│   │   ├── 00_run_all.sql      # Master runner (runs 01-09 in order)
│   │   ├── 01_create_tables.sql # 8 knowledge base tables + RLS
│   │   ├── 02-09_seed_*.sql    # Seed data for each table
│   │   └── README.md
│   ├── sql/
│   │   └── stripe-webhook-prereqs.sql  # stripe_webhook_events table + increment_user_credits()
│   └── functions/
│       ├── agent-proxy/index.ts      # AI proxy (NVIDIA NIM + credit deduction)
│       ├── create-checkout/index.ts  # Stripe checkout session creator
│       └── stripe-webhook/index.ts   # Stripe webhook handler (credit top-up)
│
└── docs/superpowers/plans/     # Development plans (reference only)
```

---

## 4. Environment Variables

### Frontend (.env.local)

```bash
VITE_SUPABASE_URL=https://gagzfaryozgtugnhcpcs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_hjSlx5qGL3ROeLGmYZzDPQ_VEG02yRo
```

### Supabase Edge Function Secrets

Set via Supabase Dashboard > Project Settings > Edge Functions > Secrets:

| Secret | Description |
|--------|------------|
| `NVIDIA_API_KEY` | NVIDIA NIM API key for Llama 3.3 inference |
| `STRIPE_SECRET_KEY` | Stripe secret key (sk_live_... or sk_test_...) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (whsec_...) |
| `STRIPE_PRICE_ID` | Stripe price ID for credit top-up (fallback: `price_1TAWavBIBf5ufJy37B734Gm9`) |
| `SITE_URL` | Production URL for Stripe redirect (e.g. `https://ideanest.app`) |
| `BYPASS_CREDITS` | Set to `true` to skip credit deduction in agent-proxy (dev only!) |

### Auto-provided by Supabase (no manual config needed):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 5. Database Schema

### Tables Created via Seed SQL (01_create_tables.sql):

8 knowledge base tables (all with RLS: authenticated read, service_role full):

1. `contract_clauses` — JKR 203, PAM 2006/2018, FIDIC clause library
2. `ubbl_provisions` — Malaysia UBBL 1984 by-law provisions
3. `ms_standards` — Malaysian Standards (MS 522, MS 1064, etc.)
4. `vo_templates` — VO request letters, cost breakdowns, approval forms
5. `measurement_codes` — SMM2 section codes + NRM element codes
6. `bim_regulations` — CITP, BIM mandate, IBS, Act 520
7. `competitor_pricing` — CostX, Cubicost, Cubit pricing data
8. `qs_companies` — Klang Valley QS consultancy prospect list

### Tables Created via SQL Editor (not in seed files):

9. `user_credits` — Per-user credit balance
   - Columns: `user_id` (uuid FK to auth.users), `credits_balance` (int), `updated_at`
   - RLS: users can read own row; service_role full access
   - Function: `consume_credit()` — deducts 1 credit, raises `NO_CREDITS` if balance = 0

10. `stripe_webhook_events` — Idempotent webhook event log (from `stripe-webhook-prereqs.sql`)
    - Prevents duplicate credit grants on webhook replay
    - Function: `increment_user_credits(user_id, delta)` — adds credits

### New User Setup (trigger or manual):

When a new user signs up, they need a `user_credits` row with `credits_balance = 5` (5 free audits). This should be handled by a database trigger on `auth.users` insert, or manually via SQL.

---

## 6. Supabase Edge Functions

### 1. `agent-proxy` (POST)
- **Purpose**: AI copilot backend — proxies chat to NVIDIA NIM (Llama 3.3 70B)
- **Auth**: Bearer token (Supabase JWT)
- **Credit**: Deducts 1 credit per call via `consume_credit` RPC
- **Input**: `{ messages, tools, system, model? }`
- **Output**: `{ response, credits_balance }`

### 2. `create-checkout` (POST)
- **Purpose**: Creates Stripe Checkout session for credit top-up
- **Input**: `{ user_id }`
- **Output**: `{ url, session_id }`
- **Redirect**: success -> `/?checkout=success`, cancel -> `/?checkout=cancelled`

### 3. `stripe-webhook` (POST)
- **Purpose**: Handles `checkout.session.completed` events
- **Validates**: signature, price_id, currency (MYR), amount (RM499), quantity (1)
- **Idempotent**: Uses `stripe_webhook_events` table to prevent duplicates
- **Action**: Adds 50 credits via `increment_user_credits`

---

## 7. Deployment Steps

### A. Build Frontend

```bash
cd "D:\VO system"
npm install
npm run build      # Output in dist/
```

The `dist/` folder is a static SPA. Deploy to any static hosting:
- **Vercel**: `vercel --prod`
- **Netlify**: drag-drop `dist/` or CLI
- **Cloudflare Pages**: connect git or upload
- **Supabase Storage**: if you prefer same-platform hosting

### B. Static Assets Required

web-ifc WASM files must be in `public/` (copied to root of `dist/` at build):
- `web-ifc.wasm`
- `web-ifc-mt.wasm` (if exists)

These are typically auto-copied by web-ifc-three. Verify after build:
```bash
ls dist/web-ifc*.wasm
```

### C. Deploy Supabase Edge Functions

```bash
# Link project (one time)
npx supabase link --project-ref gagzfaryozgtugnhcpcs

# Deploy all functions
npx supabase functions deploy agent-proxy
npx supabase functions deploy create-checkout
npx supabase functions deploy stripe-webhook
```

### D. Initialize Database

Run in Supabase SQL Editor in this order:
1. `supabase/seed/01_create_tables.sql` (creates 8 KB tables + RLS)
2. `supabase/seed/02-09` seed files (populate reference data)
3. `supabase/sql/stripe-webhook-prereqs.sql` (stripe events + increment function)
4. Create `user_credits` table + `consume_credit` function (if not already created)
5. Create trigger to give new users 5 free credits

### E. Stripe Setup

1. Create a Product + Price in Stripe Dashboard (RM 499 = 49900 sen, one-time)
2. Set the Price ID as `STRIPE_PRICE_ID` secret
3. Create webhook endpoint pointing to:
   `https://gagzfaryozgtugnhcpcs.supabase.co/functions/v1/stripe-webhook`
4. Subscribe to `checkout.session.completed` event only
5. Copy webhook signing secret as `STRIPE_WEBHOOK_SECRET`

### F. NVIDIA NIM Setup

1. Sign up at https://build.nvidia.com
2. Get API key
3. Set as `NVIDIA_API_KEY` in Supabase secrets
4. Default model: `meta/llama-3.3-70b-instruct`

---

## 8. Local Development

```bash
cd "D:\VO system"
npm install
npm run dev        # http://localhost:3000
npm run test       # Run 148 tests
npm run lint       # TypeScript check (tsc --noEmit)
npm run build      # Production build
```

---

## 9. Git History (V1)

```
a4be1d3 fix: implement missing focusOnExpressId + cleanup
d648d7a fix: code review — remove API key leak, add viewer error boundary, harden types
589f8b7 fix: increase IFC file size limit from 50MB to 100MB
6591d50 feat: audit report tab + error boundary + toast + file size validation
8c4a48a docs: V1 demo polish implementation plan — 7 tasks
a4d4363 docs: V1 demo polish spec — audit tab + defensive optimizations
bdebb08 style: fix AuthGuard.tsx leftover zinc/sky colors to slate/blue
c7f7f23 feat: add loading indicators for IFC upload and Copilot processing
40cb280 ci: add vitest + 148 smoke tests + GitHub Actions CI workflow
5cc09c1 chore: remove unused lucide-react imports from App.tsx
426158a style: global color migration zinc->slate, sky/fuchsia->blue
e33680c refactor: extract 6 components from App.tsx (1543->1003 lines)
7f25698 baseline: pre-UI-polish state (includes Task 1 format.ts extraction)
```

---

## 10. Key Design Decisions

1. **Client-side IFC parsing**: No server upload. Privacy selling point — IFC never leaves the browser.
2. **Credit-based billing**: Each Excel export and Copilot conversation costs 1 credit. Prevents unlimited free usage while keeping the core audit free.
3. **NVIDIA NIM over direct Gemini**: Cheaper, OpenAI-compatible API format, Llama 3.3 70B handles tool calling well.
4. **Synchronous audit engine**: `runAudit()` is synchronous but wrapped in `setTimeout` for UI responsiveness. Fast enough for files up to ~3000 elements.
5. **Dark theme only**: Professional appearance for QS industry. Consistent slate/blue palette.
6. **React 19 class component workaround**: ErrorBoundary requires class component; React 19 types have issues. Fixed with cast pattern (documented in CLAUDE.md).
7. **100MB IFC file size limit**: Balances protection against browser crashes with real-world file sizes (typical IFC: 10-80MB).

---

## 11. Known Limitations (V1)

- Export timeout protection (30s max on credit polling) not implemented — low priority
- No offline mode — requires Supabase for auth and credits
- Copilot requires NVIDIA NIM — if NVIDIA is down, Copilot won't work
- No mobile responsive layout — designed for desktop demo
- `user_credits` table and `consume_credit` function were created in Supabase Dashboard, not version-controlled in seed SQL
- `BYPASS_CREDITS=true` flag still exists in agent-proxy (remove for production!)

---

## 12. Pre-Demo Checklist

- [ ] Verify Supabase project is active and reachable
- [ ] Verify Stripe webhook is configured and test with CLI: `stripe trigger checkout.session.completed`
- [ ] Verify NVIDIA NIM API key is valid
- [ ] Prepare 2 IFC test files (e.g., SampleCastle base + modified revision)
- [ ] Test Path A: Upload IFC -> Run Audit -> check report
- [ ] Test Path B: Upload 2 IFCs -> Run VO -> click row (3D focus) -> Copilot -> Export
- [ ] Ensure `BYPASS_CREDITS=true` is set for demo (so credits don't block showcase)
- [ ] Clear browser data for clean first-impression

---

## 13. Contact / Ownership

- **Developer**: seang541@gmail.com
- **Supabase Project**: `gagzfaryozgtugnhcpcs`
- **Stripe Account**: Check Stripe Dashboard for account details
- **NVIDIA NIM**: Check https://build.nvidia.com for API key management
