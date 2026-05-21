// Idea Nest Audit — Main extractor
// Source: D:/IdeaNest/IdeaNest_Portable/ifc_utils.py (the actual extractor.py
// despite the misleading filename — defines run_extraction).
//
// This is the public entry point for the audit engine. The `audit_ifc` tool
// in src/agent/tools.ts will call `runAudit()` after pulling the web-ifc API
// handle from BimEngine.

import { buildElementMeshIndex, getElementMeshMetrics } from './geometry';
import {
  extractElementInput,
  findPreferredMeasure,
  iterElementsOfType,
  safeGuid,
  safeName,
  getIfcTypeName,
} from './pset-reader';
import { classifyElement, inferStructuralRole } from './smm2-rules';
import { BBoxSpatialIndex } from './spatial-index';
import { assignStorey, buildStoreyIndex } from './storey';
import { buildAuditSummary, buildBqRows } from './summarize';
import {
  type AuditConfig,
  type AuditResult,
  type ElementAuditRecord,
  type MeshMetrics,
} from './types';

// ── IFC type code constants (from web-ifc/ifc-schema.d.ts) ───────────────────
// Hard-coded so we don't pull a runtime import just for numbers. These are
// IFC schema constants, stable across IFC2X3 and IFC4.

const IFCWALL = 2391406946;
const IFCWALLSTANDARDCASE = 3512223829;
const IFCWALLELEMENTEDCASE = 4156078855;
const IFCSLAB = 1529196076;
const IFCSLABSTANDARDCASE = 3027962421;
const IFCSLABELEMENTEDCASE = 3127900445;
const IFCBEAM = 753842376;
const IFCCOLUMN = 843113511;
const IFCCOVERING = 1973544240;
const IFCMEMBER = 1073191201;
const IFCBUILDINGELEMENTPROXY = 1095909175;

const PRIMARY_TARGETS: Array<{ code: number; ifcClass: string }> = [
  { code: IFCWALL, ifcClass: 'IfcWall' },
  { code: IFCWALLSTANDARDCASE, ifcClass: 'IfcWall' },
  { code: IFCWALLELEMENTEDCASE, ifcClass: 'IfcWall' },
  { code: IFCSLAB, ifcClass: 'IfcSlab' },
  { code: IFCSLABSTANDARDCASE, ifcClass: 'IfcSlab' },
  { code: IFCSLABELEMENTEDCASE, ifcClass: 'IfcSlab' },
  { code: IFCBEAM, ifcClass: 'IfcBeam' },
  { code: IFCCOLUMN, ifcClass: 'IfcColumn' },
  { code: IFCCOVERING, ifcClass: 'IfcCovering' },
];

const ALIAS_TARGETS: Array<{ code: number; ifcClass: string }> = [
  { code: IFCMEMBER, ifcClass: 'IfcMember' },
  { code: IFCBUILDINGELEMENTPROXY, ifcClass: 'IfcBuildingElementProxy' },
];

// ── Public API ───────────────────────────────────────────────────────────────

export interface AuditEngineInput {
  /** web-ifc IfcAPI instance. Untyped because BimEngine treats it as `any`. */
  api: any;
  /** Model ID returned by `api.OpenModel()` */
  modelID: number;
  config?: AuditConfig;
}

/**
 * Run the SMM2 / JKR audit against an already-loaded IFC model. Pure
 * client-side — no network, no Edge Function call.
 *
 * Returns one `ElementAuditRecord` per audited element. Day 5 wraps this
 * with summarize.ts to produce the BqRows / AuditSummary aggregations.
 */
