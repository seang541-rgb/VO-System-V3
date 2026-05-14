# Phase 2 Plan — `audit_ifc` Tool (IdeaNest Integration)

Written: 2026-04-18. Target: complete by end of Month 1 (~2026-05-18).

---

## Decision: Port to TypeScript (browser-side), not a Python microservice

After reading the full IdeaNest source, the cleanest Phase 2 path is to port the audit engine to TypeScript and run it client-side — the same pattern as the VO comparison engine.

**Why not a Python microservice (Railway/Fly.io)?**
- Another service to manage and pay for.
- Cold starts add latency.
- IFC data is already in the browser; uploading it to a server wastes bandwidth (bad for Sri Lanka network).
- 80% of the audit logic is pure math / rule tables — easy to port.

**Why not Deno Edge Function spawning Python?**
- Supabase Edge Functions are sandboxed — no subprocess spawning.

**Why TypeScript + web-ifc works:**
- `web-ifc` is already bundled in VO system and can read IFC psets/quantities.
- The default `quantity_mode=compat` uses official IFC quantities first — **no geometry mesh computation needed for most elements**.
- Geometry fallback (mesh metrics) returns `"source: geometry-disabled"` — same as the Python engine when `ifcopenshell.geom` is unavailable, which is accepted behavior.
- The SMM2 rule tables, storey assignment, and spatial indexing are pure algorithmic code (no ifcopenshell calls).

**Estimated LOC to port:** ~900 LOC Python → ~1000 LOC TypeScript (verbosity). About 1 week of focused work.

---

## Files to create

All in `src/audit/`:

| File | Ported from | Notes |
|---|---|---|
| `types.ts` | `models.py` | TypeScript interfaces for `AuditRecord`, `BqRow`, `AuditSummary`, `BoundingBox` |
| `smm2-rules.ts` | `rules_my_smm2.py` | SMM2 classification tables + `classifyElement()` function |
| `pset-reader.ts` | `ifc_utils.py` | `findPreferredMeasure()` using web-ifc's `getItemProperties()` |
| `storey.ts` | `storey.py` | Storey assignment using element's `ContainedInStructure` |
| `spatial-index.ts` | `spatial_index.py` | BBox spatial bucket index |
| `geometry.ts` | `geometry.py` (partial) | BBox only; mesh metrics return `source: "geometry-disabled"` |
| `extractor.ts` | `extractor.py` / `ifc_utils.py` | Main `runAudit(ifcApi, modelID, config)` function |
| `summarize.ts` | `ideanest_server_portable.js` `summarizeRecords()` / `buildBqRows()` | Aggregation + BQ grouping |

---

## API the `audit_ifc` tool will call

```ts
// src/audit/extractor.ts
export interface AuditConfig {
  quantityMode?: 'compat' | 'mesh';  // default 'compat'
  l1ZMaxMm?: number;                  // default 4000
}

export interface AuditResult {
  records: AuditRecord[];
  bqRows: BqRow[];
  summary: AuditSummary;
  quantityModeUsed: string;
}

export async function runAudit(
  ifcApi: WebIFC.IfcAPI,     // already loaded in BimEngine
  modelID: number,
  config?: AuditConfig,
): Promise<AuditResult>
```

The `audit_ifc` tool in `src/agent/tools.ts` will call this after extracting the `ifcApi` and `modelID` from `BimEngine`.

---

## Changes needed in existing files

### `src/agent/tools.ts`
- Add `ifcApi` and `modelID` to `ToolContext` (for base and revision separately).
- Replace `audit_ifc` stub with real call to `runAudit()`.

### `src/BimEngine.ts`
- Expose a `getIfcApi(): { api: WebIFC.IfcAPI; modelID: number }` method (or similar) so the tool executor can access the raw web-ifc handle.

### `src/App.tsx`
- Pass `engineRef.current?.getIfcApi(...)` into `agentToolContext`.

---

## Output format the agent returns

```json
{
  "elementsAudited": 142,
  "summary": {
    "recordCount": 142,
    "jkrCodeCount": 8,
    "quantitySources": [
      { "source": "Qto_WallBaseQuantities.NetVolume", "count": 89, "netVolumeM3": 234.5 }
    ],
    "classifications": [...]
  },
  "bqRows": [
    { "item": "F10.1", "description": "Reinforced concrete wall", "unit": "m3", "netQty": 45.2, "elementCount": 23 }
  ],
  "topRecords": [...]
}
```

The agent then narrates this in plain language for the user.

---

## Implementation order (1 week plan)

**Day 1:** `types.ts` + `smm2-rules.ts`
Port the SMM2 classification tables from `rules_my_smm2.py`. This is pure data — no IFC API calls. Write a quick sanity test with a few element type strings.

**Day 2:** `pset-reader.ts`
Port `find_preferred_measure()` and `find_property_value()` using web-ifc's `getItemProperties()`. The tricky part: web-ifc property API differs from ifcopenshell — need to map pset names correctly. Use existing VO `BimEngine.ts` as reference for how it reads psets.

**Day 3:** `storey.ts` + `spatial-index.ts`
Both are pure logic. Storey assignment reads `ContainedInStructure` links. Spatial index is a bucketed BBox lookup.

**Day 4:** `geometry.ts` + `extractor.ts`
Geometry: bbox from pset dimensions only (no mesh). Extractor: wire everything together with the compat-mode quantity priority.

**Day 5:** `summarize.ts` + wire into `audit_ifc` tool + test with `NBU_MedicalClinic_Arch.ifc`.

---

## Checklist for Phase 2 done

- [ ] `src/audit/` directory created with all 8 files
- [ ] `BimEngine.ts` exposes `getIfcApi()` (or equivalent handle)
- [ ] `ToolContext` updated with `baseIfcHandle`, `revisionIfcHandle`
- [ ] `audit_ifc` tool calls `runAudit()` and returns structured result
- [ ] Test prompt: "Audit the base model and give me the BQ summary" → agent returns a table of JKR codes + quantities
- [ ] Test against `NBU_MedicalClinic_Arch.ifc` from IdeaNest; compare output row counts against IdeaNest portable output
- [ ] `npm run lint` passes
- [ ] Update `AGENT_PHASE1_CHECKLIST.md` Step 6g to reflect real audit output
