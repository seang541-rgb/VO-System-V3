import fs from 'node:fs';
import path from 'node:path';
import {
  IfcAPI,
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCCOLUMN,
  IFCBEAM,
  IFCDOOR,
  IFCWINDOW,
  IFCWALL,
  IFCFOOTING,
  IFCSTAIR,
  IFCCURTAINWALL,
  IFCPIPESEGMENT,
  IFCDUCTSEGMENT,
  IFCSANITARYTERMINAL,
  IFCCOVERING,
  IFCFLOWSEGMENT,
  IFCFLOWTERMINAL,
  IFCFLOWCONTROLLER,
  IFCFLOWFITTING,
  IFCFLOWMOVINGDEVICE,
  IFCFLOWSTORAGEDEVICE,
  IFCFLOWTREATMENTDEVICE,
  IFCDISTRIBUTIONELEMENT,
  IFCMEMBER,
  IFCRAILING,
  IFCPLATE,
  IFCDISCRETEACCESSORY,
  IFCMECHANICALFASTENER,
  IFCFASTENER,
  IFCENERGYCONVERSIONDEVICE,
  IFCROOF,
  IFCRAMP,
  IFCBUILDINGELEMENTPROXY,
  IFCFURNISHINGELEMENT,
  IFCELEMENTASSEMBLY,
  IFCCABLECARRIERSEGMENT,
  IFCEQUIPMENTELEMENT,
  IFCOPENINGELEMENT,
} from 'web-ifc';
import {
  BimAttributeValue,
  BimComponent,
  BimQuantityValue,
  buildComponentFingerprint,
  buildCommercialBreakdown,
  compareModels,
} from '../src/vo-diff-core';
import { buildQsLabel, buildSpatialLocation, inferSmm2Section } from '../src/qs-helpers';
import { PROJECT_QS_OVERRIDES } from '../src/qs-project-config';

const SUPPORTED_ELEMENT_TYPES = [
  IFCWALL,
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCCOLUMN,
  IFCBEAM,
  IFCDOOR,
  IFCWINDOW,
  IFCFOOTING,
  IFCSTAIR,
  IFCCURTAINWALL,
  IFCPIPESEGMENT,
  IFCDUCTSEGMENT,
  IFCSANITARYTERMINAL,
  IFCCOVERING,
  IFCFLOWSEGMENT,
  IFCFLOWTERMINAL,
  IFCFLOWCONTROLLER,
  IFCFLOWFITTING,
  IFCFLOWMOVINGDEVICE,
  IFCFLOWSTORAGEDEVICE,
  IFCFLOWTREATMENTDEVICE,
  IFCDISTRIBUTIONELEMENT,
  IFCMEMBER,
  IFCRAILING,
  IFCPLATE,
  IFCDISCRETEACCESSORY,
  IFCMECHANICALFASTENER,
  IFCFASTENER,
  IFCENERGYCONVERSIONDEVICE,
  IFCROOF,
  IFCRAMP,
  IFCBUILDINGELEMENTPROXY,
  IFCFURNISHINGELEMENT,
  IFCELEMENTASSEMBLY,
  IFCCABLECARRIERSEGMENT,
  IFCEQUIPMENTELEMENT,
  IFCOPENINGELEMENT,
];

function unwrapIfcValue(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((item) => unwrapIfcValue(item));
  if (typeof value === 'object' && value && 'value' in (value as Record<string, unknown>)) {
    return unwrapIfcValue((value as Record<string, unknown>).value);
  }
  return value;
}

