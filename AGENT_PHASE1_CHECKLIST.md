# Phase 1 Verification Checklist — IFC Copilot

> ✅ **COMPLETED 2026-05-08.** Phase 1 verified end-to-end with NVIDIA NIM + Llama 3.3 70B. See `PROGRESS_LOG.md` for milestone details. This file is kept as historical reference; the Anthropic-specific steps below are obsolete (LLM backend was switched to NVIDIA).

Work through this sequentially. Don't skip ahead — each section assumes the previous one passed. If a step fails, fix it before moving on.

Created: 2026-04-18. Target: complete within 3 days of opening this file.

---

## 0. Prerequisites

- [ ] Node.js 20+ installed and on PATH (`node -v` works in PowerShell)
- [ ] `npx supabase` available (`npx supabase --version`)
- [ ] Anthropic API key in hand (starts with `sk-ant-`)
- [ ] You know your Supabase project ref (e.g. `abcdefgh`)
- [ ] `.env` contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`

---

## 1. Local static checks

```bash
cd "D:/VO system"
npm install          # only if lockfile changed or first time
npm run lint         # = tsc --noEmit
```

- [ ] `npm run lint` exits with code 0 (no TS errors)
- [ ] If errors reference `src/agent/*` or `src/components/CopilotPanel.tsx`: paste the error at me and I'll fix.
- [ ] If errors are in unrelated files you haven't touched: likely pre-existing, not from this change.

```bash
npm run build        # confirms Vite can bundle the new files
```

- [ ] Build succeeds.
- [ ] Chunk warnings about size are OK (pre-existing).

---

## 2. Local dev server boots

```bash
npm run dev
```

- [ ] Opens on `http://localhost:3000` without console errors.
- [ ] Sign-in UI shows (AuthGuard).
- [ ] Sign in with an existing test account.
- [ ] Three tabs now visible at the top: **VO Overview & 3D**, **BQ Mapping & Valuation**, **IFC Copilot** (purple).

---

## 3. Copilot tab renders before Edge Function is deployed

Click the **IFC Copilot** tab. You should see:

- [ ] Empty state with 4 sample prompts.
- [ ] Status line reading `Base IFC: not loaded · Revision IFC: not loaded · Comparison: not run`.
- [ ] Textarea is enabled (because you are signed in).
- [ ] Clicking a sample prompt → error bubble like `Agent proxy failed (404)` or similar network error. **This is expected at this stage** — it confirms the frontend is trying to call the Edge Function. Deploy it next.

---

## 4. Deploy `agent-proxy` Edge Function

```bash
cd "D:/VO system"
npx supabase login                              # once
npx supabase link --project-ref YOUR_PROJECT_REF  # once
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy agent-proxy
```

- [ ] `secrets set` completes without error.
- [ ] `functions deploy agent-proxy` prints a success URL like `https://YOUR_PROJECT_REF.supabase.co/functions/v1/agent-proxy`.
- [ ] In Supabase Dashboard → Edge Functions, `agent-proxy` shows **Deployed** status.

---

## 5. Edge Function smoke tests (raw curl)

Get a user access token first. Easiest: in the running `npm run dev` app, open DevTools → Console:

```js
(await supabase.auth.getSession()).data.session.access_token
```

Copy the string. Store it as `TOKEN` in your shell.

### 5a. No auth → 401

```bash
curl -i -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/agent-proxy" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}]}'
```

- [ ] Returns HTTP 401 with `{"error":"Missing bearer token."}`.

### 5b. Auth + simple ping → 200 and assistant text

```bash
curl -i -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/agent-proxy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Reply with the single word PONG"}]}'
```

- [ ] HTTP 200.
- [ ] Body contains `"response":{...}` with a `content` array including a `text` block.
- [ ] Body contains `"credits_balance": <number>` that is **1 lower than before this call**.
- [ ] Verify credit decrement: in Supabase SQL editor run `SELECT credits_balance FROM user_credits WHERE user_id = '<your-user-uuid>';` — matches.

### 5c. Out of credits → 402

Temporarily set your balance to 0: `UPDATE user_credits SET credits_balance = 0 WHERE user_id = '<your-uuid>';`

- [ ] Re-run the curl from 5b.
- [ ] Returns HTTP 402 with `{"error":"Insufficient credits. Please top up."}`.
- [ ] Restore your balance: `UPDATE user_credits SET credits_balance = 50 WHERE user_id = '<your-uuid>';`

---

## 6. End-to-end UI flow

Back in the running dev app (refresh first).

### 6a. Copilot works before any IFC is loaded

Open **IFC Copilot** tab. Prompt:

> Hello, what can you do?

- [ ] Assistant bubble appears with a greeting + capability list (mentions query_ifc, compare_ifc, etc.).
- [ ] Credit counter in the header drops by 1.
- [ ] No error bubbles.

### 6b. `query_ifc` — without IFC loaded

Prompt:

> How many IfcWall components are in the base model?

- [ ] Tool bubble shows `query_ifc` expanded → result JSON has `total: 0, matched: 0`.
- [ ] Assistant explains that no model is loaded.

### 6c. Load both IFCs

Upload `basin-tessellation.ifc` as Base and `V2_basin.ifc` as Revision (in the Overview tab).

- [ ] Both models show "ready" with component counts.
- [ ] Switch back to Copilot tab.
- [ ] Status line updates to `Base IFC: N components · Revision IFC: M components`.

### 6d. `query_ifc` — with IFC loaded

Prompt:

> List 5 components from the base model with the largest volume quantity.

- [ ] Tool bubble shows `query_ifc` with input `{ "model": "base", "limit": 5 }` (or similar).
- [ ] Assistant produces a table/list referencing real qsLabels from your IFC.

### 6e. `compare_ifc` + `summarize_commercial_impact` chain

Prompt:

> Compare the two models and give me the top 5 biggest commercial actions by amount.

- [ ] Tool bubble 1: `compare_ifc` — result has `summary: { added, deleted, modified, ... }` matching what the Overview tab would show.
- [ ] Tool bubble 2: `summarize_commercial_impact` — result has `topActions` array.
- [ ] Assistant produces a numbered list of top 5 with qsLabel + amount.
- [ ] Status line now shows `Comparison: cached`.

### 6f. `export_vo_excel`

Prompt:

> Generate the VO Excel workbook.

- [ ] Tool bubble: `export_vo_excel` returns `{ ok: true, ... }`.
- [ ] Browser downloads `vo-substantiation-*.xlsx`.
- [ ] Open the file; sheets match the existing export: `VO Cover Sheet`, `Summary`, `Star Rate Register`, `Star Rate Build-up`, `BQ Mapping Register`, `VO Substantiation`.

### 6g. `audit_ifc` stub

Prompt:

> Run an IdeaNest audit on the base model.

- [ ] Tool bubble: `audit_ifc` returns `{ notImplemented: true, ... }`.
- [ ] Assistant explains the feature is Phase 2 and not yet wired.

---

## 7. Credit accounting sanity

- [ ] Starting balance noted before this session: `____`.
- [ ] Expected calls made during Section 6: `____` (one per user message — 6a, 6b, 6d, 6e, 6f, 6g = 6 calls if you followed exactly).
- [ ] Actual balance after: matches starting minus expected.
- [ ] Any drift? → Check `stripe_webhook_events` table + Edge Function logs in Supabase Dashboard.

---

## 8. Reset + resilience

- [ ] Click **Reset** in the Copilot header → chat clears, status line unchanged.
- [ ] Send a new prompt → works fine (session reinitialized).
- [ ] Sign out, sign back in, open Copilot → empty state again (expected; Phase 1 does not persist history).

---

## 9. Error path polish

- [ ] If Anthropic API is down (simulate by temporarily setting a bad `ANTHROPIC_API_KEY`), the chat shows a readable error, not a white screen.
- [ ] Restore the real key and redeploy.

---

## 10. Production readiness gate

Before calling Phase 1 "done":

- [ ] All sections 1–9 ticked.
- [ ] Noted any rough edges for Phase 2 (streaming, history persistence, tool UX).
- [ ] Updated `AGENT_SETUP.md` with any deployment gotchas you hit.
- [ ] Committed the new files to git (if this repo uses git).

---

## If something breaks

Come back and paste the error + which step. Quickest to fix in order of likelihood:

1. **`consume_credit` signature mismatch** — the RPC may take args in your deployment. Check `supabase/sql/` and existing `App.tsx` usage.
2. **Anthropic tool schema rejection** — usually a typo in `src/agent/tools.ts`. Check the exact error body returned by the proxy.
3. **CORS / auth preflight** — Edge Function returns early for `OPTIONS`. If stuck, log the `request.headers` in the function and redeploy.
4. **Model ID** — `claude-opus-4-7` is the default in `agent-proxy/index.ts`. If your account doesn't have access, change to `claude-sonnet-4-6` or `claude-haiku-4-5-20251001`.
