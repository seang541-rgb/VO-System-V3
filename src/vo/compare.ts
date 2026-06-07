import { PROJECT_QS_OVERRIDES } from '../qs-project-config';
import { STRUCTURAL_TYPES, type ShieldRateRule } from '../qs-config';
import type {
  BimAttributeValue,
  BimComponent,
  BimFieldChange,
  BimQuantityValue,
  ChangeCategory,
  EotFlag,
  FormworkAlert,
  QsImpact,
  StarRateCandidate,
  VoComparisonResults,
} from './types';

function normalizeString(value: string | number | null | undefined) {
  if (value == null || value === '') {
    return '-';
  }
  return String(value);
}

export function formatNumericValue(value: number, unit: string) {
  const rendered = Number.isFinite(value) ? value.toFixed(4) : '0.0000';
  return unit ? `${rendered} ${unit}` : rendered;
}

function serializeAttributes(attributes: Record<string, BimAttributeValue>) {
  return Object.keys(attributes)
    .sort()
    .map((key) => { const attr = attributes[key]!; return [key, attr.value, attr.source]; })
    .flat();
}

function serializeQuantities(quantities: Record<string, BimQuantityValue>) {
  return Object.keys(quantities)
    .sort()
    .map((key) => { const qty = quantities[key]!; return [key, qty.value, qty.unit, qty.source]; })
    .flat();
}

export function buildComponentCorpus(component: BimComponent) {
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

export function looksConcrete(component: BimComponent) {
  return /(concrete|reinforced concrete|\brc\b|c\d{2,3}|grade\s*c\d{2,3}|strength\s*class)/i.test(
    buildComponentCorpus(component),
  );
}

export function looksBrickwork(component: BimComponent) {
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

export function isFormworkCandidate(component: BimComponent) {
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
    message: 'Geometry Changed: Auto-trigger Formwork Re-assessment (需重新评估模板单价)',
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
