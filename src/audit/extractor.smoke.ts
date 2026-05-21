// Day 4 smoke test — runAudit() end-to-end against a stub web-ifc API.
// Run with: npx tsx src/audit/extractor.smoke.ts
import { runAudit } from './extractor';

const TYPE_CODES = {
  IfcWall: 2391406946,
  IfcSlab: 1529196076,
  IfcColumn: 843113511,
  IfcBuildingStorey: 3124254112,
  IfcRelContainedInSpatialStructure: 3242617779,
  IfcRelDefinesByProperties: 4186316022,
  IfcPropertySet: 3902619275,
  IfcElementQuantity: 1883228015,
  IfcPropertySingleValue: 2598011224,
  IfcQuantityVolume: 2405470396,
  IfcQuantityArea: 931644368,
} as const;
const TYPE_NAMES: Record<number, string> = Object.fromEntries(Object.entries(TYPE_CODES).map(([k, v]) => [v, k]));

// Helper to build a stub line
const L = (type: number, extras: Record<string, unknown> = {}) => ({ type, ...extras });

// Stub model:
//  - Storey "Level 1" (#100) contains Wall (#1), Slab (#2), Column (#3)
//  - Wall has Pset_WallCommon (IsExternal=true, LoadBearing=true) + Qto_WallBaseQuantities (NetVolume=15, NetSideArea=40)
//  - Slab has Qto_SlabBaseQuantities (NetVolume=20, NetArea=30)
//  - Column has Qto_ColumnBaseQuantities (NetVolume=2)
const lines: Record<number, any> = {
  // Elements
  1: L(TYPE_CODES.IfcWall, { GlobalId: { value: 'WALL-1' }, Name: { value: 'Wall: 200mm: 555' }, IsDefinedBy: [{ value: 10 }, { value: 11 }] }),
  2: L(TYPE_CODES.IfcSlab, { GlobalId: { value: 'SLAB-1' }, Name: { value: 'Floor Slab' }, IsDefinedBy: [{ value: 12 }] }),
  3: L(TYPE_CODES.IfcColumn, { GlobalId: { value: 'COL-1' }, Name: { value: 'C1' }, IsDefinedBy: [{ value: 13 }] }),

  // Storey
  100: L(TYPE_CODES.IfcBuildingStorey, { Name: { value: 'Level 1' } }),

  // Storey relation
  200: L(TYPE_CODES.IfcRelContainedInSpatialStructure, {
    RelatingStructure: { value: 100 },
    RelatedElements: [{ value: 1 }, { value: 2 }, { value: 3 }],
  }),

  // Wall pset relations
  10: L(TYPE_CODES.IfcRelDefinesByProperties, { RelatingPropertyDefinition: { value: 20 } }),
  11: L(TYPE_CODES.IfcRelDefinesByProperties, { RelatingPropertyDefinition: { value: 21 } }),
  // Slab pset relation
  12: L(TYPE_CODES.IfcRelDefinesByProperties, { RelatingPropertyDefinition: { value: 22 } }),
  // Column pset relation
  13: L(TYPE_CODES.IfcRelDefinesByProperties, { RelatingPropertyDefinition: { value: 23 } }),

  // Wall psets
  20: L(TYPE_CODES.IfcPropertySet, { Name: { value: 'Pset_WallCommon' }, HasProperties: [{ value: 30 }, { value: 31 }] }),
  21: L(TYPE_CODES.IfcElementQuantity, { Name: { value: 'Qto_WallBaseQuantities' }, Quantities: [{ value: 40 }, { value: 41 }] }),
  22: L(TYPE_CODES.IfcElementQuantity, { Name: { value: 'Qto_SlabBaseQuantities' }, Quantities: [{ value: 42 }, { value: 43 }] }),
  23: L(TYPE_CODES.IfcElementQuantity, { Name: { value: 'Qto_ColumnBaseQuantities' }, Quantities: [{ value: 44 }] }),

  // Wall properties + quantities
  30: L(TYPE_CODES.IfcPropertySingleValue, { Name: { value: 'IsExternal' }, NominalValue: { value: true } }),
  31: L(TYPE_CODES.IfcPropertySingleValue, { Name: { value: 'LoadBearing' }, NominalValue: { value: true } }),
  40: L(TYPE_CODES.IfcQuantityVolume, { Name: { value: 'NetVolume' }, VolumeValue: { value: 15 } }),
  41: L(TYPE_CODES.IfcQuantityArea, { Name: { value: 'NetSideArea' }, AreaValue: { value: 40 } }),
  // Slab quantities
  42: L(TYPE_CODES.IfcQuantityVolume, { Name: { value: 'NetVolume' }, VolumeValue: { value: 20 } }),
  43: L(TYPE_CODES.IfcQuantityArea, { Name: { value: 'NetArea' }, AreaValue: { value: 30 } }),
  // Column quantities
  44: L(TYPE_CODES.IfcQuantityVolume, { Name: { value: 'NetVolume' }, VolumeValue: { value: 2 } }),
};

