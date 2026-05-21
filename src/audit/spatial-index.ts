// Idea Nest Audit — Bucketed bbox spatial index
// Source: D:/IdeaNest/IdeaNest_Portable/__init__.py (despite the filename, this
// is where BBoxSpatialIndex lives in the portable build).
//
// Pure logic — no IFC API. Used by the extractor to find structural members
// (beams / columns) that intersect a wall, so opening / structural deductions
// can be applied per SMM2 rules.

import { type BoundingBox, bboxExpanded, bboxIntersection } from './types';

interface IndexedItem<T> {
  key: number;
  bbox: BoundingBox;
  payload: T;
}

/**
 * Mirrors `BBoxSpatialIndex` from the Python audit engine. Each bbox is
 * inserted into every (x,y,z) bucket it overlaps; queries walk the same
 * buckets for the query bbox, then filter by exact bbox overlap.
 *
 * `bucketSizeM` controls the grid resolution. The default of 5 m matches
 * the Python engine — large enough that walls/columns rarely span > 1
 * bucket, small enough that queries don't scan the whole model.
 */
export class BBoxSpatialIndex<T = unknown> {
  private readonly bucketSizeM: number;
  private readonly buckets: Map<string, IndexedItem<T>[]> = new Map();

  constructor(bucketSizeM = 5.0) {
    this.bucketSizeM = Math.max(bucketSizeM, 0.1);
  }

  add(key: number, bbox: BoundingBox | null, payload: T): void {
    if (bbox == null) return;
    const item: IndexedItem<T> = { key, bbox, payload };
    for (const bucket of this.bucketKeys(bbox)) {
      const list = this.buckets.get(bucket);
      if (list) list.push(item);
      else this.buckets.set(bucket, [item]);
    }
  }

  query(bbox: BoundingBox | null, toleranceM = 0.0): T[] {
    if (bbox == null) return [];
    const expanded = bboxExpanded(bbox, Math.max(0, toleranceM));
    const results: T[] = [];
    const seen = new Set<number>();
    for (const bucket of this.bucketKeys(expanded)) {
      const list = this.buckets.get(bucket);
      if (!list) continue;
      for (const item of list) {
        if (seen.has(item.key)) continue;
        if (bboxIntersection(item.bbox, expanded) === null) continue;
        seen.add(item.key);
        results.push(item.payload);
      }
    }
    return results;
  }

  size(): number {
    let total = 0;
    const seen = new Set<number>();
    for (const list of this.buckets.values()) {
      for (const item of list) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        total++;
      }
    }
    return total;
  }

  private *bucketKeys(bbox: BoundingBox): Generator<string> {
    const size = this.bucketSizeM;
    const x0 = Math.floor(bbox.xMin / size);
    const y0 = Math.floor(bbox.yMin / size);
    const z0 = Math.floor(bbox.zMin / size);
    const x1 = Math.floor(bbox.xMax / size);
    const y1 = Math.floor(bbox.yMax / size);
    const z1 = Math.floor(bbox.zMax / size);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          yield `${x},${y},${z}`;
        }
      }
    }
  }
}
