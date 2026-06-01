import type {
  BimComponent,
  BimFieldChange,
  BqLineItem,
  BqMappingContext,
  VoCommercialAction,
} from '../BimEngine';
import { PROJECT_QS_OVERRIDES } from '../qs-project-config';

export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error';
export type CompareState = 'idle' | 'running' | 'success' | 'error';
export type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit' | 'guide' | 'dwg';

export function buildBqMappingContext(items: BqLineItem[], labelMappings: Record<string, string>): BqMappingContext | undefined {
  if (items.length === 0) return undefined;
  return {
    itemsByReference: Object.fromEntries(items.map((item) => [item.itemReference, item])),
    labelMappings,
  };
}

export function guessUnitBySection(sectionCode: string) {
  if (sectionCode === 'F') return 'm3';
  if (sectionCode === 'G' || sectionCode === 'M') return 'm2';
  if (sectionCode === 'Q' || sectionCode === 'U') return 'nr';
  return '';
}

export function buildSystemUnitMismatchMessage(systemUnit: string, bqUnit: string) {
  return `Unit Mismatch: System (${systemUnit || '-'}) vs BQ (${bqUnit || '-'}). Please verify BQ item or adjust extraction rule.`;
}

export function formatElementLabel(component?: Partial<BimComponent> | null) {
  if (!component) return 'Unknown element';
  return component.qsLabel || component.name || component.type || 'Unknown element';
}

export function getActionChanges(action?: Partial<VoCommercialAction> | null) {
  return Array.isArray(action?.changes) ? action.changes : [];
}

export function formatCurrencyValue(value: number) {
  return `${PROJECT_QS_OVERRIDES.currencySymbol} ${value.toFixed(2)}`;
}

export function formatSignedCurrencyValue(value: number) {
  const rendered = `${PROJECT_QS_OVERRIDES.currencySymbol} ${Math.abs(value).toFixed(2)}`;
  return value < 0 ? `-${rendered}` : rendered;
}

export function formatRateValue(action: VoCommercialAction) {
  if (action.rateStatus === 'forced-star-rate') return 'Item Not Found in BQ - Forced Star Rate';
  if (action.rateStatus !== 'rated' || typeof action.rate !== 'number') return 'Pending';
  return `${formatCurrencyValue(action.rate)} / ${action.unit}`;
}

export function formatAmountValue(action: VoCommercialAction) {
  if (action.rateStatus === 'forced-star-rate') return 'Forced Star Rate';
  if (action.rateStatus !== 'rated' || typeof action.amount !== 'number') return 'Pending';
  return formatSignedCurrencyValue(action.amount);
}

export function formatQuantityValue(action: VoCommercialAction) {
  return Number.isFinite(action.quantity) ? action.quantity.toFixed(4) : '0.0000';
}

export function formatQuantitySource(action: VoCommercialAction) {
  switch (action.quantitySource) {
    case 'qto':
    case 'type-qto':
      return 'Qto';
    case 'geometry':
      return 'Geometry';
    case 'bbox':
      return 'BBox Estimate';
    default:
      return 'Derived';
  }
}

export function formatQuantityRisk(action: VoCommercialAction) {
  if (!action.quantityRisk) return '-';
  return `${action.quantityRisk.message} | ${action.quantityRisk.reason}`;
}

export function formatChangeLine(change: BimFieldChange) {
  const deltaText = typeof change.delta === 'number' && Number.isFinite(change.delta)
    ? ` | delta ${change.delta.toFixed(4)}${change.unit ? ` ${change.unit}` : ''}`
    : '';
  const qsText = change.qsImpact === 'ignored'
    ? ` | QS ignored: ${change.qsReason ?? 'Rule filtered'}`
    : ' | QS counted';
  const protectedQtyText = typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity)
    ? ` | protected ${change.protectedQuantity.toFixed(4)}${change.protectedUnit ? ` ${change.protectedUnit}` : ''}`
    : '';
  const protectedValueText = typeof change.protectedValue === 'number' && Number.isFinite(change.protectedValue)
    ? ` | protected value ${formatCurrencyValue(change.protectedValue)}`
    : change.qsImpact === 'ignored' && typeof change.protectedQuantity === 'number'
      ? ' | protected value rate required'
      : '';
  return `${change.label}: ${change.before} -> ${change.after}${deltaText}${qsText}${protectedQtyText}${protectedValueText}`;
}

export function formatMeasurementRule(action: VoCommercialAction) {
  if (action.measurementRuleLabel && action.measurementRuleId) {
    return `${action.measurementRuleLabel} [${action.measurementRuleId}]`;
  }
  return action.measurementRuleLabel || action.measurementRuleId || 'Fallback measurement rule';
}