export function runAudit(input: AuditEngineInput): AuditResult {
  const { api, modelID } = input;
  const cfg: Required<Omit<AuditConfig, 'l1ZMaxMm'>> & { l1ZMaxMm: number } = {
    quantityMode: input.config?.quantityMode ?? 'compat',
    l1ZMaxMm: input.config?.l1ZMaxMm ?? 4000,
    openingIgnoreThresholdM2: input.config?.openingIgnoreThresholdM2 ?? 0.1,
  };

  // 1. Build storey index up front. O(relations) once, then O(1) lookups.
  const storeyIndex = buildStoreyIndex(api, modelID);

  // 2. Collect express IDs for every primary target type.
  const primaryIds = new Set<number>();
  for (const target of PRIMARY_TARGETS) {
    for (const id of iterElementsOfType(api, modelID, target.code)) {
      primaryIds.add(id);
    }
  }

  // 3. Collect alias candidates (Member / Proxy) — only those that pass the
  //    structural-role inference. Day 1's inferStructuralRole runs on the
  //    pre-extracted ElementInput so we have to read each alias once first.
  const aliasIds = new Set<number>();
  for (const target of ALIAS_TARGETS) {
    for (const id of iterElementsOfType(api, modelID, target.code)) {
      const input = extractElementInput(api, modelID, id);
      if (inferStructuralRole(input) !== null) aliasIds.add(id);
    }
  }

  // 4. Compute mesh metrics for every element we'll audit. One bulk
  //    StreamMeshes call now produces real bbox + volume + surface area for
  //    each element — the previous geometry-disabled stub is gone.
  const allAuditedIds = [...primaryIds, ...aliasIds];
  const metricsById = buildElementMeshIndex(api, modelID, allAuditedIds);

  // 5. Build the structural-cutter spatial index (beams + columns + qualified
  //    aliases). Walls will query this for nearby structural members.
  const spatialIndex = new BBoxSpatialIndex<{ ifcClass: string; expressID: number }>();
  for (const id of primaryIds) {
    const line = api.GetLine(modelID, id);
    const ifcClass = getIfcTypeName(api, line?.type);
    const cls = ifcClass.toLowerCase();
    if (cls.startsWith('ifcbeam') || cls.startsWith('ifccolumn')) {
      const m = metricsById.get(id);
      if (m?.bbox) spatialIndex.add(id, m.bbox, { ifcClass, expressID: id });
    }
  }
  for (const id of aliasIds) {
    const m = metricsById.get(id);
    if (!m?.bbox) continue;
    const line = api.GetLine(modelID, id);
    const ifcClass = getIfcTypeName(api, line?.type);
    spatialIndex.add(id, m.bbox, { ifcClass, expressID: id });
  }

  // 6. Audit each element.
  const records: ElementAuditRecord[] = [];

  for (const expressID of allAuditedIds) {
    const line = api.GetLine(modelID, expressID, false, true);
    if (!line) continue;
    const ifcClass = getIfcTypeName(api, line?.type);
    const input = extractElementInput(api, modelID, expressID);
    const structuralRole = inferStructuralRole(input);
    const classification = classifyElement(input, structuralRole);
    const metrics = metricsById.get(expressID) ?? getElementMeshMetrics(api, modelID, expressID);

    const preferredBaseType = structuralRole === 'beam'
      ? 'IfcBeam'
      : structuralRole === 'column'
        ? 'IfcColumn'
        : undefined;

    const volumeResult = findPreferredMeasure(api, modelID, line, 'volume', preferredBaseType);
    const areaResult = findPreferredMeasure(api, modelID, line, 'area', preferredBaseType);

    const storey = assignStorey(expressID, metrics.bbox, storeyIndex, [0, cfg.l1ZMaxMm]);

    const notes: string[] = [];
    let grossVolume: number | null = metrics.grossVolumeM3;
    let netVolume: number | null = metrics.grossVolumeM3;
    let quantitySource: string = metrics.source;

    if (cfg.quantityMode === 'compat' && volumeResult.value != null) {
      grossVolume = volumeResult.value;
      netVolume = volumeResult.value;
      quantitySource = volumeResult.source || 'official';
      notes.push('official-quantity-priority');
      if (areaResult.value != null) {
        notes.push(`official-area:${areaResult.source}`);
      }
    } else if (volumeResult.value != null) {
      notes.push(`official-volume-available:${volumeResult.source}`);
    } else if (cfg.quantityMode === 'compat') {
      notes.push('compat-fell-back-to-mesh');
    }

    // Structural candidate counting (informational — actual intersection volume
    // requires mesh, currently disabled).
    const candidates = metrics.bbox ? spatialIndex.query(metrics.bbox, 0.025) : [];
    if (candidates.length > 0) {
      notes.push(`structural_candidates=${candidates.length}`);
    }

    const lowerCls = ifcClass.toLowerCase();
    if (structuralRole && !lowerCls.startsWith('ifcbeam') && !lowerCls.startsWith('ifccolumn')) {
      notes.push(`structural-alias:${structuralRole}:${ifcClass}`);
    }

    records.push({
      guid: safeGuid(line),
      ifcClass,
      name: safeName(line),
      elementGroup: classification.elementGroup,
      description: classification.description,
      quantityUnit: 'm3',
      storeyName: storey.name,
      storeySource: storey.source,
      isExternal: classification.isExternal,
      classification: classification.classification,
      jkrCode: classification.jkrCode,
      quantityMode: cfg.quantityMode,
      quantitySource,
      grossVolumeM3: grossVolume,
      netVolumeM3: netVolume,
      openingVolumeM3: 0,
      openingAreaM2: 0,
      structuralIntersectionM3: 0,
      structuralCandidateCount: candidates.length,
      intersectionMode: 'approx',
      wallSideAreaM2: metrics.wallSideAreaM2,
      plasterAreaM2: null,
      bboxZMinMm: metrics.bbox ? metrics.bbox.zMin * 1000 : null,
      bboxZMaxMm: metrics.bbox ? metrics.bbox.zMax * 1000 : null,
      geometrySource: metrics.source,
      notes,
    });
  }

  return {
    records,
    bqRows: buildBqRows(records),
    summary: buildAuditSummary(records),
    quantityModeUsed: cfg.quantityMode,
  };
}
