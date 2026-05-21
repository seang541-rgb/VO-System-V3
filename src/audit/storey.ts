// Idea Nest Audit — Storey assignment
// Source: D:/IdeaNest/IdeaNest_Portable/contractor_bq_compat.csv (yes, the
// portable distribution stashed the actual storey.py contents inside a CSV
// filename — the file is real Python, just renamed). Defines build_storey_index
// and assign_storey.

import { type BoundingBox } from './types';
import { getIfcTypeName, ifcRef, ifcRefList, ifcText, iterElementsOfType } from './pset-reader';

// IFC type codes from web-ifc/ifc-schema.d.ts. Hard-coded here so we don't
// need a build-time import from web-ifc — the same numeric IDs are stable
// across IFC2X3 / IFC4 since they come from the IFC schema spec.
const IFCRELCONTAINEDINSPATIALSTRUCTURE = 3242617779;

export interface StoreyAssignment {
  /** Display name, e.g. "Level 1" or "Storey#42" */
  name: string;
  /** "spatial-relation" | "bbox-zmin-fallback" | "unresolved" */
  source: string;
}

/**
 * Walk every IfcRelContainedInSpatialStructure relation in the model.
 * For each relation whose RelatingStructure is an IfcBuildingStorey, record
 * "this element belongs to that storey" for each entry in RelatedElements.
 *
 * Returns a map keyed by element expressID. Mirrors `build_storey_index`.
 */
export function buildStoreyIndex(api: any, modelID: number): Map<number, StoreyAssignment> {
  const index = new Map<number, StoreyAssignment>();

  const relationIds = iterElementsOfType(api, modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE);
  for (const relationId of relationIds) {
    let relation: any;
    try {
      relation = api.GetLine(modelID, relationId);
    } catch {
      continue;
    }
    if (!relation) continue;

    const structureId = ifcRef(relation?.RelatingStructure);
    if (structureId == null) continue;

    let structure: any;
    try {
      structure = api.GetLine(modelID, structureId);
    } catch {
      continue;
    }
    if (!structure) continue;

    if (getIfcTypeName(api, structure?.type) !== 'IfcBuildingStorey') continue;

    const storeyName = ifcText(structure?.Name) || `Storey#${structureId}`;
    const elementIds = ifcRefList(relation?.RelatedElements);
    for (const elementId of elementIds) {
      // First-write-wins. The Python engine has the same semantic via dict
      // assignment — later relations would overwrite, but in practice each
      // element is referenced by exactly one storey.
      if (!index.has(elementId)) {
        index.set(elementId, { name: storeyName, source: 'spatial-relation' });
      }
    }
  }

  return index;
}

/**
 * Resolve the storey for a single element.
 *
 * Priority order:
 *  1. Direct hit in the storey index (from IfcRelContainedInSpatialStructure)
 *  2. bbox z-min fallback: if the element's lowest point is inside the L1
 *     range (default 0–4000 mm), classify as "Storey L1"
 *  3. Otherwise "Unassigned"
 *
 * Mirrors `assign_storey`.
 */
export function assignStorey(
  expressID: number,
  bbox: BoundingBox | null,
  storeyIndex: Map<number, StoreyAssignment>,
  l1RangeMm: readonly [number, number] = [0, 4000],
): StoreyAssignment {
  const direct = storeyIndex.get(expressID);
  if (direct) return direct;

  if (bbox != null) {
    const zMinMm = bbox.zMin * 1000;
    const [lower, upper] = l1RangeMm;
    if (zMinMm >= lower && zMinMm <= upper) {
      return { name: 'Storey L1', source: 'bbox-zmin-fallback' };
    }
  }

  return { name: 'Unassigned', source: 'unresolved' };
}
