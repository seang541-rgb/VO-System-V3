/**
 * IFC data extraction — reads property sets, relationships, geometry
 * and spatial location from a loaded web-ifc model. All functions are
 * stateless (they take an IfcAPI handle + modelID) so the BimEngine
 * class stays focused on 3D rendering.
 */

import type { BimAttributeValue, BimComponent, BimQuantityValue } from '../vo-diff-core';
import { buildComponentFingerprint } from '../vo-diff-core';
import { buildQsLabel, buildSpatialLocation, inferSmm2Section } from '../qs-helpers';
import { STEP_SUPPORTED_TYPE_NAMES, buildFallbackProps, buildStepMaterialMap, buildStepPropertyDataMap, parseStepEntities } from '../ifc-step-fallback';
import type { IfcAPI, IfcLine } from './web-ifc-api';
import {
  unwrapIfcValue,
  normalizeIfcText,
  readIfcRef,
  readIfcRefList,
  humanizeIfcName,
  getSafeIfcTypeName,
  summarizeRelatedLine,
  resolveIfcEntityLine,
  roundMetric,
  makeAttribute,
  makeQuantity,
} from './ifc-helpers';

// Re-export helpers so BimEngine (and audit) can import from one place
export { normalizeIfcText, readIfcRef, readIfcRefList, humanizeIfcName, getSafeIfcTypeName } from './ifc-helpers';
export type { IfcAPI } from './web-ifc-api';

// ── Geometry math ───────────────────────────────────────────────────

function applyFlatMatrix(x: number, y: number, z: number, matrix: ArrayLike<number>) {
  return {
    x: matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    y: matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    z: matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
  };
}

type Vec3 = { x: number; y: number; z: number };

function triangleArea(a: Vec3, b: Vec3, c: Vec3) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}

function signedTriangleVolume(a: Vec3, b: Vec3, c: Vec3) {
  return (
    a.x * (b.y * c.z - b.z * c.y) -
    a.y * (b.x * c.z - b.z * c.x) +
    a.z * (b.x * c.y - b.y * c.x)
  ) / 6;
}

// ── Geometry data ───────────────────────────────────────────────────

export interface GeometryData {
  signature: string;
  bboxVolume: number;
  bboxSurfaceArea: number;
  geometryVolume: number;
  geometrySurfaceArea: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

const EMPTY_GEOMETRY: GeometryData = {
  signature: '',
  bboxVolume: 0,
  bboxSurfaceArea: 0,
  geometryVolume: 0,
  geometrySurfaceArea: 0,
  sizeX: 0,
  sizeY: 0,
  sizeZ: 0,
};

export function collectGeometryData(api: IfcAPI, modelID: number, expressID: number): GeometryData {
  const mins: [number, number, number] = [Infinity, Infinity, Infinity];
  const maxs: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let meshCount = 0;
  let geometrySurfaceArea = 0;
  let geometrySignedVolume = 0;

  try {
    const flatMesh = api.GetFlatMesh(modelID, expressID);
    if (flatMesh) {
      meshCount += 1;
      for (let gi = 0; gi < flatMesh.geometries.size(); gi += 1) {
        const placed = flatMesh.geometries.get(gi);
        const geom = api.GetGeometry(modelID, placed.geometryExpressID);
        const vertices = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const indices = typeof api.GetIndexArray === 'function' && typeof geom.GetIndexData === 'function' && typeof geom.GetIndexDataSize === 'function'
          ? api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize())
          : null;

        const readPoint = (vRef: number) => applyFlatMatrix(
          vertices[vRef * 6]!, vertices[vRef * 6 + 1]!, vertices[vRef * 6 + 2]!,
          placed.flatTransformation,
        );

        for (let vi = 0; vi < vertices.length; vi += 6) {
          const p = applyFlatMatrix(vertices[vi]!, vertices[vi + 1]!, vertices[vi + 2]!, placed.flatTransformation);
          mins[0] = Math.min(mins[0], p.x); mins[1] = Math.min(mins[1], p.y); mins[2] = Math.min(mins[2], p.z);
          maxs[0] = Math.max(maxs[0], p.x); maxs[1] = Math.max(maxs[1], p.y); maxs[2] = Math.max(maxs[2], p.z);
        }

        if (indices && indices.length >= 3) {
          for (let ii = 0; ii + 2 < indices.length; ii += 3) {
            const a = readPoint(indices[ii]!), b = readPoint(indices[ii + 1]!), c = readPoint(indices[ii + 2]!);
            geometrySurfaceArea += triangleArea(a, b, c);
            geometrySignedVolume += signedTriangleVolume(a, b, c);
          }
        } else {
          for (let vi = 0; vi + 17 < vertices.length; vi += 18) {
            const a = applyFlatMatrix(vertices[vi]!, vertices[vi + 1]!, vertices[vi + 2]!, placed.flatTransformation);
            const b = applyFlatMatrix(vertices[vi + 6]!, vertices[vi + 7]!, vertices[vi + 8]!, placed.flatTransformation);
            const c = applyFlatMatrix(vertices[vi + 12]!, vertices[vi + 13]!, vertices[vi + 14]!, placed.flatTransformation);
            geometrySurfaceArea += triangleArea(a, b, c);
            geometrySignedVolume += signedTriangleVolume(a, b, c);
          }
        }

        if (typeof geom.delete === 'function') geom.delete();
      }
      if (typeof flatMesh.delete === 'function') flatMesh.delete();
    }
  } catch {
    return EMPTY_GEOMETRY;
  }

