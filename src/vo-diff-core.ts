import { PROJECT_QS_OVERRIDES } from './qs-project-config';
import { STRUCTURAL_TYPES, type CommercialRateRule, type QuantityNormalizationRule, type QuantityNormalizationStrategy, type ShieldRateRule } from './qs-config';

export type ChangeCategory = 'core' | 'reference' | 'attribute' | 'quantity' | 'geometry';
export type QsImpact = 'counted' | 'ignored';

export interface BimAttributeValue {
  key: string;
  label: string;
  value: string;
  source: 'pset' | 'type-pset' | 'derived';
}

export interface BimQuantityValue {
  key: string;
  label: string;
  value: number;
  unit: string;
  source: 'qto' | 'type-qto' | 'geometry' | 'bbox' | 'derived';
}

export interface BimComponent {
  ifcId: string;
  expressID: number;
  type: string;
  name: string;
  objectType: string;
  predefinedType: string;
  description: string;
  tag: string;
  placementId: number | null;
  representationId: number | null;
  typeSignature: string;
  materialSignature: string;
  psetSignature: string;
  geometrySignature: string;
  locationPath: string;
  siteName: string;
  buildingName: string;
  levelName: string;
  blockName: string;
  zoneName: string;
  roomName: string;
  axisName: string;
  gridRoomName: string;
  preferredLocationLabel: string;
  preferredLocationKind: string;
  isOpening: boolean;
  openingHostIfcId: string;
  openingHostType: string;
  openingHostName: string;
  openingCount: number;
  openingSignature: string;
  smm2SectionCode: string;
  smm2SectionTitle: string;
  smm2SectionSort: string;
  trade: string;
  qsLabel: string;
  attributes: Record<string, BimAttributeValue>;
  quantities: Record<string, BimQuantityValue>;
  fingerprint: string;
}

export interface BimFieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
  category: ChangeCategory;
  key?: string;
  delta?: number;
  unit?: string;
  source?: string;
  qsImpact: QsImpact;
  qsReason?: string;
  qsRuleId?: string;
  protectedQuantity?: number;
  protectedUnit?: string;
  protectedRate?: number;
  protectedValue?: number;
  protectedCurrency?: string;
  protectedRateLabel?: string;
}

export interface FormworkAlert {
  message: string;
  reason: string;
  severity: 'warning';
}

export interface StarRateCandidate {
  title: string;
  reason: string;
  recommendedAction: string;
  priority: 'high';
}

export interface EotFlag {
  title: string;
  reason: string;
  recommendedAction: string;
  severity: 'warning';
  ruleId: string;
}

export interface QuantityRiskAlert {
  message: string;
  reason: string;
  recommendedAction: string;
  severity: 'high';
  source: 'bbox';
}

export interface ModifiedBimComponent {
  base: BimComponent;
  rev: BimComponent;
  changes: BimFieldChange[];
  qsImpact: QsImpact;
  formworkAlert?: FormworkAlert;
  starRateCandidate?: StarRateCandidate;
  eotFlag?: EotFlag;
}

export type VoCommercialActionType = 'Omission' | 'Addition';
export type CommercialRateStatus = 'rated' | 'pending' | 'forced-star-rate';
export type CommercialPricingSource = 'contract-bq' | 'project-rate' | 'unmapped' | 'unit-mismatch' | 'forced-star-rate';

interface CommercialMeasurement {
  key: string;
  label: string;
  quantity: number;
  unit: string;
  source: BimQuantityValue['source'];
  note?: string;
  risk?: QuantityRiskAlert;
}

export interface BqLineItem {
  itemReference: string;
  description: string;
  unit: string;
  contractRate: number;
}

export interface BqMappingContext {
  itemsByReference: Record<string, BqLineItem>;
  labelMappings: Record<string, string>;
}

export interface VoCommercialAction {
  id: string;
  action: VoCommercialActionType;
  sourceStatus: 'Added' | 'Deleted' | 'Modified';
  component: BimComponent;
  counterpart?: BimComponent;
  qsImpact: QsImpact;
  changes: BimFieldChange[];
  protectedValue: number;
  quantityKey: string;
  quantityLabel: string;
  quantity: number;
  unit: string;
  quantitySource: BimQuantityValue['source'];
  measurementNote?: string;
  measurementRuleId?: string;
  measurementRuleLabel?: string;
  quantityRisk?: QuantityRiskAlert;
  rateStatus: CommercialRateStatus;
  pricingSource: CommercialPricingSource;
  bqItemReference?: string;
  bqDescription?: string;
  rate?: number;
  amount?: number;
  rateRuleId?: string;
  rateLabel: string;
  formworkAlert?: FormworkAlert;
  starRateCandidate?: StarRateCandidate;
  eotFlag?: EotFlag;
}

export interface VoCommercialSummary {
  omissions: number;
  additions: number;
  modifiedPairs: number;
  ratedActions: number;
  pendingRateActions: number;
  highRiskQuantityItems: number;
  omissionValue: number;
  additionValue: number;
  netValue: number;
}

export interface VoCommercialBreakdown {
  actions: VoCommercialAction[];
  summary: VoCommercialSummary;
}

export interface VoQsSummary {
  countedItems: number;
  ignoredItems: number;
  countedChanges: number;
  ignoredChanges: number;
  protectedValue: number;
  formworkAlerts: number;
  starRateCandidates: number;
  eotFlags: number;
}

export interface VoComparisonResults {
  added: BimComponent[];
  deleted: BimComponent[];
  modified: ModifiedBimComponent[];
  qsSummary: VoQsSummary;
}

function normalizeString(value: string | number | null | undefined) {
  if (value == null || value === '') {
    return '-';
  }
  return String(value);
}

function formatNumericValue(value: number, unit: string) {
  const rendered = Number.isFinite(value) ? value.toFixed(4) : '0.0000';
  return unit ? `${rendered} ${unit}` : rendered;
}

const QTO_SOURCES: BimQuantityValue['source'][] = ['qto', 'type-qto'];
const GEOMETRY_SOURCES: BimQuantityValue['source'][] = ['geometry'];
const BBOX_SOURCES: BimQuantityValue['source'][] = ['bbox'];
const GEOMETRY_DERIVATION_NOTE = '[Derived from Geometry Mesh Calculation]';
const BBOX_HIGH_RISK_NOTE = '[High Risk: Qty Estimated via BBox. Manual QS Verification Required]';

function serializeAttributes(attributes: Record<string, BimAttributeValue>) {
  return Object.keys(attributes)
    .sort()
    .map((key) => [key, attributes[key].value, attributes[key].source])
    .flat();
}

