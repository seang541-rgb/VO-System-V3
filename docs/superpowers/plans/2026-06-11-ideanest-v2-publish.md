# IdeaNest V2 — Consolidation & V3 Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the current IdeaNest V1 codebase, cut the RVT (Autodesk Revit / APS) module entirely, refresh project docs, and force-publish the result to `seang541-rgb/VO-System-V3` master — while leaving `seang541-rgb/ideanest-v1` GitHub repo byte-identical to before this work started.

**Architecture:** All edits happen inside the existing `C:\Users\johns\ideanest-v1\` working tree on a new local branch `v3-publish`. Branch off `main`, delete RVT files, edit 5 reference sites in source + 2 docs, run typecheck + build as the verification gate, commit once, force-push to a temporary `v3` remote pointed at VO-System-V3, then return to `main` so the local checkout matches `origin/main`. The `origin` remote (= ideanest-v1) is never pushed to.

**Tech Stack:** React 19 + TypeScript 5.8 + Vite 6, web-ifc, Three.js, Supabase, Stripe, DeepSeek V4 Flash via Supabase edge function. No new tech. No npm install.

**Spec:** `docs/superpowers/specs/2026-06-11-ideanest-v2-design.md`

---

## Pre-flight (read before starting)

1. The current local `main` HEAD should be commit `7d23305` (today's spec commit) which is one commit ahead of `origin/main` (= `e62b484`, today's DeepSeek migration). Verify with:
   ```bash
   git status   # expect: "Your branch is ahead of 'origin/main' by 1 commit"
   git log --oneline -3
   ```
2. Working tree may have uncommitted `.tmp_*` / `IdeaNest_CIP_Spark_Pitch_*.pptx` / `apply_bg_images.py` / `supabase/.temp/*` / `.claude/launch.json` — that's fine, those don't get staged.
3. **CRITICAL:** No command in this plan ever pushes to `origin`. If a step would push to `origin/main`, the plan is wrong — STOP and ask.

---

## Task 1: Create the v3-publish branch

**Files:** none (Git branch operation only)

- [ ] **Step 1: Verify clean state of main**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git status --short && git log --oneline -2
```

Expected: status shows untracked tmp files only (no staged changes on `main` other than expected), and log shows `7d23305 docs(spec): IdeaNest V2 …` as HEAD with `e62b484 feat(copilot): migrate to DeepSeek V4 Flash …` as parent.

- [ ] **Step 2: Create and switch to v3-publish branch**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git checkout -b v3-publish
```

Expected: `Switched to a new branch 'v3-publish'`

- [ ] **Step 3: Confirm branch**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git branch --show-current
```

Expected: `v3-publish`

- [ ] **Step 4: No commit yet** (this task only creates the branch)

---

## Task 2: Delete RVT source files, hooks, components, edge functions, seed

**Files (all deleted):**
- `src/rvt/aps-client.ts`
- `src/rvt/types.ts`
- `src/rvt/` (the now-empty directory)
- `src/hooks/useRvtConvert.ts`
- `src/components/RvtViewer.tsx`
- `src/components/RvtAuditPanel.tsx`
- `supabase/functions/rvt-token/` (directory + contents)
- `supabase/functions/rvt-convert/` (directory + contents)
- `supabase/functions/rvt-status/` (directory + contents)
- `supabase/functions/rvt-download/` (directory + contents)
- `supabase/seed/10_create_rvt_jobs.sql`

`ViewerErrorBoundary.tsx` is **kept** — it wraps the shared 3D viewer, not RVT-specific.

- [ ] **Step 1: Delete RVT source + hook + components**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && rm -rf src/rvt src/hooks/useRvtConvert.ts src/components/RvtViewer.tsx src/components/RvtAuditPanel.tsx
```

- [ ] **Step 2: Delete RVT edge functions and seed**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && rm -rf supabase/functions/rvt-token supabase/functions/rvt-convert supabase/functions/rvt-status supabase/functions/rvt-download supabase/seed/10_create_rvt_jobs.sql
```

- [ ] **Step 3: Verify deletions**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && ls src/rvt 2>&1 ; ls src/hooks/useRvtConvert.ts 2>&1 ; ls src/components/Rvt*.tsx 2>&1 ; ls supabase/functions/ | grep -i rvt ; ls supabase/seed/*rvt* 2>&1
```

Expected (each line): "No such file or directory" or empty output. No matches.

- [ ] **Step 4: No commit yet** (we wait until all edits are done to commit atomically)

---

## Task 3: Edit src/lib/format.ts — remove 'rvt' from ActiveTab type

**Files:**
- Modify: `src/lib/format.ts:12`

- [ ] **Step 1: Apply edit**

In `src/lib/format.ts` line 12, change:
```ts
export type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit' | 'guide' | 'dwg' | 'rvt';
```

to:
```ts
export type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit' | 'guide' | 'dwg';
```

- [ ] **Step 2: Verify no other `'rvt'` literal references in src/lib/**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && grep -rn "'rvt'" src/lib/
```

Expected: no output.

---

## Task 4: Edit src/i18n/en.ts and src/i18n/zh.ts — remove all RVT keys

**Files:**
- Modify: `src/i18n/en.ts` (delete 1 header tab key + 10 `rvt.*` keys + 2 `sidebar.rvt*` keys = 13 lines)
- Modify: `src/i18n/zh.ts` (same 13 lines)

- [ ] **Step 1: Edit en.ts — delete the `'header.tab.rvt'` line**

In `src/i18n/en.ts` line 12, delete the line:
```ts
  'header.tab.rvt': 'RVT',
```

- [ ] **Step 2: Edit en.ts — delete the 12 RVT-related lines (lines 405–416)**

In `src/i18n/en.ts`, delete these 12 lines:
```ts
  'rvt.title': 'RVT Audit',
  'rvt.uploadHint': 'Upload a Revit (.rvt) file for 3D preview and cloud-powered audit',
  'rvt.uploadBtn': 'Upload RVT',
  'rvt.viewerWaiting': 'Upload a .rvt file to preview',
  'rvt.viewerLoading': 'Loading 3D model...',
  'rvt.auditCost': 'Audit costs {cost} credits',
  'rvt.runAudit': 'Run RVT Audit',
  'rvt.conversionFailed': 'RVT conversion failed',
  'rvt.auditComplete': 'Audit complete: {count} elements in {duration}s',
  'rvt.insufficientCredits': 'Not enough credits for RVT audit. Please top up.',
  'sidebar.rvtAudit': 'RVT Audit',
  'sidebar.rvtAuditSub': 'Revit cloud audit',
```

- [ ] **Step 3: Edit zh.ts — delete the `'header.tab.rvt'` line**

In `src/i18n/zh.ts` line 12, delete the line:
```ts
  'header.tab.rvt': 'RVT',
```

- [ ] **Step 4: Edit zh.ts — delete the 12 RVT-related lines (lines 405–416)**

In `src/i18n/zh.ts`, delete these 12 lines:
```ts
  'rvt.title': 'RVT 审计',
  'rvt.uploadHint': '上传 Revit (.rvt) 文件进行 3D 预览和云端审计',
  'rvt.uploadBtn': '上传 RVT',
  'rvt.viewerWaiting': '上传 .rvt 文件开始预览',
  'rvt.viewerLoading': '加载 3D 模型中...',
  'rvt.auditCost': '审计消耗 {cost} 积分',
  'rvt.runAudit': '运行 RVT 审计',
  'rvt.conversionFailed': 'RVT 转换失败',
  'rvt.auditComplete': '审计完成：{count} 个构件，耗时 {duration}s',
  'rvt.insufficientCredits': 'RVT 审计积分不足，请充值。',
  'sidebar.rvtAudit': 'RVT 审计',
  'sidebar.rvtAuditSub': 'Revit 云端审计',
```

- [ ] **Step 5: Verify no RVT keys remain in i18n**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && grep -nE "[Rr]vt|RVT" src/i18n/
```

Expected: no output.

---

## Task 5: Edit src/components/AppSidebar.tsx — drop unused onUploadRvt prop

**Files:**
- Modify: `src/components/AppSidebar.tsx:39` (delete `onUploadRvt: () => void;`)
- Modify: `src/components/AppSidebar.tsx:50` (remove `onUploadRvt` from destructure)

Note: `onUploadRvt` was declared in the props interface and destructured, but **never used in JSX**. Safe to delete in both spots without touching markup.

- [ ] **Step 1: Delete the interface line**

In `src/components/AppSidebar.tsx` line 39, delete the line:
```ts
  onUploadRvt: () => void;
```

- [ ] **Step 2: Remove from destructure on line 50**

In `src/components/AppSidebar.tsx` line 50, change:
```ts
  onRunAudit, auditState, onUploadRvt, onResetWorkspace,
```

to:
```ts
  onRunAudit, auditState, onResetWorkspace,
```

- [ ] **Step 3: Verify no rvt references remain**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && grep -n "rvt\|Rvt\|RVT" src/components/AppSidebar.tsx
```

Expected: no output.

---

## Task 6: Edit src/components/AppHeader.tsx — drop the commented-out RVT tab line

**Files:**
- Modify: `src/components/AppHeader.tsx:20` (delete the commented-out line)

The tab is already commented out from a prior cleanup. Removing the dead comment fully retires the term.

- [ ] **Step 1: Delete the commented line**

In `src/components/AppHeader.tsx` line 20, delete the line:
```ts
  // { key: 'rvt', i18nKey: 'header.tab.rvt' },
```

- [ ] **Step 2: Verify**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && grep -n "rvt\|Rvt\|RVT" src/components/AppHeader.tsx
```

Expected: no output.

---

## Task 7: Edit src/App.tsx — remove RVT import, hook call, JSX, file input, prop pass

**Files:**
- Modify: `src/App.tsx` — 6 surgical edits at known line numbers (verify with grep before each edit; line numbers may shift as edits accumulate, so re-grep)

- [ ] **Step 1: Delete the RvtAuditPanel import**

In `src/App.tsx`, delete the line that contains:
```ts
import RvtAuditPanel from './components/RvtAuditPanel';
```

- [ ] **Step 2: Delete the useRvtConvert import**

In `src/App.tsx`, delete the line that contains:
```ts
import { useRvtConvert, RVT_CREDIT_COST } from './hooks/useRvtConvert';
```

- [ ] **Step 3: Delete the RVT hook block**

In `src/App.tsx`, delete this entire block:
```tsx
  // ── Hook: RVT Convert ─────────────────────────────────────────────────
```

then locate and delete the following block which calls `useRvtConvert`:
```tsx
  const rvt = useRvtConvert({
    ensureEngine, setSysLog, setActiveTab,
    user, setCreditsBalance, setShowPaywall, refreshCredits,
  });
  const { rvtFile, rvtUrn, rvtConvertStatus, rvtConvertProgress, rvtConvertError, rvtAuditResult, rvtAuditDurationMs, rvtInputRef, handleRvtUpload, runRvtAudit } = rvt;
```

Note: the comment `// ── Hook: RVT Convert ─────────────────────────────────────────────────` appears to be misplaced just above the `useBilling` hook in the source. After deletion, the `useBilling` hook block should remain — only remove the comment line and the `const rvt = …` / destructure block.

- [ ] **Step 4: Delete the hidden RVT file input**

In `src/App.tsx`, delete this single line:
```tsx
      <input ref={rvtInputRef} type="file" className="hidden" accept=".rvt,.RVT" onChange={handleRvtUpload} />
```

- [ ] **Step 5: Remove the onUploadRvt prop from `<AppSidebar />` invocation**

In `src/App.tsx`, find the AppSidebar JSX block and delete the line:
```tsx
          onUploadRvt={() => rvtInputRef.current?.click()}
```

- [ ] **Step 6: Delete the RVT tab branch in the render switch**

In `src/App.tsx`, delete this entire JSX block:
```tsx
        ) : activeTab === 'rvt' ? (
          <RvtAuditPanel
            rvtFile={rvtFile}
            rvtUrn={rvtUrn}
            convertStatus={rvtConvertStatus}
            convertProgress={rvtConvertProgress}
            convertError={rvtConvertError}
            auditResult={rvtAuditResult}
            auditDurationMs={rvtAuditDurationMs}
            creditCost={RVT_CREDIT_COST}
            onUpload={() => rvtInputRef.current?.click()}
            onRunAudit={runRvtAudit}
            canRunAudit={!!rvtFile && rvtConvertStatus === 'idle' && !!user}
          />
```

After deletion, the conditional chain becomes `...) : (` going straight to the CopilotPanel default branch. Verify the `)` and `:` balance around the deletion — the line before the deleted block ends with `/>` (DwgPanel close) and the line after is `        ) : (`. After edit, the DwgPanel `/>` is directly followed by `        ) : (`.

- [ ] **Step 7: Verify all RVT references gone from App.tsx**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && grep -nE "[Rr]vt|RVT" src/App.tsx
```

Expected: no output.

---

## Task 8: Rewrite CLAUDE.md to V2 scope

**Files:**
- Modify: `CLAUDE.md` (replace the project overview + tech stack lines to drop RVT)

- [ ] **Step 1: Apply edit — overview**

In `CLAUDE.md`, change:
```md
IFC-based audit, VO comparison, and quantity takeoff platform. Supports IFC, DWG, and RVT files.
Targeted at Malaysian construction industry — JKR/SMM2 classification standards.
Dual selling points: (A) instant audit/quantity takeoff, (B) VO comparison with AI copilot.
```

to:
```md
IFC + DWG audit, VO comparison, and quantity takeoff platform with a DeepSeek-V4-Flash-powered Copilot grounded in a Malaysian construction knowledge base (CIPAA / JKR / UBBL / CIDB / MS).
Targeted at Malaysian construction industry — JKR / SMM2 classification standards.
Dual selling points: (A) instant audit / quantity takeoff (IFC + DWG), (B) VO comparison with AI Copilot.
```

- [ ] **Step 2: Apply edit — tech stack (LLM line)**

In `CLAUDE.md`, change the AI Agent line:
```md
- **AI Agent**: NVIDIA NIM / Llama 3.3 70B (OpenAI-compatible via Supabase Edge Function proxy)
```

to:
```md
- **AI Agent**: DeepSeek V4 Flash (OpenAI-compatible) via Supabase Edge Function proxy, with `query_knowledge_base` tool fanning out to contract clauses + UBBL + MS standards + BIM regulations + measurement codes
```

- [ ] **Step 3: Verify no RVT references remain in CLAUDE.md**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && grep -nE "[Rr]vt|RVT|Revit" CLAUDE.md
```

Expected: no output.

---

## Task 9: Refresh README.md headline (RVT-clean, brand update)

**Files:**
- Modify: `README.md` lines 1–3

README.md currently says "VO System MVP" — outdated. Update to IdeaNest brand. README does not currently mention RVT, so the rewrite is brand-only.

- [ ] **Step 1: Replace top of README.md**

Change the first 3 lines of `README.md`:
```md
# VO System MVP

A lightweight IFC-based VO comparison MVP that can:
```

to:
```md
# IdeaNest — IFC + DWG Audit & VO Copilot

A browser-based platform for Malaysian QS, contractors, architects, and engineers. Combines:

- Two-IFC VO comparison with `Added` / `Deleted` / `Modified` detection
- SMM2 / JKR audit + quantity takeoff
- DWG 2D takeoff for sites that don't yet use BIM
- A DeepSeek V4 Flash AI Copilot grounded in a 60+ row knowledge base (CIPAA 2012, JKR 203A, UBBL, CIDB grades, MS standards)

The original VO comparison MVP feature set is below:
```

(Keep everything that follows unchanged — bullet list, run instructions, CLI section, etc. The "The original VO comparison MVP feature set is below:" line introduces the existing content.)

- [ ] **Step 2: Verify no RVT references**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && grep -nE "[Rr]vt|RVT|Revit" README.md
```

Expected: no output.

---

## Task 10: Verification gate — typecheck + production build

This is the safety net. If these fail, all prior edits are wrong and must be fixed before committing.

- [ ] **Step 1: TypeScript type-check**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && npx tsc --noEmit
```

Expected: exit code 0, no output.

If errors mention any remaining `rvt`/`Rvt`/`RVT` symbol, return to Task 7 / 5 / 4 and find the missed reference (likely a deleted prop being passed by name from somewhere).

- [ ] **Step 2: Production build**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && npx vite build
```

Expected: exit code 0, final line shows `✓ built in XXs`, `dist/` populates with `index.html`, `assets/*.js`, `assets/*.css`.

- [ ] **Step 3: Confirm bundle size sanity**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && ls -lh dist/assets/*.js | head -5
```

Expected: bundle sizes within ~10% of the pre-cut baseline (e.g. `index-*.js` should be ~660 KB ± 30 KB, `three-*.js` ~3.1 MB unchanged, `libredwg-web-*.js` ~8.6 MB unchanged because DWG was kept).

---

## Task 11: Commit v3-publish

**Files:** stage all V2 changes (deleted files + edits to App.tsx, AppSidebar.tsx, AppHeader.tsx, format.ts, en.ts, zh.ts, CLAUDE.md, README.md).

- [ ] **Step 1: Stage all relevant changes (do not stage tmp/PPT files)**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git add \
  src/App.tsx \
  src/lib/format.ts \
  src/components/AppSidebar.tsx \
  src/components/AppHeader.tsx \
  src/i18n/en.ts src/i18n/zh.ts \
  CLAUDE.md README.md \
  src/rvt src/hooks/useRvtConvert.ts \
  src/components/RvtViewer.tsx src/components/RvtAuditPanel.tsx \
  supabase/functions/rvt-token supabase/functions/rvt-convert \
  supabase/functions/rvt-status supabase/functions/rvt-download \
  supabase/seed/10_create_rvt_jobs.sql
```

(`git add` on deleted paths stages the deletion. `git add` on directories handles both edits + deletions.)

- [ ] **Step 2: Verify stage**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git status --short
```

Expected: staged lines (`M`, `D`) for the above files only. No untracked `.tmp_*` or PPT files staged.

- [ ] **Step 3: Commit**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git commit -m "$(cat <<'EOF'
feat: IdeaNest V2 — drop RVT module, refresh brand to V3

Cut: src/rvt/, useRvtConvert, RvtViewer, RvtAuditPanel, 4 rvt-* edge
functions, rvt_jobs seed, all related i18n / App.tsx wiring.
RVT (Autodesk APS) PoC code remains in the ideanest-v1 repo history
for future Autodesk integration work; V2 surface area is intentionally
smaller to focus on validated modules (Copilot + IFC VO + Audit + DWG).

Kept: Copilot (DeepSeek V4 Flash + KB), IFC VO comparison, SMM2/JKR
audit, DWG 2D takeoff, Auth/Stripe/credits, full knowledge base seed.

Docs: CLAUDE.md and README.md refreshed to describe the V2 scope.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: `[v3-publish <hash>] feat: IdeaNest V2 — drop RVT module, refresh brand to V3`, file change summary.

- [ ] **Step 4: Confirm commit on v3-publish, not main**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git log --oneline -3 && git log --oneline main -3
```

Expected: `v3-publish` log shows the new commit at HEAD; `main` log does NOT.

---

## Task 12: Add V3 remote and force-push v3-publish to V3 master

**CRITICAL:** This is the only step that touches GitHub. Verify everything before running.

- [ ] **Step 1: Add the V3 remote**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git remote add v3 https://github.com/seang541-rgb/VO-System-V3.git && git remote -v
```

Expected output ends with two `v3` lines pointing to VO-System-V3, alongside the existing `origin` lines pointing to ideanest-v1.

- [ ] **Step 2: Final safety check — origin remains untouched**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git log origin/main..main --oneline
```

Expected: shows the spec commit `7d23305 docs(spec): …` only. (The v3-publish commit is on `v3-publish`, not on `main`, so it's not in this range.)

If output unexpectedly shows the V2-RVT-cut commit on `main`, STOP — something went wrong; do not push.

- [ ] **Step 3: Dry-run the push (no actual transfer)**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git push -f --dry-run v3 v3-publish:master
```

Expected: shows what would be pushed; no errors.

- [ ] **Step 4: Force-push to V3 master**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git push -f v3 v3-publish:master
```

Expected: `+ <old>...<new> v3-publish -> master (forced update)` (or `... -> master (new branch)` if V3 master was empty, unlikely).

- [ ] **Step 5: Remote-side verification**

Run:
```bash
gh api repos/seang541-rgb/VO-System-V3/contents/src 2>&1 | python -c "import json,sys; data=json.load(sys.stdin); names=[x['name'] for x in data]; print('rvt present:', 'rvt' in names); print('dwg present:', 'dwg' in names); print('agent present:', 'agent' in names)"
```

Expected:
```
rvt present: False
dwg present: True
agent present: True
```

- [ ] **Step 6: Verify origin (ideanest-v1) is untouched**

Run:
```bash
gh api repos/seang541-rgb/ideanest-v1/commits?per_page=1 2>&1 | python -c "import json,sys; print(json.load(sys.stdin)[0]['sha'][:7])"
```

Expected: `e62b484` (today's DeepSeek migration). NOT `7d23305` (the local spec commit, never pushed). NOT the v3-publish commit hash.

---

## Task 13: Clean up local state

- [ ] **Step 1: Switch back to main**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git checkout main && git log --oneline -2
```

Expected: HEAD is `7d23305 docs(spec): …` (local-only spec commit, parent `e62b484`).

- [ ] **Step 2: Remove the v3 remote (optional but tidy)**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git remote remove v3 && git remote -v
```

Expected: only `origin` remains pointing to ideanest-v1.

- [ ] **Step 3: Confirm the v3-publish branch still exists locally (in case of follow-up)**

Run:
```bash
cd /c/Users/johns/ideanest-v1 && git branch
```

Expected: both `main` (current) and `v3-publish` listed.

(Leave `v3-publish` branch in place — it's a useful safety reference if we need to re-push V3 later.)

---

## Task 14: Optional V3 Vercel smoke test

**Skip if V3 has no Vercel project.**

- [ ] **Step 1: Check V3 Vercel link**

Open https://vercel.com/dashboard and check if there's a project named `vo-system-v3` (or similar) linked to `seang541-rgb/VO-System-V3`.

- [ ] **Step 2: If linked, wait ~2 minutes for auto-deploy**

A force push triggers a redeploy. Watch the Vercel project's Deployments tab for the new build (matches the commit hash from Task 11 Step 3).

- [ ] **Step 3: Smoke test the deployed site**

Once deploy is `Ready`, open the V3 preview URL. Sign in (same Supabase = same credentials work). Open the Copilot. Ask:

> "What is CIPAA section 35?"

Expected: response includes "void", "pay-when-paid", quotes Section 35, references ACT_746. Confirms KB seed still loaded, agent-proxy DeepSeek still works, and the cut build hasn't broken anything.

- [ ] **Step 4: No commit / no push** (this task is read-only verification)

---

## Self-Review Summary (already done before saving)

Coverage of spec sections:
- §1 (Why V2) — captured in plan header
- §2 (Scope) — Tasks 2–7 implement the cuts; nothing in plan introduces V3-only experiments (none of the OCR / router / report files are referenced)
- §3 (Operational flow) — Tasks 1, 11, 12, 13 mirror the 9-step flow
- §4 (Doc updates) — Tasks 8, 9
- §5 (Out of scope) — plan does not touch LiDAR, marketing, etc.
- §6 (Success criteria) — verified in Tasks 10 (build), 12 Step 5 (V3 state), 12 Step 6 (V1 untouched), 14 (smoke test)
- §Appendix A — Tasks 2 (files), 3, 4, 5, 6, 7 (edits) cover every entry

Type / name consistency: every prop name (`onUploadRvt`), variable (`rvtInputRef`, `rvtFile`, `RVT_CREDIT_COST`), and i18n key (`rvt.*`, `sidebar.rvtAudit`, `header.tab.rvt`) referenced in deletions matches the actual source. Verified by grep before authoring.

No placeholders. No "TODO" / "TBD" / "similar to". Every code block shows the actual text to delete or insert.
