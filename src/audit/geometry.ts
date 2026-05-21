// Idea Nest Audit — Geometry layer (bbox + mesh metrics)
//
// Extracts per-element geometry from web-ifc's mesh stream. Mirrors the
// pattern BimEngine.collectGeometryData already uses for the 3D viewer — the
// audit engine just needs bbox + a few measurements, not the full mesh.
//
// All calls are SYNCHRONOUS: api.StreamMeshes invokes its callback inline,
// so we can keep runAudit synchronous.

import { type MeshMetrics, type BoundingBox, emptyMeshMetrics } from './types';

interface Point3 {
  x: number;
  y: number;
  z: number;
}

// ── Local copies of the small math helpers (avoid importing from BimEngine
// so the audit module stays self-contained). ───────────────────────────────

function applyFlatMatrix(x: number, y: number, z: number, m: ArrayLike<number>): Point3 {
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    z: m[2] * x + m[6] * y + m[10] * z + m[14],
  };
}

function triangleArea(a: Point3, b: Point3, c: Point3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}

function signedTriangleVolume(a: Point3, b: Point3, c: Point3): number {
  return (
    a.x * (b.y * c.z - b.z * c.y) -
    a.y * (b.x * c.z - b.z * c.x) +
    a.z * (b.x * c.y - b.y * c.x)
  ) / 6;
}

/**
 * Returns the normalised normal of a triangle. Used to filter "vertical"
 * faces (|normal.z| < 0.3) for wall side area.
 */
function triangleNormal(a: Point3, b: Point3, c: Point3): Point3 {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: cx / len, y: cy / len, z: cz / len };
}

// ── Core extraction ─────────────────────────────────────────────────────────

interface RawMeshAccumulator {
  mins: [number, number, number];
  maxs: [number, number, number];
  meshCount: number;
  surfaceArea: number;
  signedVolume: number;
  wallSideArea: number;
}

function newAccumulator(): RawMeshAccumulator {
  return {
    mins: [Infinity, Infinity, Infinity],
    maxs: [-Infinity, -Infinity, -Infinity],
    meshCount: 0,
    surfaceArea: 0,
    signedVolume: 0,
    wallSideArea: 0,
  };
}

/**
 * Walk a web-ifc mesh — accumulate bbox + face metrics into the accumulator.
 * Mirrors the inner loop of BimEngine.collectGeometryData.
 */
function consumeMesh(api: any, modelID: number, mesh: any, acc: RawMeshAccumulator): void {
  acc.meshCount += 1;

  const geomCount: number = typeof mesh.geometries?.size === 'function' ? mesh.geometries.size() : 0;
  for (let gi = 0; gi < geomCount; gi += 1) {
    const placedGeometry = mesh.geometries.get(gi);
    const geometry = api.GetGeometry(modelID, placedGeometry.geometryExpressID);
    const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize()) as ArrayLike<number>;

    const indices =
      typeof api.GetIndexArray === 'function' &&
      typeof geometry.GetIndexData === 'function' &&
      typeof geometry.GetIndexDataSize === 'function'
        ? (api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize()) as ArrayLike<number>)
        : null;

    const transform = placedGeometry.flatTransformation;
    const readVertex = (vRef: number): Point3 =>
      applyFlatMatrix(vertices[vRef * 6], vertices[vRef * 6 + 1], vertices[vRef * 6 + 2], transform);

    // BBox: walk every vertex.
    for (let vi = 0; vi < vertices.length; vi += 6) {
      const p = applyFlatMatrix(vertices[vi], vertices[vi + 1], vertices[vi + 2], transform);
      if (p.x < acc.mins[0]) acc.mins[0] = p.x;
      if (p.y < acc.mins[1]) acc.mins[1] = p.y;
      if (p.z < acc.mins[2]) acc.mins[2] = p.z;
      if (p.x > acc.maxs[0]) acc.maxs[0] = p.x;
      if (p.y > acc.maxs[1]) acc.maxs[1] = p.y;
      if (p.z > acc.maxs[2]) acc.maxs[2] = p.z;
    }

    // Surface area + signed volume + wall side area: walk triangles.
    if (indices && indices.length >= 3) {
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = readVertex(indices[i]);
        const b = readVertex(indices[i + 1]);
        const c = readVertex(indices[i + 2]);
        const area = triangleArea(a, b, c);
        acc.surfaceArea += area;
        acc.signedVolume += signedTriangleVolume(a, b, c);
        const n = triangleNormal(a, b, c);
        if (Math.abs(n.z) < 0.3) acc.wallSideArea += area; // vertical-ish faces
      }
    } else {
      // No index buffer — assume vertices are laid out triangle-by-triangle.
      for (let vi = 0; vi + 17 < vertices.length; vi += 18) {
        const a = applyFlatMatrix(vertices[vi], vertices[vi + 1], vertices[vi + 2], transform);
        const b = applyFlatMatrix(vertices[vi + 6], vertices[vi + 7], vertices[vi + 8], transform);
        const c = applyFlatMatrix(vertices[vi + 12], vertices[vi + 13], vertices[vi + 14], transform);
        const area = triangleArea(a, b, c);
        acc.surfaceArea += area;
        acc.signedVolume += signedTriangleVolume(a, b, c);
        const n = triangleNormal(a, b, c);
        if (Math.abs(n.z) < 0.3) acc.wallSideArea += area;
      }
    }

    if (typeof geometry.delete === 'function') geometry.delete();
  }
}

