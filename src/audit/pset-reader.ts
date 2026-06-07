// Idea Nest Audit — IFC pset reader
// Source: D:/IdeaNest/IdeaNest_Portable/rules_my_smm2.py (the "ifc_utils" module
// despite the misleading filename — defines find_property_value,
// find_preferred_measure, iter_property_definitions, etc.)
//
// Bridges raw web-ifc lines into the typed `ElementInput` consumed by
// `classifyElement` from smm2-rules.ts. Mirrors the patterns BimEngine.ts
// already uses (GetLine with inverse refs, walking IsDefinedBy → property
// definitions). All helpers are duplicated here on purpose to keep the audit
// module self-contained.

import {
  PREFERRED_MEASURE_PATHS,
  MEASURE_KEYWORDS,
  type ElementInput,
  type MeasureKind,
  type PsetPath,
} from './smm2-rules';

// ── IFC value coercion helpers (duplicated from BimEngine for isolation) ────

export function unwrapIfcValue(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((item) => unwrapIfcValue(item));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('value' in record) return unwrapIfcValue(record.value);
  }
  return value;
}

export function ifcText(value: unknown): string {
  const v = unwrapIfcValue(value);
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  if (Array.isArray(v)) return v.map(ifcText).filter(Boolean).join(', ');
  return '';
}