function serializeQuantities(quantities: Record<string, BimQuantityValue>) {
  return Object.keys(quantities)
    .sort()
    .map((key) => [key, quantities[key].value, quantities[key].unit, quantities[key].source])
    .flat();
}

function buildComponentCorpus(component: BimComponent) {
  const attributeText = Object.values(component.attributes)
    .map((attribute) => `${attribute.key} ${attribute.value}`)
    .join(' ');

  return [
    component.type,
    component.name,
    component.objectType,
    component.description,
    component.materialSignature,
    component.typeSignature,
    component.psetSignature,
    component.trade,
    component.qsLabel,
    component.openingSignature,
    component.openingHostType,
    component.openingHostName,
    attributeText,
  ]
    .join(' ')
    .toLowerCase();
}

function looksConcrete(component: BimComponent) {
  return /(concrete|reinforced concrete|\brc\b|c\d{2,3}|grade\s*c\d{2,3}|strength\s*class)/i.test(
    buildComponentCorpus(component),
  );
}

function looksBrickwork(component: BimComponent) {
  return /(brickwork|brick|blockwork|block|masonry|aac)/i.test(buildComponentCorpus(component));
}

function isAreaDeduction(change: Omit<BimFieldChange, 'qsImpact'>) {
  return (
    change.category === 'quantity' &&
    typeof change.delta === 'number' &&
    Number.isFinite(change.delta) &&
    change.delta < 0 &&
    (change.unit === 'm2' || /area/i.test(`${change.label} ${change.key ?? ''}`))
  );
}

function isVolumeDeduction(change: Omit<BimFieldChange, 'qsImpact'>) {
  return (
    change.category === 'quantity' &&
    typeof change.delta === 'number' &&
    Number.isFinite(change.delta) &&
    change.delta < 0 &&
    (change.unit === 'm3' || /volume/i.test(`${change.label} ${change.key ?? ''}`))
  );
}

function hasOpeningRelationship(component: BimComponent) {
  return component.isOpening || component.openingCount > 0 || Boolean(component.openingSignature) || Boolean(component.openingHostIfcId);
}

function summarizeOpeningContext(component: BimComponent) {
  if (component.isOpening) {
    const hostBits = [component.openingHostType, component.openingHostName || component.openingHostIfcId]
      .filter(Boolean)
      .join(' ');
    return hostBits ? `Opening host: ${hostBits}.` : '';
  }

  if (component.openingCount > 0 || component.openingSignature) {
    const summary = component.openingSignature || `${component.openingCount} hosted openings`;
    return `Host openings: ${summary}.`;
  }

  return '';
}

function buildShieldReason(prefix: string, base: BimComponent, rev: BimComponent) {
  const contexts = [summarizeOpeningContext(rev), summarizeOpeningContext(base)].filter(Boolean);
  const uniqueContexts = [...new Set(contexts)];
  return [prefix, ...uniqueContexts].join(' ');
}

function isOpeningShieldCandidate(change: Omit<BimFieldChange, 'qsImpact'>, base: BimComponent, rev: BimComponent) {
  const corpus = [
    change.label,
    change.key ?? '',
    base.type,
    rev.type,
    base.objectType,
    rev.objectType,
    base.qsLabel,
    rev.qsLabel,
    base.typeSignature,
    rev.typeSignature,
    base.psetSignature,
    rev.psetSignature,
    base.materialSignature,
    rev.materialSignature,
    base.openingSignature,
    rev.openingSignature,
    base.openingHostType,
    rev.openingHostType,
    base.openingHostName,
    rev.openingHostName,
  ]
    .join(' ')
    .toLowerCase();

  return hasOpeningRelationship(base) || hasOpeningRelationship(rev) || /(opening|void|hole|penetration|sleeve|recess|window|door|duct|pipe|service|mep|netarea|netsidearea|netvolume|grossarea|grossvolume)/i.test(
    corpus,
  );
}


function resolveShieldRateRule(change: BimFieldChange, base: BimComponent, rev: BimComponent): ShieldRateRule | undefined {
  const candidateTypes = [base.type, rev.type, base.openingHostType, rev.openingHostType].filter(Boolean);

  return PROJECT_QS_OVERRIDES.shieldRateRules.find((rule) => {
    if (rule.ruleIds && (!change.qsRuleId || !rule.ruleIds.includes(change.qsRuleId))) {
      return false;
    }

    if (rule.sectionCode && ![base.smm2SectionCode, rev.smm2SectionCode].includes(rule.sectionCode)) {
      return false;
    }

    if (rule.unit && change.unit && rule.unit !== change.unit) {
      return false;
    }

    if (rule.ifcTypes && !rule.ifcTypes.some((type) => candidateTypes.includes(type))) {
      return false;
    }

    return true;
  });
}

function isFormworkCandidate(component: BimComponent) {
  return STRUCTURAL_TYPES.includes(component.type) || looksConcrete(component);
}

function matchesVolumeQuantity(key: string, label: string, unit: string) {
  return unit === 'm3' || /volume/i.test(`${key} ${label}`);
}

function matchesSurfaceQuantity(key: string, label: string, unit: string) {
  return unit === 'm2' && /(surface|side.?area|formwork|gross.?area)/i.test(`${key} ${label}`);
}

function matchesPerimeterQuantity(key: string, label: string, unit: string) {
  return unit === 'm' && /(perimeter|girth|boundary|profile|outline)/i.test(`${key} ${label}`);
}

function sumQuantities(
  component: BimComponent,
  matcher: (key: string, label: string, unit: string) => boolean,
) {
  return Object.entries(component.quantities).reduce((sum, [key, quantity]) => {
    if (!matcher(key, quantity.label, quantity.unit)) return sum;
    return sum + quantity.value;
  }, 0);
}

function parseMeshCount(signature: string) {
  const match = /meshes=(\d+)/i.exec(signature);
  return match ? Number(match[1]) : 0;
}

function hasGeometryChange(changes: BimFieldChange[]) {
  return changes.some(
    (change) =>
      change.category === 'geometry' ||
      change.field === 'geometrySignature' ||
      change.field === 'representationId' ||
      change.field === 'placementId',
  );
}

