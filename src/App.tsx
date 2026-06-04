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
import AuthGuard from './components/AuthGuard';
import AppHeader from './components/AppHeader';
import AppSidebar from './components/AppSidebar';
import ModelViewer from './components/ModelViewer';
import KPIGrid from './components/KPIGrid';
import ResultsTable from './components/ResultsTable';
import BQMappingPanel from './components/BQMappingPanel';
import CopilotPanel from './components/CopilotPanel';
import AuditPanel from './components/AuditPanel';
import GuidePage from './components/GuidePage';
import DwgPanel from './components/DwgPanel';
import { runDwgTakeoff } from './dwg/dwgEngine';
import type { DwgTakeoffResult } from './dwg/quantityModel';
import RvtAuditPanel from './components/RvtAuditPanel';
import type { RvtConvertStatus } from './rvt/types';
import { rvtConvertInit, rvtUploadToAps, rvtConvertStart, rvtPollUntilDone, rvtDownloadIfc } from './rvt/aps-client';
import ViewerErrorBoundary from './components/ViewerErrorBoundary';
import type { AuditState } from './components/AuditPanel';
import type { AuditResult } from './audit/types';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from './auth/AuthProvider';
import { supabase } from './lib/supabase';
import { useCredits } from './hooks/useCredits';
import { useLang } from './i18n/LanguageContext';
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
  const { t } = useLang();
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
  const [bqFileName, setBqFileName] = useState('');
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
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditState, setAuditState] = useState<AuditState>('idle');
  const [auditError, setAuditError] = useState('');
  const [auditDurationMs, setAuditDurationMs] = useState(0);
  const [billingError, setBillingError] = useState('');
  const [billingNotice, setBillingNotice] = useState<{ tone: 'success' | 'info'; message: string } | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [dwgResult, setDwgResult] = useState<DwgTakeoffResult | null>(null);
  const [dwgLoading, setDwgLoading] = useState(false);
  const [dwgError, setDwgError] = useState('');

  const [rvtFile, setRvtFile] = useState<File | null>(null);
  const [rvtUrn, setRvtUrn] = useState<string | null>(null);
  const [rvtConvertStatus, setRvtConvertStatus] = useState<RvtConvertStatus>('idle');
  const [rvtConvertProgress, setRvtConvertProgress] = useState('');
  const [rvtConvertError, setRvtConvertError] = useState('');
  const [rvtAuditResult, setRvtAuditResult] = useState<AuditResult | null>(null);
  const [rvtAuditDurationMs, setRvtAuditDurationMs] = useState(0);
  const rvtInputRef = useRef<HTMLInputElement>(null);
  const RVT_CREDIT_COST = 3;

  const { user, signOut, passwordRecovery, updatePassword, dismissPasswordRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const { balance: creditsBalance, loading: creditsLoading, error: creditsError, refresh: refreshCredits, setBalance: setCreditsBalance } = useCredits(user?.id);

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BimEngine | null>(null);
  const handledCheckoutStateRef = useRef<string | null>(null);
  const v1InputRef = useRef<HTMLInputElement>(null);
  const v2InputRef = useRef<HTMLInputElement>(null);
  const bqInputRef = useRef<HTMLInputElement>(null);
  const dwgInputRef = useRef<HTMLInputElement>(null);
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
    if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__engine = engine;
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
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Top-up may have completed, but credit refresh failed.';
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

  const MAX_IFC_SIZE = 100 * 1024 * 1024; // 100 MB

  const handleIFCUpload = async (e: React.ChangeEvent<HTMLInputElement>, version: 'v1' | 'v2') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IFC_SIZE) {
      const setErr = version === 'v1' ? setV1Error : setV2Error;
      const sizeMsg = t('sys.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) });
      setErr(sizeMsg);
      toast.error(sizeMsg);
      e.target.value = '';
      return;
    }

    resetComparison();

    const setFile = version === 'v1' ? setV1File : setV2File;
    const setComponents = version === 'v1' ? setV1Components : setV2Components;
    const setState = version === 'v1' ? setV1State : setV2State;
    const setError = version === 'v1' ? setV1Error : setV2Error;
    const label = version === 'v1' ? t('misc.v1Base') : t('misc.v2Revision');

    setFile(file);
    setComponents([]);
    setError('');
    setState('loading');
    setSysLog(`Parsing ${label} IFC: ${file.name}...`);

    const engine = ensureEngine();
    if (!engine) {
      const message = t('sys.engineNotReady');
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
      toast.success(t('toast.loadSuccess', { label, count: String(components.length) }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown parsing error';
      setState('error');
      setError(message);
      setSysLog(`Failed to parse ${label}: ${message}`);
      toast.error(t('toast.loadFailed', { label }));
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown BQ import error';
      setBqItems([]);
      setBqFileName('');
      setBqError(message);
      setSysLog(`BQ import failed: ${message}`);
    }

    e.target.value = '';
  };

  const handleDwgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActiveTab('dwg');
    setDwgLoading(true);
    setDwgError('');
    setDwgResult(null);
    setSysLog(`Parsing DWG locally: ${file.name}...`);
    try {
      const buffer = await file.arrayBuffer();
      const result = await runDwgTakeoff(buffer, file.name);
      setDwgResult(result);
      setSysLog(`DWG takeoff complete: ${result.items.length} quantity items from ${result.entities} entities.`);
      toast.success(`DWG 算量完成 · ${result.items.length} 条工程量`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown DWG parse error';
      setDwgError(message);
      setSysLog(`DWG takeoff failed: ${message}`);
      toast.error('DWG 解析失败');
    } finally {
      setDwgLoading(false);
      e.target.value = '';
    }
  };

  const handleRvtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error('RVT file exceeds 100MB limit');
      e.target.value = '';
      return;
    }
    setRvtFile(file);
    setRvtUrn(null);
    setRvtConvertStatus('idle');
    setRvtConvertError('');
    setRvtAuditResult(null);
    setActiveTab('rvt');
    setSysLog(`RVT file loaded: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    e.target.value = '';
  };

  const runRvtAudit = useCallback(async () => {
    if (!rvtFile || !user) return;

    setRvtConvertStatus('credit_check');
    setRvtConvertError('');
    setRvtAuditResult(null);
    const t0 = performance.now();

    try {
      setRvtConvertStatus('uploading');
      setSysLog('RVT: Initializing cloud conversion...');
      const init = await rvtConvertInit(rvtFile.name, rvtFile.size);

      if (init.credits_balance !== null) setCreditsBalance(init.credits_balance);

      setSysLog('RVT: Uploading to Autodesk cloud...');
      await rvtUploadToAps(init.upload_url, rvtFile);

      setRvtConvertStatus('converting');
      setSysLog('RVT: Starting RVT → IFC conversion...');
      const start = await rvtConvertStart(init.job_id, init.upload_key, init.bucket, init.object_key);

      setRvtUrn(start.urn);

      await rvtPollUntilDone(init.job_id, (status, progress) => {
        setRvtConvertProgress(progress);
        setSysLog(`RVT: Converting... ${progress}`);
      });

      setRvtConvertStatus('downloading');
      setSysLog('RVT: Downloading converted IFC...');
      const ifcBuffer = await rvtDownloadIfc(init.job_id);

      setSysLog('RVT: Running audit on converted IFC...');
      const engine = ensureEngine();
      if (!engine) throw new Error('BIM engine not available');

      await engine.loadIfcModel(ifcBuffer, (p) => {
        setSysLog(`RVT: Loading converted IFC... ${Math.round(p * 100)}%`);
      });

      const handle = engine.getIfcHandle();
      if (!handle) throw new Error('IFC model failed to load from converted file');

      const { runAudit: doAudit } = await import('./audit/extractor');
      const result = doAudit({ api: handle.api, modelID: handle.modelID });
      const duration = performance.now() - t0;

      setRvtAuditResult(result);
      setRvtAuditDurationMs(duration);
      setRvtConvertStatus('done');
      setSysLog(`RVT audit complete: ${result.records.length} elements in ${(duration / 1000).toFixed(1)}s`);
      toast.success(`RVT 审计完成 · ${result.records.length} 个构件`);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setRvtConvertError(message);
      setRvtConvertStatus('error');
      setSysLog(`RVT audit failed: ${message}`);

      if (message.includes('Insufficient credits') || message.includes('NO_CREDITS')) {
        setShowPaywall(true);
        toast.error(t('rvt.insufficientCredits'));
      } else {
        toast.error('RVT 审计失败');
      }

      await refreshCredits();
    }
  }, [rvtFile, user, ensureEngine, t, refreshCredits, setCreditsBalance]);

  const runAudit = useCallback(async () => {
    const engine = ensureEngine();
    if (!engine) return;
    const handle = engine.getIfcHandle();
    if (!handle) {
      setAuditError(t('sys.auditNotReady'));
      setAuditState('error');
      return;
    }
    setAuditState('running');
    setAuditError('');
    setAuditResult(null);
    setActiveTab('audit');
    const t0 = performance.now();
    try {
      const { runAudit: doAudit } = await import('./audit/extractor');
      const result = doAudit({ api: handle.api, modelID: handle.modelID });
      const duration = performance.now() - t0;
      setAuditDurationMs(duration);
      setAuditResult(result);
      setAuditState('done');
      setSysLog(`Audit complete: ${result.records.length} elements in ${(duration / 1000).toFixed(1)}s`);
      toast.success(t('toast.auditComplete', { count: String(result.records.length), duration: (duration / 1000).toFixed(1) }));
    } catch (err) {
      setAuditDurationMs(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      setAuditError(message);
      setAuditState('error');
      setSysLog(`Audit failed: ${message}`);
      toast.error(t('toast.auditFailed', { message }));
    }
  }, []);

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
      setActiveTab('overview');
      const commercial = buildCommercialBreakdown(results, buildBqMappingContext(bqItems, labelMappings));
      setCompareMessage(
        `Comparison complete. Raw: ${results.modified.length} modified. Commercial: ${commercial.summary.omissions} omissions, ${commercial.summary.additions} additions. Pending rates: ${commercial.summary.pendingRateActions}. Net rated value: ${formatSignedCurrencyValue(commercial.summary.netValue)}. Protected value: ${formatCurrencyValue(results.qsSummary.protectedValue)}.`,
      );

      try {
        engine.highlightComparison(results);
      } catch (highlightError: unknown) {
        const message = highlightError instanceof Error ? highlightError.message : '3D highlight failed';
        setSysLog(`VO Complete, but 3D highlight failed: ${message}`);
      }

      setSysLog(
        `VO Complete: ${results.added.length} Added, ${results.deleted.length} Deleted, ${results.modified.length} Modified. Commercial: ${commercial.summary.omissions} omissions, ${commercial.summary.additions} additions. Pending rates: ${commercial.summary.pendingRateActions}. Net rated value: ${formatSignedCurrencyValue(commercial.summary.netValue)}.`,
      );
      toast.success(t('toast.voComplete'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown comparison error';
      setVoResults(null);
      setCompareState('error');
      setCompareMessage(`Comparison failed: ${message}`);
      setSysLog(`VO Analysis Failed: ${message}`);
      toast.error(t('toast.voFailed'));
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
      toast.success(t('toast.excelExported'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to validate cloud credits.';
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start Stripe Checkout.';
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

  const pricingContext = useMemo(() => buildBqMappingContext(bqItems, labelMappings), [bqItems, labelMappings]);
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
                setSysLog(`Bulk lock applied: ${item.itemReference} mounted to ${bulkEligibleLabels.length} QS descriptions covering ${bulkEligibleInstanceCount} model instances.`);
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
      // DEV ONLY: expose to window for console debugging.
      if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__ifcHandle = handle;
      return handle;
    },
    activeIfcSlot,
    dwgItems: dwgResult?.items,
    dwgFileName: dwgResult?.fileName ?? null,
  }), [v1Components, v2Components, voResults, bqItems, labelMappings, v1File, v2File, runCompareForAgent, activeIfcSlot, dwgResult]);

  return (
    <AuthGuard>
      <Toaster position="top-right" toastOptions={{ style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' } }} />
      <div className="min-h-screen w-full overflow-x-hidden bg-slate-900 font-sans text-slate-300">
      {/* ── HEADER (Idea Nest) ────────────────────────────── */}
      <AppHeader
        creditsBalance={creditsBalance}
        creditsLoading={creditsLoading}
        showLegacyBanner={showLegacyBanner}
        onCloseBanner={() => setShowLegacyBanner(false)}
        onSignOut={signOut}
      />
      {/* Hidden file inputs (triggered from sidebar buttons) */}
      <input ref={v1InputRef} type="file" className="hidden" accept=".ifc,.IFC,application/octet-stream" onChange={(e) => handleIFCUpload(e, 'v1')} disabled={isRunning} />
      <input ref={v2InputRef} type="file" className="hidden" accept=".ifc,.IFC,application/octet-stream" onChange={(e) => handleIFCUpload(e, 'v2')} disabled={isRunning} />
      <input ref={bqInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleBqUpload} disabled={isRunning} />
      <input ref={dwgInputRef} type="file" className="hidden" accept=".dwg,.DWG" onChange={handleDwgUpload} />
      <input ref={rvtInputRef} type="file" className="hidden" accept=".rvt,.RVT" onChange={handleRvtUpload} />

      {/* ── BODY: sidebar + main ───────────────────────────── */}
      <div className="flex">
        <AppSidebar
          v1File={v1File} v2File={v2File} bqFileName={bqFileName}
          v1Components={v1Components} v2Components={v2Components} bqItems={bqItems}
          v1State={v1State} v2State={v2State} voResults={voResults}
          isRunning={isRunning} isExporting={isExporting} activeTab={activeTab}
          onUploadBase={() => v1InputRef.current?.click()}
          onUploadRevision={() => v2InputRef.current?.click()}
          onUploadBq={() => bqInputRef.current?.click()}
          onRunCompare={runVOComparison}
          onExportExcel={exportWorkbook}
          onExportBqTemplate={exportBqTemplateWorkbook}
          onTabChange={setActiveTab}
          onRunAudit={runAudit}
          auditState={auditState}
          onUploadRvt={() => rvtInputRef.current?.click()}
        />

        <main className="min-w-0 flex-1 overflow-x-hidden">


      <div className="flex flex-col">
        <div className={showOverviewTab ? '' : 'hidden'}>
          <ViewerErrorBoundary>
            <ModelViewer
              containerRef={containerRef}
              sysLog={sysLog}
              v1File={v1File} v2File={v2File}
              v1State={v1State} v2State={v2State}
              v1Components={v1Components} v2Components={v2Components}
              v1Error={v1Error} v2Error={v2Error}
              bqFileName={bqFileName} bqItems={bqItems}
              bqError={bqError} mappingError={mappingError}
              compareMessage={compareMessage}
              onResetCamera={() => engineRef.current?.resetCamera()}
              onToggleClipping={() => engineRef.current?.toggleClipping()}
            />
          </ViewerErrorBoundary>
        </div>

        {showOverviewTab ? (
          showReportPanel ? (
            <div className="flex flex-col border-t border-slate-700 bg-slate-900">
              <div className="border-b border-slate-800 bg-slate-800 p-3 text-xs font-bold uppercase tracking-widest text-blue-400">{t('vo.resultsTitle')}</div>
              {compareState === "error" ? (
                <div className="m-4 rounded border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{compareMessage}</div>
              ) : (
                <>
                <KPIGrid
                  totalChanges={totalChanges}
                  totalCommercialOmissions={totalCommercialOmissions}
                  totalCommercialAdditions={totalCommercialAdditions}
                  totalNetValue={totalNetValue}
                  totalPendingRates={totalPendingRates}
                  totalProtectedValue={totalProtectedValue}
                  rawModified={voResults?.modified.length ?? 0}
                  totalRatedActions={totalRatedActions}
                  totalHighRiskQuantityItems={totalHighRiskQuantityItems}
                  mappedLabelCount={mappedLabelCount}
                  mappingCandidatesCount={mappingCandidates.length}
                  contractBqCount={contractBqCount}
                  totalFormworkAlerts={totalFormworkAlerts}
                  totalStarRateCandidates={totalStarRateCandidates}
                  totalEotFlags={totalEotFlags}
                />
                <ResultsTable
                  resultRows={resultRows}
                  selectedRowKey={selectedRowKey}
                  onRowClick={focusCommercialAction}
                  scrollRef={resultsTableScrollRef}
                  scrollbarRef={resultsScrollbarRef}
                  scrollbarInnerRef={resultsScrollbarInnerRef}
                />
              </>
            )}
            </div>
          ) : null
        ) : showValuationTab ? (
          <BQMappingPanel
            mappingRows={mappingRows}
            bqFileName={bqFileName}
            bqItems={bqItems}
            bqError={bqError}
            mappingError={mappingError}
            orphanRows={orphanRows}
            orphanInstanceCount={orphanInstanceCount}
            orphanPreview={orphanPreview}
            mappedLabelCount={mappedLabelCount}
            mappingCandidatesCount={mappingCandidates.length}
            totalPendingRates={totalPendingRates}
            contractBqCount={contractBqCount}
            compareMessage={compareMessage}
            onUpdateMapping={updateLabelMapping}
            onStageDraft={stageDraftMapping}
          />
        ) : activeTab === 'audit' ? (
          <AuditPanel
            auditResult={auditResult}
            auditState={auditState}
            auditError={auditError}
            auditDurationMs={auditDurationMs}
            onRunAudit={runAudit}
            canRun={v1State === 'ready' || v2State === 'ready'}
          />
        ) : activeTab === 'guide' ? (
          <GuidePage />
        ) : activeTab === 'dwg' ? (
          <DwgPanel
            result={dwgResult}
            loading={dwgLoading}
            error={dwgError}
            onUpload={() => dwgInputRef.current?.click()}
          />
        ) : activeTab === 'rvt' ? (
          <RvtAuditPanel
            rvtFile={rvtFile}
            rvtUrn={rvtUrn}
            convertStatus={rvtConvertStatus}
            convertProgress={rvtConvertProgress}
            convertError={rvtConvertError}
            auditResult={rvtAuditResult}
            auditDurationMs={rvtAuditDurationMs}
            creditCost={RVT_CREDIT_COST}
            onUpload={() => rvtInputRef.current?.click()}
            onRunAudit={runRvtAudit}
            canRunAudit={!!rvtFile && rvtConvertStatus === 'idle' && !!user}
          />
        ) : (
          <div className="flex flex-col border-t border-slate-700 bg-slate-900 px-4 py-4 lg:px-6">
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
        <div className={`mx-6 mt-4 rounded-2xl border px-4 py-3 text-sm ${billingNotice.tone === 'success' ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200' : 'border-blue-900/70 bg-blue-950/30 text-blue-200'}`}>
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
          {t('toast.creditsRefreshed', { error: creditsError })}
        </div>
      )}
      {showPaywall && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-700 bg-slate-900/95 p-8 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">{t('paywall.label')}</div>
            <h2 className="mt-4 text-3xl font-black text-white">{t('paywall.title')}</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">{t('paywall.message')}</p>
            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/70 px-4 py-4 text-sm text-slate-300">
              {t('paywall.balance')} <span className="font-black text-white">{creditsBalance ?? 0}</span> {t('paywall.unit')}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="flex-1 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                onClick={handleTopUpCheckout}
                disabled={isStartingCheckout || !user}
              >
                {isStartingCheckout ? t('paywall.redirecting') : t('paywall.topUp')}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-slate-600 bg-slate-800 px-5 py-4 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
                onClick={() => setShowPaywall(false)}
              >
                {t('paywall.close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {passwordRecovery && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900/95 p-8 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-400">{t('password.label')}</div>
            <h2 className="mt-4 text-2xl font-black text-white">{t('password.title')}</h2>
            <p className="mt-2 text-sm text-slate-400">{t('password.hint')}</p>
            <form
              className="mt-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setPasswordError('');
                if (newPassword.length < 6) {
                  setPasswordError(t('password.tooShort'));
                  return;
                }
                if (newPassword !== confirmPassword) {
                  setPasswordError(t('password.mismatch'));
                  return;
                }
                setPasswordUpdating(true);
                try {
                  await updatePassword(newPassword);
                  setNewPassword('');
                  setConfirmPassword('');
                  toast.success(t('password.success'));
                } catch (err: unknown) {
                  setPasswordError(err instanceof Error ? err.message : 'Failed to update password.');
                } finally {
                  setPasswordUpdating(false);
                }
              }}
            >
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('password.newPassword')}</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-600/20"
                  placeholder={t('password.newPlaceholder')}
                  minLength={6}
                  required
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('password.confirmPassword')}</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-2xl border border-slate-700/50 bg-slate-800/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-600/20"
                  placeholder={t('password.confirmPlaceholder')}
                  minLength={6}
                  required
                />
              </label>
              {passwordError && <div className="rounded-2xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{passwordError}</div>}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={passwordUpdating}
                  className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {passwordUpdating ? t('password.updating') : t('password.update')}
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-slate-600 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
                  onClick={() => { dismissPasswordRecovery(); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}
                >
                  {t('password.skip')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}


