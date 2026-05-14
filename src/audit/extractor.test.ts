import { describe, it, expect } from 'vitest';
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

const L = (type: number, extras: Record<string, unknown> = {}) => ({ type, ...extras });

const lines: Record<number, any> = {
  1: L(TYPE_CODES.IfcWall, { GlobalId: { value: 'WALL-1' }, Name: { value: 'Wall: 200mm: 555' }, IsDefinedBy: [{ value: 10 }, { value: 11 }] }),
  2: L(TYPE_CODES.IfcSlab, { GlobalId: { value: 'SLAB-1' }, Name: { value: 'Floor Slab' }, IsDefinedBy: [{ value: 12 }] }),
  3: L(TYPE_CODES.IfcColumn, { GlobalId: { value: 'COL-1' }, Name: { value: 'C1' }, IsDefinedBy: [{ value: 13 }] }),
  100: L(TYPE_CODES.IfcBuildingStorey, { Name: { value: 'Level 1' } }),
  200: L(TYPE_CODES.IfcRelContainedInSpatialStructure, { RelatingStructure: { value: 100 }, RelatedElements: [{ value: 1 }, { value: 2 }, { value: 3 }] }),
  10: L(TYPE_CODES.IfcRelDefinesByProperties, { RelatingPropertyDefinition: { value: 20 } }),
  11: L(TYPE_CODES.IfcRelDefinesByProperties, { RelatingPropertyDefinition: { value: 21 } }),
  12: L(TYPE_CODES.IfcRelDefinesByProperties, { RelatingPropertyDefinition: { value: 22 } }),
  13: L(TYPE_CODES.IfcRelDefinesByProperties, { RelatingPropertyDefinition: { value: 23 } }),
  20: L(TYPE_CODES.IfcPropertySet, { Name: { value: 'Pset_WallCommon' }, HasProperties: [{ value: 30 }, { value: 31 }] }),
  21: L(TYPE_CODES.IfcElementQuantity, { Name: { value: 'Qto_WallBaseQuantities' }, Quantities: [{ value: 40 }, { value: 41 }] }),
  22: L(TYPE_CODES.IfcElementQuantity, { Name: { value: 'Qto_SlabBaseQuantities' }, Quantities: [{ value: 42 }, { value: 43 }] }),
  23: L(TYPE_CODES.IfcElementQuantity, { Name: { value: 'Qto_ColumnBaseQuantities' }, Quantities: [{ value: 44 }] }),
  30: L(TYPE_CODES.IfcPropertySingleValue, { Name: { value: 'IsExternal' }, NominalValue: { value: true } }),
  31: L(TYPE_CODES.IfcPropertySingleValue, { Name: { value: 'LoadBearing' }, NominalValue: { value: true } }),
  40: L(TYPE_CODES.IfcQuantityVolume, { Name: { value: 'NetVolume' }, VolumeValue: { value: 15 } }),
  41: L(TYPE_CODES.IfcQuantityArea, { Name: { value: 'NetSideArea' }, AreaValue: { value: 40 } }),
  42: L(TYPE_CODES.IfcQuantityVolume, { Name: { value: 'NetVolume' }, VolumeValue: { value: 20 } }),
  43: L(TYPE_CODES.IfcQuantityArea, { Name: { value: 'NetArea' }, AreaValue: { value: 30 } }),
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

const result = runAudit({ api: stubApi, modelID: 1 });

describe('runAudit — end-to-end', () => {
  it('record count', () => expect(result.records.length).toBe(3));
  it('quantityModeUsed', () => expect(result.quantityModeUsed).toBe('compat'));

  describe('wall record', () => {
    const wall = result.records.find((r) => r.ifcClass === 'IfcWall')!;
    it('guid', () => expect(wall.guid).toBe('WALL-1'));
    it('jkr code (ext+lb)', () => expect(wall.jkrCode).toBe('JKR-WALL-EXT-LB'));
    it('classification', () => expect(wall.classification).toBe('external-load-bearing-wall'));
    it('isExternal', () => expect(wall.isExternal).toBe(true));
    it('net volume from Qto', () => expect(wall.netVolumeM3).toBe(15));
    it('quantity source', () => expect(wall.quantitySource).toBe('IfcElementQuantity:Qto_WallBaseQuantities:NetVolume'));
    it('storey name', () => expect(wall.storeyName).toBe('Level 1'));
    it('storey source', () => expect(wall.storeySource).toBe('spatial-relation'));
    it('description (Revit normalized)', () => expect(wall.description).toBe('Wall: 200mm'));
    it('notes include priority flag', () => expect(wall.notes.includes('official-quantity-priority')).toBe(true));
  });

  describe('slab record', () => {
    const slab = result.records.find((r) => r.ifcClass === 'IfcSlab')!;
    it('jkr code', () => expect(slab.jkrCode).toBe('JKR-SLAB'));
    it('classification', () => expect(slab.classification).toBe('slab'));
    it('net volume', () => expect(slab.netVolumeM3).toBe(20));
    it('storey', () => expect(slab.storeyName).toBe('Level 1'));
  });

  describe('column record', () => {
    const column = result.records.find((r) => r.ifcClass === 'IfcColumn')!;
    it('jkr code', () => expect(column.jkrCode).toBe('JKR-COLUMN'));
    it('classification', () => expect(column.classification).toBe('column'));
    it('net volume', () => expect(column.netVolumeM3).toBe(2));
  });

  describe('summary', () => {
    it('recordCount', () => expect(result.summary.recordCount).toBe(3));
    it('jkrCodeCount (3 distinct)', () => expect(result.summary.jkrCodeCount).toBe(3));
  });

  it('all records use compat mode', () => expect(result.records.every((r) => r.quantityMode === 'compat')).toBe(true));
  it('wall bboxZMinMm null (no geometry)', () => {
    const wall = result.records.find((r) => r.ifcClass === 'IfcWall')!;
    expect(wall.bboxZMinMm).toBeNull();
  });
  it('wall geometrySource', () => {
    const wall = result.records.find((r) => r.ifcClass === 'IfcWall')!;
    expect(wall.geometrySource).toBe('shape-error');
  });
});
