import type { BimAttributeValue, BimQuantityValue } from './vo-diff-core';

export interface StepEntityRecord {
  expressID: number;
  type: string;
  args: string[];
}

export interface StepPropertyData {
  attributes: Record<string, BimAttributeValue>;
  quantities: Record<string, BimQuantityValue>;
  psetSignature: string;
}

export const STEP_SUPPORTED_TYPE_NAMES = new Set([
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCSLAB',
  'IFCCOLUMN',
  'IFCBEAM',
  'IFCDOOR',
  'IFCWINDOW',
  'IFCFOOTING',
  'IFCSTAIR',
  'IFCCURTAINWALL',
  'IFCPIPESEGMENT',
  'IFCDUCTSEGMENT',
  'IFCSANITARYTERMINAL',
  'IFCCOVERING',
  'IFCFLOWSEGMENT',
  'IFCFLOWTERMINAL',
  'IFCFLOWCONTROLLER',
  'IFCFLOWFITTING',
  'IFCFLOWMOVINGDEVICE',
  'IFCFLOWSTORAGEDEVICE',
  'IFCFLOWTREATMENTDEVICE',
  'IFCDISTRIBUTIONELEMENT',
  'IFCMEMBER',
  'IFCRAILING',
  'IFCPLATE',
  'IFCDISCRETEACCESSORY',
  'IFCMECHANICALFASTENER',
  'IFCFASTENER',
  'IFCENERGYCONVERSIONDEVICE',
  'IFCROOF',
  'IFCRAMP',
  'IFCBUILDINGELEMENTPROXY',
  'IFCFURNISHINGELEMENT',
  'IFCELEMENTASSEMBLY',
  'IFCCABLECARRIERSEGMENT',
  'IFCEQUIPMENTELEMENT',
  'IFCOPENINGELEMENT',
]);

export const STEP_TYPE_NAME_MAP: Record<string, string> = {
  IFCWALL: 'IfcWall',
  IFCWALLSTANDARDCASE: 'IfcWallStandardCase',
  IFCSLAB: 'IfcSlab',
  IFCCOLUMN: 'IfcColumn',
  IFCBEAM: 'IfcBeam',
  IFCDOOR: 'IfcDoor',
  IFCWINDOW: 'IfcWindow',
  IFCFOOTING: 'IfcFooting',
  IFCSTAIR: 'IfcStair',
  IFCCURTAINWALL: 'IfcCurtainWall',
  IFCPIPESEGMENT: 'IfcPipeSegment',
  IFCDUCTSEGMENT: 'IfcDuctSegment',
  IFCSANITARYTERMINAL: 'IfcSanitaryTerminal',
  IFCCOVERING: 'IfcCovering',
  IFCFLOWSEGMENT: 'IfcFlowSegment',
  IFCFLOWTERMINAL: 'IfcFlowTerminal',
  IFCFLOWCONTROLLER: 'IfcFlowController',
  IFCFLOWFITTING: 'IfcFlowFitting',
  IFCFLOWMOVINGDEVICE: 'IfcFlowMovingDevice',
  IFCFLOWSTORAGEDEVICE: 'IfcFlowStorageDevice',
  IFCFLOWTREATMENTDEVICE: 'IfcFlowTreatmentDevice',
  IFCDISTRIBUTIONELEMENT: 'IfcDistributionElement',
  IFCMEMBER: 'IfcMember',
  IFCRAILING: 'IfcRailing',
  IFCPLATE: 'IfcPlate',
  IFCDISCRETEACCESSORY: 'IfcDiscreteAccessory',
  IFCMECHANICALFASTENER: 'IfcMechanicalFastener',
  IFCFASTENER: 'IfcFastener',
  IFCENERGYCONVERSIONDEVICE: 'IfcEnergyConversionDevice',
  IFCROOF: 'IfcRoof',
  IFCRAMP: 'IfcRamp',
  IFCBUILDINGELEMENTPROXY: 'IfcBuildingElementProxy',
  IFCFURNISHINGELEMENT: 'IfcFurnishingElement',
  IFCELEMENTASSEMBLY: 'IfcElementAssembly',
  IFCCABLECARRIERSEGMENT: 'IfcCableCarrierSegment',
  IFCEQUIPMENTELEMENT: 'IfcEquipmentElement',
  IFCOPENINGELEMENT: 'IfcOpeningElement',
};

function makeAttribute(key: string, value: string, source: BimAttributeValue['source']): BimAttributeValue {
  return { key, label: key, value, source };
}

function makeQuantity(key: string, value: number, unit: string, source: BimQuantityValue['source']): BimQuantityValue {
  return { key, label: key, value, unit, source };
}

