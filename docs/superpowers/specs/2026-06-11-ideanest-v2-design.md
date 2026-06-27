# IdeaNest V2 — Consolidation & V3 Publish Design

**Date:** 2026-06-11
**Status:** Approved (pending writing-plans)
**Author:** brainstorm session with seang541
**Target repo:** `seang541-rgb/VO-System-V3` (force-push to master)
**Source repo:** `seang541-rgb/ideanest-v1` — **read-only, must not be modified on origin**

---

## 1 · Why V2

The current `ideanest-v1.vercel.app` works, but the user identified a more important problem than messy code:

> *"I have too many features but I don't know if any of them are actually needed. I have no customer feedback baseline — that's a fatal weakness."*

V2 is **not a rewrite**. It is a **scope reset**: take the existing IdeaNest V1 codebase, keep the modules with a real-world signal, hide or remove the rest, publish the cleaner result as a separate canonical repo (V3 master), and use that as the demo + reference version going forward.

The one validated customer signal is from an East Malaysia partner asking for a "scan to see which parts are done / which are not" feature (LiDAR progress monitoring). That is a V3+ direction depending on CIP SPARK funding, and is **not in scope for this V2 spec**.

### Constraints (locked)

| Constraint | Reason |
|---|---|
| `seang541-rgb/ideanest-v1` GitHub repo **must remain untouched** — no pushes, no force-pushes, no branch changes on origin | V1 is the production version live at `ideanest-v1.vercel.app`; risk of breaking customers' live access |
| Result publishes to `seang541-rgb/VO-System-V3` master via **force push** | V3 currently holds an older snapshot; user explicitly authorized overwrite |
| All local Git operations happen inside the existing `C:\Users\johns\ideanest-v1\` working tree (no new clones, no staging directories) | Faster, no risk of forgetting to clean up a second tree |

---

## 2 · Scope — What's In, What's Out

### Keep (V2 core, default-enabled)

| Module | Path / Files | Why |
|---|---|---|
| AI Copilot (DeepSeek V4 Flash) | `src/agent/*`, `supabase/functions/agent-proxy/`, system prompt with `query_knowledge_base` first routing | The product's headline feature, validated 40/40 in 20-question bilingual test (2026-06-11) |
| Knowledge base (26 contract clauses + 21 BIM regs + 22 MS standards) | `supabase/seed/01_create_tables.sql` … `11_seed_kb_expansion_jkr_cipaa.sql` | Powers the Copilot's verified citations (CIPAA / JKR / UBBL / CIDB) |
| IFC VO comparison + Excel substantiation | `src/BimEngine.ts`, `src/vo/*`, `src/vo-diff-core.ts`, `src/vo-report.ts`, `src/components/ResultsTable.tsx`, `KPIGrid.tsx`, `BQMappingPanel.tsx` | The original VO System core, still the only path that earns its credits |
| IFC SMM2 / JKR Audit | `src/audit/*`, `src/components/AuditPanel.tsx` | IdeaNest's original value prop |
| DWG 2D takeoff | `src/dwg/*`, `src/components/DwgPanel.tsx`, `src/hooks/useDwgTakeoff.ts` | East Malaysia partner asked for this — only DWG-related signal from a real customer |
| Auth + Stripe + credits | `src/auth/*`, `src/components/AuthGuard.tsx`, `supabase/functions/stripe-webhook`, etc | Existing billing infra, no change |
| UI shell | `src/App.tsx`, `src/components/AppHeader.tsx`, `AppSidebar.tsx`, `ErrorBoundary.tsx` | Refactored to drop the RVT tab |

### Cut (deleted from V2)

| Module | Path / Files | Reason |
|---|---|---|
| RVT (Revit) APS integration — all of it | `src/rvt/`, `src/hooks/useRvtConvert.ts`, `src/components/RvtViewer.tsx`, `RvtAuditPanel.tsx`, `ViewerErrorBoundary.tsx` (RVT-specific), `supabase/functions/rvt-token/`, `rvt-convert/`, `rvt-status/`, `rvt-download/`, `supabase/seed/10_create_rvt_jobs.sql`, all `App.tsx` RVT routing, all `i18n/en.ts` and `i18n/zh.ts` `rvt.*` keys | User decision: "现在基本都没用到，砍吧". The original rationale (Autodesk API strategic prep) does not justify carrying ~635 lines of unused code into the new canonical repo. If Autodesk integration becomes a real path later, the design + edge function code remains in `ideanest-v1` repo history as reference. |

### Do not introduce (V3 had these, don't bring them over)

| V3-only module | Reason for skipping |
|---|---|
| `src/ocr/`, `src/bq-vector-match.ts`, `src/router.tsx`, `src/layouts/`, `src/report/`, `src/locales/`, `src/vo-diff-core.test.ts` | Experimental code with no current users, no proven value. V2 = focus, not feature accumulation. |

---

## 3 · Operational Flow (preserving V1 origin)

All steps run inside `C:\Users\johns\ideanest-v1\`. The local Git working tree currently sits on `main` tracking `origin/main` (= `seang541-rgb/ideanest-v1`).

```text
1. git checkout -b v3-publish              # branch off main locally; main stays clean
2. delete RVT files + edit App.tsx, i18n   # see §2 'Cut' list
3. update CLAUDE.md and README.md           # see §4
4. npx tsc --noEmit && npx vite build       # gate: typecheck + production build must pass
5. git add -A && git commit -m "feat: …"   # single commit on v3-publish (never reaches origin/main)
6. git remote add v3 https://github.com/seang541-rgb/VO-System-V3.git
7. git push -f v3 v3-publish:master         # force-push to V3 only
8. git checkout main                        # return to main — origin/main untouched
9. git remote remove v3                     # (optional cleanup)
```

**Verification after step 7:**
- `git log origin/main..main` should be empty (no new commits on `main`)
- `gh api repos/seang541-rgb/ideanest-v1/commits?per_page=1` should still show commit `e62b484` as latest (today's earlier DeepSeek migration)
- `gh api repos/seang541-rgb/VO-System-V3/contents/src` should show no `rvt/` folder, present `dwg/`, present `agent/`

### Risk: V3 Vercel auto-deploy

If `VO-System-V3` has a connected Vercel project, the force push will trigger a build & deploy. This is acceptable — the user wants V3 to become the new canonical demo site. If V3 has no Vercel link, nothing visible changes on the web. Either outcome is fine. (If user later realizes V3 had a sensitive secret set differently, they can disconnect Vercel from V3 before step 7 — they will be reminded in the implementation plan.)

---

## 4 · Documentation Updates

Two files change to match the new scope:

| File | Change |
|---|---|
| `CLAUDE.md` | Replace VO-System-V3 era description with: "Idea Nest — AI-Powered Construction Intelligence Platform. Browser-based VO comparison, SMM2/JKR audit, DWG takeoff, and a DeepSeek-V4-Flash-powered Copilot grounded in a Malaysian construction knowledge base (CIPAA / JKR / UBBL / CIDB / MS)." List the kept modules. Note the cut RVT module. Link the spec. |
| `README.md` | Same brand description as `CLAUDE.md` headline + a short "How to run" + "Feature flags" section (empty list for now, will fill if/when we add hidden modules in future). |

No new env vars, no changes to existing Supabase secrets.

---

## 5 · What is **explicitly out of scope**

These were discussed during brainstorming but moved to follow-up specs:

| Idea | Where it goes |
|---|---|
| LiDAR progress scan (East Malaysia partner ask) | Separate V2.1 spec, gated on CIP SPARK funding result + iPad Pro purchase |
| RVT feature-flag-hidden alternative (`VITE_ENABLE_RVT`) | User chose hard cut over flag. If later needed, the implementation is trivial because the original `ideanest-v1` repo history still contains the code. |
| Migrating the old `D:/IdeaNest` Node + Python portable tool into the SaaS | Already implicitly done — V2 carries the IdeaNest audit functionality natively as TypeScript |
| Switching LLM, redesigning prompt, retrying language matching | Was just done in commit `e62b484` (2026-06-11). V2 inherits, no further work. |
| Marketing landing page, beta user funnel, paid tier polish | Phase 3 follow-up, not this spec |

---

## 6 · Success Criteria

V2 is done when **all** of these are true:

1. `seang541-rgb/VO-System-V3` master = clean IdeaNest V2 code, no RVT, has DWG, has new Copilot + KB
2. `seang541-rgb/ideanest-v1` master commit is still `e62b484` (today's DeepSeek migration) — **byte-identical to before V2 work started**
3. Local `main` branch in `C:\Users\johns\ideanest-v1\` matches `origin/main` (no untracked changes added to main)
4. Build passes (`npx tsc --noEmit` exit 0, `npx vite build` exit 0) on the V2 tree
5. `CLAUDE.md` and `README.md` describe the V2 scope accurately
6. (Optional but recommended) Quick smoke test: open the V3 Vercel preview (if it auto-deployed) and confirm the Copilot answers a CIPAA / EOT question correctly

---

## 7 · Open questions

None blocking. The two questions that came up during brainstorm and weren't explicitly answered are:

1. **Does V3 have a Vercel project connected?** → Will check during execution; if yes, force push triggers redeploy (acceptable per §3).
2. **Should V2 also remove the trio of dev PPT files committed to V1 today?** → No, they were never committed (they are in V1 working tree only). They will not be copied to V3.

---

## Appendix A — File-level cut list (authoritative)

Files / dirs to **delete** before pushing to V3:

```
src/rvt/
src/hooks/useRvtConvert.ts
src/components/RvtViewer.tsx
src/components/RvtAuditPanel.tsx
supabase/functions/rvt-token/
supabase/functions/rvt-convert/
supabase/functions/rvt-status/
supabase/functions/rvt-download/
supabase/seed/10_create_rvt_jobs.sql
```

Files to **edit** (remove RVT references):

```
src/App.tsx                   — drop RVT tab, route, state, props
src/components/AppHeader.tsx  — drop RVT tab if present
src/components/AppSidebar.tsx — drop RVT section if present
src/components/ViewerErrorBoundary.tsx — review; if RVT-only, delete; if shared with IFC viewer, keep
src/i18n/en.ts                — remove keys: rvt.*, sidebar.rvt*, etc
src/i18n/zh.ts                — same removal as en.ts
CLAUDE.md                     — full rewrite (see §4)
README.md                     — full rewrite (see §4)
```

Run after edits:

```bash
npx tsc --noEmit   # must exit 0
npx vite build     # must exit 0 and dist/ populates
```