export function formatCommercialBasis(action: VoCommercialAction) {
  const qty = `${action.quantityLabel}${action.measurementNote ? ` ${action.measurementNote}` : ''}: ${formatQuantityValue(action)} ${action.unit}`;
  const rule = `Rule: ${formatMeasurementRule(action)}`;
  if (action.rateStatus === 'rated' && typeof action.rate === 'number' && typeof action.amount === 'number') {
    return `${qty} | ${rule} @ ${formatCurrencyValue(action.rate)} / ${action.unit} = ${formatSignedCurrencyValue(action.amount)} (${action.rateLabel})`;
  }
  return `${qty} | ${rule} | rate pending (${action.rateLabel})`;
}

export function formatCommercialDetail(action: VoCommercialAction) {
  const changes = getActionChanges(action);
  const basisLine = `Commercial basis: ${formatCommercialBasis(action)}`;
  const protectionLine = action.protectedValue > 0
    ? `Protected Value: ${formatCurrencyValue(action.protectedValue)} (Saved by SMM2 Rule).`
    : '';

  if (action.sourceStatus === 'Modified' && action.action === 'Omission' && action.quantity === 0 && action.protectedValue > 0) {
    return [basisLine, 'Shielded non-deduction: omission quantity reduced to 0 for commercial counting.', protectionLine, changes.map(formatChangeLine).join('\n')].filter(Boolean).join('\n');
  }
  if (action.sourceStatus === 'Modified' && action.action === 'Omission') {
    const counterpart = action.counterpart ? formatElementLabel(action.counterpart) : 'revision item';
    return [basisLine, `Omit original contract item. Counterpart addition: ${counterpart}.`, protectionLine, changes.map(formatChangeLine).join('\n')].filter(Boolean).join('\n');
  }
  if (action.sourceStatus === 'Modified' && action.action === 'Addition') {
    const counterpart = action.counterpart ? formatElementLabel(action.counterpart) : 'base item';
    return `${basisLine}\nAdd revised item. Replaces omitted base item: ${counterpart}.\n${changes.map(formatChangeLine).join('\n')}`;
  }
  if (action.sourceStatus === 'Added') return `${basisLine}\nAddition from revision model.`;
  if (action.sourceStatus === 'Deleted') return `${basisLine}\nOmission from base contract item.`;
  return basisLine;
}

export function formatActionProtectedQuantity(action: VoCommercialAction) {
  const changes = getActionChanges(action);
  if (action.action !== 'Omission' || changes.length === 0) return '-';
  const protectedParts = changes
    .filter((change) => typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity))
    .map((change) => `${change.protectedQuantity!.toFixed(4)}${change.protectedUnit ? ` ${change.protectedUnit}` : ''}`);
  return protectedParts.length > 0 ? protectedParts.join(' | ') : '-';
}

export function formatActionProtectedValue(action: VoCommercialAction) {
  const changes = getActionChanges(action);
  if (action.action !== 'Omission') return '-';
  if (action.protectedValue > 0) return formatCurrencyValue(action.protectedValue);
  const hasProtectedQty = changes.some((change) => typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity));
  return hasProtectedQty ? 'Rate needed' : '-';
}

export function formatActionFormworkAlert(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.formworkAlert) return '-';
  return `${action.formworkAlert.message} | ${action.formworkAlert.reason}`;
}

export function formatActionStarRate(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.starRateCandidate) return '-';
  return `${action.starRateCandidate.title} | ${action.starRateCandidate.recommendedAction}`;
}

export function formatActionEotFlag(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.eotFlag) return '-';
  return `${action.eotFlag.title} | ${action.eotFlag.recommendedAction}`;
}

export function formatOpeningLink(component?: Partial<BimComponent> | null) {
  if (!component) return '-';
  if (component.isOpening) {
    const hostBits = [component.openingHostType, component.openingHostName || component.openingHostIfcId].filter(Boolean).join(' ');
    return hostBits ? `Opening -> ${hostBits}` : 'Opening -> Unassigned host';
  }
  if (component.openingCount > 0 || component.openingSignature) {
    return component.openingSignature ? `Host -> ${component.openingSignature}` : `Host -> ${component.openingCount} opening(s)`;
  }
  return '-';
}

export function formatStaticShield(component?: Partial<BimComponent> | null) {
  if (!component) return '-';
  if (component.isOpening) return 'Opening change';
  if (component.openingCount > 0) return 'Host openings tracked';
  return '-';
}

export function modelStateLabel(state: ModelLoadState, count: number, fileName: string | null) {
  if (state === 'loading') return 'Parsing...';
  if (state === 'error') return 'Load failed';
  if (state === 'ready') return `${count} indexed elements`;
  if (fileName) return fileName;
  return 'Not loaded';
}

export function summarizeLabels(labels: string[], limit = 3) {
  if (labels.length === 0) return '';
  const preview = labels.slice(0, limit).join(' | ');
  return labels.length > limit ? `${preview} ...` : preview;
}
