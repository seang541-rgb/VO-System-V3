// Day 3 smoke test — spatial-index.ts + storey.ts
// Run with: npx tsx src/audit/day3.smoke.ts
import { BBoxSpatialIndex } from './spatial-index';
import { buildStoreyIndex, assignStorey } from './storey';
import type { BoundingBox } from './types';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  }
}

// ── BBoxSpatialIndex ────────────────────────────────────────────────────────

const bbox = (xMin: number, yMin: number, zMin: number, xMax: number, yMax: number, zMax: number): BoundingBox => ({
  xMin, yMin, zMin, xMax, yMax, zMax,
});

// 1. Empty index returns empty
{
  const idx = new BBoxSpatialIndex<string>();
  check('empty index returns []', idx.query(bbox(0, 0, 0, 1, 1, 1)), []);
  check('empty index size 0', idx.size(), 0);
}

// 2. Single item — query overlaps
{
  const idx = new BBoxSpatialIndex<string>();
  idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
  check('hit: overlapping bbox', idx.query(bbox(1, 1, 1, 3, 3, 3)), ['beam-1']);
  check('hit: containing bbox', idx.query(bbox(-1, -1, -1, 5, 5, 5)), ['beam-1']);
  check('hit: contained bbox', idx.query(bbox(0.5, 0.5, 0.5, 1, 1, 1)), ['beam-1']);
}

// 3. Single item — query doesn't overlap
{
  const idx = new BBoxSpatialIndex<string>();
  idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
  check('miss: far away', idx.query(bbox(100, 100, 100, 101, 101, 101)), []);
  // Touching bboxes don't intersect (xMin >= xMax check is strict)
  check('miss: touching face', idx.query(bbox(2, 0, 0, 4, 2, 2)), []);
}

// 4. Tolerance expansion
{
  const idx = new BBoxSpatialIndex<string>();
  idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
  check('tolerance: misses without it', idx.query(bbox(2.1, 0, 0, 4, 2, 2)), []);
  check('tolerance: hits with 0.2m', idx.query(bbox(2.1, 0, 0, 4, 2, 2), 0.2), ['beam-1']);
}

// 5. Multiple items, dedup across buckets
{
  const idx = new BBoxSpatialIndex<string>(5.0);
  idx.add(1, bbox(0, 0, 0, 6, 1, 1), 'long-beam');     // spans bucket (0,0,0) and (1,0,0)
  idx.add(2, bbox(0.5, 0.5, 0, 1, 1, 1), 'small-col'); // only bucket (0,0,0)
  idx.add(3, bbox(50, 50, 50, 51, 51, 51), 'far');     // bucket (10,10,10)
  const results = idx.query(bbox(0, 0, 0, 7, 1, 1)).sort();
  check('multi-bucket dedup query (sorted)', results, ['long-beam', 'small-col']);
  check('size counts unique keys', idx.size(), 3);
}

// 6. Null bbox handling
{
  const idx = new BBoxSpatialIndex<string>();
  idx.add(1, null, 'no-bbox-payload'); // should silently no-op
  idx.add(2, bbox(0, 0, 0, 1, 1, 1), 'real');
  check('null bbox add ignored', idx.size(), 1);
  check('null bbox query returns []', idx.query(null), []);
}

// 7. Custom bucket size
{
  const idx = new BBoxSpatialIndex<string>(0.5); // tiny buckets
  // A bbox spanning 5m in 0.5m buckets = 10 buckets per axis = 1000 buckets total
  idx.add(1, bbox(0, 0, 0, 5, 5, 5), 'big');
  check('tiny bucket: hit anywhere inside', idx.query(bbox(2, 2, 2, 3, 3, 3)), ['big']);
  check('tiny bucket: miss outside', idx.query(bbox(10, 10, 10, 11, 11, 11)), []);
}

// ── Storey assignment ──────────────────────────────────────────────────────

// Stub api covering IfcRelContainedInSpatialStructure walks
const TYPE_CODES = {
  IfcBuildingStorey: 3124254112,
  IfcRelContainedInSpatialStructure: 3242617779,
  IfcWall: 1,
  IfcSlab: 2,
  IfcDoor: 3,
} as const;
const TYPE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(TYPE_CODES).map(([k, v]) => [v, k]),
);

