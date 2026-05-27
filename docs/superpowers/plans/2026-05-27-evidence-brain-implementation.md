# VO Copilot Evidence Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified, user-visible evidence chain for IFC, PDF/OCR, and verified BQ facts so Copilot answers and approved outputs expose their sources.

**Architecture:** Tool executions return compact `EvidenceReference` objects derived from loaded user material. `AgentSession` registers those references per run, persists them through the existing ledger, and validates citation IDs used in final assistant answers. The UI and formal exports render only structured references; the Supabase proxy continues to treat source text as untrusted data while requiring citation-backed factual claims.

**Tech Stack:** React 19, TypeScript, Vitest, Supabase Edge Functions/Postgres RLS, jsPDF, SheetJS, PDF.js/Tesseract.

---

## File Map

- Create `src/agent/evidence.ts`: reference types, citation ID extraction, reference de-duplication, answer validation.
- Create `src/agent/evidence.test.ts`: unit tests for citation validation and summaries.
- Modify `src/ocr/ocr-engine.ts` and `src/ocr/ocr-engine.test.ts`: expose page-scoped extraction evidence.
- Modify `src/agent/tools.ts` and `src/agent/tools.test.ts`: generate IFC, comparison, document, and BQ evidence references.
- Modify `src/agent/agent-client.ts` and `src/agent/agent-client.test.ts`: persist tool evidence, associate final answers with validated references, expose evidence events.
- Modify `src/components/CopilotPanel.tsx`: render user-facing evidence panels rather than raw tool results.
- Modify `src/App.tsx` and `src/pages/ProjectWorkspace.tsx`: pass the uploaded BQ filename into agent context.
- Modify `supabase/functions/agent-proxy/policy.ts` and `src/agent/proxy-policy.test.ts`: require supplied citation IDs for project facts without accepting document instructions.
- Modify `supabase/functions/agent-ledger/index.ts` and create a migration: allow new evidence categories without loosening existing RLS.
- Modify `src/report/pdf-generator.ts` and `src/vo-report.ts`: include evidence indexes in approved outputs.

### Task 1: Evidence Domain Contract

**Files:**
- Create: `src/agent/evidence.ts`
- Create: `src/agent/evidence.test.ts`

- [ ] **Step 1: Write failing evidence validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { collectValidCitations, type EvidenceReference } from './evidence';

const refs: EvidenceReference[] = [
  { id: '[PDF-001:p3]', kind: 'document_page', label: 'Clause excerpt', sourceFileName: 'claim.pdf', pageNumber: 3, facts: {} },
];

