import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BimComponent,
  BimEngine,
  BqLineItem,
  BqMappingContext,
  VoCommercialAction,
  VoComparisonResults,
  buildCommercialBreakdown,
} from './BimEngine';
import { exportVoSubstantiationWorkbook } from './vo-report';
import { DEFAULT_TEST_BQ_ITEMS, parseBqWorkbook, exportBqTemplateWorkbook, normalizeBqUnit, recommendBqMatches } from './bq-tools';
import { PROJECT_QS_OVERRIDES } from './qs-project-config';
import {
  Upload,
  RefreshCw,
  Play,
  Home,
  BoxSelect,
  Download,
  Sparkles,
  FileBox,
  FileSpreadsheet,
  ScrollText,
  Layers3,
  ClipboardList,
  X,
  CheckCircle2,
  Circle,
  Zap,
  Coins,
  LogOut,
  FileText,
} from 'lucide-react';
import AuthGuard from './components/AuthGuard';
import CopilotPanel from './components/CopilotPanel';
import { useAuth } from './auth/AuthProvider';
import { supabase } from './lib/supabase';
import { useCredits } from './hooks/useCredits';
import type { ToolContext } from './agent/tools';
import {
  type ModelLoadState,
  type CompareState,
  type ActiveTab,
  buildBqMappingContext,
  guessUnitBySection,
  buildSystemUnitMismatchMessage,
  formatElementLabel,
  getActionChanges,
  formatCurrencyValue,
  formatSignedCurrencyValue,
  formatRateValue,
  formatAmountValue,
  formatQuantityValue,
  formatQuantitySource,
  formatQuantityRisk,
  formatChangeLine,
  formatMeasurementRule,
  formatCommercialBasis,
  formatCommercialDetail,
  formatActionProtectedQuantity,
  formatActionProtectedValue,
  formatActionFormworkAlert,
  formatActionStarRate,
  formatActionEotFlag,
  formatOpeningLink,
  formatStaticShield,
  modelStateLabel,
  summarizeLabels,
} from './lib/format';

const BQ_MAPPING_STORAGE_KEY = `vo-system-bq-mappings:${PROJECT_QS_OVERRIDES.projectName}`;
const CHECKOUT_BALANCE_STORAGE_KEY = 'vo-system:checkout-balance';
const CHECKOUT_CREDIT_TOP_UP_AMOUNT = 50;