function buildFormworkAlert(base: BimComponent, rev: BimComponent, changes: BimFieldChange[]): FormworkAlert | undefined {
  const trigger = PROJECT_QS_OVERRIDES.formworkTrigger;
  if (!trigger.enabled) return undefined;
  if (![base.type, rev.type].some((type) => trigger.applicableIfcTypes.includes(type))) return undefined;
  if (!isFormworkCandidate(base) && !isFormworkCandidate(rev)) return undefined;

  const baseVolume = sumQuantities(base, matchesVolumeQuantity);
  const revVolume = sumQuantities(rev, matchesVolumeQuantity);
  const volumeDelta = revVolume - baseVolume;
  const baseSurface = sumQuantities(base, matchesSurfaceQuantity);
  const revSurface = sumQuantities(rev, matchesSurfaceQuantity);
  const surfaceDelta = revSurface - baseSurface;
  const basePerimeter = sumQuantities(base, matchesPerimeterQuantity);
  const revPerimeter = sumQuantities(rev, matchesPerimeterQuantity);
  const perimeterDelta = revPerimeter - basePerimeter;
  const meshDelta = parseMeshCount(rev.geometrySignature) - parseMeshCount(base.geometrySignature);
  const geometryChanged = hasGeometryChange(changes);

  const smallVolumeChange = Math.abs(volumeDelta) <= trigger.maxVolumeDelta;
  const largeSurfaceIncrease =
    surfaceDelta >= trigger.minSurfaceIncrease ||
    (baseSurface > 0 && surfaceDelta / baseSurface >= trigger.minSurfaceIncreaseRatio);
  const perimeterIncrease = perimeterDelta >= trigger.minPerimeterIncrease;
  const complexityIncrease = geometryChanged && meshDelta >= trigger.minMeshIncrease;

  if (!smallVolumeChange) return undefined;
  if (!(largeSurfaceIncrease || perimeterIncrease || complexityIncrease)) return undefined;

  const reasons = [`volume delta ${formatNumericValue(volumeDelta, 'm3')}`];
  if (surfaceDelta > 0) reasons.push(`gross surface area +${formatNumericValue(surfaceDelta, 'm2')}`);
  if (perimeterDelta > 0) reasons.push(`perimeter/profile +${formatNumericValue(perimeterDelta, 'm')}`);
  if (complexityIncrease) {
    reasons.push(
      `geometry complexity increased (mesh count ${parseMeshCount(base.geometrySignature)} -> ${parseMeshCount(rev.geometrySignature)})`,
    );
  }

  return {
    message: 'Geometry Changed: Auto-trigger Formwork Re-assessment (\u9700\u91cd\u65b0\u8bc4\u4f30\u6a21\u677f\u5355\u4ef7)',
    reason: reasons.join('; '),
    severity: 'warning',
  };
}

function buildStarRateCandidate(component: BimComponent, formworkAlert?: FormworkAlert): StarRateCandidate | undefined {
  if (!formworkAlert) return undefined;

  return {
    title: 'Star Rate Candidate: Formwork Re-assessment required',
    reason: `${component.qsLabel || component.type}. ${formworkAlert.reason}`,
    recommendedAction: 'Submit new formwork / abnormal geometry rate build-up for QS review.',
    priority: 'high',
  };
}


function buildForcedStarRateCandidate(component: BimComponent, counterpart?: BimComponent, changes: BimFieldChange[] = []): StarRateCandidate {
  const materialChange = changes.some((change) => change.field === 'materialSignature' || change.field.toLowerCase().includes('material'));
  const typeChange = changes.some((change) => change.field === 'typeSignature' || change.field.toLowerCase().includes('type'));
  const reasons = [];
  if (materialChange) reasons.push('material / performance specification changed');
  if (typeChange) reasons.push('type reference changed');
  if (counterpart?.qsLabel) reasons.push(`original contract item differs from ${counterpart.qsLabel}`);

  return {
    title: 'Star Rate Candidate: Item Not Found in BQ - Forced Star Rate',
    reason: `${component.qsLabel || component.type}. ${reasons.join('; ') || 'No matching awarded BQ item was mounted for this revised specification.'}`,
    recommendedAction: 'Do not reuse the original contract rate. Prepare a new star rate build-up and submit QS justification for approval.',
    priority: 'high',
  };
}

function shouldForceStarRate(params: { action: VoCommercialActionType; sourceStatus: 'Added' | 'Deleted' | 'Modified'; component: BimComponent; counterpart?: BimComponent; changes: BimFieldChange[]; bqContext?: BqMappingContext; }) {
  if (!params.bqContext) return false;
  if (params.action !== 'Addition') return false;
  if (params.sourceStatus !== 'Modified' && params.sourceStatus !== 'Added') return false;

  const labelKey = params.component.qsLabel || params.component.name || params.component.type;
  const mappedReference = params.bqContext.labelMappings[labelKey];
  if (mappedReference) return false;

  if (params.sourceStatus === 'Added') return false;
  if (!params.counterpart) return false;

  const materialChanged = params.changes.some((change) => change.field === 'materialSignature' || change.field.toLowerCase().includes('material'));
  const typeChanged = params.changes.some((change) => change.field === 'typeSignature');
  const labelChanged = params.component.qsLabel !== params.counterpart.qsLabel;
  return materialChanged || typeChanged || labelChanged;
}

function buildEotFlag(base: BimComponent, rev: BimComponent, changes: BimFieldChange[]): EotFlag | undefined {
  const changedFields = changes.map((change) => change.field.toLowerCase());
  const changeCorpus = changes
    .map((change) => `${change.field} ${change.label} ${change.before} ${change.after}`)
    .join(' ')
    .toLowerCase();
  const combinedCorpus = `${buildComponentCorpus(base)} ${buildComponentCorpus(rev)} ${changeCorpus}`;


  for (const rule of PROJECT_QS_OVERRIDES.eotTriggerRules) {
    if (rule.ifcTypes && !rule.ifcTypes.includes(base.type) && !rule.ifcTypes.includes(rev.type)) {
      continue;
    }

    if (rule.changedFields && !rule.changedFields.some((ruleField) => changedFields.some((field) => field === ruleField.toLowerCase() || field.startsWith(`${ruleField.toLowerCase()}.`) || field.includes(ruleField.toLowerCase())))) {
      continue;
    }

    if (rule.corpusPatterns && !rule.corpusPatterns.some((pattern) => pattern.test(combinedCorpus))) {
      continue;
    }

    return {
      title: rule.title,
      reason: `${rev.qsLabel || rev.type}. ${rule.reason}`,
      recommendedAction: rule.recommendedAction,
      severity: 'warning',
      ruleId: rule.id,
    };
  }

  return undefined;
}

