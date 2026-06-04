import { PROJECT_QS_OVERRIDES } from '../qs-project-config';
import type { CommercialRateRule, QuantityNormalizationRule, QuantityNormalizationStrategy } from '../qs-config';
import { buildComponentCorpus, formatNumericValue, isFormworkCandidate, looksConcrete } from './compare';
import type {
  BimComponent,
  BimFieldChange,
  BimQuantityValue,
  BqMappingContext,
  CommercialMeasurement,
  EotFlag,
  FormworkAlert,
  ModifiedBimComponent,
  QsImpact,
  QuantityRiskAlert,
  StarRateCandidate,
  VoCommercialAction,
  VoCommercialActionType,
  VoCommercialBreakdown,
  VoComparisonResults,
} from './types';

const QTO_SOURCES: BimQuantityValue['source'][] = ['qto', 'type-qto'];
const GEOMETRY_SOURCES: BimQuantityValue['source'][] = ['geometry'];
const BBOX_SOURCES: BimQuantityValue['source'][] = ['bbox'];
const GEOMETRY_DERIVATION_NOTE = '[Derived from Geometry Mesh Calculation]';
const BBOX_HIGH_RISK_NOTE = '[High Risk: Qty Estimated via BBox. Manual QS Verification Required]';

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

function resolveCommercialRateRule(component: BimComponent, measurement: CommercialMeasurement, options: { preferFormwork?: boolean } = {}) {
  if (options.preferFormwork) {
    const formworkRule = PROJECT_QS_OVERRIDES.commercialRateRules.find((rule) => rule.id === 'formwork-rate' && matchesCommercialRateRule(rule, component) && rule.unit === measurement.unit);
    if (formworkRule) return formworkRule;
  }

  return PROJECT_QS_OVERRIDES.commercialRateRules.find((rule) => matchesCommercialRateRule(rule, component) && rule.unit === measurement.unit);
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
  const projectRateRule = forcedStarRate || bqRate ? null : resolveCommercialRateRule(params.component, measurement, { preferFormwork });
  const effectiveRate = forcedStarRate ? undefined : (bqRate?.rate ?? projectRateRule?.rate);
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
    pricingSource: forcedStarRate ? 'forced-star-rate' : (bqRate?.pricingSource ?? (projectRateRule ? 'project-rate' : 'unmapped')),
    bqItemReference: bqRate?.bqItemReference,
    bqDescription: bqRate?.bqDescription,
    rateStatus: forcedStarRate ? 'forced-star-rate' : (bqRate?.rateStatus ?? (projectRateRule ? 'rated' : 'pending')),
    rate: effectiveRate,
    amount,
    rateRuleId: forcedStarRate ? 'forced-star-rate' : (bqRate?.rateRuleId ?? projectRateRule?.id),
    rateLabel: forcedStarRate ? 'Item Not Found in BQ - Forced Star Rate' : (bqRate?.rateLabel ?? projectRateRule?.label ?? 'Project rate required'),
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
