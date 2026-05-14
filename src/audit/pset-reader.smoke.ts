// Day 2 smoke test — verify IFC value coercion + pset walkers using a stubbed web-ifc API.
// Run with: npx tsx src/audit/pset-reader.smoke.ts
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

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────
check('unwrapIfcValue wrapped', unwrapIfcValue({ value: 42, type: 4 }), 42);
check('unwrapIfcValue null', unwrapIfcValue(null), null);
check('unwrapIfcValue plain', unwrapIfcValue('hello'), 'hello');
check('unwrapIfcValue array', unwrapIfcValue([{ value: 1 }, { value: 2 }]), [1, 2]);

check('ifcText wrapped', ifcText({ value: '  Wall 200mm  ' }), 'Wall 200mm');
check('ifcText null', ifcText(null), '');
check('ifcText number', ifcText(3.14), '3.14');
check('ifcText array', ifcText([{ value: 'a' }, { value: 'b' }]), 'a, b');

check('ifcRef wrapped', ifcRef({ value: 123 }), 123);
check('ifcRef invalid', ifcRef({ value: 'abc' }), null);
check('ifcRefList', ifcRefList([{ value: 1 }, { value: 2 }, { value: 'bad' }]), [1, 2]);

check('toFloat from string', toFloat('  42.5  '), 42.5);
check('toFloat wrapped', toFloat({ value: 12 }), 12);
check('toFloat boolean', toFloat(true), null);
check('toFloat invalid', toFloat('abc'), null);

check('toBool true word', toBool({ value: 'TRUE' }), true);
check('toBool false word', toBool('NO'), false);
check('toBool boolean direct', toBool(true), true);
check('toBool null', toBool(null), null);
check('toBool unknown', toBool('maybe'), null);

// ── buildTextSignature ────────────────────────────────────────────────────
check(
  'textSignature joins fields',
  buildTextSignature({
    Name: { value: 'Wall' },
    ObjectType: { value: 'Generic 200mm' },
    Description: null,
    Tag: { value: 'W-1' },
    PredefinedType: { value: 'STANDARD' },
  }),
  'Wall | Generic 200mm | W-1 | STANDARD',
);

check('textSignature empty', buildTextSignature({}), '');

// ── Stub web-ifc API for pset walkers ─────────────────────────────────────
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

// Lines indexed by expressID, simulating an IFC model with one wall that has:
// - A PSet "Pset_WallCommon" with IsExternal = true, LoadBearing = false
// - An ElementQuantity "Qto_WallBaseQuantities" with NetVolume = 12.5, NetSideArea = 30
const lines: Record<number, any> = {
  1: {
    expressID: 1,
    type: TYPE_CODES.IfcWall,
    GlobalId: { value: 'GUID-WALL-1' },
    Name: { value: 'Wall: Generic 200mm: 12345' },
    ObjectType: { value: 'Wall' },
    IsDefinedBy: [{ value: 10 }, { value: 11 }],
  },
  10: {
    expressID: 10,
    type: TYPE_CODES.IfcRelDefinesByProperties,
    RelatingPropertyDefinition: { value: 20 },
  },
  11: {
    expressID: 11,
    type: TYPE_CODES.IfcRelDefinesByProperties,
    RelatingPropertyDefinition: { value: 21 },
  },
  20: {
    expressID: 20,
    type: TYPE_CODES.IfcPropertySet,
    Name: { value: 'Pset_WallCommon' },
    HasProperties: [{ value: 30 }, { value: 31 }],
  },
  21: {
    expressID: 21,
    type: TYPE_CODES.IfcElementQuantity,
    Name: { value: 'Qto_WallBaseQuantities' },
    Quantities: [{ value: 40 }, { value: 41 }],
  },
  30: {
    expressID: 30,
    type: TYPE_CODES.IfcPropertySingleValue,
    Name: { value: 'IsExternal' },
    NominalValue: { value: true, type: 4 },
  },
  31: {
    expressID: 31,
    type: TYPE_CODES.IfcPropertySingleValue,
    Name: { value: 'LoadBearing' },
    NominalValue: { value: false, type: 4 },
  },
  40: {
    expressID: 40,
    type: TYPE_CODES.IfcQuantityVolume,
    Name: { value: 'NetVolume' },
    VolumeValue: { value: 12.5 },
  },
  41: {
    expressID: 41,
    type: TYPE_CODES.IfcQuantityArea,
    Name: { value: 'NetSideArea' },
    AreaValue: { value: 30 },
  },
};

const stubApi = {
  GetLine: (_modelID: number, expressID: number, _flatten?: boolean, _includeInverse?: boolean) => lines[expressID] ?? null,
  GetNameFromTypeCode: (code: number) => TYPE_NAMES_BY_CODE[code] ?? '',
};

const wallLine = stubApi.GetLine(1, 1);

// ── iterPropertyDefinitions ───────────────────────────────────────────────
const defs = iterPropertyDefinitions(stubApi, 1, wallLine);
check('iterPropertyDefinitions count', defs.length, 2);
check('iterPropertyDefinitions types', defs.map((d) => d.type).sort(), ['IfcElementQuantity', 'IfcPropertySet']);

// ── findPropertyValue ─────────────────────────────────────────────────────
check('findPropertyValue IsExternal', findPropertyValue(stubApi, 1, wallLine, 'IsExternal'), true);
check('findPropertyValue LoadBearing', findPropertyValue(stubApi, 1, wallLine, 'LoadBearing'), false);
check('findPropertyValue case-insensitive', findPropertyValue(stubApi, 1, wallLine, 'isexternal'), true);
check('findPropertyValue NetVolume from quantity', findPropertyValue(stubApi, 1, wallLine, 'NetVolume'), 12.5);
check('findPropertyValue missing', findPropertyValue(stubApi, 1, wallLine, 'DoesNotExist'), null);

// ── findPreferredMeasure ──────────────────────────────────────────────────
const volume = findPreferredMeasure(stubApi, 1, wallLine, 'volume');
check('findPreferredMeasure volume value', volume.value, 12.5);
check('findPreferredMeasure volume source', volume.source, 'IfcElementQuantity:Qto_WallBaseQuantities:NetVolume');

const area = findPreferredMeasure(stubApi, 1, wallLine, 'area');
check('findPreferredMeasure area value', area.value, 30);

const noMeasure = findPreferredMeasure(stubApi, 1, wallLine, 'volume', 'IfcDoor');
// IfcDoor isn't in PREFERRED_MEASURE_PATHS so paths is empty → falls back to first candidate
check('findPreferredMeasure unknown base type → fallback to candidate', noMeasure.value, 12.5);

// ── extractElementInput ───────────────────────────────────────────────────
const elementInput = extractElementInput(stubApi, 1, 1);
check('extractElementInput ifcClass', elementInput.ifcClass, 'IfcWall');
check('extractElementInput name', elementInput.name, 'Wall: Generic 200mm: 12345');
check('extractElementInput isExternal', elementInput.isExternal, true);
check('extractElementInput loadBearing', elementInput.loadBearing, false);
check('extractElementInput textSignature', elementInput.textSignature, 'Wall: Generic 200mm: 12345 | Wall');

console.log(`\n${pass}/${pass + fail} tests passed`);
process.exit(fail > 0 ? 1 : 0);