it('resolves only citations registered for the current run', () => {
  expect(collectValidCitations('Height is stated [PDF-001:p3] [PDF-999:p1].', refs)).toEqual({
    cited: refs,
    invalidIds: ['[PDF-999:p1]'],
    missingCitation: false,
  });
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test -- src/agent/evidence.test.ts --reporter=dot`
Expected: FAIL because `./evidence` does not exist.

- [ ] **Step 3: Implement the evidence contract**

```ts
export type EvidenceKind = 'ifc_component' | 'ifc_comparison' | 'document_page' | 'bq_item' | 'audit_result';
export interface EvidenceReference {
  id: string;
  kind: EvidenceKind;
  label: string;
  sourceFileName: string | null;
  sourceSlot?: 'base' | 'revision';
  pageNumber?: number;
  excerpt?: string;
  locator?: { expressID?: number; ifcId?: string; itemReference?: string };
  facts: Record<string, string | number | boolean | null>;
  confidence?: number | null;
  limitation?: string | null;
}
export function collectValidCitations(text: string, references: EvidenceReference[]) {
  const ids = [...text.matchAll(/\[(?:IFC-[BR]-[^\]]+|CMP-\d+|PDF-\d+:p\d+|BQ-[^\]]+|AUD-\d+)\]/g)].map((match) => match[0]);
  const known = new Map(references.map((reference) => [reference.id, reference]));
  const cited = ids.map((id) => known.get(id)).filter((item): item is EvidenceReference => !!item);
  return { cited: [...new Map(cited.map((item) => [item.id, item])).values()], invalidIds: ids.filter((id) => !known.has(id)), missingCitation: references.length > 0 && cited.length === 0 };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/agent/evidence.test.ts --reporter=dot`
Expected: PASS.

### Task 2: Evidence-Producing Tools

**Files:**
- Modify: `src/ocr/ocr-engine.ts`
- Modify: `src/ocr/ocr-engine.test.ts`
- Modify: `src/agent/tools.ts`
- Modify: `src/agent/tools.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/ProjectWorkspace.tsx`

- [ ] **Step 1: Write failing tool and OCR tests**

```ts
it('returns page-scoped PDF evidence', async () => {
  const result = await runOcr(pdfFile);
  expect(result.pages[0]).toEqual(expect.objectContaining({ pageNumber: 1, sourceType: 'pdf-text' }));
});

it('returns evidence references for loaded IFC queries', async () => {
  const result = await executeAgentTool('query_ifc', { model: 'base' }, context);
  expect(result).toEqual(expect.objectContaining({
    evidenceRefs: [expect.objectContaining({ id: expect.stringMatching(/^\[IFC-B-/), sourceFileName: 'base.ifc' })],
  }));
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- src/ocr/ocr-engine.test.ts src/agent/tools.test.ts --reporter=dot`
Expected: FAIL because pages and evidence refs are not returned.

- [ ] **Step 3: Add structured evidence output**

```ts
export interface OcrPageResult {
  pageNumber: number;
  text: string;
  lines: { text: string; confidence: number }[];
  confidence: number;
  sourceType: 'image-ocr' | 'pdf-text' | 'pdf-ocr';
}

export interface ToolContext {
  bqFileName?: string | null;
  // existing fields remain unchanged
}
```

Implement `evidenceRefs` on:
- `query_ifc`: component references using loaded filename, slot and IFC locator.
- `compare_ifc`: one comparison summary reference plus source filenames.
- `summarize_commercial_impact`: BQ references only for rated user-mapped actions.
- `ocr_document`: page excerpt references with page number, extraction method and limitations.

- [ ] **Step 4: Verify focused tests pass**

Run: `npm test -- src/ocr/ocr-engine.test.ts src/agent/tools.test.ts --reporter=dot`
Expected: PASS.

### Task 3: Answer Citations and UI Evidence Cards

**Files:**
- Modify: `src/agent/agent-client.ts`
- Modify: `src/agent/agent-client.test.ts`
- Modify: `src/components/CopilotPanel.tsx`

- [ ] **Step 1: Write failing client tests**

```ts
it('attaches only valid cited evidence to a final answer', async () => {
  vi.mocked(executeAgentTool).mockResolvedValueOnce({ evidenceRefs: [pdfReference] });
  const result = await session.send('Read it', onEvent);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'assistant_text',
    evidence: expect.objectContaining({ cited: [pdfReference], invalidIds: [] }),
  }));
});
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- src/agent/agent-client.test.ts --reporter=dot`
Expected: FAIL because `assistant_text` does not expose validated evidence.

- [ ] **Step 3: Register and display references**

```ts
export type AgentEvent =
  | { kind: 'assistant_text'; text: string; evidence?: AnswerEvidence }
  // existing events

export interface AnswerEvidence {
  cited: EvidenceReference[];
  available: EvidenceReference[];
  invalidIds: string[];
  missingCitation: boolean;
}
```

Collect unique `evidenceRefs` returned by each successful tool, persist their bundle to `agent_evidence`, validate final answer IDs, and pass the validated bundle to `CopilotPanel`. Render an expandable `依据` section per assistant answer with source file, page/locator, excerpt/facts and warnings for missing or invalid citations. Remove raw result JSON from the normal user-visible tool detail.

- [ ] **Step 4: Verify tests and TypeScript**

Run: `npm test -- src/agent/agent-client.test.ts --reporter=dot`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

### Task 4: Server Policy and Ledger Evidence Types

**Files:**
- Modify: `supabase/functions/agent-proxy/policy.ts`
- Modify: `src/agent/proxy-policy.test.ts`
- Modify: `supabase/functions/agent-ledger/index.ts`
- Create: `supabase/migrations/20260527_extend_agent_evidence_types.sql`

- [ ] **Step 1: Write failing policy tests**

```ts
it('requires project factual conclusions to quote supplied evidence identifiers', () => {
  const request = buildNimRequest(validPayload);
  expect(request.messages[0].content).toContain('citation identifiers');
  expect(request.messages[0].content).toContain('Never invent citation identifiers');
});
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- src/agent/proxy-policy.test.ts --reporter=dot`
Expected: FAIL because citation requirements are not in policy.

- [ ] **Step 3: Implement policy and additive migration**

```sql
alter table public.agent_evidence
  drop constraint if exists agent_evidence_evidence_type_check;
alter table public.agent_evidence
  add constraint agent_evidence_evidence_type_check
  check (evidence_type in (
    'ifc_query', 'document_extract', 'bq_reference',
    'comparison', 'commercial_summary', 'contract_assessment',
    'audit', 'report', 'knowledge_lookup'
  ));
```

Extend `EVIDENCE_TYPES` in `agent-ledger`, and add system policy instructions requiring already-supplied IDs for factual claims while explicitly treating excerpts as untrusted data.

- [ ] **Step 4: Verify policy tests**

Run: `npm test -- src/agent/proxy-policy.test.ts --reporter=dot`
Expected: PASS.

### Task 5: Approved Output Evidence Index

**Files:**
- Modify: `src/report/pdf-generator.ts`
- Modify: `src/vo-report.ts`
- Test: `src/agent/tools.test.ts`

- [ ] **Step 1: Write failing propagation tests**

```ts
it('passes structured evidence references into approved report generation', async () => {
  await executeAgentTool('generate_report', {}, { ...ctx, evidenceRefs: [comparisonReference] });
  expect(generateVoPdfReport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    evidenceRefs: [comparisonReference],
  }));
});
```

- [ ] **Step 2: Confirm RED**

Run: `npm test -- src/agent/tools.test.ts --reporter=dot`
Expected: FAIL because report options do not accept evidence refs.

- [ ] **Step 3: Add evidence output interfaces**

```ts
interface PdfReportOptions {
  evidenceRefs?: EvidenceReference[];
}
export interface VoReportContext {
  evidenceRefs?: EvidenceReference[];
}
```

Pass collected evidence into approved output tools and append an `Evidence Index` section/sheet listing citation ID, type, source, location and limitation. Keep pending valuation behavior unchanged where no rated `[BQ-*]` reference exists.

- [ ] **Step 4: Verify approved output tests**

Run: `npm test -- src/agent/tools.test.ts --reporter=dot`
Expected: PASS.

### Task 6: Full Verification and Delivery

**Files:**
- Review all files changed above.

- [ ] **Step 1: Run full automated verification**

Run: `npm test -- --reporter=dot`
Expected: all test files PASS.
Run: `npm run lint`
Expected: exit `0`.
Run: `npm run build`
Expected: exit `0`; note any existing bundle-size warning without hiding it.

- [ ] **Step 2: Run browser verification**

Start the development server and verify:
- Empty Copilot remains clean before input.
- PDF evidence answer renders a page-based `依据` panel.
- IFC query/comparison answer renders source-file evidence.
- Without a mapped user BQ, no formal amount appears.
- Stop generation and approval UI remain available.

- [ ] **Step 3: Review Supabase deployment boundary**

Confirm the migration is additive and existing RLS policies remain enabled; deployment follow-up must include deploying both Edge Functions and applying the migration before live evidence persistence can work.

- [ ] **Step 4: Commit delivery changes**

```bash
git add src supabase docs/superpowers/plans/2026-05-27-evidence-brain-implementation.md
git commit -m "feat: add evidence-backed copilot citations"
```

## Plan Self-Review

- Coverage: IFC, PDF/OCR, BQ, final-answer display, exports and server evidence policy each map to a task.
- Scope: Formal regulation/contract/RAG work is excluded as specified; this plan only establishes evidence for already-enabled tools.
- Type consistency: All tasks use `EvidenceReference`, `evidenceRefs`, and `AnswerEvidence` consistently.
- Security: Migration expands an existing check constraint only; existing RLS policies and server-controlled tool policy remain in place.