function applyShieldEconomics(change: BimFieldChange, base: BimComponent, rev: BimComponent): BimFieldChange {
  if (change.qsImpact !== 'ignored' || typeof change.delta !== 'number' || !Number.isFinite(change.delta)) {
    return change;
  }

  const protectedQuantity = Math.abs(change.delta);
  const shieldRateRule = resolveShieldRateRule(change, base, rev);
  const protectedUnit = change.unit || shieldRateRule?.unit || '';

  if (!shieldRateRule) {
    return {
      ...change,
      protectedQuantity,
      protectedUnit,
      protectedCurrency: PROJECT_QS_OVERRIDES.currencySymbol,
      protectedRateLabel: 'Project rate required',
    };
  }

  return {
    ...change,
    protectedQuantity,
    protectedUnit,
    protectedRate: shieldRateRule.rate,
    protectedValue: protectedQuantity * shieldRateRule.rate,
    protectedCurrency: PROJECT_QS_OVERRIDES.currencySymbol,
    protectedRateLabel: shieldRateRule.label,
  };
}

function applyQsRules(change: Omit<BimFieldChange, 'qsImpact'>, base: BimComponent, rev: BimComponent): BimFieldChange {
  if (
    isAreaDeduction(change) &&
    Math.abs(change.delta ?? 0) <= 0.1 &&
    isOpeningShieldCandidate(change, base, rev) &&
    (looksBrickwork(base) || looksBrickwork(rev))
  ) {
    return {
      ...change,
      qsImpact: 'ignored',
      qsRuleId: 'SMM2-G.3-OPENING-ND',
      qsReason: buildShieldReason(
        'SMM2 Clause G.3 shield: brickwork opening deduction at or below 0.1 m2 is ignored.',
        base,
        rev,
      ),
    };
  }

  if (
    isVolumeDeduction(change) &&
    Math.abs(change.delta ?? 0) <= 0.05 &&
    isOpeningShieldCandidate(change, base, rev) &&
    (looksConcrete(base) || looksConcrete(rev))
  ) {
    return {
      ...change,
      qsImpact: 'ignored',
      qsRuleId: 'SMM2-F-VOID-ND',
      qsReason: buildShieldReason(
        'Concrete opening shield: void deduction at or below 0.05 m3 is ignored.',
        base,
        rev,
      ),
    };
  }

  return {
    ...change,
    qsImpact: 'counted',
  };
}

export function buildComponentFingerprint(component: Omit<BimComponent, 'fingerprint'>) {
  return JSON.stringify([
    component.type,
    component.name,
    component.objectType,
    component.predefinedType,
    component.description,
    component.tag,
    component.placementId,
    component.representationId,
    component.typeSignature,
    component.materialSignature,
    component.psetSignature,
    component.geometrySignature,
    component.locationPath,
    component.siteName,
    component.buildingName,
    component.levelName,
    component.blockName,
    component.zoneName,
    component.roomName,
    component.axisName,
    component.gridRoomName,
    component.preferredLocationLabel,
    component.preferredLocationKind,
    component.isOpening,
    component.openingHostIfcId,
    component.openingHostType,
    component.openingHostName,
    component.openingCount,
    component.openingSignature,
    component.smm2SectionCode,
    component.smm2SectionTitle,
    component.smm2SectionSort,
    component.trade,
    component.qsLabel,
    serializeAttributes(component.attributes),
    serializeQuantities(component.quantities),
  ]);
}