function normalizeIfcText(value: unknown): string {
  const normalized = unwrapIfcValue(value);
  if (normalized == null) return '';
  if (Array.isArray(normalized)) return normalized.map((entry) => normalizeIfcText(entry)).filter(Boolean).join(', ');
  if (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean') return String(normalized).trim();
  if (typeof normalized === 'object') {
    const record = normalized as Record<string, unknown>;
    if ('Name' in record) return normalizeIfcText(record.Name);
    if ('type' in record) return normalizeIfcText(record.type);
  }
  return '';
}

function readIfcRef(value: unknown): number | null {
  const normalized = unwrapIfcValue(value);
  return typeof normalized === 'number' && Number.isFinite(normalized) ? normalized : null;
}

function readIfcRefList(value: unknown): number[] {
  const normalized = unwrapIfcValue(value);
  if (!Array.isArray(normalized)) return [];
  return normalized.map((entry) => readIfcRef(entry)).filter((entry): entry is number => entry !== null);
}

function summarizeRelatedLine(typeName: string, line: any): string {
  const globalId = normalizeIfcText(line?.GlobalId);
  const name = normalizeIfcText(line?.Name);
  const predefinedType = normalizeIfcText(line?.PredefinedType);
  return [
    typeName || 'IfcReference',
    line?.expressID ? `#${line.expressID}` : '',
    globalId ? `[${globalId}]` : '',
    name ? `"${name}"` : '',
    predefinedType ? `<${predefinedType}>` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function roundMetric(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : '0.0000';
}

function applyFlatMatrix(x: number, y: number, z: number, matrix: ArrayLike<number>) {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  };
}

function triangleArea(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;
  return 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
}

function signedTriangleVolume(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }) {
  return (
    a.x * (b.y * c.z - b.z * c.y) -
    a.y * (b.x * c.z - b.z * c.x) +
    a.z * (b.x * c.y - b.y * c.x)
  ) / 6;
}

function makeAttribute(key: string, value: string, source: BimAttributeValue['source']): BimAttributeValue {
  return { key, label: key, value, source };
}

function makeQuantity(key: string, value: number, unit: string, source: BimQuantityValue['source']): BimQuantityValue {
  return { key, label: key, value, unit, source };
}

function humanizeIfcName(name: string) {
  return name.replace(/^Ifc/, '') || name;
}

function readQuantityValue(quantity: any): { value: number; unit: string } | null {
  const valueKeys: Array<[string, string]> = [
    ['LengthValue', 'm'],
    ['AreaValue', 'm2'],
    ['VolumeValue', 'm3'],
    ['CountValue', 'count'],
    ['WeightValue', 'kg'],
    ['TimeValue', 'h'],
  ];

  for (const [key, unit] of valueKeys) {
    const value = unwrapIfcValue(quantity?.[key]);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { value, unit };
    }
  }

  return null;
}

function renderPropertyValue(api: IfcAPI, modelID: number, property: any, propertyType: string) {
  if (propertyType === 'IfcPropertySingleValue') return normalizeIfcText(property?.NominalValue);
  if (propertyType === 'IfcPropertyEnumeratedValue') return normalizeIfcText(property?.EnumerationValues);
  if (propertyType === 'IfcPropertyListValue') return normalizeIfcText(property?.ListValues);
  if (propertyType === 'IfcPropertyBoundedValue') {
    const lower = normalizeIfcText(property?.LowerBoundValue);
    const upper = normalizeIfcText(property?.UpperBoundValue);
    return [lower, upper].filter(Boolean).join(' .. ');
  }
  if (propertyType === 'IfcPropertyReferenceValue') {
    const referenceId = readIfcRef(property?.PropertyReference);
    if (referenceId === null) return '';
    const referenceLine = api.GetLine(modelID, referenceId);
    return summarizeRelatedLine(api.GetNameFromTypeCode(referenceLine.type), referenceLine);
  }
  return '';
}