// Two storeys: "Level 1" (storey 100) with elements 1, 2; "Level 2" (storey 101) with element 3.
// Element 4 has no relation — falls back to bbox; element 5 has no relation and no bbox.
const lines: Record<number, any> = {
  100: { type: TYPE_CODES.IfcBuildingStorey, Name: { value: 'Level 1' } },
  101: { type: TYPE_CODES.IfcBuildingStorey, Name: { value: 'Level 2' } },
  // unnamed storey for fallback test
  102: { type: TYPE_CODES.IfcBuildingStorey, Name: null },

  200: {
    type: TYPE_CODES.IfcRelContainedInSpatialStructure,
    RelatingStructure: { value: 100 },
    RelatedElements: [{ value: 1 }, { value: 2 }],
  },
  201: {
    type: TYPE_CODES.IfcRelContainedInSpatialStructure,
    RelatingStructure: { value: 101 },
    RelatedElements: [{ value: 3 }],
  },
  202: {
    // a relation pointing at something that ISN'T a storey — should be skipped
    type: TYPE_CODES.IfcRelContainedInSpatialStructure,
    RelatingStructure: { value: 999 },
    RelatedElements: [{ value: 99 }],
  },
  999: { type: TYPE_CODES.IfcWall, Name: { value: 'Not a storey' } },
};

const allRelationIds = [200, 201, 202];

const stubApi = {
  GetLine: (_modelID: number, expressID: number) => lines[expressID] ?? null,
  GetNameFromTypeCode: (code: number) => TYPE_NAMES[code] ?? '',
  GetLineIDsWithType: (_modelID: number, typeCode: number) => {
    if (typeCode === TYPE_CODES.IfcRelContainedInSpatialStructure) return allRelationIds;
    return [];
  },
};

const storeyIndex = buildStoreyIndex(stubApi, 1);
check('storey index size', storeyIndex.size, 3);
check('element 1 → Level 1', storeyIndex.get(1)?.name, 'Level 1');
check('element 1 source', storeyIndex.get(1)?.source, 'spatial-relation');
check('element 2 → Level 1', storeyIndex.get(2)?.name, 'Level 1');
check('element 3 → Level 2', storeyIndex.get(3)?.name, 'Level 2');
check('element 99 (relation pointed to non-storey)', storeyIndex.get(99), undefined);

// assignStorey
check('direct hit', assignStorey(1, null, storeyIndex), { name: 'Level 1', source: 'spatial-relation' });

// Bbox fallback: zMin 1.5m → 1500mm, inside default L1 range [0, 4000]
const insideL1: BoundingBox = bbox(0, 0, 1.5, 1, 1, 3);
check('bbox fallback inside L1', assignStorey(99999, insideL1, storeyIndex), {
  name: 'Storey L1',
  source: 'bbox-zmin-fallback',
});

// Bbox fallback: zMin 5m → 5000mm, outside L1 → unresolved
const aboveL1: BoundingBox = bbox(0, 0, 5, 1, 1, 7);
check('bbox fallback above L1', assignStorey(99999, aboveL1, storeyIndex), {
  name: 'Unassigned',
  source: 'unresolved',
});

// No bbox at all
check('no bbox → unresolved', assignStorey(99999, null, storeyIndex), {
  name: 'Unassigned',
  source: 'unresolved',
});

// Custom L1 range (e.g. for double-height ground floor)
check('custom L1 range', assignStorey(99999, aboveL1, storeyIndex, [0, 6000]), {
  name: 'Storey L1',
  source: 'bbox-zmin-fallback',
});

// Anonymous storey gets fallback name "Storey#102"
{
  const lines2: Record<number, any> = {
    ...lines,
    300: {
      type: TYPE_CODES.IfcRelContainedInSpatialStructure,
      RelatingStructure: { value: 102 },
      RelatedElements: [{ value: 50 }],
    },
  };
  const stubApi2 = {
    GetLine: (_modelID: number, expressID: number) => lines2[expressID] ?? null,
    GetNameFromTypeCode: (code: number) => TYPE_NAMES[code] ?? '',
    GetLineIDsWithType: (_modelID: number, typeCode: number) => {
      if (typeCode === TYPE_CODES.IfcRelContainedInSpatialStructure) return [...allRelationIds, 300];
      return [];
    },
  };
  const idx = buildStoreyIndex(stubApi2, 1);
  check('anonymous storey → fallback name', idx.get(50)?.name, 'Storey#102');
}

console.log(`\n${pass}/${pass + fail} tests passed`);
process.exit(fail > 0 ? 1 : 0);
