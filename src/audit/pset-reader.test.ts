import { describe, it, expect } from 'vitest';
import {
  unwrapIfcValue,
  ifcText,
  ifcRef,
  ifcRefList,
  toFloat,
  toBool,
  buildTextSignature,
  findPropertyValue,
  findPreferredMeasure,
  iterPropertyDefinitions,
  extractElementInput,
} from './pset-reader';

describe('unwrapIfcValue', () => {
  it('unwraps wrapped object', () => expect(unwrapIfcValue({ value: 42, type: 4 })).toBe(42));
  it('returns null for null', () => expect(unwrapIfcValue(null)).toBeNull());
  it('passes through plain values', () => expect(unwrapIfcValue('hello')).toBe('hello'));
  it('unwraps array of wrapped objects', () => expect(unwrapIfcValue([{ value: 1 }, { value: 2 }])).toEqual([1, 2]));
});

describe('ifcText', () => {
  it('unwraps and trims wrapped string', () => expect(ifcText({ value: '  Wall 200mm  ' })).toBe('Wall 200mm'));
  it('returns empty string for null', () => expect(ifcText(null)).toBe(''));
  it('converts number to string', () => expect(ifcText(3.14)).toBe('3.14'));
  it('joins array values', () => expect(ifcText([{ value: 'a' }, { value: 'b' }])).toBe('a, b'));
});

describe('ifcRef', () => {
  it('unwraps numeric ref', () => expect(ifcRef({ value: 123 })).toBe(123));
  it('returns null for non-numeric', () => expect(ifcRef({ value: 'abc' })).toBeNull());
});

describe('ifcRefList', () => {
  it('filters valid refs', () => expect(ifcRefList([{ value: 1 }, { value: 2 }, { value: 'bad' }])).toEqual([1, 2]));
});

describe('toFloat', () => {
  it('parses string', () => expect(toFloat('  42.5  ')).toBe(42.5));
  it('unwraps wrapped number', () => expect(toFloat({ value: 12 })).toBe(12));
  it('returns null for boolean', () => expect(toFloat(true)).toBeNull());
  it('returns null for non-numeric string', () => expect(toFloat('abc')).toBeNull());
});

describe('toBool', () => {
  it('recognizes TRUE word', () => expect(toBool({ value: 'TRUE' })).toBe(true));
  it('recognizes NO word', () => expect(toBool('NO')).toBe(false));
  it('passes through boolean', () => expect(toBool(true)).toBe(true));
  it('returns null for null', () => expect(toBool(null)).toBeNull());
  it('returns null for unknown string', () => expect(toBool('maybe')).toBeNull());
});

describe('buildTextSignature', () => {
  it('joins non-empty fields with pipe', () => {
    expect(buildTextSignature({
      Name: { value: 'Wall' },
      ObjectType: { value: 'Generic 200mm' },
      Description: null,
      Tag: { value: 'W-1' },
      PredefinedType: { value: 'STANDARD' },
    })).toBe('Wall | Generic 200mm | W-1 | STANDARD');
  });
  it('returns empty string for empty object', () => expect(buildTextSignature({})).toBe(''));
});

// Stub web-ifc API
const TYPE_CODES = {
  IfcWall: 100,
  IfcRelDefinesByProperties: 200,
  IfcPropertySet: 300,
  IfcElementQuantity: 301,
  IfcPropertySingleValue: 400,
  IfcQuantityVolume: 500,
  IfcQuantityArea: 501,
} as const;

const TYPE_NAMES_BY_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(TYPE_CODES).map(([name, code]) => [code, name]),
);