function collectRelationshipData(api: IfcAPI, modelID: number, expressID: number) {
  const inverseLine = api.GetLine(modelID, expressID, false, true);
  const typeObjectIds = readIfcRefList(inverseLine?.IsTypedBy)
    .map((relationId) => api.GetLine(modelID, relationId))
    .map((relation: any) => readIfcRef(relation?.RelatingType))
    .filter((id: number | null): id is number => id !== null);

  const typeSignature = typeObjectIds
    .map((typeId) => api.GetLine(modelID, typeId))
    .map((line: any) => summarizeRelatedLine(api.GetNameFromTypeCode(line.type), line))
    .sort()
    .join(' | ');

  const materialSignature = readIfcRefList(inverseLine?.HasAssociations)
    .map((relationId) => api.GetLine(modelID, relationId))
    .filter((relation: any) => api.GetNameFromTypeCode(relation.type) === 'IfcRelAssociatesMaterial')
    .map((relation: any) => readIfcRef(relation?.RelatingMaterial))
    .filter((id: number | null): id is number => id !== null)
    .map((materialId) => api.GetLine(modelID, materialId))
    .map((line: any) => summarizeRelatedLine(api.GetNameFromTypeCode(line.type), line))
    .sort()
    .join(' | ');

  const openingIds = readIfcRefList(inverseLine?.HasOpenings)
    .map((relationId) => api.GetLine(modelID, relationId))
    .map((relation: any) => readIfcRef(relation?.RelatedOpeningElement))
    .filter((id: number | null): id is number => id !== null);

  const openingSignature = openingIds
    .map((openingId) => api.GetLine(modelID, openingId))
    .map((line: any) => summarizeRelatedLine(api.GetNameFromTypeCode(line.type), line))
    .sort()
    .join(' | ');

  const openingHostIds = readIfcRefList(inverseLine?.VoidsElements)
    .map((relationId) => api.GetLine(modelID, relationId))
    .map((relation: any) => readIfcRef(relation?.RelatingBuildingElement))
    .filter((id: number | null): id is number => id !== null);

  const openingHostLine = openingHostIds.length > 0 ? api.GetLine(modelID, openingHostIds[0]) : null;

  return {
    typeObjectIds,
    typeSignature,
    materialSignature,
    openingCount: openingIds.length,
    openingSignature,
    openingHostIfcId: normalizeIfcText(openingHostLine?.GlobalId),
    openingHostType: openingHostLine ? api.GetNameFromTypeCode(openingHostLine.type) : '',
    openingHostName: normalizeIfcText(openingHostLine?.Name),
  };
}

function collectPropertyData(api: IfcAPI, modelID: number, expressID: number, typeObjectIds: number[]) {
  const inverseLine = api.GetLine(modelID, expressID, false, true);
  const attributes: Record<string, BimAttributeValue> = {};
  const quantities: Record<string, BimQuantityValue> = {};
  const definitionIds = new Set<number>();

  readIfcRefList(inverseLine?.IsDefinedBy)
    .map((relationId) => api.GetLine(modelID, relationId))
    .filter((relation: any) => api.GetNameFromTypeCode(relation.type) === 'IfcRelDefinesByProperties')
    .forEach((relation: any) => {
      const definitionId = readIfcRef(relation?.RelatingPropertyDefinition);
      if (definitionId !== null) definitionIds.add(definitionId);
    });

  typeObjectIds
    .map((typeId) => api.GetLine(modelID, typeId))
    .forEach((typeLine: any) => {
      readIfcRefList(typeLine?.HasPropertySets).forEach((definitionId) => definitionIds.add(definitionId));
    });

  const psetSignatureParts: string[] = [];

  [...definitionIds].forEach((definitionId) => {
    const definition = api.GetLine(modelID, definitionId);
    const definitionType = api.GetNameFromTypeCode(definition.type);
    const definitionName = normalizeIfcText(definition?.Name) || `${definitionType}#${definitionId}`;
    psetSignatureParts.push(`${definitionType}:${definitionName}`);

    if (definitionType === 'IfcPropertySet') {
      readIfcRefList(definition?.HasProperties).forEach((propertyId) => {
        const property = api.GetLine(modelID, propertyId);
        const propertyType = api.GetNameFromTypeCode(property.type);
        const propertyName = normalizeIfcText(property?.Name) || `${propertyType}#${propertyId}`;
        const key = `${definitionName}.${propertyName}`;
        const value = renderPropertyValue(api, modelID, property, propertyType);
        if (value) attributes[key] = makeAttribute(key, value, 'pset');
      });
    }

    if (definitionType === 'IfcElementQuantity') {
      readIfcRefList(definition?.Quantities).forEach((quantityId) => {
        const quantity = api.GetLine(modelID, quantityId);
        const quantityType = api.GetNameFromTypeCode(quantity.type);
        const quantityName = normalizeIfcText(quantity?.Name) || `${quantityType}#${quantityId}`;
        const key = `${definitionName}.${quantityName}`;
        const rendered = readQuantityValue(quantity);
        if (rendered) quantities[key] = makeQuantity(key, rendered.value, rendered.unit, 'qto');
      });
    }
  });

  return {
    attributes,
    quantities,
    psetSignature: psetSignatureParts.sort().join(' | '),
  };
}