  if (meshCount === 0 || !Number.isFinite(mins[0]) || !Number.isFinite(maxs[0])) {
    return EMPTY_GEOMETRY;
  }

  const sizeX = maxs[0] - mins[0], sizeY = maxs[1] - mins[1], sizeZ = maxs[2] - mins[2];
  const centerX = (mins[0] + maxs[0]) / 2, centerY = (mins[1] + maxs[1]) / 2, centerZ = (mins[2] + maxs[2]) / 2;
  const bboxVolume = Math.max(0, sizeX * sizeY * sizeZ);
  const bboxSurfaceArea = Math.max(0, 2 * (sizeX * sizeY + sizeY * sizeZ + sizeX * sizeZ));
  const geometryVolume = Math.abs(geometrySignedVolume);

  return {
    signature: [
      `bbox=${roundMetric(sizeX)}x${roundMetric(sizeY)}x${roundMetric(sizeZ)}`,
      `center=${roundMetric(centerX)},${roundMetric(centerY)},${roundMetric(centerZ)}`,
      `meshes=${meshCount}`,
      `garea=${roundMetric(geometrySurfaceArea)}`,
      `gvol=${roundMetric(geometryVolume)}`,
    ].join(' | '),
    bboxVolume, bboxSurfaceArea, geometryVolume, geometrySurfaceArea, sizeX, sizeY, sizeZ,
  };
}

// ── Relationship data ───────────────────────────────────────────────

export interface RelationshipData {
  typeObjectIds: number[];
  typeSignature: string;
  materialSignature: string;
  openingCount: number;
  openingSignature: string;
  openingHostIfcId: string;
  openingHostType: string;
  openingHostName: string;
}