export function ifcRef(value: unknown): number | null {
  const v = unwrapIfcValue(value);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function ifcRefList(value: unknown): number[] {
  const v = unwrapIfcValue(value);
  if (!Array.isArray(v)) return [];
  return v.map(ifcRef).filter((n): n is number => n !== null);
}

export function toFloat(value: unknown): number | null {
  const v = unwrapIfcValue(value);
  if (v == null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parsed = parseFloat(String(v).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function toBool(value: unknown): boolean | null {
  const v = unwrapIfcValue(value);
  if (typeof v === 'boolean') return v;
  if (v == null) return null;
  const normalized = String(v).trim().toLowerCase();
  if (['true', 't', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'f', 'no', '0'].includes(normalized)) return false;
  return null;
}

export function getIfcTypeName(api: any, typeCode: unknown, fallback = 'IfcEntity'): string {
  if (typeof typeCode !== 'number' || !Number.isFinite(typeCode)) return fallback;
  try {
    const resolved = api?.GetNameFromTypeCode?.(typeCode);
    return typeof resolved === 'string' && resolved.trim() ? resolved : `${fallback}#${typeCode}`;
  } catch {
    return `${fallback}#${typeCode}`;
  }
}

export function safeGuid(line: any): string {
  return ifcText(line?.GlobalId);
}

export function safeName(line: any): string {
  return ifcText(line?.Name);
}

// ── Property-definition iteration ───────────────────────────────────────────

interface ResolvedDefinition {
  /** "IfcPropertySet" or "IfcElementQuantity" or other definition class */
  type: string;
  /** Definition's `Name` attribute */
  name: string;
  /** The raw web-ifc line for the definition */
  line: any;
}

/**
 * Walks an element's `IsDefinedBy` inverse refs and yields the RelatingPropertyDefinition
 * for each `IfcRelDefinesByProperties` relation. Mirrors `iter_property_definitions()`.
 *
 * Pre-condition: caller must have fetched the element line with inverse refs
 * (i.e. `api.GetLine(modelID, expressID, false, true)`).
 */
export function iterPropertyDefinitions(api: any, modelID: number, elementLine: any): ResolvedDefinition[] {
  const definitions: ResolvedDefinition[] = [];
  const definitionIds = new Set<number>();

  ifcRefList(elementLine?.IsDefinedBy).forEach((relationId) => {
    const relation = safeGetLine(api, modelID, relationId);
    if (!relation) return;
    const relationType = getIfcTypeName(api, relation?.type);
    if (relationType !== 'IfcRelDefinesByProperties') return;
    const definitionId = ifcRef(relation?.RelatingPropertyDefinition);
    if (definitionId !== null) definitionIds.add(definitionId);
  });

  for (const id of definitionIds) {
    const line = safeGetLine(api, modelID, id);
    if (!line) continue;
    definitions.push({
      type: getIfcTypeName(api, line?.type, 'IfcPropertyDefinition'),
      name: ifcText(line?.Name),
      line,
    });
  }

  return definitions;
}

function safeGetLine(api: any, modelID: number, expressID: number): any {
  try {
    return api.GetLine(modelID, expressID);
  } catch {
    return null;
  }
}

// ── Property / quantity value lookup ────────────────────────────────────────

const QUANTITY_VALUE_KEYS = ['VolumeValue', 'AreaValue', 'LengthValue', 'CountValue'] as const;

/**
 * Mirror of `find_property_value()`. Case-insensitive name match across all
 * psets and quantities. Returns the unwrapped IFC value (string/number/bool/null).
 */
export function findPropertyValue(api: any, modelID: number, elementLine: any, propertyName: string): unknown {
  const wanted = propertyName.toLowerCase();
  for (const def of iterPropertyDefinitions(api, modelID, elementLine)) {
    if (def.type === 'IfcPropertySet') {
      const props = ifcRefList(def.line?.HasProperties);
      for (const propId of props) {
        const prop = safeGetLine(api, modelID, propId);
        if (!prop) continue;
        const name = ifcText(prop?.Name).toLowerCase();
        if (name !== wanted) continue;
        return unwrapIfcValue(prop?.NominalValue);
      }
    }
    if (def.type === 'IfcElementQuantity') {
      const quantities = ifcRefList(def.line?.Quantities);
      for (const qId of quantities) {
        const q = safeGetLine(api, modelID, qId);
        if (!q) continue;
        const name = ifcText(q?.Name).toLowerCase();
        if (name !== wanted) continue;
        for (const key of QUANTITY_VALUE_KEYS) {
          const value = unwrapIfcValue(q?.[key]);
          if (value != null) return value;
        }
      }
    }
  }
  return null;
}

// ── Preferred-measure lookup ────────────────────────────────────────────────

interface MeasureCandidate {
  value: number;
  /** "IfcPropertySet:PSet_Revit_Dimensions:Volume" — used to match preferred paths */
  source: string;
}

/**
 * Mirror of `find_preferred_measure()`. Walks all psets/quantities, gathers
 * candidates whose name contains the measure keyword, then picks the FIRST
 * candidate matching the preferred-path order. Falls back to any keyword
 * match if no preferred path hit.
 *
 * Returns [value, sourceTag]. value is null when nothing matches.
 */
export function findPreferredMeasure(
  api: any,
  modelID: number,
  elementLine: any,
  measureKind: MeasureKind,
  preferredBaseType?: string,
): { value: number | null; source: string } {
  const paths = pathsForElement(elementLine, measureKind, preferredBaseType, api);
  const keywords = MEASURE_KEYWORDS[measureKind] ?? [];
  const candidates: MeasureCandidate[] = [];

  for (const def of iterPropertyDefinitions(api, modelID, elementLine)) {
    if (def.type === 'IfcPropertySet') {
      const props = ifcRefList(def.line?.HasProperties);
      for (const propId of props) {
        const prop = safeGetLine(api, modelID, propId);
        if (!prop) continue;
        const propName = ifcText(prop?.Name);
        if (keywords.length > 0 && !keywords.some((kw) => propName.toLowerCase().includes(kw))) continue;
        const value = toFloat(prop?.NominalValue);
        if (value != null) {
          candidates.push({ value, source: `${def.type}:${def.name}:${propName}` });
        }
      }
    }
    if (def.type === 'IfcElementQuantity') {
      const quantities = ifcRefList(def.line?.Quantities);
      for (const qId of quantities) {
        const q = safeGetLine(api, modelID, qId);
        if (!q) continue;
        const qName = ifcText(q?.Name);
        if (keywords.length > 0 && !keywords.some((kw) => qName.toLowerCase().includes(kw))) continue;
        let value: number | null = null;
        for (const key of QUANTITY_VALUE_KEYS) {
          value = toFloat(q?.[key]);
          if (value != null) break;
        }
        if (value != null) {
          candidates.push({ value, source: `${def.type}:${def.name}:${qName}` });
        }
      }
    }
  }

  // Match preferred paths in order
  for (const path of paths) {
    for (const c of candidates) {
      const parts = c.source.split(':', 3);
      if (parts.length !== 3) continue;
      const [srcType, srcName, srcProp] = parts;
      if (srcType === path.psetType && srcName === path.psetName && srcProp === path.propertyName) {
        return { value: c.value, source: c.source };
      }
    }
  }

  if (candidates.length > 0) {
    const best = candidates[0]!;
    return { value: best.value, source: best.source };
  }
  return { value: null, source: '' };
}

function pathsForElement(
  elementLine: any,
  measureKind: MeasureKind,
  preferredBaseType: string | undefined,
  api: any,
): PsetPath[] {
  if (preferredBaseType) {
    const preferred = PREFERRED_MEASURE_PATHS[preferredBaseType];
    if (preferred) return preferred[measureKind] ?? [];
  }
  // Match by element's IFC class. web-ifc has no direct `is_a()` with subtype walking,
  // but for the supported types (Wall/Slab/Beam/Column/Covering) the typeCode→name
  // is exact and subtypes (e.g. IfcWallStandardCase) inherit the parent name only
  // through the API's type-code-to-class mapping.
  const ifcClass = getIfcTypeName(api, elementLine?.type);
  for (const baseType of Object.keys(PREFERRED_MEASURE_PATHS)) {
    if (ifcClass === baseType || ifcClass.startsWith(`${baseType}Standard`)) {
      const paths = PREFERRED_MEASURE_PATHS[baseType];
      return paths?.[measureKind] ?? [];
    }
  }
  return [];
}

// ── Element-input extraction ────────────────────────────────────────────────

/**
 * Reads everything `classifyElement()` from smm2-rules.ts needs from a single
 * element. Performs O(n) GetLine calls where n = number of property definitions
 * attached to the element (typically 5-15). Caller batches across all
 * audited elements.
 */
export function extractElementInput(api: any, modelID: number, expressID: number): ElementInput {
  const line = api.GetLine(modelID, expressID, false, true);
  const ifcClass = getIfcTypeName(api, line?.type);

  return {
    ifcClass,
    name: safeName(line),
    textSignature: buildTextSignature(line),
    isExternal: toBool(findPropertyValue(api, modelID, line, 'IsExternal')),
    loadBearing: toBool(findPropertyValue(api, modelID, line, 'LoadBearing')),
  };
}

/**
 * Mirror of `structural_text_signature()` — concatenate identifying string
 * fields with " | " separator. Used by the structural-role inference for
 * IfcMember / IfcBuildingElementProxy aliases.
 */
export function buildTextSignature(line: any): string {
  const parts: string[] = [];
  for (const attr of ['Name', 'ObjectType', 'Description', 'Tag', 'PredefinedType']) {
    const text = ifcText(line?.[attr]);
    if (text) parts.push(text);
  }
  return parts.join(' | ');
}

// ── Class iteration ─────────────────────────────────────────────────────────

/**
 * Mirror of `iter_type()` — returns express IDs for all elements of the given
 * IFC class (and subtypes when web-ifc's `GetLineIDsWithType` accepts it).
 *
 * Caller passes the IFC type code (number). Use `api.GetIfcType(modelID,
 * "IfcWall")` to convert from class name if needed, or import constants from
 * web-ifc.
 */
export function iterElementsOfType(api: any, modelID: number, typeCode: number): number[] {
  try {
    const result = api.GetLineIDsWithType(modelID, typeCode);
    if (!result) return [];
    if (Array.isArray(result)) return result;
    // Some web-ifc builds return a Vector wrapper with .size() / .get(i)
    if (typeof result.size === 'function' && typeof result.get === 'function') {
      const out: number[] = [];
      const n = result.size();
      for (let i = 0; i < n; i++) {
        const id = result.get(i);
        if (typeof id === 'number') out.push(id);
      }
      return out;
    }
    return [];
  } catch {
    return [];
  }
}
