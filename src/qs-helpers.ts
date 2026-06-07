import { BimAttributeValue, BimQuantityValue } from './vo-diff-core';
import {
  FINISH_TYPES,
  GRID_LIKE_PATTERNS,
  MEP_TYPES,
  OPENING_TYPES,
  PreferredLocationKind,
  QS_DIAMETER_ATTRIBUTE_PATTERNS,
  QS_DIAMETER_QUANTITY_PATTERNS,
  QS_DIMENSION_ATTRIBUTE_PATTERNS,
  QS_DIMENSION_QUANTITY_PATTERNS,
  QS_HEIGHT_ATTRIBUTE_PATTERNS,
  QS_HEIGHT_QUANTITY_PATTERNS,
  QS_INSTALLATION_PATTERNS,
  QS_MATERIAL_ATTRIBUTE_PATTERNS,
  QS_MATERIAL_RULES,
  QS_PROFILE_PATTERNS,
  QS_TYPE_FALLBACKS,
  QS_WIDTH_ATTRIBUTE_PATTERNS,
  QS_WIDTH_QUANTITY_PATTERNS,
  SMM2_SECTION_RULES,
  SMM2_SECTIONS,
  STRUCTURAL_TYPES,
  WALL_TYPES,
} from './qs-config';
import { PROJECT_QS_OVERRIDES } from './qs-project-config';

export interface SpatialLocation {
  siteName: string;
  buildingName: string;
  levelName: string;
  gridRoomName: string;
  locationPath: string;
  preferredLocationLabel: string;
  blockName?: string;
  zoneName?: string;
  roomName?: string;
  axisName?: string;
  preferredLocationKind?: PreferredLocationKind;
}

export interface Smm2Section {
  code: string;
  title: string;
  sort: string;
  label: string;
}