export function collectRelationshipData(api: IfcAPI, modelID: number, expressID: number): RelationshipData {
  const inverseLine = api.GetLine(modelID, expressID, false, true);

  const typeObjectIds = readIfcRefList(inverseLine?.IsTypedBy)
    .map((relationId) => api.GetLine(modelID, relationId))
    .map((relation) => readIfcRef(relation?.RelatingType))
    .filter((id): id is number => id !== null);

  const typeSignature = typeObjectIds
    .map((typeId) => api.GetLine(modelID, typeId))
    .map((line) => summarizeRelatedLine(getSafeIfcTypeName(api, line?.type), line))
    .sort()
    .join(' | ');

  const materialSignature = readIfcRefList(inverseLine?.HasAssociations)
    .map((relationId) => api.GetLine(modelID, relationId))
    .filter((relation) => getSafeIfcTypeName(api, relation?.type) === 'IfcRelAssociatesMaterial')
    .map((relation) => readIfcRef(relation?.RelatingMaterial))
    .filter((id): id is number => id !== null)
    .map((materialId) => api.GetLine(modelID, materialId))
    .map((line) => summarizeRelatedLine(getSafeIfcTypeName(api, line?.type), line))
    .sort()
    .join(' | ');

  const openingIds = readIfcRefList(inverseLine?.HasOpenings)
    .map((relationId) => api.GetLine(modelID, relationId))
    .map((relation) => readIfcRef(relation?.RelatedOpeningElement))
    .filter((id): id is number => id !== null);

  const openingSignature = openingIds
    .map((openingId) => api.GetLine(modelID, openingId))
    .map((line) => summarizeRelatedLine(getSafeIfcTypeName(api, line?.type), line))
    .sort()
    .join(' | ');

  const openingHostIds = readIfcRefList(inverseLine?.VoidsElements)
    .map((relationId) => api.GetLine(modelID, relationId))
    .map((relation) => readIfcRef(relation?.RelatingBuildingElement))
    .filter((id): id is number => id !== null);

  const openingHostLine = openingHostIds.length > 0 ? api.GetLine(modelID, openingHostIds[0]!) : null;

  return {
    typeObjectIds,
    typeSignature,
    materialSignature,
    openingCount: openingIds.length,
    openingSignature,
    openingHostIfcId: normalizeIfcText(openingHostLine?.GlobalId),
    openingHostType: openingHostLine ? getSafeIfcTypeName(api, openingHostLine?.type, 'IfcElement') : '',
    openingHostName: normalizeIfcText(openingHostLine?.Name),
  };
}

// ── Property data ───────────────────────────────────────────────────

export interface PropertyData {
  attributes: Record<string, BimAttributeValue>;
  quantities: Record<string, BimQuantityValue>;
  psetSignature: string;
}

function renderPropertyValue(api: IfcAPI, modelID: number, property: IfcLine, propertyType: string): string {
  if (propertyType === 'IfcPropertySingleValue') return normalizeIfcText(property.NominalValue);
  if (propertyType === 'IfcPropertyEnumeratedValue') return normalizeIfcText(property.EnumerationValues);
  if (propertyType === 'IfcPropertyListValue') return normalizeIfcText(property.ListValues);
  if (propertyType === 'IfcPropertyBoundedValue') {
    const lower = normalizeIfcText(property.LowerBoundValue);
    const upper = normalizeIfcText(property.UpperBoundValue);
    return [lower, upper].filter(Boolean).join(' .. ');
  }
  if (propertyType === 'IfcPropertyReferenceValue') {
    const referenceId = readIfcRef(property.PropertyReference);
    if (referenceId === null) return '';
    const referenceLine = api.GetLine(modelID, referenceId);
    return summarizeRelatedLine(getSafeIfcTypeName(api, referenceLine?.type), referenceLine);
  }
  return '';
}

function readQuantityValue(quantity: IfcLine): { value: number; unit: string } | null {
  const valueKeys: Array<[string, string]> = [
    ['LengthValue', 'm'], ['AreaValue', 'm2'], ['VolumeValue', 'm3'],
    ['CountValue', 'count'], ['WeightValue', 'kg'], ['TimeValue', 'h'],
  ];
  for (const [key, unit] of valueKeys) {
    const value = unwrapIfcValue(quantity[key]);
    if (typeof value === 'number' && Number.isFinite(value)) return { value, unit };
  }
  return null;
}