export function splitStepArguments(source: string) {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'") {
      current += char;
      if (inString && source[index + 1] === "'") {
        current += source[index + 1];
        index += 1;
      } else {
        inString = !inString;
      }
      continue;
    }

    if (!inString) {
      if (char === '(') depth += 1;
      if (char === ')') depth = Math.max(0, depth - 1);
      if (char === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) result.push(current.trim());
  return result;
}

export function parseStepEntities(stepText: string) {
  const entities = new Map<number, StepEntityRecord>();
  const entityPattern = /#(\d+)\s*=\s*([A-Z0-9_]+)\(([^;]*)\);/g;
  let match: RegExpExecArray | null;

  while ((match = entityPattern.exec(stepText)) !== null) {
    const expressID = Number(match[1]);
    const type = match[2].toUpperCase();
    const args = splitStepArguments(match[3]);
    entities.set(expressID, { expressID, type, args });
  }

  return entities;
}

export function parseRawStepString(token?: string) {
  if (!token) return '';
  const trimmed = token.trim();
  if (!trimmed || trimmed === '$' || trimmed === '*') return '';
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'").trim();
  }
  return trimmed;
}

export function parseStepString(token?: string) {
  const raw = parseRawStepString(token);
  if (!raw) return '';
  if (/^\.[A-Z0-9_]+\.$/.test(raw)) return raw.slice(1, -1);
  return raw.replace(/[\-_]+/g, ' ').trim();
}

export function parseStepRef(token?: string) {
  if (!token) return null;
  const match = /#(\d+)/.exec(token.trim());
  return match ? Number(match[1]) : null;
}

export function parseStepRefList(token?: string) {
  if (!token) return [];
  const trimmed = token.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return [];
  return splitStepArguments(trimmed.slice(1, -1))
    .map((entry) => parseStepRef(entry))
    .filter((entry): entry is number => entry !== null);
}

function formatMaterialSemanticName(rawName: string) {
  const cleaned = rawName.replace(/[\-_]+/g, ' ').trim();
  if (/stone\s+sand\s+lime/i.test(cleaned)) return 'sand lime blockwork';
  if (/concrete\s+reinforced\s+in\s+situ/i.test(cleaned)) return 'reinforced concrete';
  return cleaned;
}

function buildStepMaterialSummary(materialId: number | null, entities: Map<number, StepEntityRecord>, visited = new Set<number>()): string {
  if (materialId === null || visited.has(materialId)) return '';
  visited.add(materialId);
  const entity = entities.get(materialId);
  if (!entity) return '';

  if (entity.type === 'IFCMATERIAL') {
    const rawName = parseRawStepString(entity.args[0]);
    const semanticName = formatMaterialSemanticName(rawName);
    if (!rawName) return 'IfcMaterial';
    if (semanticName && semanticName.toLowerCase() !== rawName.toLowerCase()) {
      return `IfcMaterial "${semanticName}" [${rawName}]`;
    }
    return `IfcMaterial "${semanticName || rawName}"`;
  }

  if (entity.type === 'IFCMATERIALLAYER') {
    return buildStepMaterialSummary(parseStepRef(entity.args[0]), entities, visited);
  }

  if (entity.type === 'IFCMATERIALLAYERSET' || entity.type === 'IFCMATERIALLIST') {
    const refs = parseStepRefList(entity.args[0]);
    return refs.map((ref) => buildStepMaterialSummary(ref, entities, visited)).filter(Boolean).join(' | ');
  }

  if (entity.type === 'IFCMATERIALLAYERSETUSAGE') {
    return buildStepMaterialSummary(parseStepRef(entity.args[0]), entities, visited);
  }

  for (const arg of entity.args) {
    const nestedRef = parseStepRef(arg);
    if (nestedRef !== null) {
      const nested = buildStepMaterialSummary(nestedRef, entities, visited);
      if (nested) return nested;
    }
  }

  return entity.type;
}

export function buildStepMaterialMap(entities: Map<number, StepEntityRecord>) {
  const materialMap = new Map<number, string>();
  entities.forEach((entity) => {
    if (entity.type !== 'IFCRELASSOCIATESMATERIAL') return;
    const relatedIds = parseStepRefList(entity.args[4]);
    const materialSummary = buildStepMaterialSummary(parseStepRef(entity.args[5]), entities);
    relatedIds.forEach((relatedId) => {
      materialMap.set(relatedId, materialSummary);
    });
  });
  return materialMap;
}

function renderStepNominalValue(token?: string): string {
  if (!token) return '';
  const trimmed = token.trim();
  if (!trimmed || trimmed === '$' || trimmed === '*') return '';
  const wrapped = /^([A-Z0-9_]+)\((.*)\)$/i.exec(trimmed);
  if (wrapped) {
    const inner = wrapped[2];
    const stringValue = parseStepString(inner);
    if (stringValue) return stringValue;
    const numeric = Number(inner);
    if (Number.isFinite(numeric)) return String(numeric);
    return inner.trim();
  }
  return parseStepString(trimmed);
}

