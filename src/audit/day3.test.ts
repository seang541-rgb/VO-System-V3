import { describe, it, expect } from 'vitest';
import { BBoxSpatialIndex } from './spatial-index';
import { buildStoreyIndex, assignStorey } from './storey';
import type { BoundingBox } from './types';

const bbox = (xMin: number, yMin: number, zMin: number, xMax: number, yMax: number, zMax: number): BoundingBox => ({
  xMin, yMin, zMin, xMax, yMax, zMax,
});

describe('BBoxSpatialIndex', () => {
  it('empty index returns []', () => {
    const idx = new BBoxSpatialIndex<string>();
    expect(idx.query(bbox(0, 0, 0, 1, 1, 1))).toEqual([]);
  });

  it('empty index size is 0', () => {
    const idx = new BBoxSpatialIndex<string>();
    expect(idx.size()).toBe(0);
  });

  it('hit: overlapping bbox', () => {
    const idx = new BBoxSpatialIndex<string>();
    idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
    expect(idx.query(bbox(1, 1, 1, 3, 3, 3))).toEqual(['beam-1']);
  });

  it('hit: containing bbox', () => {
    const idx = new BBoxSpatialIndex<string>();
    idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
    expect(idx.query(bbox(-1, -1, -1, 5, 5, 5))).toEqual(['beam-1']);
  });

  it('hit: contained bbox', () => {
    const idx = new BBoxSpatialIndex<string>();
    idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
    expect(idx.query(bbox(0.5, 0.5, 0.5, 1, 1, 1))).toEqual(['beam-1']);
  });

  it('miss: far away', () => {
    const idx = new BBoxSpatialIndex<string>();
    idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
    expect(idx.query(bbox(100, 100, 100, 101, 101, 101))).toEqual([]);
  });

  it('miss: touching face (strict)', () => {
    const idx = new BBoxSpatialIndex<string>();
    idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
    expect(idx.query(bbox(2, 0, 0, 4, 2, 2))).toEqual([]);
  });

  it('tolerance: misses without it', () => {
    const idx = new BBoxSpatialIndex<string>();
    idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
    expect(idx.query(bbox(2.1, 0, 0, 4, 2, 2))).toEqual([]);
  });

  it('tolerance: hits with 0.2m', () => {
    const idx = new BBoxSpatialIndex<string>();
    idx.add(1, bbox(0, 0, 0, 2, 2, 2), 'beam-1');
    expect(idx.query(bbox(2.1, 0, 0, 4, 2, 2), 0.2)).toEqual(['beam-1']);
  });

  it('multi-bucket dedup query', () => {
    const idx = new BBoxSpatialIndex<string>(5.0);
    idx.add(1, bbox(0, 0, 0, 6, 1, 1), 'long-beam');
    idx.add(2, bbox(0.5, 0.5, 0, 1, 1, 1), 'small-col');
    idx.add(3, bbox(50, 50, 50, 51, 51, 51), 'far');
    expect(idx.query(bbox(0, 0, 0, 7, 1, 1)).sort()).toEqual(['long-beam', 'small-col']);
  });

  it('size counts unique keys', () => {
    const idx = new BBoxSpatialIndex<string>(5.0);
    idx.add(1, bbox(0, 0, 0, 6, 1, 1), 'long-beam');
    idx.add(2, bbox(0.5, 0.5, 0, 1, 1, 1), 'small-col');
    idx.add(3, bbox(50, 50, 50, 51, 51, 51), 'far');
    expect(idx.size()).toBe(3);
  });

  it('null bbox add is ignored', () => {
    const idx = new BBoxSpatialIndex<string>();
    idx.add(1, null, 'no-bbox-payload');
    idx.add(2, bbox(0, 0, 0, 1, 1, 1), 'real');
    expect(idx.size()).toBe(1);
  });

  it('null bbox query returns []', () => {
    const idx = new BBoxSpatialIndex<string>();
    expect(idx.query(null)).toEqual([]);
  });

  it('tiny bucket: hit inside', () => {
    const idx = new BBoxSpatialIndex<string>(0.5);
    idx.add(1, bbox(0, 0, 0, 5, 5, 5), 'big');
    expect(idx.query(bbox(2, 2, 2, 3, 3, 3))).toEqual(['big']);
  });

  it('tiny bucket: miss outside', () => {
    const idx = new BBoxSpatialIndex<string>(0.5);
    idx.add(1, bbox(0, 0, 0, 5, 5, 5), 'big');
    expect(idx.query(bbox(10, 10, 10, 11, 11, 11))).toEqual([]);
  });
});