export function collectPropertyData(api: IfcAPI, modelID: number, expressID: number, typeObjectIds: number[]): PropertyData {
  const inverseLine = api.GetLine(modelID, expressID, false, true);
  const attributes: Record<string, BimAttributeValue> = {};
  const quantities: Record<string, BimQuantityValue> = {};
  const definitionIds = new Set<number>();

  readIfcRefList(inverseLine?.IsDefinedBy)
    .map((relationId) => api.GetLine(modelID, relationId))
    .filter((relation) => getSafeIfcTypeName(api, relation?.type) === 'IfcRelDefinesByProperties')
    .forEach((relation) => {
      const definitionId = readIfcRef(relation?.RelatingPropertyDefinition);
      if (definitionId !== null) definitionIds.add(definitionId);
    });

  typeObjectIds
    .map((typeId) => api.GetLine(modelID, typeId))
    .forEach((typeLine) => {
      readIfcRefList(typeLine?.HasPropertySets).forEach((definitionId) => definitionIds.add(definitionId));
    });

  const psetSignatureParts: string[] = [];

  [...definitionIds].forEach((definitionId) => {
    const definition = api.GetLine(modelID, definitionId);
    const definitionType = getSafeIfcTypeName(api, definition?.type, 'IfcPropertyDefinition');
    const definitionName = normalizeIfcText(definition?.Name) || `${definitionType}#${definitionId}`;
    psetSignatureParts.push(`${definitionType}:${definitionName}`);

    if (definitionType === 'IfcPropertySet') {
      readIfcRefList(definition?.HasProperties).forEach((propertyId) => {
        const property = api.GetLine(modelID, propertyId);
        const propertyType = getSafeIfcTypeName(api, property?.type, 'IfcProperty');
        const propertyName = normalizeIfcText(property?.Name) || `${propertyType}#${propertyId}`;
        const key = `${definitionName}.${propertyName}`;
        const value = renderPropertyValue(api, modelID, property, propertyType);
        if (value) attributes[key] = makeAttribute(key, value, 'pset');
      });
    }

    if (definitionType === 'IfcElementQuantity') {
      readIfcRefList(definition?.Quantities).forEach((quantityId) => {
        const quantity = api.GetLine(modelID, quantityId);
        const quantityType = getSafeIfcTypeName(api, quantity?.type, 'IfcPhysicalQuantity');
        const quantityName = normalizeIfcText(quantity?.Name) || `${quantityType}#${quantityId}`;
        const key = `${definitionName}.${quantityName}`;
        const rendered = readQuantityValue(quantity);
        if (rendered) quantities[key] = makeQuantity(key, rendered.value, rendered.unit, 'qto');
      });
    }
  });

  return { attributes, quantities, psetSignature: psetSignatureParts.sort().join(' | ') };
}

// ── Spatial location ────────────────────────────────────────────────

export function collectSpatialLocation(api: IfcAPI, modelID: number, expressID: number, elementType: string) {
  const inverseLine = api.GetLine(modelID, expressID, false, true);
  const relationIds = readIfcRefList(inverseLine?.ContainedInStructure);

  for (const relationId of relationIds) {
    const relation = api.GetLine(modelID, relationId);
    let currentId = readIfcRef(relation?.RelatingStructure);
    const visited = new Set<number>();
    const ancestors: Array<{ type: string; name: string }> = [];

    while (currentId !== null && !visited.has(currentId)) {
      visited.add(currentId);
      const line = api.GetLine(modelID, currentId, false, true);
      if (!line) break;
      const typeName = getSafeIfcTypeName(api, line.type, 'IfcSpatialStructureElement');
      const name = normalizeIfcText(line.LongName) || normalizeIfcText(line.Name) || humanizeIfcName(typeName);
      ancestors.unshift({ type: typeName, name: humanizeIfcName(name) });
      const parentRelationId = readIfcRefList(line.Decomposes)[0];
      if (!parentRelationId) break;
      const parentRelation = api.GetLine(modelID, parentRelationId);
      currentId = readIfcRef(parentRelation?.RelatingObject);
    }

    if (ancestors.length > 0) return buildSpatialLocation(ancestors, elementType);
  }

  return buildSpatialLocation([], elementType);
}

// ── Component snapshot builder ──────────────────────────────────────