function collectGeometryData(api: IfcAPI, modelID: number, expressID: number) {
  const mins = [Infinity, Infinity, Infinity];
  const maxs = [-Infinity, -Infinity, -Infinity];
  let meshCount = 0;
  let geometrySurfaceArea = 0;
  let geometrySignedVolume = 0;

  const empty = {
    signature: '',
    bboxVolume: 0,
    bboxSurfaceArea: 0,
    geometryVolume: 0,
    geometrySurfaceArea: 0,
    sizeX: 0,
    sizeY: 0,
    sizeZ: 0,
  };

  try {
    api.StreamMeshes(modelID, [expressID], (mesh) => {
      meshCount += 1;
      for (let geometryIndex = 0; geometryIndex < mesh.geometries.size(); geometryIndex += 1) {
        const placedGeometry = mesh.geometries.get(geometryIndex);
        const geometry = api.GetGeometry(modelID, placedGeometry.geometryExpressID);
        const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = typeof api.GetIndexArray === 'function' && typeof geometry.GetIndexData === 'function' && typeof geometry.GetIndexDataSize === 'function'
          ? api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
          : null;

        const readPoint = (vertexRef: number) => applyFlatMatrix(
          vertices[vertexRef * 6],
          vertices[vertexRef * 6 + 1],
          vertices[vertexRef * 6 + 2],
          placedGeometry.flatTransformation,
        );

        for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 6) {
          const point = applyFlatMatrix(
            vertices[vertexIndex],
            vertices[vertexIndex + 1],
            vertices[vertexIndex + 2],
            placedGeometry.flatTransformation,
          );
          mins[0] = Math.min(mins[0], point.x);
          mins[1] = Math.min(mins[1], point.y);
          mins[2] = Math.min(mins[2], point.z);
          maxs[0] = Math.max(maxs[0], point.x);
          maxs[1] = Math.max(maxs[1], point.y);
          maxs[2] = Math.max(maxs[2], point.z);
        }

        if (indices && indices.length >= 3) {
          for (let indexIndex = 0; indexIndex + 2 < indices.length; indexIndex += 3) {
            const a = readPoint(indices[indexIndex]);
            const b = readPoint(indices[indexIndex + 1]);
            const c = readPoint(indices[indexIndex + 2]);
            geometrySurfaceArea += triangleArea(a, b, c);
            geometrySignedVolume += signedTriangleVolume(a, b, c);
          }
        } else {
          for (let vertexIndex = 0; vertexIndex + 17 < vertices.length; vertexIndex += 18) {
            const a = applyFlatMatrix(vertices[vertexIndex], vertices[vertexIndex + 1], vertices[vertexIndex + 2], placedGeometry.flatTransformation);
            const b = applyFlatMatrix(vertices[vertexIndex + 6], vertices[vertexIndex + 7], vertices[vertexIndex + 8], placedGeometry.flatTransformation);
            const c = applyFlatMatrix(vertices[vertexIndex + 12], vertices[vertexIndex + 13], vertices[vertexIndex + 14], placedGeometry.flatTransformation);
            geometrySurfaceArea += triangleArea(a, b, c);
            geometrySignedVolume += signedTriangleVolume(a, b, c);
          }
        }

        if (typeof geometry.delete === 'function') geometry.delete();
      }
    });
  } catch {
    return empty;
  }

  if (meshCount === 0 || !Number.isFinite(mins[0]) || !Number.isFinite(maxs[0])) {
    return empty;
  }

  const sizeX = maxs[0] - mins[0];
  const sizeY = maxs[1] - mins[1];
  const sizeZ = maxs[2] - mins[2];
  const centerX = (mins[0] + maxs[0]) / 2;
  const centerY = (mins[1] + maxs[1]) / 2;
  const centerZ = (mins[2] + maxs[2]) / 2;
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
    bboxVolume,
    bboxSurfaceArea,
    geometryVolume,
    geometrySurfaceArea,
    sizeX,
    sizeY,
    sizeZ,
  };
}

function collectSpatialLocation(api: IfcAPI, modelID: number, expressID: number, elementType: string) {
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
      const typeName = api.GetNameFromTypeCode(line.type);
      const name = normalizeIfcText(line?.LongName) || normalizeIfcText(line?.Name) || humanizeIfcName(typeName);
      ancestors.unshift({ type: typeName, name: humanizeIfcName(name) });
      const parentRelationId = readIfcRefList(line?.Decomposes)[0];
      if (!parentRelationId) break;
      const parentRelation = api.GetLine(modelID, parentRelationId);
      currentId = readIfcRef(parentRelation?.RelatingObject);
    }

    if (ancestors.length > 0) {
      return buildSpatialLocation(ancestors, elementType);
    }
  }

  return buildSpatialLocation([], elementType);
}