const STRUCTURAL_TYPE_SET = new Set(STRUCTURAL_TYPES);
const WALL_TYPE_SET = new Set(WALL_TYPES);
const OPENING_TYPE_SET = new Set(OPENING_TYPES);
const FINISH_TYPE_SET = new Set(FINISH_TYPES);
const MEP_TYPE_SET = new Set(MEP_TYPES);
const ACTIVE_SECTION_RULES = [...PROJECT_QS_OVERRIDES.sectionRules, ...SMM2_SECTION_RULES];
const ACTIVE_MATERIAL_RULES = [...PROJECT_QS_OVERRIDES.materialRules, ...QS_MATERIAL_RULES];
const ACTIVE_TYPE_FALLBACKS = { ...QS_TYPE_FALLBACKS, ...PROJECT_QS_OVERRIDES.typeFallbacks };

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function humanizeIfcName(type: string) {
  return type.replace(/^Ifc/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function normalizeCompare(value: string) {
  return normalizeText(value).toLowerCase();
}

function applyLocationAlias(value: string) {
  return PROJECT_QS_OVERRIDES.locationAliases[value] ?? value;
}

function applyScopedAlias(value: string, aliases: Record<string, string>) {
  return aliases[value] ?? applyLocationAlias(value);
}

function findAttributeValue(attributes: Record<string, BimAttributeValue>, patterns: RegExp[]) {
  const entries = Object.values(attributes);
  for (const attribute of entries) {
    if (patterns.some((pattern) => pattern.test(attribute.key))) {
      return attribute.value;
    }
  }
  return '';
}

function findQuantityValue(
  quantities: Record<string, BimQuantityValue>,
  patterns: RegExp[],
  unit?: string,
) {
  const entries = Object.values(quantities);
  for (const quantity of entries) {
    if (!patterns.some((pattern) => pattern.test(quantity.key))) continue;
    if (unit && quantity.unit !== unit) continue;
    return quantity.value;
  }
  return null;
}

function parseDimensionMm(value: string | number | null | undefined) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  if (num < 1) {
    return Math.round(num * 1000);
  }
  return Math.round(num);
}

function findDimensionMm(
  attributes: Record<string, BimAttributeValue>,
  quantities: Record<string, BimQuantityValue>,
  attributePatterns: RegExp[],
  quantityPatterns: RegExp[],
) {
  const fromAttribute = parseDimensionMm(findAttributeValue(attributes, attributePatterns));
  if (fromAttribute) {
    return fromAttribute;
  }

  const fromQuantity = findQuantityValue(quantities, quantityPatterns, 'm');
  if (typeof fromQuantity === 'number') {
    return Math.round(fromQuantity * 1000);
  }

  return null;
}

function inferThicknessText(
  attributes: Record<string, BimAttributeValue>,
  quantities: Record<string, BimQuantityValue>,
  geometry: { sizeX: number; sizeY: number; sizeZ: number },
) {
  const fromData = findDimensionMm(
    attributes,
    quantities,
    QS_DIMENSION_ATTRIBUTE_PATTERNS,
    QS_DIMENSION_QUANTITY_PATTERNS,
  );
  if (fromData) {
    return `${fromData}mm thick`;
  }

  const candidates = [geometry.sizeX, geometry.sizeY, geometry.sizeZ]
    .filter((value) => value > 0 && value < 1)
    .sort((a, b) => a - b);
  if (candidates.length > 0) {
    return `${Math.round(candidates[0]! * 1000)}mm thick`;
  }

  return '';
}

function inferDiameterText(
  attributes: Record<string, BimAttributeValue>,
  quantities: Record<string, BimQuantityValue>,
) {
  const diameter = findDimensionMm(
    attributes,
    quantities,
    QS_DIAMETER_ATTRIBUTE_PATTERNS,
    QS_DIAMETER_QUANTITY_PATTERNS,
  );
  return diameter ? `${diameter}mm dia.` : '';
}

function inferSizePairText(
  attributes: Record<string, BimAttributeValue>,
  quantities: Record<string, BimQuantityValue>,
  geometry: { sizeX: number; sizeY: number; sizeZ: number },
) {
  const width =
    findDimensionMm(
      attributes,
      quantities,
      QS_WIDTH_ATTRIBUTE_PATTERNS,
      QS_WIDTH_QUANTITY_PATTERNS,
    ) ?? null;
  const height =
    findDimensionMm(
      attributes,
      quantities,
      QS_HEIGHT_ATTRIBUTE_PATTERNS,
      QS_HEIGHT_QUANTITY_PATTERNS,
    ) ?? null;

  if (width && height) {
    return `${width} x ${height}mm`;
  }

  const candidates = [geometry.sizeX, geometry.sizeY, geometry.sizeZ]
    .filter((value) => value > 0.05)
    .sort((a, b) => b - a)
    .slice(0, 2)
    .map((value) => Math.round(value * 1000));
  if (candidates.length === 2) {
    return `${candidates[1]} x ${candidates[0]}mm`;
  }

  return '';
}

function inferProfileText(
  attributes: Record<string, BimAttributeValue>,
  quantities: Record<string, BimQuantityValue>,
) {
  const fromAttribute = findAttributeValue(attributes, QS_PROFILE_PATTERNS);
  if (fromAttribute) {
    return fromAttribute;
  }

  const entries = Object.values(quantities).filter((quantity) =>
    QS_PROFILE_PATTERNS.some((pattern) => pattern.test(quantity.key)),
  );
  if (entries.length > 0) {
    const entry = entries[0]!;
    return `${entry.value.toFixed(3)} ${entry.unit}`;
  }

  return '';
}

function inferMaterialPhrase(
  materialSignature: string,
  attributes: Record<string, BimAttributeValue>,
  predefinedType: string,
  type: string,
) {
  const attributeMaterial = findAttributeValue(attributes, QS_MATERIAL_ATTRIBUTE_PATTERNS);
  const combined = normalizeText(`${materialSignature} ${attributeMaterial} ${predefinedType}`);
  const ruleMatch = ACTIVE_MATERIAL_RULES.find((rule) => rule.pattern.test(combined));

  if (ruleMatch) return ruleMatch.phrase;
  if (ACTIVE_TYPE_FALLBACKS[type]) return ACTIVE_TYPE_FALLBACKS[type];
  return combined || humanizeIfcName(type);
}

function inferElementNoun(type: string, objectType: string) {
  const objectPhrase = normalizeText(objectType);
  const normalizedObjectPhrase = normalizeCompare(objectPhrase);
  const override =
    PROJECT_QS_OVERRIDES.nounOverrides[type] ||
    PROJECT_QS_OVERRIDES.nounOverrides[normalizedObjectPhrase];
  if (override) {
    return override;
  }
  if (objectPhrase && objectPhrase.length > 2) {
    return objectPhrase.toLowerCase();
  }
  return ACTIVE_TYPE_FALLBACKS[type] ?? humanizeIfcName(type);
}

function inferInstallationPhrase(attributes: Record<string, BimAttributeValue>, objectType: string) {
  const raw = normalizeText(
    `${findAttributeValue(attributes, QS_INSTALLATION_PATTERNS)} ${objectType}`,
  ).trim();
  if (!raw) return '';
  if (/^(in|with|on|to)\b/i.test(raw)) return raw.toLowerCase();
  if (/mortar|screed|render|plaster|paint|finish/i.test(raw)) return `in ${raw.toLowerCase()}`;
  if (/fix|bolt|anchor|bracket|mount/i.test(raw)) return `with ${raw.toLowerCase()}`;
  return raw.toLowerCase();
}

function pushUnique(parts: string[], value: string) {
  const compact = normalizeText(value);
  if (!compact) return;

  const norm = normalizeCompare(compact);
  const duplicate = parts.some((existing) => {
    const existingNorm = normalizeCompare(existing);
    return norm === existingNorm || norm.includes(existingNorm) || existingNorm.includes(norm);
  });

  if (!duplicate) {
    parts.push(compact);
  }
}

function buildLocationText(location: SpatialLocation) {
  return location.preferredLocationLabel ? `at ${location.preferredLocationLabel}` : '';
}

function buildWallLabel(
  materialText: string,
  noun: string,
  thicknessText: string,
  installationText: string,
  locationText: string,
) {
  const parts: string[] = [];
  pushUnique(parts, thicknessText);
  pushUnique(parts, materialText);
  if (!/brickwork|blockwork|concrete/i.test(materialText)) {
    pushUnique(parts, noun);
  }
  pushUnique(parts, installationText);
  pushUnique(parts, locationText);
  return parts.join(' ');
}

function buildOpeningLabel(
  materialText: string,
  noun: string,
  sizeText: string,
  locationText: string,
) {
  const parts: string[] = [];
  pushUnique(parts, materialText);
  pushUnique(parts, sizeText);
  pushUnique(parts, noun);
  pushUnique(parts, locationText);
  return parts.join(' ');
}

function buildStructuralLabel(
  materialText: string,
  noun: string,
  profileText: string,
  sizeText: string,
  locationText: string,
) {
  const parts: string[] = [];
  pushUnique(parts, materialText);
  pushUnique(parts, profileText || sizeText);
  pushUnique(parts, noun);
  pushUnique(parts, locationText);
  return parts.join(' ');
}

function buildMepLabel(
  materialText: string,
  noun: string,
  diameterText: string,
  sizeText: string,
  locationText: string,
) {
  const parts: string[] = [];
  pushUnique(parts, diameterText || sizeText);
  pushUnique(parts, materialText);
  if (!/basin|closet|urinal|pipework|ductwork/i.test(materialText)) {
    pushUnique(parts, noun);
  }
  pushUnique(parts, locationText);
  return parts.join(' ');
}

function buildGenericLabel(
  materialText: string,
  noun: string,
  thicknessText: string,
  sizeText: string,
  installationText: string,
  locationText: string,
) {
  const parts: string[] = [];
  pushUnique(parts, thicknessText || sizeText);
  pushUnique(parts, materialText);
  pushUnique(parts, noun);
  pushUnique(parts, installationText);
  pushUnique(parts, locationText);
  return parts.join(' ');
}

function buildSectionInfo(code: string): Smm2Section {
  const section = SMM2_SECTIONS[code] ?? SMM2_SECTIONS.ZZ!;

  return {
    code: section!.code,
    title: section!.title,
    sort: `${String(section!.order).padStart(2, '0')}-${section!.code}`,
    label: `Section ${section!.code}: ${section!.title}`,
  };
}

export function inferSmm2Section(
  type: string,
  materialSignature: string,
  attributes: Record<string, BimAttributeValue>,
) {
  const corpus = `${type} ${materialSignature} ${Object.values(attributes)
    .map((attribute) => `${attribute.key} ${attribute.value}`)
    .join(' ')}`.toLowerCase();
  const match = ACTIVE_SECTION_RULES.find((rule) => {
    const typeMatches = !rule.ifcTypes || rule.ifcTypes.includes(type);
    const typePatternMatches = !rule.typePattern || rule.typePattern.test(type);
    const corpusMatches =
      !rule.corpusPatterns || rule.corpusPatterns.some((pattern) => pattern.test(corpus));
    return typeMatches && typePatternMatches && corpusMatches;
  });

  return buildSectionInfo(match?.code ?? 'ZZ');
}

export function buildQsLabel(
  type: string,
  materialSignature: string,
  predefinedType: string,
  objectType: string,
  attributes: Record<string, BimAttributeValue>,
  quantities: Record<string, BimQuantityValue>,
  geometry: { sizeX: number; sizeY: number; sizeZ: number },
  location: SpatialLocation,
) {
  const thicknessText = inferThicknessText(attributes, quantities, geometry);
  const diameterText = inferDiameterText(attributes, quantities);
  const sizeText = inferSizePairText(attributes, quantities, geometry);
  const profileText = inferProfileText(attributes, quantities);
  const materialText = inferMaterialPhrase(materialSignature, attributes, predefinedType, type);
  const noun = inferElementNoun(type, objectType);
  const installationText = inferInstallationPhrase(attributes, objectType);
  const locationText = buildLocationText(location);

  if (WALL_TYPE_SET.has(type)) {
    return buildWallLabel(materialText, noun, thicknessText, installationText, locationText);
  }

  if (OPENING_TYPE_SET.has(type)) {
    return buildOpeningLabel(materialText, noun, sizeText, locationText);
  }

  if (STRUCTURAL_TYPE_SET.has(type)) {
    return buildStructuralLabel(materialText, noun, profileText, sizeText, locationText);
  }

  if (MEP_TYPE_SET.has(type)) {
    return buildMepLabel(materialText, noun, diameterText, sizeText, locationText);
  }

  if (FINISH_TYPE_SET.has(type)) {
    return buildGenericLabel(materialText, noun, thicknessText, sizeText, installationText, locationText);
  }

  return buildGenericLabel(materialText, noun, thicknessText, sizeText, installationText, locationText);
}

function inferAxisCandidate(
  ancestors: Array<{ type: string; name: string }>,
  zoneName: string,
) {
  const explicit =
    [...ancestors]
      .reverse()
      .find((ancestor) => GRID_LIKE_PATTERNS.some((pattern) => pattern.test(ancestor.name)))
      ?.name || '';
  return explicit || zoneName || '';
}

function inferRoomCandidate(
  ancestors: Array<{ type: string; name: string }>,
  spaceName: string,
) {
  if (spaceName) {
    return spaceName;
  }

  return (
    [...ancestors]
      .reverse()
      .find(
        (ancestor) =>
          !['IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcZone'].includes(
            ancestor.type,
          ) && !GRID_LIKE_PATTERNS.some((pattern) => pattern.test(ancestor.name)),
      )?.name || ''
  );
}

function inferBlockCandidate(
  ancestors: Array<{ type: string; name: string }>,
  buildingName: string,
) {
  const explicit = ancestors.find((ancestor) => /(block|tower|wing|podium)/i.test(ancestor.name))?.name || '';
  return explicit || buildingName || '';
}

function resolveLocationSelector(type: string): PreferredLocationKind {
  if (STRUCTURAL_TYPE_SET.has(type)) return PROJECT_QS_OVERRIDES.locationSelectors.structural;
  if (MEP_TYPE_SET.has(type)) return PROJECT_QS_OVERRIDES.locationSelectors.mep;
  if (OPENING_TYPE_SET.has(type)) return PROJECT_QS_OVERRIDES.locationSelectors.opening;
  if (FINISH_TYPE_SET.has(type)) return PROJECT_QS_OVERRIDES.locationSelectors.finish;
  return PROJECT_QS_OVERRIDES.locationSelectors.default;
}

function pickLocationValue(
  preferred: PreferredLocationKind,
  candidates: Record<PreferredLocationKind, string>,
) {
  const fallbackOrder: Record<PreferredLocationKind, PreferredLocationKind[]> = {
    axis: ['axis', 'room', 'zone', 'block', 'level', 'path', 'unassigned'],
    room: ['room', 'zone', 'block', 'level', 'axis', 'path', 'unassigned'],
    zone: ['zone', 'block', 'room', 'level', 'axis', 'path', 'unassigned'],
    block: ['block', 'zone', 'room', 'level', 'axis', 'path', 'unassigned'],
    level: ['level', 'block', 'room', 'axis', 'path', 'unassigned', 'zone'],
    path: ['path', 'level', 'room', 'axis', 'zone', 'block', 'unassigned'],
    unassigned: ['unassigned', 'path', 'level', 'room', 'axis', 'zone', 'block'],
  };

  for (const key of fallbackOrder[preferred]) {
    const value = normalizeText(candidates[key]);
    if (value) return value;
  }

  return 'Unassigned';
}

export function choosePreferredLocation(
  type: string,
  locationPath: string,
  levelName: string,
  gridRoomName: string,
  axisName = '',
  roomName = '',
  zoneName = '',
  blockName = '',
) {
  const preferredKind = resolveLocationSelector(type);
  const preferredLocationLabel = pickLocationValue(preferredKind, {
    axis: axisName,
    room: roomName || gridRoomName,
    zone: zoneName,
    block: blockName,
    level: levelName,
    path: locationPath,
    unassigned: 'Unassigned',
  });

  return {
    preferredLocationKind: preferredKind,
    preferredLocationLabel,
  };
}

export function buildSpatialLocation(
  ancestors: Array<{ type: string; name: string }>,
  elementType: string,
) {
  const siteName = ancestors.find((ancestor) => ancestor.type === 'IfcSite')?.name || '';
  const buildingName =
    ancestors.find((ancestor) => ancestor.type === 'IfcBuilding')?.name || '';
  const levelName =
    ancestors.find((ancestor) => ancestor.type === 'IfcBuildingStorey')?.name ||
    buildingName ||
    'Unassigned';
  const zoneName = ancestors.find((ancestor) => ancestor.type === 'IfcZone')?.name || '';
  const spaceName = ancestors.find((ancestor) => ancestor.type === 'IfcSpace')?.name || '';
  const axisName = inferAxisCandidate(ancestors, zoneName);
  const roomName = inferRoomCandidate(ancestors, spaceName);
  const blockName = inferBlockCandidate(ancestors, buildingName);
  const locationPath =
    ancestors.map((ancestor) => ancestor.name).filter(Boolean).join(' / ') || 'Unassigned';

  const aliasedSiteName = applyLocationAlias(siteName);
  const aliasedBuildingName = applyLocationAlias(buildingName);
  const aliasedLevelName = applyLocationAlias(levelName);
  const aliasedZoneName = applyScopedAlias(zoneName, PROJECT_QS_OVERRIDES.zoneAliases);
  const aliasedRoomName = applyScopedAlias(roomName, PROJECT_QS_OVERRIDES.roomAliases);
  const aliasedAxisName = applyScopedAlias(axisName, PROJECT_QS_OVERRIDES.axisAliases);
  const aliasedBlockName = applyScopedAlias(blockName, PROJECT_QS_OVERRIDES.blockAliases);
  const aliasedLocationPath = locationPath
    .split(' / ')
    .map((segment) => applyLocationAlias(segment))
    .join(' / ');

  const preferred = choosePreferredLocation(
    elementType,
    aliasedLocationPath,
    aliasedLevelName,
    aliasedRoomName || aliasedAxisName,
    aliasedAxisName,
    aliasedRoomName,
    aliasedZoneName,
    aliasedBlockName,
  );

  return {
    siteName: aliasedSiteName,
    buildingName: aliasedBuildingName,
    levelName: aliasedLevelName,
    gridRoomName: preferred.preferredLocationLabel,
    locationPath: aliasedLocationPath,
    preferredLocationLabel: preferred.preferredLocationLabel,
    blockName: aliasedBlockName,
    zoneName: aliasedZoneName,
    roomName: aliasedRoomName,
    axisName: aliasedAxisName,
    preferredLocationKind: preferred.preferredLocationKind,
  } satisfies SpatialLocation;
}
