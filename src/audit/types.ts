// Idea Nest Audit — TypeScript port of IdeaNest Python data models
// Source: D:/IdeaNest/IdeaNest_Portable/spatial_index.py (defines BoundingBox, MeshMetrics, etc.
// despite the misleading filename — the file is actually the data-model module)
//
// All measurements assume metres unless otherwise noted. The audit runs entirely
// in the browser; nothing here depends on Node, Deno, or any backend.

// ── Geometry primitives ──────────────────────────────────────────────────────

export interface BoundingBox {
  xMin: number;
  yMin: number;
  zMin: number;
  xMax: number;
  yMax: number;
  zMax: number;
}

function bboxWidth(b: BoundingBox): number {
  return Math.max(0, b.xMax - b.xMin);
}

function bboxDepth(b: BoundingBox): number {
  return Math.max(0, b.yMax - b.yMin);
}

function bboxHeight(b: BoundingBox): number {
  return Math.max(0, b.zMax - b.zMin);
}

export function bboxVolume(b: BoundingBox): number {
  return bboxWidth(b) * bboxDepth(b) * bboxHeight(b);
}

export function bboxExpanded(b: BoundingBox, delta: number): BoundingBox {
  return {
    xMin: b.xMin - delta,
    yMin: b.yMin - delta,
    zMin: b.zMin - delta,
    xMax: b.xMax + delta,
    yMax: b.yMax + delta,
    zMax: b.zMax + delta,
  };
}

export function bboxIntersection(a: BoundingBox, b: BoundingBox): BoundingBox | null {
  const xMin = Math.max(a.xMin, b.xMin);
  const yMin = Math.max(a.yMin, b.yMin);
  const zMin = Math.max(a.zMin, b.zMin);
  const xMax = Math.min(a.xMax, b.xMax);
  const yMax = Math.min(a.yMax, b.yMax);
  const zMax = Math.min(a.zMax, b.zMax);
  if (xMin >= xMax || yMin >= yMax || zMin >= zMax) return null;
  return { xMin, yMin, zMin, xMax, yMax, zMax };
}

// ── Mesh metrics ─────────────────────────────────────────────────────────────

/**
 * `source` describes how the metrics were derived:
 * - "mesh"               full mesh available
 * - "geometry-disabled"  no geometry module (browser builds skip mesh by default)
 * - "shape-error"        ifcopenshell.geom.create_shape failed
 * - "empty-mesh"         shape returned but had no verts/faces
 * - "unavailable"        not yet computed
 */
export type MeshMetricsSource =
  | 'mesh'
  | 'geometry-disabled'
  | 'shape-error'
  | 'empty-mesh'
  | 'unavailable';

export interface MeshMetrics {
  bbox: BoundingBox | null;
  grossVolumeM3: number | null;
  surfaceAreaM2: number | null;
  wallSideAreaM2: number | null;
  openingAreaM2: number | null;
  vertices: ReadonlyArray<readonly [number, number, number]> | null;
  faces: ReadonlyArray<readonly [number, number, number]> | null;
  source: MeshMetricsSource;
}

export function emptyMeshMetrics(source: MeshMetricsSource = 'unavailable'): MeshMetrics {
  return {
    bbox: null,
    grossVolumeM3: null,
    surfaceAreaM2: null,
    wallSideAreaM2: null,
    openingAreaM2: null,
    vertices: null,
    faces: null,
    source,
  };
}

// ── Audit records ────────────────────────────────────────────────────────────

export interface OpeningMetrics {
  guid: string;
  areaM2: number | null;
  volumeM3: number | null;
  deducted: boolean;
  /** "deducted", "ignored-small-opening", "" etc. */
  deductionReason: string;
}

/**
 * One row per audited element. Mirrors the Python `ElementAuditRecord` dataclass.
 * Field names use camelCase per TS convention; the export-to-JSON layer can map
 * back to snake_case if the Python audit_viewer expects that shape.
 */
export interface ElementAuditRecord {
  guid: string;
  ifcClass: string;
  name: string;
  /** "wall" | "slab" | "beam" | "column" | "covering" | other */
  elementGroup: string;
  description: string;
  /** Unit string for `quantitySource` (e.g. "m3", "m2") */
  quantityUnit: string;
  storeyName: string;
  /** "spatial" | "geometry" | "fallback" — how the storey was assigned */
  storeySource: string;
  /** From IsExternal pset, or null if not present */
  isExternal: boolean | null;
  /** Refined SMM2 classification, e.g. "external-load-bearing-wall" */
  classification: string;
  /** JKR code, e.g. "JKR-WALL-EXT-LB" */
  jkrCode: string;
  /** "compat" | "mesh" — which mode actually produced the quantity */
  quantityMode: string;
  /** e.g. "IfcElementQuantity:Qto_WallBaseQuantities:NetVolume" */
  quantitySource: string;
  grossVolumeM3: number | null;
  netVolumeM3: number | null;
  openingVolumeM3: number;
  openingAreaM2: number;
  structuralIntersectionM3: number;
  structuralCandidateCount: number;
  /** "exact" | "approx" | "approx-fallback" */
  intersectionMode: string;
  wallSideAreaM2: number | null;
  plasterAreaM2: number | null;
  bboxZMinMm: number | null;
  bboxZMaxMm: number | null;
  /** "mesh" | "geometry-disabled" | "shape-error" | "empty-mesh" | "unavailable" */
  geometrySource: string;
  notes: string[];
}

// ── Aggregation outputs ──────────────────────────────────────────────────────

export interface QuantitySourceBucket {
  source: string;
  count: number;
  netVolumeM3: number;
}

export interface ClassificationBucket {
  classification: string;
  jkrCode: string;
  elementGroup: string;
  count: number;
  netVolumeM3: number;
  netAreaM2: number;
}

export interface AuditSummary {
  recordCount: number;
  jkrCodeCount: number;
  quantitySources: QuantitySourceBucket[];
  classifications: ClassificationBucket[];
}

export interface BqRow {
  /** SMM2 / JKR item code, e.g. "F10.1" or "JKR-WALL-EXT-LB" */
  item: string;
  description: string;
  unit: string;
  netQty: number;
  elementCount: number;
}

// ── Engine I/O ───────────────────────────────────────────────────────────────

/** "compat" prefers official IFC quantities first; "mesh" forces mesh computation. */
export type QuantityMode = 'compat' | 'mesh';

export interface AuditConfig {
  quantityMode?: QuantityMode;
  /** Z-coord cutoff (mm) for "Level 1 only" audit runs. Default 4000 mm. */
  l1ZMaxMm?: number;
  /** Openings smaller than this area (m²) are not deducted. Default 0.1 */
  openingIgnoreThresholdM2?: number;
}

export interface AuditResult {
  records: ElementAuditRecord[];
  bqRows: BqRow[];
  summary: AuditSummary;
  /** "compat" | "mesh" | "compat-fallback" — what actually ran */
  quantityModeUsed: string;
}