export function compareModels(baseComps: BimComponent[], revComps: BimComponent[]): VoComparisonResults {
  const baseMap = new Map<string, BimComponent>();
  baseComps.forEach((component) => baseMap.set(component.ifcId, component));

  const results: VoComparisonResults = {
    added: [],
    deleted: [],
    modified: [],
    qsSummary: {
      countedItems: 0,
      ignoredItems: 0,
      countedChanges: 0,
      ignoredChanges: 0,
      protectedValue: 0,
      formworkAlerts: 0,
      starRateCandidates: 0,
      eotFlags: 0,
    },
  };

  const revKeys = new Set<string>();

  revComps.forEach((rev) => {
    revKeys.add(rev.ifcId);
    const base = baseMap.get(rev.ifcId);

    if (!base) {
      results.added.push(rev);
      return;
    }

    const rawChanges: Omit<BimFieldChange, 'qsImpact'>[] = [];

    const compareCoreField = (field: keyof BimComponent, label: string, category: ChangeCategory) => {
      if (base[field] !== rev[field]) {
        rawChanges.push({
          field: String(field),
          label,
          before: normalizeString(base[field] as string | number | null),
          after: normalizeString(rev[field] as string | number | null),
          category,
        });
      }
    };

    compareCoreField('type', 'Element type', 'core');
    compareCoreField('name', 'Name', 'core');
    compareCoreField('objectType', 'Object type', 'core');
    compareCoreField('predefinedType', 'Predefined type', 'core');
    compareCoreField('description', 'Description', 'core');
    compareCoreField('tag', 'Tag', 'core');
    compareCoreField('typeSignature', 'Type reference', 'reference');
    compareCoreField('materialSignature', 'Material reference', 'reference');
    compareCoreField('psetSignature', 'Property-set references', 'reference');
    compareCoreField('geometrySignature', 'Geometry signature', 'geometry');
    compareCoreField('locationPath', 'Location path', 'core');
    compareCoreField('siteName', 'Site', 'core');
    compareCoreField('buildingName', 'Building', 'core');
    compareCoreField('levelName', 'Level', 'core');
    compareCoreField('blockName', 'Block', 'core');
    compareCoreField('zoneName', 'Zone', 'core');
    compareCoreField('roomName', 'Room', 'core');
    compareCoreField('axisName', 'Axis', 'core');
    compareCoreField('gridRoomName', 'Grid/Room', 'core');
    compareCoreField('preferredLocationLabel', 'Preferred location', 'core');
    compareCoreField('preferredLocationKind', 'Preferred location kind', 'core');
    compareCoreField('openingHostIfcId', 'Opening host GlobalId', 'core');
    compareCoreField('openingHostType', 'Opening host type', 'core');
    compareCoreField('openingHostName', 'Opening host name', 'core');
    compareCoreField('openingSignature', 'Opening signature', 'core');
    compareCoreField('smm2SectionCode', 'SMM2 section code', 'core');
    compareCoreField('smm2SectionTitle', 'SMM2 section title', 'core');
    compareCoreField('trade', 'Trade', 'core');
    compareCoreField('qsLabel', 'QS Label', 'core');

    if (base.isOpening !== rev.isOpening) {
      rawChanges.push({
        field: 'isOpening',
        label: 'Opening element flag',
        before: normalizeString(base.isOpening ? 'Yes' : 'No'),
        after: normalizeString(rev.isOpening ? 'Yes' : 'No'),
        category: 'core',
      });
    }

    if (base.openingCount !== rev.openingCount) {
      rawChanges.push({
        field: 'openingCount',
        label: 'Hosted opening count',
        before: normalizeString(base.openingCount),
        after: normalizeString(rev.openingCount),
        category: 'core',
      });
    }

    if (base.placementId !== rev.placementId) {
      rawChanges.push({
        field: 'placementId',
        label: 'Placement',
        before: normalizeString(base.placementId),
        after: normalizeString(rev.placementId),
        category: 'geometry',
      });
    }

    if (base.representationId !== rev.representationId) {
      rawChanges.push({
        field: 'representationId',
        label: 'Geometry reference',
        before: normalizeString(base.representationId),
        after: normalizeString(rev.representationId),
        category: 'geometry',
      });
    }

    const attributeKeys = new Set([...Object.keys(base.attributes), ...Object.keys(rev.attributes)]);
    [...attributeKeys].sort().forEach((key) => {
      const beforeAttribute = base.attributes[key];
      const afterAttribute = rev.attributes[key];
      const beforeValue = beforeAttribute?.value ?? '';
      const afterValue = afterAttribute?.value ?? '';

      if (beforeValue !== afterValue) {
        rawChanges.push({
          field: `attributes.${key}`,
          key,
          label: afterAttribute?.label || beforeAttribute?.label || key,
          before: normalizeString(beforeValue),
          after: normalizeString(afterValue),
          category: 'attribute',
          source: afterAttribute?.source || beforeAttribute?.source,
        });
      }
    });

    const quantityKeys = new Set([...Object.keys(base.quantities), ...Object.keys(rev.quantities)]);
    [...quantityKeys].sort().forEach((key) => {
      const beforeQuantity = base.quantities[key];
      const afterQuantity = rev.quantities[key];
      const beforeValue = beforeQuantity?.value ?? 0;
      const afterValue = afterQuantity?.value ?? 0;
      const delta = afterValue - beforeValue;

      if (Math.abs(delta) > 0.0001 || (!beforeQuantity && afterQuantity) || (beforeQuantity && !afterQuantity)) {
        const unit = afterQuantity?.unit || beforeQuantity?.unit || '';
        rawChanges.push({
          field: `quantities.${key}`,
          key,
          label: afterQuantity?.label || beforeQuantity?.label || key,
          before: beforeQuantity ? formatNumericValue(beforeValue, unit) : '-',
          after: afterQuantity ? formatNumericValue(afterValue, unit) : '-',
          category: 'quantity',
          delta,
          unit,
          source: afterQuantity?.source || beforeQuantity?.source,
        });
      }
    });

    if (rawChanges.length === 0 && base.fingerprint !== rev.fingerprint) {
      rawChanges.push({
        field: 'fingerprint',
        label: 'Metadata',
        before: 'Base revision data',
        after: 'Revision data',
        category: 'core',
      });
    }

    if (rawChanges.length > 0) {
      const annotatedChanges = rawChanges.map((change) => applyShieldEconomics(applyQsRules(change, base, rev), base, rev));
      const itemImpact: QsImpact = annotatedChanges.some((change) => change.qsImpact === 'counted') ? 'counted' : 'ignored';

      if (itemImpact === 'counted') {
        results.qsSummary.countedItems += 1;
      } else {
        results.qsSummary.ignoredItems += 1;
      }

      annotatedChanges.forEach((change) => {
        if (change.qsImpact === 'counted') {
          results.qsSummary.countedChanges += 1;
        } else {
          results.qsSummary.ignoredChanges += 1;
        }

        if (typeof change.protectedValue === 'number' && Number.isFinite(change.protectedValue)) {
          results.qsSummary.protectedValue += change.protectedValue;
        }
      });

      const formworkAlert = buildFormworkAlert(base, rev, annotatedChanges);
      const starRateCandidate = buildStarRateCandidate(rev, formworkAlert);
      const eotFlag = buildEotFlag(base, rev, annotatedChanges);
      if (formworkAlert) {
        results.qsSummary.formworkAlerts += 1;
      }
      if (starRateCandidate) {
        results.qsSummary.starRateCandidates += 1;
      }
      if (eotFlag) {
        results.qsSummary.eotFlags += 1;
      }

      results.modified.push({
        base,
        rev,
        changes: annotatedChanges,
        qsImpact: itemImpact,
        formworkAlert,
        starRateCandidate,
        eotFlag,
      });
    }
  });

  baseComps.forEach((base) => {
    if (!revKeys.has(base.ifcId)) {
      results.deleted.push(base);
    }
  });

  return results;
}


