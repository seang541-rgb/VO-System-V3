# Idea Nest Copilot — Setup & Architecture

> **Brand:** Idea Nest · VO Copilot · 变更单与合约索赔智能体
> **Status:** Phase 1 ✅ · Phase 2.5 ✅ · Phase 2 (audit_ifc) pending
> **Last updated:** 2026-05-09

---

## What ships in this build

A conversational agent embedded in the Idea Nest UI (formerly VO System). Reuses Supabase Auth, the existing `consume_credit` RPC, browser-side IFC engine, and Stripe billing. **No new database schema needed.**

## Files (current)

| Path | Purpose |
| --- | --- |
| `src/agent/tools.ts` | Tool schemas (Anthropic + OpenAI + Gemini wrappers) + client-side executor. |
| `src/agent/agent-client.ts` | `AgentSession` driving the OpenAI-style tool-call loop. Includes dedup + force-text fallback. |
| `src/components/CopilotPanel.tsx` | Chat UI rendered as the main view. |
| `supabase/functions/agent-proxy/index.ts` | Edge Function: verifies JWT, debits 1 credit, forwards to NVIDIA NIM. |
| `src/App.tsx` | Idea Nest shell (header + sidebar + main pane). |
| `src/main.tsx` | App bootstrap. |

## Tools exposed to the agent (6)

| Tool | What it does |
| --- | --- |
| `query_ifc` | Filter base/revision components by type / qsLabel / SMM2 section. |
| `compare_ifc` | Run (or reuse cached) VO comparison; returns summary + top modified items + samples. |
| `summarize_commercial_impact` | Buildable commercial breakdown — omissions, additions, top actions by amount. |
| `analyze_contract_clause` | **(Phase 2.5)** Pack VO snapshot + user-pasted clause → assistant reasons about claim eligibility. |
| `export_vo_excel` | Trigger `exportVoSubstantiationWorkbook` → browser download. |
| `audit_ifc` | **(Phase 2 stub)** Returns `notImplemented` until IdeaNest port lands. |

Tools execute **client-side** because IFC data already lives in the browser. The Edge Function only handles auth, credit debit, and the LLM API call.

## LLM backend

**Current:** NVIDIA NIM with `meta/llama-3.3-70b-instruct` (OpenAI-compatible).

Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`
Tool calling: native, via `tools` array in OpenAI format.
Free tier: 1 year via [build.nvidia.com](https://build.nvidia.com).

Switchable to OpenAI / Anthropic / other OpenAI-compatible providers by changing `NVIDIA_ENDPOINT` and `NVIDIA_API_KEY` in `supabase/functions/agent-proxy/index.ts`.

## Required Supabase secrets

```
NVIDIA_API_KEY=nvapi-...
SUPABASE_URL=https://<project-ref>.supabase.co  (auto-injected)
SUPABASE_ANON_KEY=...                            (auto-injected)
```

Set with:
```powershell
npx supabase secrets set NVIDIA_API_KEY=nvapi-... --project-ref <project-ref>
```

## Deploying the Edge Function

```powershell
cd "D:/VO system"
npx supabase functions deploy agent-proxy --no-verify-jwt --project-ref <project-ref>
```

The `--no-verify-jwt` flag is required because the function does its own JWT verification via direct REST call to `/auth/v1/user` (Supabase JS client had auth quirks in the Edge runtime).

## Tool-loop hardening (added 2026-05-09)

Llama 3.3 70B tends to retry tools instead of giving up on errors. Three layers of defense in `AgentSession.send`:

1. **MAX_HOPS = 4** — hard limit on rounds
2. **Per-turn dedup** — exact `(toolName, argsJson)` matches return `DUPLICATE_TOOL_CALL` error without execution
3. **Force-text fallback** — when a tool returns `PREREQUISITE_NOT_MET`, the next hop sends `tools: []` so the model must reply in plain text

Tool error messages prefixed with `PREREQUISITE_NOT_MET:` (in `executeAgentTool`) trigger this fallback.

## Credit accounting

1 credit per agent conversation turn (whether or not tools are called). Same balance pool as Excel export. Topped up via Stripe Checkout (MYR 499 = 50 credits).
