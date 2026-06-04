import React, { useCallback, useMemo, useState } from 'react';
import {
  BimComponent,
  BimEngine,
  BqLineItem,
  VoCommercialAction,
  VoComparisonResults,
  buildCommercialBreakdown,
} from '../BimEngine';
import { normalizeBqUnit, recommendBqMatches } from '../bq-tools';
import type { CompareState, ActiveTab, ModelLoadState } from '../lib/format';
import {
  buildBqMappingContext,
  buildSystemUnitMismatchMessage,
  formatElementLabel,
  formatSignedCurrencyValue,
  formatCurrencyValue,
  formatRateValue,
  formatAmountValue,
  formatQuantityValue,
  formatQuantitySource,
  formatQuantityRisk,
  formatMeasurementRule,
  formatCommercialDetail,
  formatActionProtectedQuantity,
  formatActionProtectedValue,
  formatActionFormworkAlert,
  formatActionStarRate,
  formatActionEotFlag,
  formatOpeningLink,
  formatStaticShield,
  guessUnitBySection,
  getActionChanges,
  summarizeLabels,
} from '../lib/format';
import toast from 'react-hot-toast';
import { useLang } from '../i18n/LanguageContext';

export function useVoComparison(deps: {
  ensureEngine: () => BimEngine | null;
  engineRef: React.RefObject<BimEngine | null>;
  v1State: ModelLoadState;
  v2State: ModelLoadState;
  v1Components: BimComponent[];
  v2Components: BimComponent[];
  bqItems: BqLineItem[];
  labelMappings: Record<string, string>;
  setSysLog: (msg: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setMappingError: (msg: string) => void;
  setLabelMappings: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  mappingDrafts: Record<string, string>;
  setMappingDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const { t } = useLang();
  const [voResults, setVoResults] = useState<VoComparisonResults | null>(null);
  const [compareState, setCompareState] = useState<CompareState>('idle');
  const [compareMessage, setCompareMessage] = useState('Load two IFC files, then run the comparison.');
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const resetComparison = () => {
    setVoResults(null);
    setSelectedRowKey(null);
    setCompareState('idle');
    setCompareMessage('Load two IFC files, then run the comparison.');
  };

  const runVOComparison = async () => {
    const engine = deps.ensureEngine();
    if (!engine || deps.v1State !== 'ready' || deps.v2State !== 'ready') {
      setCompareState('error');
      setCompareMessage('Both IFC files must be parsed successfully before comparison can run.');
      deps.setSysLog('Comparison blocked: both IFC files must load successfully first.');
      return;
    }

    setIsRunning(true);
    setCompareState('running');
    setCompareMessage('Comparing V1 and V2 models...');
    deps.setSysLog('Comparing V1 and V2 models...');

    try {
      const results = await engine.compareModels(deps.v1Components, deps.v2Components);
      setVoResults(results);
      setSelectedRowKey(null);
      setCompareState('success');
      deps.setActiveTab('overview');
      const commercial = buildCommercialBreakdown(results, buildBqMappingContext(deps.bqItems, deps.labelMappings));
      setCompareMessage(
        `Comparison complete. Raw: ${results.modified.length} modified. Commercial: ${commercial.summary.omissions} omissions, ${commercial.summary.additions} additions. Pending rates: ${commercial.summary.pendingRateActions}. Net rated value: ${formatSignedCurrencyValue(commercial.summary.netValue)}. Protected value: ${formatCurrencyValue(results.qsSummary.protectedValue)}.`,
      );

      try {
        engine.highlightComparison(results);
      } catch (highlightError: unknown) {
        const message = highlightError instanceof Error ? highlightError.message : '3D highlight failed';
        deps.setSysLog(`VO Complete, but 3D highlight failed: ${message}`);
      }

      deps.setSysLog(
        `VO Complete: ${results.added.length} Added, ${results.deleted.length} Deleted, ${results.modified.length} Modified. Commercial: ${commercial.summary.omissions} omissions, ${commercial.summary.additions} additions. Pending rates: ${commercial.summary.pendingRateActions}. Net rated value: ${formatSignedCurrencyValue(commercial.summary.netValue)}.`,
      );
      toast.success(t('toast.voComplete'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown comparison error';
      setVoResults(null);
      setCompareState('error');
      setCompareMessage(`Comparison failed: ${message}`);
      deps.setSysLog(`VO Analysis Failed: ${message}`);
      toast.error(t('toast.voFailed'));
    }

    setIsRunning(false);
  };

  const focusCommercialAction = (action: VoCommercialAction) => {
    if (!deps.engineRef.current) return;

    const focusTarget = action.action === 'Omission' && action.sourceStatus === 'Modified' && action.counterpart
      ? action.counterpart
      : action.action === 'Omission' && action.sourceStatus === 'Deleted'
        ? null
        : action.component;

    if (!focusTarget) {
      deps.setSysLog(`No 3D target available for ${action.action} ${formatElementLabel(action.component)}. Deleted base-only items are listed in the report but not kept in the current viewer model.`);
      return;
    }

    const focused = deps.engineRef.current.focusOnExpressId(focusTarget.expressID);
    if (!focused) {
      deps.setSysLog(`Unable to focus ${formatElementLabel(focusTarget)} in the current 3D view.`);
      return;
    }

    setSelectedRowKey(action.id);
    if (focusTarget.ifcId !== action.component.ifcId) {
      deps.setSysLog(`Focused revision counterpart for omitted base item: ${formatElementLabel(action.component)} -> ${formatElementLabel(focusTarget)}.`);
    } else {
      deps.setSysLog(`Focused ${action.action} item in 3D: ${formatElementLabel(focusTarget)}.`);
    }
  };

  const runCompareForAgent = useCallback(async (): Promise<VoComparisonResults | null> => {
    const engine = deps.ensureEngine();
    if (!engine || deps.v1State !== 'ready' || deps.v2State !== 'ready') return null;
    const results = await engine.compareModels(deps.v1Components, deps.v2Components);
    setVoResults(results);
    setCompareState('success');
    try {
      engine.highlightComparison(results);
    } catch {
      /* highlight failures do not block tool result */
    }
    return results;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.v1State, deps.v2State, deps.v1Components, deps.v2Components]);

  // ── Derived commercial data ──────────────────────────────────────────────
  const pricingContext = useMemo(() => buildBqMappingContext(deps.bqItems, deps.labelMappings), [deps.bqItems, deps.labelMappings]);
  const commercialBreakdown = useMemo(() => voResults ? buildCommercialBreakdown(voResults, pricingContext) : null, [voResults, pricingContext]);
  const safeCommercialActions = Array.isArray(commercialBreakdown?.actions)
    ? commercialBreakdown.actions.filter((action): action is VoCommercialAction => Boolean(action?.component))
    : [];

  const resultRows = safeCommercialActions.map((action) => {
    const component = action.component;
    const changes = getActionChanges(action);
    return {
      key: action.id || `${action.action}-${component?.ifcId || Math.random()}`,
      section: component?.smm2SectionCode || '-',
      level: component?.levelName || '-',
      block: component?.blockName || '-',
      zone: component?.zoneName || '-',
      gridRoom: component?.gridRoomName || '-',
      locationKind: component?.preferredLocationKind || '-',
      openingLink: formatOpeningLink(component),
      shield: action.sourceStatus === 'Modified'
        ? (action.action === 'Omission'
            ? changes.some((change) => change?.qsImpact === 'ignored') ? 'Ignored' : '-'
            : (action.formworkAlert || action.starRateCandidate || action.counterpart ? 'Counted' : '-'))
        : formatStaticShield(component),
      protectedQty: formatActionProtectedQuantity(action),
      protectedValue: formatActionProtectedValue(action),
      alert: formatActionFormworkAlert(action),
      starRate: formatActionStarRate(action),
      eotFlag: formatActionEotFlag(action),
      element: formatElementLabel(component),
      measurement: `${action.quantityLabel || 'Measure'}${action.measurementNote ? ` ${action.measurementNote}` : ''}`,
      measureRule: formatMeasurementRule(action),
      quantitySource: formatQuantitySource(action),
      quantityRisk: formatQuantityRisk(action),
      quantity: formatQuantityValue(action),
      unit: action.unit || '-',
      rate: formatRateValue(action),
      amount: formatAmountValue(action),
      actionLabel: action.action,
      techStatus: action.sourceStatus,
      qsImpact: action.qsImpact,
      detail: formatCommercialDetail(action),
      actionClass: action.action === 'Omission' ? 'text-red-400' : 'text-green-400',
      techClass: action.sourceStatus === 'Modified' ? 'text-amber-400' : action.sourceStatus === 'Added' ? 'text-green-400' : 'text-red-400',
      qsClass: action.qsImpact === 'ignored' ? 'text-slate-400' : 'text-emerald-400',
      rateClass: action.rateStatus === 'forced-star-rate' ? 'font-semibold text-red-300' : action.rateStatus === 'rated' ? 'text-blue-400' : 'text-amber-300',
      quantityRiskClass: action.quantityRisk ? 'font-semibold text-red-300' : 'text-slate-500',
      amountClass: action.rateStatus === 'forced-star-rate'
        ? 'font-semibold text-red-300'
        : action.rateStatus === 'rated'
          ? (typeof action.amount === 'number' && action.amount < 0 ? 'text-red-300' : 'text-green-300')
          : 'text-amber-300',
      canFocus: !(action.action === 'Omission' && action.sourceStatus === 'Deleted') || Boolean(action.counterpart),
      focusHint: action.action === 'Omission' && action.sourceStatus === 'Deleted'
        ? 'Base-only deletion: no live 3D target in current viewer.'
        : action.action === 'Omission' && action.sourceStatus === 'Modified' && action.counterpart
          ? 'Click to focus the revision counterpart in 3D.'
          : 'Click to focus this item in 3D.',
      rawAction: action,
    };
  });

  const mappingCandidates = (() => {
    const map = new Map<string, { label: string; section: string; unit: string; instanceCount: number; typeGroupKey: string }>();
    const sourceComponents = safeCommercialActions
      .map((action) => action.component)
      .filter((component): component is BimComponent => Boolean(component?.ifcId));
    sourceComponents.forEach((component) => {
      const label = formatElementLabel(component);
      if (!label) return;
      const unit = guessUnitBySection(component.smm2SectionCode);
      const typeGroupKey = [
        component.smm2SectionCode,
        component.type,
        component.objectType,
        component.predefinedType,
        component.typeSignature,
        component.materialSignature,
        normalizeBqUnit(unit),
      ]
        .map((value) => (value || '-').toLowerCase())
        .join('|');
      const existing = map.get(label);
      if (existing) {
        existing.instanceCount += 1;
        return;
      }
      map.set(label, {
        label,
        section: component.smm2SectionCode,
        unit,
        instanceCount: 1,
        typeGroupKey,
      });
    });
    return [...map.values()].sort((left, right) => left.section.localeCompare(right.section) || right.instanceCount - left.instanceCount || left.label.localeCompare(right.label));
  })();

  const mappedLabelCount = mappingCandidates.filter((candidate) => Boolean(deps.labelMappings[candidate.label])).length;
  const contractBqCount = safeCommercialActions.filter((action) => action.pricingSource === 'contract-bq').length;

  const mappingRows = mappingCandidates.map((candidate) => {
    const mappedReference = deps.labelMappings[candidate.label] ?? '';
    const draftReference = deps.mappingDrafts[candidate.label] ?? mappedReference;
    const mappedItem = deps.bqItems.find((item) => item.itemReference === mappedReference);
    const draftItem = deps.bqItems.find((item) => item.itemReference === draftReference);
    const systemUnit = normalizeBqUnit(candidate.unit);
    const selectedUnit = normalizeBqUnit(draftItem?.unit || '');
    const hasUnitMismatch = Boolean(systemUnit && selectedUnit && systemUnit !== selectedUnit);
    const recommendations = recommendBqMatches(deps.bqItems, candidate.label, candidate.section, candidate.unit);
    const suggestedItem = recommendations[0];
    const selectableItems = deps.bqItems.map((item) => {
      const mismatch = Boolean(systemUnit) && normalizeBqUnit(item.unit) !== systemUnit;
      return {
        ...item,
        mismatch,
      };
    });
    const suggestedSelectableItem = suggestedItem && !suggestedItem.unit
      ? suggestedItem
      : suggestedItem && normalizeBqUnit(suggestedItem.unit) === systemUnit
        ? suggestedItem
        : undefined;
    const bulkPeerRows = mappingCandidates.filter((entry) => entry.typeGroupKey === candidate.typeGroupKey);
    const unitStatus = !draftReference
      ? 'Unmapped'
      : hasUnitMismatch
        ? `Unit mismatch (${selectedUnit || '-'} vs ${systemUnit || '-'})`
        : draftReference === mappedReference && mappedReference
          ? 'Mounted'
          : 'Ready to confirm';

    return {
      ...candidate,
      mappedReference,
      draftReference,
      mappedItem,
      draftItem,
      systemUnit,
      selectedUnit,
      hasUnitMismatch,
      unitStatus,
      recommendations,
      suggestedItem,
      suggestedSelectableItem,
      selectableItems,
      bulkPeerLabels: bulkPeerRows.map((entry) => entry.label),
      bulkPeerInstanceCount: bulkPeerRows.reduce((sum, entry) => sum + entry.instanceCount, 0),
    };
  });

  const orphanRows = mappingRows.filter((row) => !row.mappedReference);
  const orphanInstanceCount = orphanRows.reduce((sum, row) => sum + row.instanceCount, 0);
  const orphanPreview = summarizeLabels(orphanRows.map((row) => row.label));

  const updateLabelMapping = (label: string, itemReference: string, options?: { skipBulkPrompt?: boolean }) => {
    if (!itemReference) {
      deps.setMappingError('');
      deps.setLabelMappings((current) => {
        const next = { ...current };
        delete next[label];
        return next;
      });
      deps.setMappingDrafts((current) => {
        const next = { ...current };
        delete next[label];
        return next;
      });
      deps.setSysLog(`BQ mapping cleared for ${label}.`);
      return;
    }

    const candidate = mappingCandidates.find((entry) => entry.label === label);
    const item = deps.bqItems.find((entry) => entry.itemReference === itemReference);
    const systemUnit = normalizeBqUnit(candidate?.unit || '');
    const bqUnit = normalizeBqUnit(item?.unit || '');

    if (candidate && item && systemUnit && bqUnit && systemUnit !== bqUnit) {
      const message = buildSystemUnitMismatchMessage(systemUnit, bqUnit);
      deps.setMappingError(message);
      deps.setMappingDrafts((current) => ({ ...current, [label]: itemReference }));
      deps.setSysLog(`BQ mapping blocked for ${label}: ${message}`);
      return;
    }

    const applyLabels = (labels: string[]) => {
      deps.setMappingError('');
      deps.setLabelMappings((current) => {
        const next = { ...current };
        labels.forEach((entry) => {
          next[entry] = itemReference;
        });
        return next;
      });
      deps.setMappingDrafts((current) => {
        const next = { ...current };
        labels.forEach((entry) => {
          next[entry] = itemReference;
        });
        return next;
      });
    };

    const candidateRow = mappingRows.find((row) => row.label === label);
    const bulkEligibleRows = candidateRow
      ? mappingRows.filter((row) => row.typeGroupKey === candidateRow.typeGroupKey && (!row.mappedReference || row.mappedReference === itemReference || row.label === label))
      : [];
    const bulkEligibleLabels = [...new Set(bulkEligibleRows.map((row) => row.label))];
    const bulkEligibleInstanceCount = bulkEligibleRows.reduce((sum, row) => sum + row.instanceCount, 0);

    if (!options?.skipBulkPrompt && item && bulkEligibleLabels.length > 1) {
      toast(
        (toastRef) => (
          <div className="text-sm">
            <p className="font-semibold text-slate-100">{t('bulk.title')}</p>
            <p className="mt-1 text-slate-300">
              {t('bulk.message', { instanceCount: String(bulkEligibleInstanceCount), labelCount: String(bulkEligibleLabels.length), reference: item.itemReference })}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500" onClick={() => {
                applyLabels(bulkEligibleLabels);
                deps.setSysLog(`Bulk lock applied: ${item.itemReference} mounted to ${bulkEligibleLabels.length} QS descriptions covering ${bulkEligibleInstanceCount} model instances.`);
                toast.dismiss(toastRef.id);
              }}>{t('bulk.applyAll')}</button>
              <button type="button" className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700" onClick={() => toast.dismiss(toastRef.id)}>{t('bulk.skip')}</button>
            </div>
          </div>
        ),
        { duration: 15000, style: { background: '#1e293b', border: '1px solid #334155', maxWidth: '400px' } },
      );
    }

    applyLabels([label]);
    const instanceSuffix = candidate?.instanceCount && candidate.instanceCount > 1 ? ` (${candidate.instanceCount} model instances)` : '';
    deps.setSysLog(`BQ mounted: ${label} -> ${itemReference}${instanceSuffix}.`);
  };

  const stageDraftMapping = (label: string, itemReference: string) => {
    deps.setMappingDrafts((current) => ({ ...current, [label]: itemReference }));
    const candidate = mappingCandidates.find((entry) => entry.label === label);
    const item = deps.bqItems.find((entry) => entry.itemReference === itemReference);
    const systemUnit = normalizeBqUnit(candidate?.unit || '');
    const bqUnit = normalizeBqUnit(item?.unit || '');

    if (itemReference && candidate && item && systemUnit && bqUnit && systemUnit !== bqUnit) {
      const message = buildSystemUnitMismatchMessage(systemUnit, bqUnit);
      deps.setMappingError(message);
      deps.setSysLog(`BQ selection flagged for ${label}: ${message}`);
      return;
    }

    if (itemReference) {
      deps.setMappingError('');
      deps.setSysLog(`BQ draft selected for ${label}: ${itemReference}. Confirm to mount the contract item.`);
      return;
    }

    deps.setMappingError('');
    deps.setSysLog(`BQ draft cleared for ${label}.`);
  };

  // ── KPI totals ─────────────────────────────────────────────────────────
  const totalChanges = voResults
    ? voResults.added.length + voResults.deleted.length + voResults.modified.length
    : 0;
  const totalProtectedValue = voResults?.qsSummary.protectedValue ?? 0;
  const totalFormworkAlerts = voResults?.qsSummary.formworkAlerts ?? 0;
  const totalStarRateCandidates = safeCommercialActions.filter((action) => Boolean(action.starRateCandidate) && action.action === 'Addition').length;
  const totalEotFlags = voResults?.qsSummary.eotFlags ?? 0;
  const totalCommercialOmissions = commercialBreakdown?.summary.omissions ?? 0;
  const totalCommercialAdditions = commercialBreakdown?.summary.additions ?? 0;
  const totalPendingRates = commercialBreakdown?.summary.pendingRateActions ?? 0;
  const totalRatedActions = commercialBreakdown?.summary.ratedActions ?? 0;
  const totalHighRiskQuantityItems = commercialBreakdown?.summary.highRiskQuantityItems ?? 0;
  const totalNetValue = commercialBreakdown?.summary.netValue ?? 0;

  return {
    voResults, setVoResults,
    compareState, setCompareState,
    compareMessage,
    selectedRowKey, setSelectedRowKey,
    isRunning,
    resetComparison,
    runVOComparison,
    focusCommercialAction,
    runCompareForAgent,
    // Derived data
    pricingContext,
    resultRows,
    mappingCandidates,
    mappedLabelCount,
    contractBqCount,
    mappingRows,
    orphanRows,
    orphanInstanceCount,
    orphanPreview,
    updateLabelMapping,
    stageDraftMapping,
    // KPI
    totalChanges,
    totalProtectedValue,
    totalFormworkAlerts,
    totalStarRateCandidates,
    totalEotFlags,
    totalCommercialOmissions,
    totalCommercialAdditions,
    totalPendingRates,
    totalRatedActions,
    totalHighRiskQuantityItems,
    totalNetValue,
  };
}