const linesByType: Record<number, number[]> = {
  [TYPE_CODES.IfcWall]: [1],
  [TYPE_CODES.IfcSlab]: [2],
  [TYPE_CODES.IfcColumn]: [3],
  [TYPE_CODES.IfcRelContainedInSpatialStructure]: [200],
};

const stubApi = {
  GetLine: (_modelID: number, expressID: number, _flatten?: boolean, _includeInverse?: boolean) => lines[expressID] ?? null,
  GetNameFromTypeCode: (code: number) => TYPE_NAMES[code] ?? '',
  GetLineIDsWithType: (_modelID: number, typeCode: number) => linesByType[typeCode] ?? [],
};

// Run the audit
const result = runAudit({ api: stubApi, modelID: 1 });

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

check('record count', result.records.length, 3);
check('quantityModeUsed', result.quantityModeUsed, 'compat');

// Find each by ifcClass for assertions
const wall = result.records.find((r) => r.ifcClass === 'IfcWall');
const slab = result.records.find((r) => r.ifcClass === 'IfcSlab');
const column = result.records.find((r) => r.ifcClass === 'IfcColumn');

if (!wall || !slab || !column) {
  console.error('FAIL: missing records', { wall, slab, column });
  process.exit(1);
}

// Wall — external load-bearing
check('wall guid', wall.guid, 'WALL-1');
check('wall jkr code (ext+lb)', wall.jkrCode, 'JKR-WALL-EXT-LB');
check('wall classification', wall.classification, 'external-load-bearing-wall');
check('wall isExternal', wall.isExternal, true);
check('wall net volume (from official Qto)', wall.netVolumeM3, 15);
check('wall quantity source', wall.quantitySource, 'IfcElementQuantity:Qto_WallBaseQuantities:NetVolume');
check('wall storey', wall.storeyName, 'Level 1');
check('wall storey source', wall.storeySource, 'spatial-relation');
check('wall description (Revit name normalized)', wall.description, 'Wall: 200mm');
check('wall notes includes priority flag', wall.notes.includes('official-quantity-priority'), true);

// Slab — generic
check('slab jkr code', slab.jkrCode, 'JKR-SLAB');
check('slab classification', slab.classification, 'slab');
check('slab net volume', slab.netVolumeM3, 20);
check('slab storey', slab.storeyName, 'Level 1');

// Column
check('column jkr code', column.jkrCode, 'JKR-COLUMN');
check('column classification', column.classification, 'column');
check('column net volume', column.netVolumeM3, 2);

// Summary
check('summary recordCount', result.summary.recordCount, 3);
check('summary jkrCodeCount (3 distinct codes)', result.summary.jkrCodeCount, 3);

// quantityMode field on every record
check('all records use compat mode', result.records.every((r) => r.quantityMode === 'compat'), true);

// bbox z-min mm (stub api has no geometry stream → empty-mesh)
check('wall bboxZMinMm null (no geometry)', wall.bboxZMinMm, null);
check('wall geometrySource', wall.geometrySource, 'shape-error');

console.log(`\n${pass}/${pass + fail} tests passed`);
process.exit(fail > 0 ? 1 : 0);