function extractComponents(api: IfcAPI, modelID: number): BimComponent[] {
  const map = new Map<string, BimComponent>();

  for (const typeId of SUPPORTED_ELEMENT_TYPES) {
    const ids = api.GetLineIDsWithType(modelID, typeId, false);
    for (let index = 0; index < ids.size(); index += 1) {
      const expressID = ids.get(index);
      const props = api.GetLine(modelID, expressID);
      const globalId = normalizeIfcText(props?.GlobalId);
      if (!globalId) continue;

      const relationships = collectRelationshipData(api, modelID, expressID);
      const propertyData = collectPropertyData(api, modelID, expressID, relationships.typeObjectIds);
      const geometryData = collectGeometryData(api, modelID, expressID);

      const typeName = api.GetNameFromTypeCode(props.type);
      const objectType = normalizeIfcText(props?.ObjectType);
      const predefinedType = normalizeIfcText(props?.PredefinedType);
      const locationData = collectSpatialLocation(api, modelID, expressID, typeName);
      const section = inferSmm2Section(typeName, relationships.materialSignature, propertyData.attributes);
      const qsLabel = buildQsLabel(
        typeName,
        relationships.materialSignature,
        predefinedType,
        objectType,
        propertyData.attributes,
        propertyData.quantities,
        geometryData,
        locationData,
      ) || humanizeIfcName(typeName);

      const componentWithoutFingerprint: Omit<BimComponent, 'fingerprint'> = {
        ifcId: globalId,
        expressID,
        type: typeName,
        name: normalizeIfcText(props?.Name),
        objectType,
        predefinedType,
        description: normalizeIfcText(props?.Description),
        tag: normalizeIfcText(props?.Tag),
        placementId: readIfcRef(props?.ObjectPlacement),
        representationId: readIfcRef(props?.Representation),
        typeSignature: relationships.typeSignature,
        materialSignature: relationships.materialSignature,
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
        isOpening: typeName === 'IfcOpeningElement',
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
          ...(geometryData.geometryVolume > 0
            ? { 'Derived.GeometryVolume': makeQuantity('Derived.GeometryVolume', geometryData.geometryVolume, 'm3', 'geometry') }
            : {}),
          ...(geometryData.geometrySurfaceArea > 0
            ? { 'Derived.GeometrySurfaceArea': makeQuantity('Derived.GeometrySurfaceArea', geometryData.geometrySurfaceArea, 'm2', 'geometry') }
            : {}),
          ...(geometryData.bboxVolume > 0
            ? { 'Derived.BBoxVolumeEstimate': makeQuantity('Derived.BBoxVolumeEstimate', geometryData.bboxVolume, 'm3', 'bbox') }
            : {}),
          ...(geometryData.bboxSurfaceArea > 0
            ? { 'Derived.BBoxSurfaceAreaEstimate': makeQuantity('Derived.BBoxSurfaceAreaEstimate', geometryData.bboxSurfaceArea, 'm2', 'bbox') }
            : {}),
        },
      };

      map.set(globalId, {
        ...componentWithoutFingerprint,
        fingerprint: buildComponentFingerprint(componentWithoutFingerprint),
      });
    }
  }

  return [...map.values()].sort((left, right) => left.ifcId.localeCompare(right.ifcId));
}