// ── Storey assignment ──────────────────────────────────────────────────────
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

const lines: Record<number, any> = {
  100: { type: TYPE_CODES.IfcBuildingStorey, Name: { value: 'Level 1' } },
  101: { type: TYPE_CODES.IfcBuildingStorey, Name: { value: 'Level 2' } },
  102: { type: TYPE_CODES.IfcBuildingStorey, Name: null },
  200: { type: TYPE_CODES.IfcRelContainedInSpatialStructure, RelatingStructure: { value: 100 }, RelatedElements: [{ value: 1 }, { value: 2 }] },
  201: { type: TYPE_CODES.IfcRelContainedInSpatialStructure, RelatingStructure: { value: 101 }, RelatedElements: [{ value: 3 }] },
  202: { type: TYPE_CODES.IfcRelContainedInSpatialStructure, RelatingStructure: { value: 999 }, RelatedElements: [{ value: 99 }] },
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

describe('buildStoreyIndex', () => {
  const storeyIndex = buildStoreyIndex(stubApi, 1);

  it('index size', () => expect(storeyIndex.size).toBe(3));
  it('element 1 → Level 1', () => expect(storeyIndex.get(1)?.name).toBe('Level 1'));
  it('element 1 source', () => expect(storeyIndex.get(1)?.source).toBe('spatial-relation'));
  it('element 2 → Level 1', () => expect(storeyIndex.get(2)?.name).toBe('Level 1'));
  it('element 3 → Level 2', () => expect(storeyIndex.get(3)?.name).toBe('Level 2'));
  it('element 99 (non-storey relation) → undefined', () => expect(storeyIndex.get(99)).toBeUndefined());
});

describe('assignStorey', () => {
  const storeyIndex = buildStoreyIndex(stubApi, 1);

  it('direct hit', () => {
    expect(assignStorey(1, null, storeyIndex)).toEqual({ name: 'Level 1', source: 'spatial-relation' });
  });

  it('bbox fallback inside L1', () => {
    expect(assignStorey(99999, bbox(0, 0, 1.5, 1, 1, 3), storeyIndex)).toEqual({ name: 'Storey L1', source: 'bbox-zmin-fallback' });
  });

  it('bbox fallback above L1 → unresolved', () => {
    expect(assignStorey(99999, bbox(0, 0, 5, 1, 1, 7), storeyIndex)).toEqual({ name: 'Unassigned', source: 'unresolved' });
  });

  it('no bbox → unresolved', () => {
    expect(assignStorey(99999, null, storeyIndex)).toEqual({ name: 'Unassigned', source: 'unresolved' });
  });

  it('custom L1 range', () => {
    expect(assignStorey(99999, bbox(0, 0, 5, 1, 1, 7), storeyIndex, [0, 6000])).toEqual({ name: 'Storey L1', source: 'bbox-zmin-fallback' });
  });
});

describe('anonymous storey fallback name', () => {
  it('gets fallback name Storey#102', () => {
    const lines2: Record<number, any> = {
      ...lines,
      300: { type: TYPE_CODES.IfcRelContainedInSpatialStructure, RelatingStructure: { value: 102 }, RelatedElements: [{ value: 50 }] },
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
    expect(idx.get(50)?.name).toBe('Storey#102');
  });
});