const lines: Record<number, any> = {
  1: { expressID: 1, type: TYPE_CODES.IfcWall, GlobalId: { value: 'GUID-WALL-1' }, Name: { value: 'Wall: Generic 200mm: 12345' }, ObjectType: { value: 'Wall' }, IsDefinedBy: [{ value: 10 }, { value: 11 }] },
  10: { expressID: 10, type: TYPE_CODES.IfcRelDefinesByProperties, RelatingPropertyDefinition: { value: 20 } },
  11: { expressID: 11, type: TYPE_CODES.IfcRelDefinesByProperties, RelatingPropertyDefinition: { value: 21 } },
  20: { expressID: 20, type: TYPE_CODES.IfcPropertySet, Name: { value: 'Pset_WallCommon' }, HasProperties: [{ value: 30 }, { value: 31 }] },
  21: { expressID: 21, type: TYPE_CODES.IfcElementQuantity, Name: { value: 'Qto_WallBaseQuantities' }, Quantities: [{ value: 40 }, { value: 41 }] },
  30: { expressID: 30, type: TYPE_CODES.IfcPropertySingleValue, Name: { value: 'IsExternal' }, NominalValue: { value: true, type: 4 } },
  31: { expressID: 31, type: TYPE_CODES.IfcPropertySingleValue, Name: { value: 'LoadBearing' }, NominalValue: { value: false, type: 4 } },
  40: { expressID: 40, type: TYPE_CODES.IfcQuantityVolume, Name: { value: 'NetVolume' }, VolumeValue: { value: 12.5 } },
  41: { expressID: 41, type: TYPE_CODES.IfcQuantityArea, Name: { value: 'NetSideArea' }, AreaValue: { value: 30 } },
};

const stubApi = {
  GetLine: (_modelID: number, expressID: number, _flatten?: boolean, _includeInverse?: boolean) => lines[expressID] ?? null,
  GetNameFromTypeCode: (code: number) => TYPE_NAMES_BY_CODE[code] ?? '',
};

const wallLine = stubApi.GetLine(1, 1);

describe('iterPropertyDefinitions', () => {
  it('returns correct count', () => {
    const defs = iterPropertyDefinitions(stubApi, 1, wallLine);
    expect(defs.length).toBe(2);
  });
  it('returns correct types', () => {
    const defs = iterPropertyDefinitions(stubApi, 1, wallLine);
    expect(defs.map((d) => d.type).sort()).toEqual(['IfcElementQuantity', 'IfcPropertySet']);
  });
});

describe('findPropertyValue', () => {
  it('finds IsExternal', () => expect(findPropertyValue(stubApi, 1, wallLine, 'IsExternal')).toBe(true));
  it('finds LoadBearing', () => expect(findPropertyValue(stubApi, 1, wallLine, 'LoadBearing')).toBe(false));
  it('case-insensitive lookup', () => expect(findPropertyValue(stubApi, 1, wallLine, 'isexternal')).toBe(true));
  it('finds NetVolume from quantity', () => expect(findPropertyValue(stubApi, 1, wallLine, 'NetVolume')).toBe(12.5));
  it('returns null for missing property', () => expect(findPropertyValue(stubApi, 1, wallLine, 'DoesNotExist')).toBeNull());
});

describe('findPreferredMeasure', () => {
  it('finds volume value', () => {
    const volume = findPreferredMeasure(stubApi, 1, wallLine, 'volume');
    expect(volume.value).toBe(12.5);
  });
  it('volume source string', () => {
    const volume = findPreferredMeasure(stubApi, 1, wallLine, 'volume');
    expect(volume.source).toBe('IfcElementQuantity:Qto_WallBaseQuantities:NetVolume');
  });
  it('finds area value', () => {
    const area = findPreferredMeasure(stubApi, 1, wallLine, 'area');
    expect(area.value).toBe(30);
  });
  it('unknown base type falls back to candidate', () => {
    const noMeasure = findPreferredMeasure(stubApi, 1, wallLine, 'volume', 'IfcDoor');
    expect(noMeasure.value).toBe(12.5);
  });
});

describe('extractElementInput', () => {
  const elementInput = extractElementInput(stubApi, 1, 1);
  it('ifcClass', () => expect(elementInput.ifcClass).toBe('IfcWall'));
  it('name', () => expect(elementInput.name).toBe('Wall: Generic 200mm: 12345'));
  it('isExternal', () => expect(elementInput.isExternal).toBe(true));
  it('loadBearing', () => expect(elementInput.loadBearing).toBe(false));
  it('textSignature', () => expect(elementInput.textSignature).toBe('Wall: Generic 200mm: 12345 | Wall'));
});