function sumProtectedValue(changes: BimFieldChange[]) {
  return changes.reduce((sum, change) => sum + (change.protectedValue ?? 0), 0);
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function appendMeasurementNote(note?: string, extra?: string) {
  if (!extra) return note;
  return note ? `${note} ${extra}` : extra;
}

function getQuantityEntries(component: BimComponent) {
  return Object.entries(component.quantities).map(([key, quantity]) => ({ key, quantity }));
}

function buildBBoxQuantityRisk(component: BimComponent): QuantityRiskAlert {
  const label = component.qsLabel || component.name || component.type;
  return {
    message: 'High Risk: Qty Estimated via BBox. Manual QS Verification Required',
    reason: `${label}. Qto quantities were unavailable and geometry calculation could not be completed, so the measurement fell back to a bounding-box estimate.`,
    recommendedAction: 'Manual QS Verification Required before rate build-up or submission.',
    severity: 'high',
    source: 'bbox',
  };
}

function toCommercialMeasurement(entry: { key: string; quantity: BimQuantityValue }, note?: string, risk?: QuantityRiskAlert): CommercialMeasurement {
  return { key: entry.key, label: entry.quantity.label || entry.key, quantity: entry.quantity.value, unit: entry.quantity.unit, source: entry.quantity.source, note, risk };
}

function createCommercialMeasurement(key: string, label: string, quantity: number, unit: string, source: BimQuantityValue['source'], note?: string, risk?: QuantityRiskAlert): CommercialMeasurement {
  return { key, label, quantity, unit, source, note, risk };
}

function findQuantityByKeys(entries: { key: string; quantity: BimQuantityValue }[], wantedKeys: string[], unit?: string, sources?: BimQuantityValue['source'][]) {
  for (const wantedKey of wantedKeys) {
    const wantedToken = normalizeToken(wantedKey);
    const candidate = entries.find(({ key, quantity }) => {
      if (unit && quantity.unit !== unit) return false;
      if (sources && !sources.includes(quantity.source)) return false;
      const variants = [key, quantity.key, quantity.label].filter(Boolean).map(normalizeToken);
      return variants.some((variant) => variant === wantedToken || variant.includes(wantedToken) || wantedToken.includes(variant));
    });
    if (candidate) return candidate;
  }
  return undefined;
}

function findQuantityByPatterns(entries: { key: string; quantity: BimQuantityValue }[], patterns: RegExp[], unit?: string, sources?: BimQuantityValue['source'][]) {
  return entries.find(({ key, quantity }) => (!unit || quantity.unit === unit) && (!sources || sources.includes(quantity.source)) && patterns.some((pattern) => pattern.test(`${key} ${quantity.label}`)));
}

function matchesCommercialRateRule(rule: CommercialRateRule, component: BimComponent) {
  if (rule.sectionCode && component.smm2SectionCode !== rule.sectionCode) return false;
  if (rule.ifcTypes && !rule.ifcTypes.includes(component.type)) return false;
  if (rule.corpusPatterns) {
    const corpus = buildComponentCorpus(component);
    if (!rule.corpusPatterns.some((pattern) => pattern.test(corpus))) return false;
  }
  return true;
}

function matchesQuantityNormalizationRule(
  rule: QuantityNormalizationRule,
  component: BimComponent,
  options: { preferFormwork?: boolean },
) {
  if (rule.sectionCode !== component.smm2SectionCode) return false;
  if (rule.ifcTypes && !rule.ifcTypes.includes(component.type)) return false;
  const activeTrigger = options.preferFormwork ? 'formwork-alert' : 'default';
  return (rule.trigger ?? 'default') === activeTrigger;
}

function parseMetersFromText(value: string) {
  const match = /(-?\d+(?:\.\d+)?)/.exec(value);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (/mm/i.test(value) || numeric > 5) return numeric / 1000;
  return numeric;
}

function parseGeometryBox(component: BimComponent) {
  const match = /bbox=([\d.\-]+)x([\d.\-]+)x([\d.\-]+)/i.exec(component.geometrySignature);
  if (!match) return null;
  const sizeX = Number(match[1]);
  const sizeY = Number(match[2]);
  const sizeZ = Number(match[3]);
  if (![sizeX, sizeY, sizeZ].every((value) => Number.isFinite(value) && value > 0)) return null;
  return { sizeX, sizeY, sizeZ };
}

function inferThicknessMeters(component: BimComponent) {
  const entries = getQuantityEntries(component);
  const quantity = findQuantityByPatterns(entries, [/thickness/i, /width/i, /depth/i], 'm');
  if (quantity) return quantity.quantity.value;

  const attribute = Object.values(component.attributes).find((item) => /thickness|width|depth/i.test(item.key));
  if (attribute) {
    const parsed = parseMetersFromText(attribute.value);
    if (parsed) return parsed;
  }

  const box = parseGeometryBox(component);
  if (!box) return null;
  return [box.sizeX, box.sizeY, box.sizeZ].filter((value) => value > 0.01).sort((a, b) => a - b)[0] ?? null;
}

function chooseConcreteMeasurement(component: BimComponent) {
  const entries = getQuantityEntries(component);
  const netVolume = findQuantityByPatterns(entries, [/net.?volume/i], 'm3', QTO_SOURCES);
  if (netVolume) return toCommercialMeasurement(netVolume);

  const geometryVolume = findQuantityByPatterns(entries, [/geometryvolume/i], 'm3', GEOMETRY_SOURCES);
  if (geometryVolume) return toCommercialMeasurement(geometryVolume, GEOMETRY_DERIVATION_NOTE);

  const bboxVolume = findQuantityByPatterns(entries, [/bboxvolumeestimate/i], 'm3', BBOX_SOURCES);
  if (bboxVolume) return toCommercialMeasurement(bboxVolume, BBOX_HIGH_RISK_NOTE, buildBBoxQuantityRisk(component));

  return undefined;
}

function chooseFormworkMeasurement(component: BimComponent) {
  const entries = getQuantityEntries(component);
  const box = parseGeometryBox(component);
  const explicitFormwork = findQuantityByPatterns(entries, [/formwork/i, /contact.?area/i], 'm2', QTO_SOURCES);
  if (explicitFormwork) return toCommercialMeasurement(explicitFormwork);

  const qtoSurface = findQuantityByPatterns(entries, [/gross.?surface.?area/i, /surface.?area/i, /side.?area/i, /gross.?area/i], 'm2', QTO_SOURCES);
  const geometrySurface = findQuantityByPatterns(entries, [/geometrysurfacearea/i], 'm2', GEOMETRY_SOURCES);
  const bboxSurface = findQuantityByPatterns(entries, [/bboxsurfaceareaestimate/i], 'm2', BBOX_SOURCES);
  const sourceSurface = qtoSurface ?? geometrySurface ?? bboxSurface;
  if (!sourceSurface) return undefined;

  const grossSurfaceValue = sourceSurface.quantity.value;
  const footprint = box ? box.sizeX * box.sizeZ : 0;
  const derivedArea = Math.max(0, grossSurfaceValue - 2 * footprint);
  if (!Number.isFinite(derivedArea) || derivedArea <= 0) return undefined;

  const sourceNote = sourceSurface.quantity.source === 'geometry'
    ? '[Derived from Geometry Surface Area]'
    : sourceSurface.quantity.source === 'bbox'
      ? '[Derived from BBox Surface Area]'
      : '[Derived from Concrete Surface Area]';
  const note = appendMeasurementNote(sourceNote, sourceSurface.quantity.source === 'bbox' ? BBOX_HIGH_RISK_NOTE : undefined);
  const risk = sourceSurface.quantity.source === 'bbox' ? buildBBoxQuantityRisk(component) : undefined;
  return createCommercialMeasurement('Derived.FormworkArea', 'Derived Formwork Area', derivedArea, 'm2', sourceSurface.quantity.source, note, risk);
}

function chooseBrickworkMeasurement(component: BimComponent) {
  const entries = getQuantityEntries(component);
  const thickness = inferThicknessMeters(component);
  const useVolume = typeof thickness === 'number' && thickness > 0.25;

  if (useVolume) {
    const volume = chooseConcreteMeasurement(component);
    if (volume) return volume;
  }

  const netArea = findQuantityByPatterns(entries, [/net.?area/i], 'm2', QTO_SOURCES);
  if (netArea) return toCommercialMeasurement(netArea);

  const volume = chooseConcreteMeasurement(component);
  if (volume && typeof thickness === 'number' && thickness > 0) {
    return createCommercialMeasurement(
      'Derived.NetArea',
      'Derived Net Area',
      volume.quantity / thickness,
      'm2',
      volume.source,
      appendMeasurementNote(volume.note, '[Derived from Volume / Thickness]'),
      volume.risk,
    );
  }

  return undefined;
}

function chooseFinishesMeasurement(component: BimComponent) {
  const entries = getQuantityEntries(component);
  const area = findQuantityByPatterns(entries, [/net.?area/i, /cover/i, /surface/i], 'm2', QTO_SOURCES);
  if (area) return toCommercialMeasurement(area);

  const volume = chooseConcreteMeasurement(component);
  const thickness = inferThicknessMeters(component);
  if (volume && typeof thickness === 'number' && thickness > 0) {
    return createCommercialMeasurement(
      'Derived.CoverageArea',
      'Derived Coverage Area',
      volume.quantity / thickness,
      'm2',
      volume.source,
      appendMeasurementNote(volume.note, '[Derived from Volume / Thickness]'),
      volume.risk,
    );
  }

  return undefined;
}

function chooseDefaultMeasurement(component: BimComponent) {
  const entries = getQuantityEntries(component);
  if (component.smm2SectionCode === 'Q' || component.smm2SectionCode === 'U') {
    return createCommercialMeasurement('Count', 'Item count', 1, 'nr', 'derived');
  }

  const area = findQuantityByPatterns(entries, [/net.?area/i, /area/i], 'm2', QTO_SOURCES);
  if (area) return toCommercialMeasurement(area);

  const geometryArea = findQuantityByPatterns(entries, [/geometrysurfacearea/i], 'm2', GEOMETRY_SOURCES);
  if (geometryArea) return toCommercialMeasurement(geometryArea, GEOMETRY_DERIVATION_NOTE);

  const bboxArea = findQuantityByPatterns(entries, [/bboxsurfaceareaestimate/i], 'm2', BBOX_SOURCES);
  if (bboxArea) return toCommercialMeasurement(bboxArea, BBOX_HIGH_RISK_NOTE, buildBBoxQuantityRisk(component));

  const volume = chooseConcreteMeasurement(component);
  if (volume) return volume;

  return createCommercialMeasurement('Count', 'Item count', 1, 'nr', 'derived');
}

function executeQuantityNormalizationStrategy(
  component: BimComponent,
  strategy: QuantityNormalizationStrategy,
): CommercialMeasurement | undefined {
  switch (strategy) {
    case 'concrete-net-volume': {
      const entries = getQuantityEntries(component);
      const netVolume = findQuantityByPatterns(entries, [/net.?volume/i], 'm3', QTO_SOURCES);
      return netVolume ? toCommercialMeasurement(netVolume) : undefined;
    }
    case 'concrete-fallback-volume':
      return chooseConcreteMeasurement(component);
    case 'formwork-derived-area':
      return chooseFormworkMeasurement(component);
    case 'brickwork-net-area': {
      const entries = getQuantityEntries(component);
      const area = findQuantityByPatterns(entries, [/net.?area/i], 'm2', QTO_SOURCES);
      return area ? toCommercialMeasurement(area) : undefined;
    }
    case 'brickwork-volume-over-thickness':
      return chooseBrickworkMeasurement(component)?.unit === 'm2' ? chooseBrickworkMeasurement(component) : undefined;
    case 'finishes-net-area': {
      const entries = getQuantityEntries(component);
      const area = findQuantityByPatterns(entries, [/net.?area/i, /cover/i, /surface/i], 'm2', QTO_SOURCES);
      return area ? toCommercialMeasurement(area) : undefined;
    }
    case 'finishes-volume-over-thickness':
      return chooseFinishesMeasurement(component)?.unit === 'm2' ? chooseFinishesMeasurement(component) : undefined;
    case 'item-count':
      return createCommercialMeasurement('Count', 'Item count', 1, 'nr', 'derived');
    case 'generic-area': {
      const entries = getQuantityEntries(component);
      const area = findQuantityByPatterns(entries, [/net.?area/i, /area/i], 'm2', QTO_SOURCES);
      if (area) return toCommercialMeasurement(area);
      const geometryArea = findQuantityByPatterns(entries, [/geometrysurfacearea/i], 'm2', GEOMETRY_SOURCES);
      if (geometryArea) return toCommercialMeasurement(geometryArea, GEOMETRY_DERIVATION_NOTE);
      const bboxArea = findQuantityByPatterns(entries, [/bboxsurfaceareaestimate/i], 'm2', BBOX_SOURCES);
      return bboxArea ? toCommercialMeasurement(bboxArea, BBOX_HIGH_RISK_NOTE, buildBBoxQuantityRisk(component)) : undefined;
    }
    case 'generic-volume':
      return chooseConcreteMeasurement(component);
    default:
      return undefined;
  }
}

function resolveCommercialMeasurement(
  component: BimComponent,
  options: { preferFormwork?: boolean } = {},
): { measurement: CommercialMeasurement; rule?: QuantityNormalizationRule } {
  for (const rule of PROJECT_QS_OVERRIDES.quantityNormalizationRules) {
    if (!matchesQuantityNormalizationRule(rule, component, options)) continue;
    for (const strategy of rule.strategies) {
      const measurement = executeQuantityNormalizationStrategy(component, strategy);
      if (measurement && measurement.unit === rule.unit) {
        return { measurement, rule };
      }
    }
  }

  return { measurement: chooseDefaultMeasurement(component) };
}

function resolveBqRateOverride(component: BimComponent, measurement: CommercialMeasurement, bqContext?: BqMappingContext) {
  if (!bqContext) return null;
  const labelKey = component.qsLabel || component.name || component.type;
  const mappedReference = bqContext.labelMappings[labelKey];
  if (!mappedReference) return null;

  const line = bqContext.itemsByReference[mappedReference];
  if (!line) {
    return {
      rateStatus: 'pending' as const,
      pricingSource: 'unmapped' as const,
      bqItemReference: mappedReference,
      bqDescription: '',
      rateRuleId: `bq:${mappedReference}`,
      rateLabel: `Mapped BQ item missing: ${mappedReference}`,
    };
  }

  if (line.unit !== measurement.unit) {
    return {
      rateStatus: 'pending' as const,
      pricingSource: 'unit-mismatch' as const,
      bqItemReference: line.itemReference,
      bqDescription: line.description,
      rateRuleId: `bq:${line.itemReference}`,
      rateLabel: `BQ unit mismatch (${line.unit} vs ${measurement.unit})`,
    };
  }

  return {
    rateStatus: 'rated' as const,
    pricingSource: 'contract-bq' as const,
    bqItemReference: line.itemReference,
    bqDescription: line.description,
    rate: line.contractRate,
    rateRuleId: `bq:${line.itemReference}`,
    rateLabel: `Contract BQ rate (${line.itemReference})`,
  };
}

function getShieldedIgnoredQuantityChanges(changes: BimFieldChange[]) {
  return changes.filter(
    (change) =>
      change.qsImpact === 'ignored' &&
      change.category === 'quantity' &&
      typeof change.delta === 'number' &&
      Number.isFinite(change.delta) &&
      change.delta < 0,
  );
}

function isShieldedNonDeductionItem(item: ModifiedBimComponent) {
  return item.qsImpact === 'ignored' && getShieldedIgnoredQuantityChanges(item.changes).length > 0;
}

function applyShieldedNonDeduction(action: VoCommercialAction) {
  const shieldedChanges = getShieldedIgnoredQuantityChanges(action.changes);
  if (shieldedChanges.length === 0) return action;

  const unit = shieldedChanges[0].protectedUnit || shieldedChanges[0].unit || action.unit;
  const rawDeduction = shieldedChanges.reduce((sum, change) => sum + Math.abs(change.delta ?? 0), 0);
  const ruleIds = [...new Set(shieldedChanges.map((change) => change.qsRuleId).filter(Boolean))];
  const note = appendMeasurementNote(
    action.measurementNote,
    `[Shielded non-deduction applied: raw deduction ${formatNumericValue(rawDeduction, unit)} ignored${ruleIds.length ? ` under ${ruleIds.join(', ')}` : ''}]`,
  );

  return {
    ...action,
    quantity: 0,
    amount: action.rateStatus === 'rated' ? 0 : undefined,
    measurementNote: note,
  };
}

function buildCommercialAction(params: { id: string; action: VoCommercialActionType; sourceStatus: 'Added' | 'Deleted' | 'Modified'; component: BimComponent; counterpart?: BimComponent; qsImpact: QsImpact; changes: BimFieldChange[]; protectedValue: number; formworkAlert?: FormworkAlert; starRateCandidate?: StarRateCandidate; eotFlag?: EotFlag; bqContext?: BqMappingContext; }): VoCommercialAction {
  const forcedStarRate = shouldForceStarRate(params);
  const mergedStarRateCandidate = forcedStarRate
    ? buildForcedStarRateCandidate(params.component, params.counterpart, params.changes)
    : params.starRateCandidate;
  const preferFormwork = params.action === 'Addition' && Boolean(params.formworkAlert || mergedStarRateCandidate) && params.component.smm2SectionCode === 'F';
  const { measurement, rule } = resolveCommercialMeasurement(params.component, { preferFormwork });
  const bqRate = resolveBqRateOverride(params.component, measurement, params.bqContext);
  const effectiveRate = forcedStarRate ? undefined : bqRate?.rate;
  const amount = typeof effectiveRate === 'number' ? measurement.quantity * effectiveRate * (params.action === 'Omission' ? -1 : 1) : undefined;
  return {
    ...params,
    starRateCandidate: mergedStarRateCandidate,
    quantityKey: measurement.key,
    quantityLabel: measurement.label,
    quantity: measurement.quantity,
    unit: measurement.unit,
    quantitySource: measurement.source,
    measurementNote: measurement.note,
    measurementRuleId: rule?.id,
    measurementRuleLabel: rule?.label,
    quantityRisk: measurement.risk,
    pricingSource: forcedStarRate ? 'forced-star-rate' : (bqRate?.pricingSource ?? 'unmapped'),
    bqItemReference: bqRate?.bqItemReference,
    bqDescription: bqRate?.bqDescription,
    rateStatus: forcedStarRate ? 'forced-star-rate' : (bqRate?.rateStatus ?? 'pending'),
    rate: effectiveRate,
    amount,
    rateRuleId: forcedStarRate ? 'forced-star-rate' : bqRate?.rateRuleId,
    rateLabel: forcedStarRate ? 'Item Not Found in BQ - Forced Star Rate' : (bqRate?.rateLabel ?? 'User BQ rate required'),
  };
}

export function buildCommercialBreakdown(results: VoComparisonResults, bqContext?: BqMappingContext): VoCommercialBreakdown {
  const actions: VoCommercialAction[] = [];
  results.modified.forEach((item) => {
    const protectedValue = sumProtectedValue(item.changes);
    if (isShieldedNonDeductionItem(item)) {
      const omissionAction = buildCommercialAction({ id: `omit-${item.base.ifcId}`, action: 'Omission', sourceStatus: 'Modified', component: item.base, counterpart: item.rev, qsImpact: item.qsImpact, changes: item.changes, protectedValue });
      actions.push(applyShieldedNonDeduction(omissionAction));
      return;
    }

    actions.push(buildCommercialAction({ id: `omit-${item.base.ifcId}`, action: 'Omission', sourceStatus: 'Modified', component: item.base, counterpart: item.rev, qsImpact: item.qsImpact, changes: item.changes, protectedValue, bqContext }));
    actions.push(buildCommercialAction({ id: `add-${item.rev.ifcId}`, action: 'Addition', sourceStatus: 'Modified', component: item.rev, counterpart: item.base, qsImpact: item.qsImpact, changes: item.changes, protectedValue: 0, formworkAlert: item.formworkAlert, starRateCandidate: item.starRateCandidate, eotFlag: item.eotFlag, bqContext }));
  });
  results.added.forEach((component) => { actions.push(buildCommercialAction({ id: `add-${component.ifcId}`, action: 'Addition', sourceStatus: 'Added', component, qsImpact: 'counted', changes: [], protectedValue: 0, bqContext })); });
  results.deleted.forEach((component) => { actions.push(buildCommercialAction({ id: `omit-${component.ifcId}`, action: 'Omission', sourceStatus: 'Deleted', component, qsImpact: 'counted', changes: [], protectedValue: 0, bqContext })); });
  actions.sort((left, right) => { const a = `${left.component.smm2SectionSort}|${left.component.levelName}|${left.component.blockName}|${left.component.zoneName}|${left.component.gridRoomName}|${left.component.qsLabel}|${left.action === 'Omission' ? '0' : '1'}`; const b = `${right.component.smm2SectionSort}|${right.component.levelName}|${right.component.blockName}|${right.component.zoneName}|${right.component.gridRoomName}|${right.component.qsLabel}|${right.action === 'Omission' ? '0' : '1'}`; return a.localeCompare(b); });
  const omissionValue = actions.filter((action) => action.action === 'Omission').reduce((sum, action) => sum + (action.amount ?? 0), 0);
  const additionValue = actions.filter((action) => action.action === 'Addition').reduce((sum, action) => sum + (action.amount ?? 0), 0);
  return { actions, summary: { omissions: actions.filter((action) => action.action === 'Omission').length, additions: actions.filter((action) => action.action === 'Addition').length, modifiedPairs: results.modified.length, ratedActions: actions.filter((action) => action.rateStatus === 'rated').length, pendingRateActions: actions.filter((action) => action.rateStatus !== 'rated').length, highRiskQuantityItems: actions.filter((action) => Boolean(action.quantityRisk)).length, omissionValue, additionValue, netValue: omissionValue + additionValue } };
}