function defaultFiles() {
  const cwd = process.cwd();
  const base = path.join(cwd, 'basin-tessellation.ifc');
  const revision = path.join(cwd, 'V2_basin.ifc');
  if (fs.existsSync(base) && fs.existsSync(revision)) {
    return [base, revision];
  }
  return [];
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
const positional = args.filter((arg, index) => arg !== '--out' && index !== outIndex + 1);
const [basePath, revisionPath] = positional.length >= 2 ? positional : defaultFiles();

if (!basePath || !revisionPath) {
  console.error('Usage: npm run compare -- <base.ifc> <revision.ifc> [--out result.json]');
  process.exit(1);
}

const api = new IfcAPI();
await api.Init();
const baseModel = api.OpenModel(fs.readFileSync(basePath));
const revisionModel = api.OpenModel(fs.readFileSync(revisionPath));
const baseComponents = extractComponents(api, baseModel);
const revisionComponents = extractComponents(api, revisionModel);
const results = compareModels(baseComponents, revisionComponents);
const commercial = buildCommercialBreakdown(results);

const output = {
  baseFile: path.basename(basePath),
  revisionFile: path.basename(revisionPath),
  indexed: {
    base: baseComponents.length,
    revision: revisionComponents.length,
  },
  summary: {
    added: results.added.length,
    deleted: results.deleted.length,
    modified: results.modified.length,
    qsCountedItems: results.qsSummary.countedItems,
    qsIgnoredItems: results.qsSummary.ignoredItems,
    qsCountedChanges: results.qsSummary.countedChanges,
    qsIgnoredChanges: results.qsSummary.ignoredChanges,
    protectedValue: Number(results.qsSummary.protectedValue.toFixed(2)),
    currencySymbol: PROJECT_QS_OVERRIDES.currencySymbol,
    formworkAlerts: results.qsSummary.formworkAlerts,
    starRateCandidates: results.qsSummary.starRateCandidates,
    eotFlags: results.qsSummary.eotFlags,
    commercialOmissions: commercial.summary.omissions,
    commercialAdditions: commercial.summary.additions,
    modifiedSplitPairs: commercial.summary.modifiedPairs,
    ratedActions: commercial.summary.ratedActions,
    pendingRateActions: commercial.summary.pendingRateActions,
    highRiskQuantityItems: commercial.summary.highRiskQuantityItems,
    omissionValue: Number(commercial.summary.omissionValue.toFixed(2)),
    additionValue: Number(commercial.summary.additionValue.toFixed(2)),
    netValue: Number(commercial.summary.netValue.toFixed(2)),
  },
  modified: results.modified.map((item) => ({
    globalId: item.rev.ifcId,
    element: item.rev.name ? `${item.rev.type} / ${item.rev.name}` : item.rev.type,
    qsImpact: item.qsImpact,
    protectedValue: Number(item.changes.reduce((sum, change) => sum + (change.protectedValue ?? 0), 0).toFixed(2)),
    formworkAlert: item.formworkAlert ?? null,
    starRateCandidate: item.starRateCandidate ?? null,
    eotFlag: item.eotFlag ?? null,
    changes: item.changes,
  })),
  added: results.added.map((component) => ({ globalId: component.ifcId, element: component.type })),
  deleted: results.deleted.map((component) => ({ globalId: component.ifcId, element: component.type })),
  commercialActions: commercial.actions.map((action) => ({
    action: action.action,
    sourceStatus: action.sourceStatus,
    globalId: action.component.ifcId,
    element: action.component.name ? `${action.component.type} / ${action.component.name}` : action.component.type,
    counterpartGlobalId: action.counterpart?.ifcId ?? null,
    quantityKey: action.quantityKey,
    quantityLabel: action.quantityLabel,
    measurementNote: action.measurementNote ?? null,
    measurementRuleId: action.measurementRuleId ?? null,
    measurementRuleLabel: action.measurementRuleLabel ?? null,
    quantityRisk: action.quantityRisk ?? null,
    quantity: Number(action.quantity.toFixed(4)),
    unit: action.unit,
    quantitySource: action.quantitySource,
    rateStatus: action.rateStatus,
    pricingSource: action.pricingSource,
    bqItemReference: action.bqItemReference ?? null,
    bqDescription: action.bqDescription ?? null,
    rate: typeof action.rate === 'number' ? Number(action.rate.toFixed(2)) : null,
    amount: typeof action.amount === 'number' ? Number(action.amount.toFixed(2)) : null,
    rateRuleId: action.rateRuleId ?? null,
    rateLabel: action.rateLabel,
    protectedValue: Number(action.protectedValue.toFixed(2)),
    formworkAlert: action.formworkAlert ?? null,
    starRateCandidate: action.starRateCandidate ?? null,
    eotFlag: action.eotFlag ?? null,
  })),
};

console.log(JSON.stringify(output, null, 2));
if (outPath) fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
api.CloseModel(baseModel);
api.CloseModel(revisionModel);
api.Dispose();