export default function App() {
  const [sysLog, setSysLog] = useState('System Live. Awaiting IFC models and QS mapping.');
  const [isRunning, setIsRunning] = useState(false);
  const [v1File, setV1File] = useState<File | null>(null);
  const [v2File, setV2File] = useState<File | null>(null);
  const [v1Components, setV1Components] = useState<BimComponent[]>([]);
  const [v2Components, setV2Components] = useState<BimComponent[]>([]);
  const [v1State, setV1State] = useState<ModelLoadState>('idle');
  const [v2State, setV2State] = useState<ModelLoadState>('idle');
  const [v1Error, setV1Error] = useState('');
  const [v2Error, setV2Error] = useState('');
  const [bqItems, setBqItems] = useState<BqLineItem[]>(DEFAULT_TEST_BQ_ITEMS);
  const [bqFileName, setBqFileName] = useState('Built-in Test BQ Library');
  const [bqError, setBqError] = useState('');
  const [mappingError, setMappingError] = useState('');
  const [labelMappings, setLabelMappings] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem(BQ_MAPPING_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [voResults, setVoResults] = useState<VoComparisonResults | null>(null);
  const [compareState, setCompareState] = useState<CompareState>('idle');
  const [compareMessage, setCompareMessage] = useState('Load two IFC files, then run the comparison.');
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('copilot');
  const [showLegacyBanner, setShowLegacyBanner] = useState(true);
  /** Tracks which IFC slot is currently in the 3D viewer (last successful load). */
  const [activeIfcSlot, setActiveIfcSlot] = useState<'base' | 'revision' | null>(null);
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingNotice, setBillingNotice] = useState<{ tone: 'success' | 'info'; message: string } | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const { user, signOut } = useAuth();
  const { balance: creditsBalance, loading: creditsLoading, error: creditsError, refresh: refreshCredits, setBalance: setCreditsBalance } = useCredits(user?.id);

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BimEngine | null>(null);
  const handledCheckoutStateRef = useRef<string | null>(null);
  const v1InputRef = useRef<HTMLInputElement>(null);
  const v2InputRef = useRef<HTMLInputElement>(null);
  const bqInputRef = useRef<HTMLInputElement>(null);
  const resultsTableScrollRef = useRef<HTMLDivElement>(null);
  const resultsScrollbarRef = useRef<HTMLDivElement>(null);
  const resultsScrollbarInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new BimEngine(containerRef.current);
    engineRef.current = engine;
    engine.onLog = (text) => setSysLog(text);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const ensureEngine = () => {
    if (engineRef.current) return engineRef.current;
    if (!containerRef.current) return null;

    const engine = new BimEngine(containerRef.current);
    engine.onLog = (text) => setSysLog(text);
    engineRef.current = engine;
    // DEV: expose to window for console debugging (Phase 3 geometry verification).
    if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__engine = engine;
    return engine;
  };

  useEffect(() => {
    if (!engineRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      engineRef.current?.onWindowResize();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [compareState, voResults, activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BQ_MAPPING_STORAGE_KEY, JSON.stringify(labelMappings));
  }, [labelMappings]);

  useEffect(() => {
    const main = resultsTableScrollRef.current;
    const bottom = resultsScrollbarRef.current;
    const inner = resultsScrollbarInnerRef.current;
    if (!main || !bottom || !inner) return;

    inner.style.width = `${main.scrollWidth}px`;
    bottom.scrollLeft = main.scrollLeft;

    let syncingFromMain = false;
    let syncingFromBottom = false;

    const syncFromMain = () => {
      if (syncingFromBottom) return;
      syncingFromMain = true;
      bottom.scrollLeft = main.scrollLeft;
      syncingFromMain = false;
    };

    const syncFromBottom = () => {
      if (syncingFromMain) return;
      syncingFromBottom = true;
      main.scrollLeft = bottom.scrollLeft;
      syncingFromBottom = false;
    };

    main.addEventListener('scroll', syncFromMain);
    bottom.addEventListener('scroll', syncFromBottom);

    const resizeObserver = new ResizeObserver(() => {
      inner.style.width = `${main.scrollWidth}px`;
      bottom.scrollLeft = main.scrollLeft;
    });

    resizeObserver.observe(main);

    return () => {
      main.removeEventListener('scroll', syncFromMain);
      bottom.removeEventListener('scroll', syncFromBottom);
      resizeObserver.disconnect();
    };
  }, [activeTab, compareState, voResults, selectedRowKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;

    const searchParams = new URLSearchParams(window.location.search);
    const checkoutState = searchParams.get('checkout');
    if (!checkoutState) return;

    const handledKey = `${user.id}:${checkoutState}`;
    if (handledCheckoutStateRef.current === handledKey) return;
    handledCheckoutStateRef.current = handledKey;

    const clearCheckoutState = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
      window.sessionStorage.removeItem(CHECKOUT_BALANCE_STORAGE_KEY);
    };

    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const handleCheckoutReturn = async () => {
      if (checkoutState === 'success') {
        const storedBalance = window.sessionStorage.getItem(CHECKOUT_BALANCE_STORAGE_KEY);
        const baselineBalance = Number.isFinite(Number(storedBalance)) ? Number(storedBalance) : (creditsBalance ?? 0);
        const targetBalance = baselineBalance + CHECKOUT_CREDIT_TOP_UP_AMOUNT;

        try {
          let refreshedBalance: number | null = null;

          for (let attempt = 0; attempt < 6; attempt += 1) {
            refreshedBalance = await refreshCredits();
            if (typeof refreshedBalance === 'number' && refreshedBalance >= targetBalance) {
              break;
            }
            if (attempt < 5) {
              await sleep(1500);
            }
          }

          setShowPaywall(false);
          setBillingError('');

          if (typeof refreshedBalance === 'number' && refreshedBalance >= targetBalance) {
            setBillingNotice({ tone: 'success', message: 'Top-up successful. Your credit balance has been refreshed.' });
            setSysLog('Stripe Checkout completed successfully. Credit balance refreshed from the cloud.');
          } else {
            setBillingNotice({ tone: 'info', message: 'Payment succeeded, but credit sync is still pending. Refresh again in a few seconds if the new balance does not appear yet.' });
            setSysLog('Stripe Checkout returned successfully, but webhook credit sync did not finish within the polling window.');
          }
        } catch (error: any) {
          const message = error?.message || 'Top-up may have completed, but credit refresh failed.';
          setBillingError(message);
          setSysLog(`Stripe return refresh failed: ${message}`);
        } finally {
          clearCheckoutState();
        }
        return;
      }

      if (checkoutState === 'cancelled') {
        setBillingNotice({ tone: 'info', message: 'Stripe Checkout was cancelled. No credits were added.' });
        setSysLog('Stripe Checkout was cancelled before payment completion.');
        clearCheckoutState();
      }
    };

    void handleCheckoutReturn();
  }, [creditsBalance, refreshCredits, user]);

  const resetComparison = () => {
    setVoResults(null);
    setSelectedRowKey(null);
    setCompareState('idle');
    setCompareMessage('Load two IFC files, then run the comparison.');
  };

  const handleIFCUpload = async (e: React.ChangeEvent<HTMLInputElement>, version: 'v1' | 'v2') => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetComparison();

    const setFile = version === 'v1' ? setV1File : setV2File;
    const setComponents = version === 'v1' ? setV1Components : setV2Components;
    const setState = version === 'v1' ? setV1State : setV2State;
    const setError = version === 'v1' ? setV1Error : setV2Error;
    const label = version === 'v1' ? 'V1 Base' : 'V2 Revision';

    setFile(file);
    setComponents([]);
    setError('');
    setState('loading');
    setSysLog(`Parsing ${label} IFC: ${file.name}...`);

    const engine = ensureEngine();
    if (!engine) {
      const message = '3D engine is not ready yet. Refresh the page and try again.';
      setState('error');
      setError(message);
      setSysLog(`Failed to parse ${label}: ${message}`);
      e.target.value = '';
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const components = await engine.loadIfcModel(buffer, (_progress, text) => {
        if (text) setSysLog(text);
      });
      setComponents(components);
      setState('ready');
      setActiveIfcSlot(version === 'v1' ? 'base' : 'revision');
      setSysLog(`${label} loaded: ${components.length} indexed elements.`);
    } catch (err: any) {
      const message = err?.message || 'Unknown parsing error';
      setState('error');
      setError(message);
      setSysLog(`Failed to parse ${label}: ${message}`);
    }

    e.target.value = '';
  };

  const handleBqUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBqError('');
    try {
      const buffer = await file.arrayBuffer();
      const items = parseBqWorkbook(buffer);
      const currentCandidates = (() => {
        const map = new Map<string, string>();
        [...v1Components, ...v2Components].forEach((component) => {
          const label = formatElementLabel(component);
          if (!label || map.has(label)) return;
          map.set(label, guessUnitBySection(component.smm2SectionCode));
        });
        return map;
      })();
      let sanitizedCount = 0;
      setLabelMappings((current) => {
        const next: Record<string, string> = {};
        Object.entries(current).forEach(([label, itemReference]) => {
          const item = items.find((entry) => entry.itemReference === itemReference);
          const systemUnit = normalizeBqUnit(currentCandidates.get(label) || '');
          if (!item || !systemUnit || item.unit === systemUnit) {
            next[label] = String(itemReference);
            return;
          }
          sanitizedCount += 1;
        });
        return next;
      });
      setBqItems(items);
      setBqFileName(file.name);
      setMappingError(sanitizedCount > 0 ? `${sanitizedCount} invalid BQ mappings were cleared because their units did not match the system SMM2 unit.` : '');
      setSysLog(`BQ loaded: ${items.length} contract line items ready for QS mapping.${sanitizedCount > 0 ? ` Cleared ${sanitizedCount} invalid unit-mismatch mappings.` : ''}`);
    } catch (err: any) {
      const message = err?.message || 'Unknown BQ import error';
      setBqItems([]);
      setBqFileName('');
      setBqError(message);
      setSysLog(`BQ import failed: ${message}`);
    }

    e.target.value = '';
  };

  const runVOComparison = async () => {
    const engine = ensureEngine();
    if (!engine || v1State !== 'ready' || v2State !== 'ready') {
      setCompareState('error');
      setCompareMessage('Both IFC files must be parsed successfully before comparison can run.');
      setSysLog('Comparison blocked: both IFC files must load successfully first.');
      return;
    }

    setIsRunning(true);
    setCompareState('running');
    setCompareMessage('Comparing V1 and V2 models...');
    setSysLog('Comparing V1 and V2 models...');

    try {
      const results = await engine.compareModels(v1Components, v2Components);
      setVoResults(results);
      setSelectedRowKey(null);
      setCompareState('success');
      const commercial = buildCommercialBreakdown(results, buildBqMappingContext(bqItems, labelMappings));
      setCompareMessage(
        `Comparison complete. Raw: ${results.modified.length} modified. Commercial: ${commercial.summary.omissions} omissions, ${commercial.summary.additions} additions. Pending rates: ${commercial.summary.pendingRateActions}. Net rated value: ${formatSignedCurrencyValue(commercial.summary.netValue)}. Protected value: ${formatCurrencyValue(results.qsSummary.protectedValue)}.`,
      );

      try {
        engine.highlightComparison(results);
      } catch (highlightError: any) {
        const message = highlightError?.message || '3D highlight failed';
        setSysLog(`VO Complete, but 3D highlight failed: ${message}`);
      }

      setSysLog(
        `VO Complete: ${results.added.length} Added, ${results.deleted.length} Deleted, ${results.modified.length} Modified. Commercial: ${commercial.summary.omissions} omissions, ${commercial.summary.additions} additions. Pending rates: ${commercial.summary.pendingRateActions}. Net rated value: ${formatSignedCurrencyValue(commercial.summary.netValue)}.`,
      );
    } catch (err: any) {
      const message = err?.message || 'Unknown comparison error';
      setVoResults(null);
      setCompareState('error');
      setCompareMessage(`Comparison failed: ${message}`);
      setSysLog(`VO Analysis Failed: ${message}`);
    }

    setIsRunning(false);
  };

  const exportWorkbook = async () => {
    if (!voResults || !user || isExporting) return;

    setIsExporting(true);
    setBillingError('');

    try {
      const { data, error } = await supabase.rpc('consume_credit');

      if (error) {
        if (error.message?.includes('NO_CREDITS')) {
          setCreditsBalance(0);
          setShowPaywall(true);
          setBillingError('No premium audit credits remaining. Top up before generating another Excel report.');
          setSysLog('Excel export blocked: credits exhausted.');
          return;
        }

        throw error;
      }

      if (typeof data?.credits_balance === 'number') {
        setCreditsBalance(data.credits_balance);
      } else {
        await refreshCredits();
      }

      exportVoSubstantiationWorkbook(voResults, {
        baseModelName: v1File?.name ?? '',
        revisionModelName: v2File?.name ?? '',
        pricingContext: buildBqMappingContext(bqItems, labelMappings),
      });
      setSysLog('Premium VO Excel generated. One audit credit consumed from the secure cloud balance.');
    } catch (err: any) {
      const message = err?.message || 'Failed to validate cloud credits.';
      setBillingError(message);
      setSysLog(`Excel export blocked: ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleTopUpCheckout = async () => {
    if (!user || isStartingCheckout) return;

    setIsStartingCheckout(true);
    setBillingError('');
    setBillingNotice(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(CHECKOUT_BALANCE_STORAGE_KEY, String(creditsBalance ?? 0));
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { user_id: user.id },
      });

      if (error) {
        throw error;
      }

      const url = typeof data?.url === 'string' ? data.url : '';
      if (!url) {
        throw new Error('Checkout session URL was not returned by the payment gateway.');
      }

      setSysLog('Redirecting to Stripe Checkout for credit top-up...');
      window.location.href = url;
    } catch (err: any) {
      const message = err?.message || 'Failed to start Stripe Checkout.';
      setBillingError(message);
      setSysLog(`Stripe Checkout bootstrap failed: ${message}`);
    } finally {
      setIsStartingCheckout(false);
    }
  };

  const focusCommercialAction = (action: VoCommercialAction) => {
    if (!engineRef.current) return;

    const focusTarget = action.action === 'Omission' && action.sourceStatus === 'Modified' && action.counterpart
      ? action.counterpart
      : action.action === 'Omission' && action.sourceStatus === 'Deleted'
        ? null
        : action.component;

    if (!focusTarget) {
      setSysLog(`No 3D target available for ${action.action} ${formatElementLabel(action.component)}. Deleted base-only items are listed in the report but not kept in the current viewer model.`);
      return;
    }

    const focused = engineRef.current.focusOnExpressId(focusTarget.expressID);
    if (!focused) {
      setSysLog(`Unable to focus ${formatElementLabel(focusTarget)} in the current 3D view.`);
      return;
    }

    setSelectedRowKey(action.id);
    if (focusTarget.ifcId !== action.component.ifcId) {
      setSysLog(`Focused revision counterpart for omitted base item: ${formatElementLabel(action.component)} -> ${formatElementLabel(focusTarget)}.`);
    } else {
      setSysLog(`Focused ${action.action} item in 3D: ${formatElementLabel(focusTarget)}.`);
    }
  };

  const pricingContext = buildBqMappingContext(bqItems, labelMappings);
  const commercialBreakdown = voResults ? buildCommercialBreakdown(voResults, pricingContext) : null;
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
      qsClass: action.qsImpact === 'ignored' ? 'text-zinc-400' : 'text-emerald-400',
      rateClass: action.rateStatus === 'forced-star-rate' ? 'font-semibold text-red-300' : action.rateStatus === 'rated' ? 'text-sky-300' : 'text-amber-300',
      quantityRiskClass: action.quantityRisk ? 'font-semibold text-red-300' : 'text-zinc-500',
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

  const mappedLabelCount = mappingCandidates.filter((candidate) => Boolean(labelMappings[candidate.label])).length;
  const contractBqCount = safeCommercialActions.filter((action) => action.pricingSource === 'contract-bq').length;
  const mappingRows = mappingCandidates.map((candidate) => {
    const mappedReference = labelMappings[candidate.label] ?? '';
    const draftReference = mappingDrafts[candidate.label] ?? mappedReference;
    const mappedItem = bqItems.find((item) => item.itemReference === mappedReference);
    const draftItem = bqItems.find((item) => item.itemReference === draftReference);
    const systemUnit = normalizeBqUnit(candidate.unit);
    const selectedUnit = normalizeBqUnit(draftItem?.unit || '');
    const hasUnitMismatch = Boolean(systemUnit && selectedUnit && systemUnit !== selectedUnit);
    const recommendations = recommendBqMatches(bqItems, candidate.label, candidate.section, candidate.unit);
    const suggestedItem = recommendations[0];
    const selectableItems = bqItems.map((item) => {
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
      setMappingError('');
      setLabelMappings((current) => {
        const next = { ...current };
        delete next[label];
        return next;
      });
      setMappingDrafts((current) => {
        const next = { ...current };
        delete next[label];
        return next;
      });
      setSysLog(`BQ mapping cleared for ${label}.`);
      return;
    }

    const candidate = mappingCandidates.find((entry) => entry.label === label);
    const item = bqItems.find((entry) => entry.itemReference === itemReference);
    const systemUnit = normalizeBqUnit(candidate?.unit || '');
    const bqUnit = normalizeBqUnit(item?.unit || '');

    if (candidate && item && systemUnit && bqUnit && systemUnit !== bqUnit) {
      const message = buildSystemUnitMismatchMessage(systemUnit, bqUnit);
      setMappingError(message);
      setMappingDrafts((current) => ({ ...current, [label]: itemReference }));
      setSysLog(`BQ mapping blocked for ${label}: ${message}`);
      return;
    }

    const applyLabels = (labels: string[]) => {
      setMappingError('');
      setLabelMappings((current) => {
        const next = { ...current };
        labels.forEach((entry) => {
          next[entry] = itemReference;
        });
        return next;
      });
      setMappingDrafts((current) => {
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

    if (!options?.skipBulkPrompt && item && bulkEligibleLabels.length > 1 && typeof window !== 'undefined') {
      const shouldBulkLock = window.confirm(
        `Detected ${bulkEligibleInstanceCount} matching model instances across ${bulkEligibleLabels.length} compatible QS descriptions. Apply ${item.itemReference} to all of them now?`,
      );
      if (shouldBulkLock) {
        applyLabels(bulkEligibleLabels);
        setSysLog(`Bulk lock applied: ${item.itemReference} mounted to ${bulkEligibleLabels.length} QS descriptions covering ${bulkEligibleInstanceCount} model instances.`);
        return;
      }
    }

    applyLabels([label]);
    const instanceSuffix = candidate?.instanceCount && candidate.instanceCount > 1 ? ` (${candidate.instanceCount} model instances)` : '';
    setSysLog(`BQ mounted: ${label} -> ${itemReference}${instanceSuffix}.`);
  };

  const stageDraftMapping = (label: string, itemReference: string) => {
    setMappingDrafts((current) => ({ ...current, [label]: itemReference }));
    const candidate = mappingCandidates.find((entry) => entry.label === label);
    const item = bqItems.find((entry) => entry.itemReference === itemReference);
    const systemUnit = normalizeBqUnit(candidate?.unit || '');
    const bqUnit = normalizeBqUnit(item?.unit || '');

    if (itemReference && candidate && item && systemUnit && bqUnit && systemUnit !== bqUnit) {
      const message = buildSystemUnitMismatchMessage(systemUnit, bqUnit);
      setMappingError(message);
      setSysLog(`BQ selection flagged for ${label}: ${message}`);
      return;
    }

    if (itemReference) {
      setMappingError('');
      setSysLog(`BQ draft selected for ${label}: ${itemReference}. Confirm to mount the contract item.`);
      return;
    }

    setMappingError('');
    setSysLog(`BQ draft cleared for ${label}.`);
  };

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

  const canCompare = v1State === 'ready' && v2State === 'ready' && !isRunning;
  const showReportPanel = compareState === 'success' || compareState === 'error';
  const showOverviewTab = activeTab === 'overview';
  const showValuationTab = activeTab === 'valuation';
  const showCopilotTab = activeTab === 'copilot';

  const runCompareForAgent = useCallback(async (): Promise<VoComparisonResults | null> => {
    const engine = ensureEngine();
    if (!engine || v1State !== 'ready' || v2State !== 'ready') return null;
    const results = await engine.compareModels(v1Components, v2Components);
    setVoResults(results);
    setCompareState('success');
    try {
      engine.highlightComparison(results);
    } catch {
      /* highlight failures do not block tool result */
    }
    return results;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v1State, v2State, v1Components, v2Components]);

  const agentToolContext: ToolContext = useMemo(() => ({
    baseComponents: v1Components,
    revisionComponents: v2Components,
    voResults,
    bqItems,
    bqContext: buildBqMappingContext(bqItems, labelMappings),
    baseFileName: v1File?.name ?? null,
    revisionFileName: v2File?.name ?? null,
    runCompare: runCompareForAgent,
    getActiveIfcHandle: () => {
      const handle = engineRef.current?.getIfcHandle() ?? null;
      // DEV ONLY: expose to window for console debugging. Remove before production.
      if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__ifcHandle = handle;
      return handle;
    },
    activeIfcSlot,
  }), [v1Components, v2Components, voResults, bqItems, labelMappings, v1File, v2File, runCompareForAgent, activeIfcSlot]);

  return (
    <AuthGuard>
      <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950 font-sans text-zinc-300">
      {/* ── HEADER (Idea Nest) ────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/95 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Idea Nest brand logo — JPEG with cream background.
                Wrapped in a light card so the cream blends with the card surface,
                making it look like an intentional brand badge on the dark sidebar.
                Swap this <img> with a transparent PNG when available. */}
            <div className="flex h-12 items-center justify-center rounded-lg bg-white/95 px-1.5 py-1 shadow-sm ring-1 ring-white/20">
              <img
                src="/ideanest-logo.png"
                alt="Idea Nest · VO Copilot"
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="leading-tight">
              <div className="text-[11px] font-medium tracking-wide text-zinc-400">
                VO Copilot · 变更单与合约索赔智能体
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Credits</span>
              <span className="text-sm font-bold text-white">{creditsLoading ? '...' : creditsBalance ?? '-'}</span>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-700 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
        {showLegacyBanner && (
          <div className="flex items-center justify-between border-t border-sky-500/10 bg-gradient-to-r from-sky-500/5 to-fuchsia-500/5 px-6 py-2">
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <Zap className="h-3 w-3 text-sky-400" />
              <span><span className="text-zinc-300">原 VO System</span> 已升级为 Idea Nest，所有 VO 比对、索赔分析、Excel 导出功能都在 Copilot 里直接调用。</span>
            </div>
            <button type="button" onClick={() => setShowLegacyBanner(false)} className="rounded p-0.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>
      {/* Hidden file inputs (triggered from sidebar buttons) */}
      <input ref={v1InputRef} type="file" className="hidden" accept=".ifc,.IFC,application/octet-stream" onChange={(e) => handleIFCUpload(e, 'v1')} disabled={isRunning} />
      <input ref={v2InputRef} type="file" className="hidden" accept=".ifc,.IFC,application/octet-stream" onChange={(e) => handleIFCUpload(e, 'v2')} disabled={isRunning} />
      <input ref={bqInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleBqUpload} disabled={isRunning} />

      {/* ── BODY: sidebar + main ───────────────────────────── */}
      <div className="flex">
        <aside className="sticky top-[57px] flex h-[calc(100vh-57px)] w-72 flex-col gap-5 overflow-y-auto border-r border-white/10 bg-zinc-950 px-4 py-5">
          {/* Workspace files */}
          <section>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Workspace</div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => v1InputRef.current?.click()}
                disabled={isRunning}
                className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-white/20 ${v1Components.length > 0 ? 'border-sky-500/30 bg-sky-500/5' : 'border-zinc-800 bg-zinc-900/50'} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <FileBox className={`h-4 w-4 ${v1Components.length > 0 ? 'text-sky-400' : 'text-zinc-500'}`} />
                <div className="flex-1 overflow-hidden">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Base IFC</div>
                  <div className={`truncate text-xs ${v1Components.length > 0 ? 'text-white' : 'text-zinc-400'}`}>
                    {v1File ? v1File.name : 'Not loaded · click to upload'}
                  </div>
                  {v1Components.length > 0 && <div className="text-[10px] text-zinc-500">{v1Components.length} components</div>}
                </div>
              </button>
              <button
                type="button"
                onClick={() => v2InputRef.current?.click()}
                disabled={isRunning}
                className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-white/20 ${v2Components.length > 0 ? 'border-fuchsia-500/30 bg-fuchsia-500/5' : 'border-zinc-800 bg-zinc-900/50'} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <FileBox className={`h-4 w-4 ${v2Components.length > 0 ? 'text-fuchsia-400' : 'text-zinc-500'}`} />
                <div className="flex-1 overflow-hidden">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Revision IFC</div>
                  <div className={`truncate text-xs ${v2Components.length > 0 ? 'text-white' : 'text-zinc-400'}`}>
                    {v2File ? v2File.name : 'Not loaded · click to upload'}
                  </div>
                  {v2Components.length > 0 && <div className="text-[10px] text-zinc-500">{v2Components.length} components</div>}
                </div>
              </button>
              <button
                type="button"
                onClick={() => bqInputRef.current?.click()}
                disabled={isRunning}
                className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-white/20 ${bqItems.length > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/50'} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <FileSpreadsheet className={`h-4 w-4 ${bqItems.length > 0 ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <div className="flex-1 overflow-hidden">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Awarded BQ</div>
                  <div className={`truncate text-xs ${bqItems.length > 0 ? 'text-white' : 'text-zinc-400'}`}>
                    {bqFileName || 'Built-in Test BQ Library'}
                  </div>
                  <div className="text-[10px] text-zinc-500">{bqItems.length} line items ready</div>
                </div>
              </button>
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Quick Actions</div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={runVOComparison}
                disabled={!canCompare}
                className="group flex w-full items-center gap-2.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-left text-white transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play className="h-4 w-4 flex-shrink-0 text-sky-300" />
                <div className="flex-1 overflow-hidden">
                  <div className="text-xs font-semibold">Run VO Comparison</div>
                  <div className="truncate text-[10px] text-zinc-400">对比 base / revision</div>
                </div>
              </button>
              <button
                type="button"
                onClick={exportWorkbook}
                disabled={!voResults || isExporting}
                className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-zinc-300 transition hover:border-white/10 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-4 w-4 flex-shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                <div className="flex-1 overflow-hidden">
                  <div className="text-xs font-semibold">{isExporting ? 'Checking...' : 'Export VO Excel'}</div>
                  <div className="truncate text-[10px] text-zinc-500">生成实证报告</div>
                </div>
              </button>
              <button
                type="button"
                onClick={exportBqTemplateWorkbook}
                className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-zinc-300 transition hover:border-white/10 hover:bg-white/5 hover:text-white"
              >
                <FileText className="h-4 w-4 flex-shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                <div className="flex-1 overflow-hidden">
                  <div className="text-xs font-semibold">BQ Template</div>
                  <div className="truncate text-[10px] text-zinc-500">下载模板</div>
                </div>
              </button>
            </div>
          </section>

          {/* Views */}
          <section>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Views</div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('copilot')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showCopilotTab ? 'bg-fuchsia-500/15 text-fuchsia-200' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
              >
                <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${showCopilotTab ? 'text-fuchsia-300' : 'text-zinc-600'}`} />
                <span className="text-xs font-semibold">IFC Copilot</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showOverviewTab ? 'bg-sky-500/15 text-sky-200' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
              >
                <Layers3 className={`h-3.5 w-3.5 flex-shrink-0 ${showOverviewTab ? 'text-sky-300' : 'text-zinc-600'}`} />
                <span className="text-xs font-semibold">3D Model & Diff</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('valuation')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showValuationTab ? 'bg-emerald-500/15 text-emerald-200' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
              >
                <ClipboardList className={`h-3.5 w-3.5 flex-shrink-0 ${showValuationTab ? 'text-emerald-300' : 'text-zinc-600'}`} />
                <span className="text-xs font-semibold">BQ Mapping & Valuation</span>
              </button>
            </div>
          </section>

          {/* Status */}
          <section className="mt-auto rounded-xl border border-white/5 bg-zinc-900/50 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Status</div>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Base IFC</span>
                <span className="flex items-center gap-1">
                  {v1Components.length > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Ready</span></> : <><Circle className="h-3 w-3 text-zinc-600" /><span className="text-zinc-500">Pending</span></>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Revision IFC</span>
                <span className="flex items-center gap-1">
                  {v2Components.length > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Ready</span></> : <><Circle className="h-3 w-3 text-zinc-600" /><span className="text-zinc-500">Pending</span></>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Comparison</span>
                <span className="flex items-center gap-1">
                  {voResults ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Done</span></> : <><Circle className="h-3 w-3 text-zinc-600" /><span className="text-zinc-500">Pending</span></>}
                </span>
              </div>
            </div>
          </section>
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden">


      <div className="flex flex-col">
        <div ref={containerRef} className={showOverviewTab ? 'relative h-[60vh] min-h-[30rem] overflow-hidden rounded-[1.75rem] border border-slate-300 bg-slate-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75)] lg:h-[58vh]' : 'hidden'}>
          <div className="absolute bottom-4 left-4 z-10 rounded-xl border border-slate-300/90 bg-white/88 px-4 py-2 font-mono text-xs text-slate-700 shadow-sm backdrop-blur">{sysLog}</div>
          <div className="absolute left-4 top-4 z-10 flex max-w-[60rem] flex-col gap-2 text-xs">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Base IFC</div>
                <div className="mt-1 truncate font-semibold text-slate-900">{v1File ? v1File.name : 'No file selected'}</div>
                <div className="mt-1 text-slate-500">{modelStateLabel(v1State, v1Components.length, v1File?.name ?? null)}</div>
                {v1Error && <div className="mt-1 text-red-400">{v1Error}</div>}
              </div>
              <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Revision IFC</div>
                <div className="mt-1 truncate font-semibold text-slate-900">{v2File ? v2File.name : 'No file selected'}</div>
                <div className="mt-1 text-slate-500">{modelStateLabel(v2State, v2Components.length, v2File?.name ?? null)}</div>
                {v2Error && <div className="mt-1 text-red-400">{v2Error}</div>}
              </div>
              <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Awarded BQ</div>
                <div className="mt-1 truncate font-semibold text-slate-900">{bqFileName || 'Built-in Test BQ Library'}</div>
                <div className="mt-1 text-slate-500">{bqItems.length} line items ready</div>
                {bqError && <div className="mt-1 text-red-400">{bqError}</div>}
                {mappingError && <div className="mt-1 text-red-300">{mappingError}</div>}
              </div>
              <div className="rounded-xl border border-sky-200/90 bg-white/84 px-3 py-2 text-sky-700 shadow-sm backdrop-blur">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-500">Workspace Status</div>
                <div className="mt-1 text-xs leading-5">{compareMessage}</div>
              </div>
            </div>
          </div>
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            <button className="rounded bg-black/50 p-2 text-white hover:bg-black/80" onClick={() => engineRef.current?.resetCamera()}>
              <Home size={16} />
            </button>
            <button className="rounded bg-black/50 p-2 text-white hover:bg-black/80" onClick={() => engineRef.current?.toggleClipping()}>
              <BoxSelect size={16} />
            </button>
          </div>
        </div>

        {showOverviewTab ? (
          showReportPanel ? (
            <div className="flex flex-col border-t border-white/10 bg-zinc-950">
              <div className="border-b border-zinc-800 bg-zinc-900 p-3 text-xs font-bold uppercase tracking-widest text-sky-500">VO Variation Results</div>
              {compareState === "error" ? (
                <div className="m-4 rounded border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{compareMessage}</div>
              ) : (
                <>
                <div className="grid grid-cols-2 gap-3 border-b border-zinc-900 px-4 py-3 text-xs md:grid-cols-5 xl:grid-cols-12">
                  <div className="rounded border border-zinc-800 bg-zinc-900/70 px-3 py-2"><div className="text-zinc-500">Total Changes</div><div className="mt-1 text-lg font-bold text-white">{totalChanges}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/70 px-3 py-2"><div className="text-zinc-500">Raw Modified</div><div className="mt-1 text-lg font-bold text-amber-400">{voResults?.modified.length ?? 0}</div></div>
                  <div className="rounded border border-red-900/70 bg-red-950/20 px-3 py-2"><div className="text-red-300">VO Omissions</div><div className="mt-1 text-lg font-bold text-red-200">{totalCommercialOmissions}</div></div>
                  <div className="rounded border border-green-900/70 bg-green-950/20 px-3 py-2"><div className="text-green-300">VO Additions</div><div className="mt-1 text-lg font-bold text-green-200">{totalCommercialAdditions}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/70 px-3 py-2"><div className="text-zinc-500">Rated Actions</div><div className="mt-1 text-lg font-bold text-sky-300">{totalRatedActions}</div></div>
                  <div className="rounded border border-amber-900/70 bg-amber-950/20 px-3 py-2"><div className="text-amber-300">Pending Rates</div><div className="mt-1 text-lg font-bold text-amber-200">{totalPendingRates}</div></div>
                  <div className="rounded border border-red-900/70 bg-red-950/20 px-3 py-2"><div className="text-red-300">High-Risk Qty</div><div className="mt-1 text-lg font-bold text-red-200">{totalHighRiskQuantityItems}</div></div>
                  <div className="rounded border border-emerald-900/70 bg-emerald-950/20 px-3 py-2"><div className="text-emerald-300">BQ Mounted</div><div className="mt-1 text-lg font-bold text-emerald-200">{mappedLabelCount}/{mappingCandidates.length}</div></div>
                  <div className="rounded border border-sky-900/70 bg-sky-950/20 px-3 py-2"><div className="text-sky-300">Contract BQ Rated</div><div className="mt-1 text-lg font-bold text-sky-200">{contractBqCount}</div></div>
                  <div className="rounded border border-sky-900/70 bg-sky-950/20 px-3 py-2"><div className="text-sky-300">Net Rated Value</div><div className="mt-1 text-lg font-bold text-sky-200">{formatSignedCurrencyValue(totalNetValue)}</div></div>
                  <div className="rounded border border-zinc-800 bg-zinc-900/70 px-3 py-2"><div className="text-zinc-500">Protected Value</div><div className="mt-1 text-lg font-bold text-amber-300">{formatCurrencyValue(totalProtectedValue)}</div></div>
                  <div className="rounded border border-red-900/70 bg-red-950/30 px-3 py-2"><div className="text-red-300">Formwork Alerts</div><div className="mt-1 text-lg font-bold text-red-200">{totalFormworkAlerts}</div></div>
                  <div className="rounded border border-orange-900/70 bg-orange-950/30 px-3 py-2"><div className="text-orange-300">Star Rate Candidates</div><div className="mt-1 text-lg font-bold text-orange-200">{totalStarRateCandidates}</div></div>
                  <div className="rounded border border-violet-900/70 bg-violet-950/30 px-3 py-2"><div className="text-violet-300">EOT Flags</div><div className="mt-1 text-lg font-bold text-violet-200">{totalEotFlags}</div></div>
                </div>
                <div className="border-b border-zinc-900 px-4 py-2 text-xs text-zinc-500">Commercial output now forces every technical modification into Omission + Addition rows. Each commercial row now carries Qty, Unit, Rate, Amount, the exact measurement rule applied, and the quantity source used. Quantity normalization now follows a strict fallback chain: Qto first, geometry mesh calculation second, and BBox estimate last. Any BBox fallback is marked as high risk for manual QS verification. Contract BQ rates override provisional project rates only when a QS-mounted Item Reference exists and its unit matches the system measurement unit. Click a row to focus the affected element in 3D; modified omissions will focus the visible revision counterpart.</div>
                <div className="border-b border-zinc-900 px-4 py-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-400">
                    Drag Horizontally Here To View Hidden Columns
                  </div>
                  <div
                    ref={resultsScrollbarRef}
                    className="overflow-x-auto overflow-y-hidden rounded-full border border-zinc-700 bg-zinc-900/90"
                  >
                    <div ref={resultsScrollbarInnerRef} className="h-4 min-w-full" />
                  </div>
                </div>
                <div ref={resultsTableScrollRef} className="hide-scrollbar overflow-x-auto p-4">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700/60 text-xs uppercase tracking-[0.18em] text-zinc-500">
                        <th className="w-[7%] px-3 py-2 font-bold">Section</th>
                        <th className="w-[10%] px-3 py-2 font-bold">Level</th>
                        <th className="w-[8%] px-3 py-2 font-bold">Block</th>
                        <th className="w-[8%] px-3 py-2 font-bold">Zone</th>
                        <th className="w-[10%] px-3 py-2 font-bold">Grid/Room</th>
                        <th className="w-[7%] px-3 py-2 font-bold">Loc Type</th>
                        <th className="w-[14%] px-3 py-2 font-bold">Host / Opening</th>
                        <th className="w-[9%] px-3 py-2 font-bold">Shield</th>
                        <th className="w-[10%] px-3 py-2 font-bold">Protected Qty</th>
                        <th className="w-[10%] px-3 py-2 font-bold">Protected Value</th>
                        <th className="w-[16%] px-3 py-2 font-bold">Formwork Alert</th>
                        <th className="w-[16%] px-3 py-2 font-bold">Star Rate</th>
                        <th className="w-[16%] px-3 py-2 font-bold">EOT Trigger</th>
                        <th className="w-[15%] px-3 py-2 font-bold">QS Description</th>
                        <th className="w-[11%] px-3 py-2 font-bold">Measure</th>
                        <th className="w-[14%] px-3 py-2 font-bold">Measure Rule</th>
                        <th className="w-[8%] px-3 py-2 font-bold">Qty Source</th>
                        <th className="w-[16%] px-3 py-2 font-bold">Qty Risk</th>
                        <th className="w-[8%] px-3 py-2 font-bold">Qty</th>
                        <th className="w-[6%] px-3 py-2 font-bold">Unit</th>
                        <th className="w-[10%] px-3 py-2 font-bold">Rate</th>
                        <th className="w-[10%] px-3 py-2 font-bold">Amount</th>
                        <th className="w-[7%] px-3 py-2 font-bold">VO Action</th>
                        <th className="w-[7%] px-3 py-2 font-bold">Tech Status</th>
                        <th className="w-[6%] px-3 py-2 font-bold">QS Impact</th>
                        <th className="pb-2 font-bold uppercase">Details</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-zinc-300">
                      {resultRows.map((row) => (
                        <tr
                          key={row.key}
                          className={`border-b border-zinc-700/40 align-top even:bg-zinc-800/20 ${row.canFocus ? 'cursor-pointer hover:bg-zinc-800/55' : 'opacity-80'} ${selectedRowKey === row.key ? 'bg-sky-950/30 ring-1 ring-inset ring-sky-500/40' : ''}` }
                          onClick={() => row.canFocus ? focusCommercialAction(row.rawAction) : undefined}
                          title={row.focusHint}
                        >
                          <td className="px-3 py-2 text-zinc-100">{row.section}</td>
                          <td className="px-3 py-2 text-sky-400">{row.level}</td>
                          <td className="px-3 py-2 text-zinc-300">{row.block}</td>
                          <td className="px-3 py-2 text-zinc-300">{row.zone}</td>
                          <td className="px-3 py-2 text-zinc-300">{row.gridRoom}</td>
                          <td className="px-3 py-2 uppercase text-zinc-500">{row.locationKind}</td>
                          <td className="px-3 py-2 text-zinc-400">{row.openingLink}</td>
                          <td className="px-3 py-2 text-zinc-400">{row.shield}</td>
                          <td className="px-3 py-2 text-zinc-300">{row.protectedQty}</td>
                          <td className="px-3 py-2 text-amber-300">{row.protectedValue}</td>
                          <td className={`py-2 ${row.alert === '-' ? 'text-zinc-500' : 'font-semibold text-red-300'}`}>{row.alert}</td>
                          <td className={`py-2 ${row.starRate === '-' ? 'text-zinc-500' : 'font-semibold text-orange-300'}`}>{row.starRate}</td>
                          <td className={`py-2 ${row.eotFlag === '-' ? 'text-zinc-500' : 'font-semibold text-violet-300'}`}>{row.eotFlag}</td>
                          <td className="px-3 py-2 text-zinc-100">{row.element}</td>
                          <td className="px-3 py-2 text-zinc-300">{row.measurement}</td>
                          <td className="px-3 py-2 text-zinc-400">{row.measureRule}</td>
                          <td className="px-3 py-2 text-zinc-300">{row.quantitySource}</td>
                          <td className={`py-2 ${row.quantityRiskClass}`}>{row.quantityRisk}</td>
                          <td className="px-3 py-2 text-zinc-300">{row.quantity}</td>
                          <td className="px-3 py-2 text-zinc-300">{row.unit}</td>
                          <td className={`py-2 ${row.rateClass}`}>{row.rate}</td>
                          <td className={`py-2 font-semibold ${row.amountClass}`}>{row.amount}</td>
                          <td className={`py-2 font-bold ${row.actionClass}`}>{row.actionLabel}</td>
                          <td className={`py-2 font-bold ${row.techClass}`}>{row.techStatus}</td>
                          <td className={`py-2 font-bold uppercase ${row.qsClass}`}>{row.qsImpact}</td>
                          <td className="whitespace-pre-wrap px-3 py-2 text-zinc-400">{row.detail}</td>
                        </tr>
                      ))}
                      {resultRows.length === 0 && (
                        <tr><td colSpan={26} className="py-4 text-center text-zinc-500">Comparison ran successfully. No variations were detected.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            </div>
          ) : null
        ) : showValuationTab ? (
          <div className="flex flex-col border-t border-white/10 bg-zinc-950">
            <div className="shrink-0 border-b border-zinc-900 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">BQ Mapping Dashboard</div>
                  <div className="mt-2 max-w-3xl text-sm text-zinc-400">This QS workbench only shows live commercial actions. Stage a BQ item, review the unit pairing, and explicitly confirm the mount before the contract rate goes live.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">BQ Mounted</div><div className="mt-2 text-2xl font-black text-white">{mappedLabelCount}/{mappingCandidates.length}</div></div>
                  <div className="rounded-xl border border-red-900/70 bg-red-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-red-300">Unmapped</div><div className="mt-2 text-2xl font-black text-white">{orphanRows.length}</div></div>
                  <div className="rounded-xl border border-amber-900/70 bg-amber-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-amber-300">Pending Rates</div><div className="mt-2 text-2xl font-black text-white">{totalPendingRates}</div></div>
                  <div className="rounded-xl border border-sky-900/70 bg-sky-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-sky-300">Contract Rated</div><div className="mt-2 text-2xl font-black text-white">{contractBqCount}</div></div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-300">Awarded BQ: <span className="font-semibold text-white">{bqFileName ? `${bqFileName} | ${bqItems.length} line items` : "Not loaded"}</span>{bqError && <div className="mt-2 text-red-400">{bqError}</div>}{mappingError && <div className="mt-2 text-red-300">{mappingError}</div>}</div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-sky-300">Status: {compareMessage}</div>
              </div>
              {orphanRows.length > 0 && (
                <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-4">
                  <div className="text-sm font-black uppercase tracking-[0.2em] text-red-200">Unmapped Items: {orphanInstanceCount} - Potential Star Rate!</div>
                  <div className="mt-2 text-sm text-red-300">{orphanRows.length} QS descriptions still have no awarded BQ item. {orphanPreview ? `Examples: ${orphanPreview}` : ""}</div>
                </div>
              )}
            </div>
            <div className="px-4 pb-6">
              <div className="flex flex-col rounded-[1.5rem] border border-zinc-800 bg-zinc-900/80 shadow-2xl shadow-black/30">
                <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 px-5 py-4">
                  <div className="text-sm font-black uppercase tracking-[0.28em] text-white">Contract Mounting Console</div>
                  <div className="mt-2 text-sm text-zinc-400">Sticky description column on the left. System unit and staged BQ unit are displayed side by side. Any unit conflict lights the row red and blocks confirmation.</div>
                </div>
                <div className="overflow-auto">
                  <table className="min-w-[110rem] border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-20 bg-zinc-950 text-xs uppercase tracking-[0.18em] text-zinc-400">
                      <tr className="border-b border-zinc-800">
                        <th className="sticky left-0 z-30 min-w-[24rem] border-r border-zinc-800 bg-zinc-950 px-3 py-2 font-black text-white">QS Description</th>
                        <th className="min-w-[6rem] px-3 py-2 font-black">Section</th>
                        <th className="min-w-[7rem] px-3 py-2 font-black">Instances</th>
                        <th className="min-w-[9rem] px-3 py-2 font-black">System Unit</th>
                        <th className="min-w-[9rem] px-3 py-2 font-black">BQ Unit</th>
                        <th className="min-w-[16rem] px-3 py-2 font-black">Suggested BQ</th>
                        <th className="min-w-[18rem] px-3 py-2 font-black">BQ Item Reference</th>
                        <th className="min-w-[14rem] px-3 py-2 font-black">BQ Description</th>
                        <th className="min-w-[10rem] px-3 py-2 font-black">Contract Rate</th>
                        <th className="min-w-[12rem] px-3 py-2 font-black">Status</th>
                        <th className="min-w-[12rem] px-3 py-2 font-black">Confirm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappingRows.map((row) => {
                        const stagedMismatch = row.hasUnitMismatch;
                        const unitCellClass = stagedMismatch ? "bg-red-950/70 text-red-200 ring-1 ring-inset ring-red-500/50" : row.draftReference ? "bg-emerald-950/30 text-emerald-200" : "bg-zinc-950 text-zinc-300";
                        return (
                          <tr key={row.label} className={`border-b border-zinc-700/40 align-top text-sm even:bg-zinc-800/20 ${stagedMismatch ? "bg-red-950/25" : row.mappedReference ? "bg-zinc-900/35" : "bg-zinc-950/10"}` }>
                            <td className={`sticky left-0 z-10 min-w-[24rem] border-r border-zinc-700/50 px-3 py-2 ${stagedMismatch ? "bg-red-950 text-red-100" : "bg-zinc-950 text-zinc-100"}` }>
                              <div className="font-semibold leading-6">{row.label}</div>
                              <div className="mt-1 text-xs text-zinc-500">Live instances: {row.instanceCount}</div>
                            </td>
                            <td className="border-r border-zinc-700/40 px-3 py-2 text-zinc-300">{row.section}</td>
                            <td className="border-r border-zinc-700/40 px-3 py-2 text-zinc-300">{row.instanceCount}</td>
                            <td className="border-r border-zinc-700/40 px-3 py-2"><div className="inline-flex min-w-[6rem] justify-center rounded-lg border border-sky-900/70 bg-sky-950/30 px-3 py-2 font-semibold text-sky-200">{row.systemUnit || "-"}</div></td>
                            <td className="border-r border-zinc-700/40 px-3 py-2"><div className={`inline-flex min-w-[6rem] justify-center rounded-lg border px-3 py-2 font-semibold ${unitCellClass}`}>{row.selectedUnit || "-"}</div></td>
                            <td className="border-r border-zinc-700/40 px-3 py-2">
                              {row.suggestedItem ? (
                                <div className="space-y-2">
                                  <div className={`${row.suggestedSelectableItem ? "text-emerald-300" : "text-amber-300"} font-semibold`}>{row.suggestedItem.itemReference} ({row.suggestedItem.score})</div>
                                  <div className="text-xs text-zinc-500">{row.suggestedItem.description}</div>
                                  <button type="button" className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${row.suggestedSelectableItem ? "border-zinc-600 bg-transparent text-zinc-200 hover:border-emerald-500/60 hover:text-emerald-200" : "border-red-800 bg-transparent text-red-300"}` } onClick={() => row.suggestedSelectableItem ? updateLabelMapping(row.label, row.suggestedSelectableItem.itemReference) : undefined}>{row.suggestedSelectableItem ? "Approve Suggestion" : "Suggestion Blocked"}</button>
                                </div>
                              ) : <span className="text-zinc-500">No recommendation</span>}
                            </td>
                            <td className="border-r border-zinc-700/40 px-3 py-2"><select className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold text-white outline-none transition ${stagedMismatch ? "border-red-500 bg-red-950/50 focus:border-red-400" : "border-zinc-700 bg-zinc-950 focus:border-sky-500"}` } value={row.draftReference} onChange={(event) => stageDraftMapping(row.label, event.target.value)}><option value="">Unmapped</option>{row.selectableItems.map((item) => <option key={item.itemReference} value={item.itemReference}>{item.itemReference}{item.mismatch ? ` [Unit mismatch: ${item.unit} vs ${row.systemUnit || "-"}]` : ""}</option>)}</select></td>
                            <td className="border-r border-zinc-700/40 px-3 py-2 text-zinc-300">{row.draftItem?.description ?? row.mappedItem?.description ?? "-"}</td>
                            <td className="border-r border-zinc-700/40 px-3 py-2 text-zinc-100">{row.draftItem ? formatCurrencyValue(row.draftItem.contractRate) : row.mappedItem ? formatCurrencyValue(row.mappedItem.contractRate) : "-"}</td>
                            <td className="border-r border-zinc-700/40 px-3 py-2"><div className={`inline-flex rounded-xl border px-3 py-2 text-xs font-bold ${stagedMismatch ? "border-red-700 bg-red-950/60 text-red-200" : row.unitStatus === "Mounted" ? "border-emerald-700 bg-emerald-950/30 text-emerald-200" : row.unitStatus === "Ready to confirm" ? "border-amber-700 bg-amber-950/30 text-amber-200" : "border-zinc-700 bg-zinc-950 text-zinc-400"}` }>{row.unitStatus}</div></td>
                            <td className="px-3 py-2"><div className="flex flex-col gap-2"><button type="button" className={`rounded-xl px-3 py-2 text-sm font-black transition ${stagedMismatch ? "cursor-not-allowed bg-zinc-700 text-zinc-300" : "bg-sky-500 text-white hover:bg-sky-400"}`} onClick={() => updateLabelMapping(row.label, row.draftReference)} disabled={!row.draftReference || stagedMismatch}>{stagedMismatch ? "Blocked" : "Confirm Mount"}</button>{stagedMismatch && <div className="text-xs font-semibold text-red-300">Unit mismatch. Verify BQ unit.</div>}<button type="button" className="rounded-xl border border-zinc-700 bg-transparent px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900" onClick={() => updateLabelMapping(row.label, "")}>Clear</button></div></td>
                          </tr>
                        );
                      })}
                      {mappingRows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-zinc-500">Run the comparison first. Only commercial Omission / Addition items are allowed into this BQ mounting console.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col border-t border-white/10 bg-zinc-950 px-4 py-4 lg:px-6">
            <div className="min-h-[36rem]">
              <CopilotPanel
                toolContext={agentToolContext}
                signedIn={!!user}
                onCreditsUpdate={(balance) => setCreditsBalance(balance)}
              />
            </div>
          </div>
        )}
      </div>
      </main>
      </div>
      </div>
      {billingNotice && (
        <div className={`mx-6 mt-4 rounded-2xl border px-4 py-3 text-sm ${billingNotice.tone === 'success' ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200' : 'border-sky-900/70 bg-sky-950/30 text-sky-200'}`}>
          {billingNotice.message}
        </div>
      )}
      {billingError && (
        <div className="mx-6 mt-4 rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {billingError}
        </div>
      )}
      {creditsError && (
        <div className="mx-6 mt-4 rounded-2xl border border-amber-900/70 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          Failed to refresh credits: {creditsError}
        </div>
      )}
      {showPaywall && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-zinc-950/95 p-8 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">Premium Audit Paywall</div>
            <h2 className="mt-4 text-3xl font-black text-white">Your 5 Free Premium Audits are Exhausted.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400">Unlock the full Star Rate Build-up and VO Commercial Report to claim your RM 50,000+ profit.</p>
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 text-sm text-zinc-300">
              Current balance: <span className="font-black text-white">{creditsBalance ?? 0}</span> premium audits
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="flex-1 rounded-2xl bg-sky-500 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
                onClick={handleTopUpCheckout}
                disabled={isStartingCheckout || !user}
              >
                {isStartingCheckout ? 'Redirecting...' : 'Top Up 50 Credits - RM 499'}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-zinc-700 bg-zinc-900 px-5 py-4 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                onClick={() => setShowPaywall(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}