function readStepQuantityValue(entity: StepEntityRecord): { value: number; unit: string } | null {
  const quantityMap: Record<string, { index: number; unit: string }> = {
    IFCQUANTITYAREA: { index: 3, unit: 'm2' },
    IFCQUANTITYVOLUME: { index: 3, unit: 'm3' },
    IFCQUANTITYLENGTH: { index: 3, unit: 'm' },
    IFCQUANTITYCOUNT: { index: 3, unit: 'count' },
    IFCQUANTITYWEIGHT: { index: 3, unit: 'kg' },
    IFCQUANTITYTIME: { index: 3, unit: 'h' },
  };
  const config = quantityMap[entity.type];
  if (!config) return null;
  const numeric = Number(entity.args[config.index]);
  if (!Number.isFinite(numeric)) return null;
  return { value: numeric, unit: config.unit };
}

function ensurePropertyBucket(map: Map<number, StepPropertyData>, expressID: number) {
  if (!map.has(expressID)) {
    map.set(expressID, { attributes: {}, quantities: {}, psetSignature: '' });
  }
  return map.get(expressID)!;
}

export function buildStepPropertyDataMap(entities: Map<number, StepEntityRecord>) {
  const dataMap = new Map<number, StepPropertyData>();

  entities.forEach((entity) => {
    if (entity.type !== 'IFCRELDEFINESBYPROPERTIES') return;
    const relatedIds = parseStepRefList(entity.args[4]);
    const definitionId = parseStepRef(entity.args[5]);
    if (definitionId === null) return;
    const definition = entities.get(definitionId);
    if (!definition) return;

    const definitionName = parseStepString(definition.args[2]) || `${definition.type}#${definitionId}`;
    const signatureEntry = `${definition.type}:${definitionName}`;

    relatedIds.forEach((relatedId) => {
      const bucket = ensurePropertyBucket(dataMap, relatedId);
      const parts = bucket.psetSignature ? bucket.psetSignature.split(' | ') : [];
      if (!parts.includes(signatureEntry)) {
        parts.push(signatureEntry);
        bucket.psetSignature = parts.filter(Boolean).sort().join(' | ');
      }
    });

    if (definition.type === 'IFCPROPERTYSET') {
      const propertyIds = parseStepRefList(definition.args[4]);
      propertyIds.forEach((propertyId) => {
        const property = entities.get(propertyId);
        if (!property) return;
        const propertyName = parseStepString(property.args[0]) || `${property.type}#${propertyId}`;
        const key = `${definitionName}.${propertyName}`;
        let value = '';
        if (property.type === 'IFCPROPERTYSINGLEVALUE') value = renderStepNominalValue(property.args[2]);
        else if (property.type === 'IFCPROPERTYENUMERATEDVALUE') value = splitStepArguments(property.args[2] || '').map((entry) => renderStepNominalValue(entry)).filter(Boolean).join(', ');
        else if (property.type === 'IFCPROPERTYLISTVALUE') value = splitStepArguments(property.args[2] || '').map((entry) => renderStepNominalValue(entry)).filter(Boolean).join(', ');
        if (!value) return;
        relatedIds.forEach((relatedId) => {
          const bucket = ensurePropertyBucket(dataMap, relatedId);
          bucket.attributes[key] = makeAttribute(key, value, 'pset');
        });
      });
    }

    if (definition.type === 'IFCELEMENTQUANTITY') {
      const quantityIds = parseStepRefList(definition.args[5]);
      quantityIds.forEach((quantityId) => {
        const quantity = entities.get(quantityId);
        if (!quantity) return;
        const rendered = readStepQuantityValue(quantity);
        if (!rendered) return;
        const quantityName = parseStepString(quantity.args[0]) || `${quantity.type}#${quantityId}`;
        const key = `${definitionName}.${quantityName}`;
        relatedIds.forEach((relatedId) => {
          const bucket = ensurePropertyBucket(dataMap, relatedId);
          bucket.quantities[key] = makeQuantity(key, rendered.value, rendered.unit, 'qto');
        });
      });
    }
  });

  return dataMap;
}

export function buildFallbackProps(entity: StepEntityRecord, materialSignature: string) {
  return {
    GlobalId: parseRawStepString(entity.args[0]),
    Name: parseStepString(entity.args[2]),
    Description: parseStepString(entity.args[3]),
    ObjectType: parseStepString(entity.args[4]),
    ObjectPlacement: parseStepRef(entity.args[5]),
    Representation: parseStepRef(entity.args[6]),
    Tag: parseStepString(entity.args[7]),
    PredefinedType: parseStepString(entity.args[8]),
    __typeName: STEP_TYPE_NAME_MAP[entity.type] || entity.type,
    __fallbackMaterialSignature: materialSignature,
  };
}