function accumulatorToMetrics(acc: RawMeshAccumulator): MeshMetrics {
  if (acc.meshCount === 0 || !Number.isFinite(acc.mins[0]) || !Number.isFinite(acc.maxs[0])) {
    return emptyMeshMetrics('empty-mesh');
  }

  const bbox: BoundingBox = {
    xMin: acc.mins[0],
    yMin: acc.mins[1],
    zMin: acc.mins[2],
    xMax: acc.maxs[0],
    yMax: acc.maxs[1],
    zMax: acc.maxs[2],
  };

  return {
    bbox,
    grossVolumeM3: Math.abs(acc.signedVolume),
    surfaceAreaM2: acc.surfaceArea,
    wallSideAreaM2: acc.wallSideArea > 0 ? acc.wallSideArea : null,
    openingAreaM2: null, // computed later by opening-deduction logic (not implemented yet)
    vertices: null,
    faces: null,
    source: 'mesh',
  };
}

// ── Public API ──────────────────────────────────────────────────────────────
// Note: web-ifc(-three)'s IfcAPI exposes `GetFlatMesh(modelID, expressID)` for
// per-element geometry. Earlier code attempted `StreamMeshes` (which doesn't
// exist on this build of the API) — that call silently failed inside a try
// block, masking the real bug. `GetFlatMesh` returns a single flat mesh whose
// `geometries` vector holds the same `(geometryExpressID, flatTransformation)`
// shape we consume below.

/**
 * Full mesh metrics for a single element. Synchronous: web-ifc resolves the
 * geometry inline.
 *
 * Returns `emptyMeshMetrics('shape-error')` if `GetFlatMesh` throws, or
 * `emptyMeshMetrics('empty-mesh')` if no usable triangles were produced.
 */
export function getElementMeshMetrics(api: any, modelID: number, expressID: number): MeshMetrics {
  const acc = newAccumulator();
  let flatMesh: any;
  try {
    flatMesh = api.GetFlatMesh(modelID, expressID);
  } catch {
    return emptyMeshMetrics('shape-error');
  }
  if (!flatMesh) return emptyMeshMetrics('empty-mesh');
  try {
    consumeMesh(api, modelID, flatMesh, acc);
  } catch {
    return emptyMeshMetrics('shape-error');
  } finally {
    if (typeof flatMesh.delete === 'function') {
      try { flatMesh.delete(); } catch { /* ignore */ }
    }
  }
  return accumulatorToMetrics(acc);
}

/**
 * Bulk extraction for many elements at once. Loops `GetFlatMesh` per id —
 * cheap because web-ifc keeps decoded geometry in WASM memory. For 10-100
 * elements this is well under 100 ms.
 *
 * Used by runAudit() to pre-populate a metrics index keyed by expressID.
 */
export function buildElementMeshIndex(
  api: any,
  modelID: number,
  expressIDs: number[],
): Map<number, MeshMetrics> {
  const out = new Map<number, MeshMetrics>();
  for (const id of expressIDs) {
    out.set(id, getElementMeshMetrics(api, modelID, id));
  }
  return out;
}