export async function buildComponentSnapshot(
  api: IfcAPI,
  modelID: number,
  expressID: number,
  props: IfcLine | null,
  manager: { getIfcType(modelID: number, expressID: number): string | Promise<string> },
): Promise<BimComponent | null> {
  const entityLine = resolveIfcEntityLine(api, modelID, expressID, props);
  const globalId = normalizeIfcText(entityLine?.GlobalId);
  if (!globalId) return null;

  const fallbackType = normalizeIfcText(entityLine?.__typeName);
  const type = fallbackType
    || (entityLine?.type ? getSafeIfcTypeName(api, entityLine.type, 'IfcElement') : '')
    || normalizeIfcText(await manager.getIfcType(modelID, expressID))
    || 'IfcElement';

  const objectType = normalizeIfcText(entityLine?.ObjectType);
  const predefinedType = normalizeIfcText(entityLine?.PredefinedType);
  const relationships = collectRelationshipData(api, modelID, expressID);
  const fallbackMaterialSignature = normalizeIfcText(entityLine?.__fallbackMaterialSignature);
  const materialSignature = relationships.materialSignature || fallbackMaterialSignature;
  const propertyData = collectPropertyData(api, modelID, expressID, relationships.typeObjectIds);
  const geometryData = collectGeometryData(api, modelID, expressID);
  const locationData = collectSpatialLocation(api, modelID, expressID, type);
  const section = inferSmm2Section(type, materialSignature, propertyData.attributes);
  const qsLabel = buildQsLabel(
    type, materialSignature, predefinedType, objectType,
    propertyData.attributes, propertyData.quantities, geometryData, locationData,
  ) || humanizeIfcName(type);

  const partial: Omit<BimComponent, 'fingerprint'> = {
    ifcId: globalId, expressID, type,
    name: normalizeIfcText(entityLine?.Name),
    objectType, predefinedType,
    description: normalizeIfcText(entityLine?.Description),
    tag: normalizeIfcText(entityLine?.Tag),
    placementId: readIfcRef(entityLine?.ObjectPlacement),
    representationId: readIfcRef(entityLine?.Representation),
    typeSignature: relationships.typeSignature,
    materialSignature,
    psetSignature: propertyData.psetSignature,
    geometrySignature: geometryData.signature,
    locationPath: locationData.locationPath,
    siteName: locationData.siteName,
    buildingName: locationData.buildingName,
    levelName: locationData.levelName,
    blockName: locationData.blockName || '',
    zoneName: locationData.zoneName || '',
    roomName: locationData.roomName || '',
    axisName: locationData.axisName || '',
    gridRoomName: locationData.gridRoomName,
    preferredLocationLabel: locationData.preferredLocationLabel,
    preferredLocationKind: locationData.preferredLocationKind || 'unassigned',
    isOpening: type === 'IfcOpeningElement',
    openingHostIfcId: relationships.openingHostIfcId,
    openingHostType: relationships.openingHostType,
    openingHostName: relationships.openingHostName,
    openingCount: relationships.openingCount,
    openingSignature: relationships.openingSignature,
    smm2SectionCode: section.code,
    smm2SectionTitle: section.title,
    smm2SectionSort: section.sort,
    trade: section.label,
    qsLabel,
    attributes: propertyData.attributes,
    quantities: {
      ...propertyData.quantities,
      ...(geometryData.geometryVolume > 0 ? { 'Derived.GeometryVolume': makeQuantity('Derived.GeometryVolume', geometryData.geometryVolume, 'm3', 'geometry') } : {}),
      ...(geometryData.geometrySurfaceArea > 0 ? { 'Derived.GeometrySurfaceArea': makeQuantity('Derived.GeometrySurfaceArea', geometryData.geometrySurfaceArea, 'm2', 'geometry') } : {}),
      ...(geometryData.bboxVolume > 0 ? { 'Derived.BBoxVolumeEstimate': makeQuantity('Derived.BBoxVolumeEstimate', geometryData.bboxVolume, 'm3', 'bbox') } : {}),
      ...(geometryData.bboxSurfaceArea > 0 ? { 'Derived.BBoxSurfaceAreaEstimate': makeQuantity('Derived.BBoxSurfaceAreaEstimate', geometryData.bboxSurfaceArea, 'm2', 'bbox') } : {}),
    },
  };

  return { ...partial, fingerprint: buildComponentFingerprint(partial) };
}

// ── STEP text fallback builder ──────────────────────────────────────

export function buildComponentFromStepEntity(
  expressID: number,
  props: IfcLine,
  propertyData?: { attributes: Record<string, BimAttributeValue>; quantities: Record<string, BimQuantityValue>; psetSignature: string },
): BimComponent | null {
  const globalId = normalizeIfcText(props.GlobalId);
  if (!globalId) return null;

  const type = normalizeIfcText(props.__typeName) || 'IfcElement';
  const objectType = normalizeIfcText(props.ObjectType);
  const predefinedType = normalizeIfcText(props.PredefinedType);
  const materialSignature = normalizeIfcText(props.__fallbackMaterialSignature);
  const attributes = propertyData?.attributes ?? {};
  const quantities = propertyData?.quantities ?? {};
  const locationData = buildSpatialLocation([], type);
  const section = inferSmm2Section(type, materialSignature, attributes);
  const qsLabel = buildQsLabel(
    type, materialSignature, predefinedType, objectType,
    attributes, quantities, { sizeX: 0, sizeY: 0, sizeZ: 0 }, locationData,
  ) || humanizeIfcName(type);

  const partial: Omit<BimComponent, 'fingerprint'> = {
    ifcId: globalId, expressID, type,
    name: normalizeIfcText(props.Name),
    objectType, predefinedType,
    description: normalizeIfcText(props.Description),
    tag: normalizeIfcText(props.Tag),
    placementId: readIfcRef(props.ObjectPlacement),
    representationId: readIfcRef(props.Representation),
    typeSignature: '', materialSignature,
    psetSignature: propertyData?.psetSignature ?? '',
    geometrySignature: '',
    locationPath: locationData.locationPath,
    siteName: locationData.siteName,
    buildingName: locationData.buildingName,
    levelName: locationData.levelName,
    blockName: locationData.blockName || '',
    zoneName: locationData.zoneName || '',
    roomName: locationData.roomName || '',
    axisName: locationData.axisName || '',
    gridRoomName: locationData.gridRoomName,
    preferredLocationLabel: locationData.preferredLocationLabel,
    preferredLocationKind: locationData.preferredLocationKind || 'unassigned',
    isOpening: type === 'IfcOpeningElement',
    openingHostIfcId: '', openingHostType: '', openingHostName: '',
    openingCount: 0, openingSignature: '',
    smm2SectionCode: section.code, smm2SectionTitle: section.title,
    smm2SectionSort: section.sort, trade: section.label,
    qsLabel, attributes, quantities,
  };

  return { ...partial, fingerprint: buildComponentFingerprint(partial) };
}

// ── Bulk extraction orchestrators ───────────────────────────────────

export { STEP_SUPPORTED_TYPE_NAMES };

export async function extractComponentsFromStepText(
  buffer: ArrayBuffer,
  onProgress?: (p: number, text?: string) => void,
): Promise<BimComponent[]> {
  const stepText = new TextDecoder('utf-8').decode(buffer);
  const entities = parseStepEntities(stepText);
  const materialMap = buildStepMaterialMap(entities);
  const propertyDataMap = buildStepPropertyDataMap(entities);
  const supported = [...entities.values()].filter((entity) => STEP_SUPPORTED_TYPE_NAMES.has(entity.type));
  const uniqueMap = new Map<string, BimComponent>();
  let processed = 0;

  for (const entity of supported) {
    const component = buildComponentFromStepEntity(
      entity.expressID,
      buildFallbackProps(entity, materialMap.get(entity.expressID) || '') as IfcLine,
      propertyDataMap.get(entity.expressID),
    );
    if (component) uniqueMap.set(component.ifcId, component);
    processed += 1;
    if (supported.length > 0) {
      const progress = 82 + Math.round((processed / supported.length) * 18);
      onProgress?.(progress, `STEP fallback parsing ${processed}/${supported.length}...`);
    }
  }

  const components = Array.from(uniqueMap.values()).sort((a, b) => a.ifcId.localeCompare(b.ifcId));
  onProgress?.(100, `STEP fallback complete. Indexed ${components.length} unique elements from ${supported.length} STEP candidates.`);
  return components;
}
