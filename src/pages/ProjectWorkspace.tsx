import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BimComponent,
  BimEngine,
  BqLineItem,
  BqMappingContext,
  VoCommercialAction,
  VoComparisonResults,
  buildCommercialBreakdown,
} from '../BimEngine';
import type { ElementProperties, StoreyInfo, ElementTypeInfo } from '../BimEngine';
import { exportVoSubstantiationWorkbook } from '../vo-report';
import { parseBqWorkbook, exportBqTemplateWorkbook, normalizeBqUnit, recommendBqMatches } from '../bq-tools';
import { PROJECT_QS_OVERRIDES } from '../qs-project-config';
import ModelViewer from '../components/ModelViewer';
import KPIGrid from '../components/KPIGrid';
import ResultsTable from '../components/ResultsTable';
import BQMappingPanel from '../components/BQMappingPanel';
import CopilotPanel from '../components/CopilotPanel';
import AuditPanel from '../components/AuditPanel';
import ViewerErrorBoundary from '../components/ViewerErrorBoundary';
import type { AuditState } from '../components/AuditPanel';
import type { AuditResult } from '../audit/types';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { useCredits } from '../hooks/useCredits';
import { useProjectFiles } from '../hooks/useProjectFiles';
import type { ProjectFile } from '../hooks/useProjectFiles';
import { useVOHistory } from '../hooks/useVOHistory';
import { dispatchWebhookEvent } from '../hooks/useWebhooks';
import { useProjects } from '../hooks/useProjects';
import type { ToolContext } from '../agent/tools';
import {
  ArrowLeft,
  Sparkles,
  Layers3,
  BarChart3,
  ClipboardList,
  FileBox,
  Play,
  Download,
  Zap,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type ModelLoadState,
  type CompareState,
  type ActiveTab,
  buildBqMappingContext,
  guessUnitBySection,
  buildSystemUnitMismatchMessage,
  formatElementLabel,
  getActionChanges,
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
  formatActionFormworkAlert,
  formatActionStarRate,
  formatActionEotFlag,
  formatOpeningLink,
  formatStaticShield,
  modelStateLabel,
  summarizeLabels,
} from '../lib/format';

// Suppress unused-import warnings for re-exported format helpers used in JSX
void formatChangeLine;
void formatCommercialBasis;
void modelStateLabel;

const BQ_MAPPING_STORAGE_KEY = `vo-system-bq-mappings:${PROJECT_QS_OVERRIDES.projectName}`;
const CHECKOUT_BALANCE_STORAGE_KEY = 'vo-system:checkout-balance';
const CHECKOUT_CREDIT_TOP_UP_AMOUNT = 50;

export default function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();


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
  const [bqItems, setBqItems] = useState<BqLineItem[]>([]);
  const [bqFileName, setBqFileName] = useState('No BQ uploaded');
  const [bqError, setBqError] = useState('');
  const [ocrFile, setOcrFile] = useState<File | null>(null);
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

  // 3D feature state
  const [storeys, setStoreys] = useState<StoreyInfo[]>([]);
  const [elementTypes, setElementTypes] = useState<ElementTypeInfo[]>([]);
  const [activeStoreyFilter, setActiveStoreyFilter] = useState<number | null>(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState<number[] | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isIsolationActive, setIsIsolationActive] = useState(false);
  const [pickedElement, setPickedElement] = useState<ElementProperties | null>(null);

  // Project-scoped persistence state
  const [selectedComparisonId, setSelectedComparisonId] = useState<string | null>(null);
  const [activeBaseFile, setActiveBaseFile] = useState<ProjectFile | null>(null);
  const [activeRevisionFile, setActiveRevisionFile] = useState<ProjectFile | null>(null);

  const { user, signOut } = useAuth();
  const { balance: creditsBalance, loading: creditsLoading, error: creditsError, refresh: refreshCredits, setBalance: setCreditsBalance } = useCredits(user?.id);

  // Project-scoped hooks
  const { activeProjects } = useProjects(user?.id);
  const currentProject = activeProjects.find((p) => p.id === projectId);
  const projectName = currentProject?.name ?? 'Project';
  const projectFiles = useProjectFiles(projectId);
  const voHistory = useVOHistory(projectId);

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BimEngine | null>(null);
  const handledCheckoutStateRef = useRef<string | null>(null);
  const v1InputRef = useRef<HTMLInputElement>(null);
  const v2InputRef = useRef<HTMLInputElement>(null);
  const bqInputRef = useRef<HTMLInputElement>(null);
  const resultsTableScrollRef = useRef<HTMLDivElement>(null);
  const resultsScrollbarRef = useRef<HTMLDivElement>(null);
  const resultsScrollbarInnerRef = useRef<HTMLDivElement>(null);
  const restoredLatestComparisonRef = useRef(false);

  // Suppress unused variable warnings for legacy state used only in JSX
  void showLegacyBanner;
  void setShowLegacyBanner;
  void signOut;
  void creditsLoading;

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new BimEngine(containerRef.current);
    engineRef.current = engine;
    engine.onLog = (text) => setSysLog(text);
    // DEV: expose for debugging
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__engine = engine;

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

  // Populate storey/type lists after model load
  const refreshViewerMetadata = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setStoreys(engine.getStoreys());
    setElementTypes(engine.getElementTypes());
  }, []);

  const handleFilterStorey = useCallback((storeyId: number | null) => {
    setActiveStoreyFilter(storeyId);
    engineRef.current?.filterByStorey(storeyId);
  }, []);

  const handleFilterType = useCallback((typeCodes: number[] | null) => {
    setActiveTypeFilter(typeCodes);
    engineRef.current?.filterByType(typeCodes);
  }, []);

  const handleToggleMeasurement = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isMeasuring) {
      engine.disableMeasurement();
      setIsMeasuring(false);
    } else {
      engine.disablePicking();
      engine.enableMeasurement((distance, points) => {
        setSysLog(`Measurement: ${distance.toFixed(3)} m between (${points[0].x.toFixed(2)}, ${points[0].y.toFixed(2)}, ${points[0].z.toFixed(2)}) and (${points[1].x.toFixed(2)}, ${points[1].y.toFixed(2)}, ${points[1].z.toFixed(2)})`);
      });
      setIsMeasuring(true);
    }
  }, [isMeasuring]);

  const handleCaptureScreenshot = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const dataUrl = engine.captureScreenshot();
      const link = document.createElement('a');
      link.download = `vo-screenshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      setSysLog('Screenshot saved.');
      toast.success('Screenshot exported');
    } catch {
      setSysLog('Screenshot capture failed.');
    }
  }, []);

  const handleClippingHeight = useCallback((value: number) => {
    engineRef.current?.setClippingHeight(value);
  }, []);

  const handleClearIsolation = useCallback(() => {
    engineRef.current?.clearIsolation();
    setIsIsolationActive(false);
  }, []);

  const handleClearMeasurements = useCallback(() => {
    engineRef.current?.clearMeasurements();
    engineRef.current?.disableMeasurement();
    setIsMeasuring(false);
  }, []);

  const handleDismissPickedElement = useCallback(() => {
    setPickedElement(null);
  }, []);

  // Enable picking by default when on 3D tab (unless measuring)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (activeTab === 'overview' && !isMeasuring) {
      engine.enablePicking((props) => {
        setPickedElement(props);
      });
    } else {
      engine.disablePicking();
    }
    return () => {
      engine.disablePicking();
    };
  }, [activeTab, isMeasuring]);

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
    if (restoredLatestComparisonRef.current || voHistory.loading || voHistory.comparisons.length === 0 || voResults) {
      return;
    }
    const latest = voHistory.comparisons[0];
    restoredLatestComparisonRef.current = true;
    setSelectedComparisonId(latest.id);
    setVoResults(latest.results_json as VoComparisonResults);
    setCompareState('success');
    setCompareMessage('Restored the latest saved comparison for this project.');
  }, [voHistory.comparisons, voHistory.loading, voResults]);

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
      setErr(`文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，上限 100MB`);
      toast.error(`文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，上限 100MB`);
      e.target.value = '';
      return;
    }

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
      refreshViewerMetadata();
      setSysLog(`${label} loaded: ${components.length} indexed elements.`);
      toast.success(`${label} 加载完成 · ${components.length} 构件`);

      // Save to project if authenticated
      if (user && projectId) {
        const savedFile = await projectFiles.upload(
          user.id,
          file,
          file.name,
          version === 'v1' ? 'base' : 'revision',
          components.length,
        );
        if (savedFile) {
          if (version === 'v1') {
            setActiveBaseFile(savedFile);
          } else {
            setActiveRevisionFile(savedFile);
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown parsing error';
      setState('error');
      setError(message);
      setSysLog(`Failed to parse ${label}: ${message}`);
      toast.error(`${label} 加载失败`);
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

  const runAudit = useCallback(async () => {
    const engine = ensureEngine();
    if (!engine) return;
    const handle = engine.getIfcHandle();
    if (!handle) {
      setAuditError('IFC engine not ready. Load an IFC file first.');
      setAuditState('error');
      return;
    }
    setAuditState('running');
    setAuditError('');
    setAuditResult(null);
    setActiveTab('audit');
    const t0 = performance.now();
    try {
      const { runAudit: doAudit } = await import('../audit/extractor');
      const result = doAudit({ api: handle.api, modelID: handle.modelID });
      const duration = performance.now() - t0;
      setAuditDurationMs(duration);
      setAuditResult(result);
      setAuditState('done');
      setSysLog(`Audit complete: ${result.records.length} elements in ${(duration / 1000).toFixed(1)}s`);
      toast.success(`算量完成 · ${result.records.length} 构件 · ${(duration / 1000).toFixed(1)}s`);
    } catch (err) {
      setAuditDurationMs(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      setAuditError(message);
      setAuditState('error');
      setSysLog(`Audit failed: ${message}`);
      toast.error(`算量失败: ${message}`);
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
      const commercial = buildCommercialBreakdown(results, buildBqMappingContext(bqItems, labelMappings));
      const valuationReady = commercial.actions.length > 0 && commercial.summary.pendingRateActions === 0;
      const valuationStatus = valuationReady
        ? `Net rated value: ${formatSignedCurrencyValue(commercial.summary.netValue)}. Protected value requires separate verified valuation basis.`
        : 'Valuation pending: upload and verify project BQ/rate information.';
      setCompareMessage(
        `Comparison complete. Raw: ${results.modified.length} modified. Commercial: ${commercial.summary.omissions} omissions, ${commercial.summary.additions} additions. Pending rates: ${commercial.summary.pendingRateActions}. ${valuationStatus}`,
      );

      try {
        engine.applyDiffVisualization(results);
      } catch (highlightError: unknown) {
        const message = highlightError instanceof Error ? highlightError.message : '3D highlight failed';
        setSysLog(`VO Complete, but 3D highlight failed: ${message}`);
      }

      // Switch to 3D tab to show diff visualization
      setActiveTab('overview');

      setSysLog(
        `VO Complete: ${results.added.length} Added, ${results.deleted.length} Deleted, ${results.modified.length} Modified. Commercial: ${commercial.summary.omissions} omissions, ${commercial.summary.additions} additions. Pending rates: ${commercial.summary.pendingRateActions}. ${valuationStatus}`,
      );
      toast.success('VO 对比完成');

      // Save comparison to project history
      if (activeBaseFile && activeRevisionFile) {
        const saved = await voHistory.saveComparison(
          activeBaseFile.id,
          activeRevisionFile.id,
          {
            added: results.added.length,
            deleted: results.deleted.length,
            modified: results.modified.length,
            totalChanges: results.added.length + results.deleted.length + results.modified.length,
          },
          results,
        );
        if (saved) setSelectedComparisonId(saved.id);
      }
      if (projectId) {
        void dispatchWebhookEvent('comparison.completed', {
          projectId,
          summary: {
            added: results.added.length,
            deleted: results.deleted.length,
            modified: results.modified.length,
            netValue: valuationReady ? commercial.summary.netValue : null,
            valuationStatus: valuationReady ? 'verified_user_bq' : 'requires_user_bq',
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown comparison error';
      setVoResults(null);
      setCompareState('error');
      setCompareMessage(`Comparison failed: ${message}`);
      setSysLog(`VO Analysis Failed: ${message}`);
      toast.error('VO 对比失败');
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
      if (projectId) {
        void dispatchWebhookEvent('report.generated', {
          projectId,
          format: 'excel',
          summary: {
            added: voResults.added.length,
            deleted: voResults.deleted.length,
            modified: voResults.modified.length,
          },
        });
      }
      setSysLog('Premium VO Excel generated. One audit credit consumed from the secure cloud balance.');
      toast.success('Excel 已导出');
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
        body: { return_path: window.location.pathname },
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

  const handleSelectComparison = (compId: string) => {
    const comp = voHistory.comparisons.find((c) => c.id === compId);
    if (!comp) return;
    setSelectedComparisonId(compId);
    setVoResults(comp.results_json as VoComparisonResults);
    setCompareState('success');
  };

  const pricingContext = useMemo(() => buildBqMappingContext(bqItems, labelMappings), [bqItems, labelMappings]);
  const commercialBreakdown = useMemo(() => voResults ? buildCommercialBreakdown(voResults, pricingContext) : null, [voResults, pricingContext]);
  const safeCommercialActions = Array.isArray(commercialBreakdown?.actions)
    ? commercialBreakdown.actions.filter((action): action is VoCommercialAction => Boolean(action?.component))
    : [];
  const valuationReady = safeCommercialActions.length > 0
    && safeCommercialActions.every((action) => action.rateStatus === 'rated');
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
      protectedValue: action.protectedValue > 0 ? 'Pending verification' : '-',
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
        (t) => (
          <div className="text-sm">
            <p className="font-semibold text-slate-100">Bulk Mapping</p>
            <p className="mt-1 text-slate-300">
              Detected {bulkEligibleInstanceCount} matching instances across {bulkEligibleLabels.length} compatible QS descriptions. Apply <span className="font-mono text-blue-300">{item.itemReference}</span> to all?
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500" onClick={() => {
                applyLabels(bulkEligibleLabels);
                setSysLog(`Bulk lock applied: ${item.itemReference} mounted to ${bulkEligibleLabels.length} QS descriptions covering ${bulkEligibleInstanceCount} model instances.`);
                toast.dismiss(t.id);
              }}>Apply All</button>
              <button type="button" className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700" onClick={() => toast.dismiss(t.id)}>Skip</button>
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

  // Suppress unused variable
  void canCompare;
  void showCopilotTab;

  const runCompareForAgent = useCallback(async (): Promise<VoComparisonResults | null> => {
    const engine = ensureEngine();
    if (!engine || v1State !== 'ready' || v2State !== 'ready') return null;
    const results = await engine.compareModels(v1Components, v2Components);
    setVoResults(results);
    setCompareState('success');
    if (activeBaseFile && activeRevisionFile) {
      const saved = await voHistory.saveComparison(
        activeBaseFile.id,
        activeRevisionFile.id,
        {
          added: results.added.length,
          deleted: results.deleted.length,
          modified: results.modified.length,
          totalChanges: results.added.length + results.deleted.length + results.modified.length,
        },
        results,
      );
      if (saved) setSelectedComparisonId(saved.id);
    }
    try {
      engine.highlightComparison(results);
    } catch {
      /* highlight failures do not block tool result */
    }
    return results;
  }, [v1State, v2State, v1Components, v2Components, activeBaseFile, activeRevisionFile, voHistory.saveComparison]);

  const agentToolContext: ToolContext = useMemo(() => ({
    baseComponents: v1Components,
    revisionComponents: v2Components,
    voResults,
    bqItems,
    bqContext: buildBqMappingContext(bqItems, labelMappings),
    bqFileName,
    ocrFile,
    baseFileName: v1File?.name ?? null,
    revisionFileName: v2File?.name ?? null,
    runCompare: runCompareForAgent,
    dispatchEvent: (eventType, payload) => {
      if (projectId) void dispatchWebhookEvent(eventType, { projectId, ...payload });
    },
    getActiveIfcHandle: () => {
      const handle = engineRef.current?.getIfcHandle() ?? null;
      // DEV ONLY: expose to window for console debugging.
      if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__ifcHandle = handle;
      return handle;
    },
    activeIfcSlot,
  }), [v1Components, v2Components, voResults, bqItems, bqFileName, labelMappings, ocrFile, v1File, v2File, runCompareForAgent, projectId, activeIfcSlot]);

  const canCompareForPanel = v1State === 'ready' && v2State === 'ready' && !isRunning;
  const canAuditForPanel = (v1State === 'ready' || v2State === 'ready') && auditState !== 'running';

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode; activeClass: string }[] = [
    { key: 'copilot', label: 'Copilot', icon: <Sparkles className="h-3.5 w-3.5" />, activeClass: 'bg-blue-600 text-white' },
    { key: 'overview', label: '3D', icon: <Layers3 className="h-3.5 w-3.5" />, activeClass: 'bg-blue-600 text-white' },
    { key: 'audit', label: 'Audit', icon: <BarChart3 className="h-3.5 w-3.5" />, activeClass: 'bg-amber-600 text-white' },
    { key: 'valuation', label: 'BQ', icon: <ClipboardList className="h-3.5 w-3.5" />, activeClass: 'bg-blue-600 text-white' },
  ];

  function formatComparisonDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Hidden file inputs */}
      <input ref={v1InputRef} type="file" className="hidden" accept=".ifc,.IFC,application/octet-stream" onChange={(e) => handleIFCUpload(e, 'v1')} disabled={isRunning} />
      <input ref={v2InputRef} type="file" className="hidden" accept=".ifc,.IFC,application/octet-stream" onChange={(e) => handleIFCUpload(e, 'v2')} disabled={isRunning} />
      <input ref={bqInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleBqUpload} disabled={isRunning} />

      {/* Top toolbar */}
      <div className="flex h-12 shrink-0 items-center border-b border-slate-700 bg-slate-900 px-4">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="ml-3 text-sm font-medium text-white truncate max-w-[180px]">{projectName}</span>

        <div className="flex-1" />

        {/* View tabs */}
        <div className="flex gap-1 rounded-xl bg-slate-800 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? tab.activeClass
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />
      </div>

      {/* Content + Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
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
                  storeys={storeys}
                  elementTypes={elementTypes}
                  activeStoreyFilter={activeStoreyFilter}
                  activeTypeFilter={activeTypeFilter}
                  isMeasuring={isMeasuring}
                  isIsolationActive={isIsolationActive}
                  pickedElement={pickedElement}
                  onFilterStorey={handleFilterStorey}
                  onFilterType={handleFilterType}
                  onToggleMeasurement={handleToggleMeasurement}
                  onCaptureScreenshot={handleCaptureScreenshot}
                  onClippingHeight={handleClippingHeight}
                  onClearIsolation={handleClearIsolation}
                  onClearMeasurements={handleClearMeasurements}
                  onDismissPickedElement={handleDismissPickedElement}
                />
              </ViewerErrorBoundary>
            </div>

            {showOverviewTab ? (
              showReportPanel ? (
                <div className="flex flex-col border-t border-slate-700 bg-slate-900">
                  <div className="border-b border-slate-800 bg-slate-800 p-3 text-xs font-bold uppercase tracking-widest text-blue-400">VO Variation Results</div>
                  {compareState === 'error' ? (
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
                        valuationReady={valuationReady}
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
            ) : (
              <div className="flex flex-1 flex-col bg-slate-900">
                {/* Centered copilot chat */}
                <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
                  <div className="min-h-[36rem]">
                    <CopilotPanel
                      toolContext={agentToolContext}
                      signedIn={!!user}
                      projectId={projectId}
                      userId={user?.id}
                      onCreditsUpdate={(balance) => setCreditsBalance(balance)}
                      onDocumentSelected={setOcrFile}
                    />
                  </div>
                </div>

                {/* Compact action bar */}
                <div className="border-t border-slate-700/50 bg-slate-900/80 px-4 py-2">
                  <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
                    {/* Base IFC */}
                    <button
                      type="button"
                      onClick={() => v1InputRef.current?.click()}
                      disabled={isRunning || v1State === 'loading'}
                      className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {v1State === 'loading' ? (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                      ) : v1Components.length > 0 ? (
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      ) : (
                        <FileBox className="h-3 w-3 text-slate-500" />
                      )}
                      {v1File ? <span className="max-w-[120px] truncate">{v1File.name}</span> : 'Upload Base'}
                    </button>

                    {/* Revision IFC */}
                    <button
                      type="button"
                      onClick={() => v2InputRef.current?.click()}
                      disabled={isRunning || v2State === 'loading'}
                      className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {v2State === 'loading' ? (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                      ) : v2Components.length > 0 ? (
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      ) : (
                        <FileBox className="h-3 w-3 text-slate-500" />
                      )}
                      {v2File ? <span className="max-w-[120px] truncate">{v2File.name}</span> : 'Upload Revision'}
                    </button>

                    {/* Run Audit */}
                    <button
                      type="button"
                      onClick={runAudit}
                      disabled={!canAuditForPanel}
                      className="flex items-center gap-1.5 rounded-full bg-amber-600/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {auditState === 'running' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                      {auditState === 'running' ? 'Auditing...' : 'Run Audit'}
                    </button>

                    {/* Run Compare */}
                    <button
                      type="button"
                      onClick={runVOComparison}
                      disabled={!canCompareForPanel}
                      className="flex items-center gap-1.5 rounded-full bg-blue-600/90 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Play className="h-3 w-3" />
                      Run Compare
                    </button>

                    {/* Export Excel */}
                    <button
                      type="button"
                      onClick={exportWorkbook}
                      disabled={!voResults || isExporting}
                      className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download className="h-3 w-3" />
                      {isExporting ? 'Exporting...' : 'Export Excel'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

      </div>

      {/* Floating notifications */}
      {billingNotice && (
        <div className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-xl ${billingNotice.tone === 'success' ? 'border-emerald-900/70 bg-emerald-950/90 text-emerald-200' : 'border-blue-900/70 bg-blue-950/90 text-blue-200'}`}>
          {billingNotice.message}
        </div>
      )}
      {billingError && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-red-900/70 bg-red-950/90 px-4 py-3 text-sm text-red-200 shadow-xl">
          {billingError}
        </div>
      )}
      {creditsError && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm rounded-2xl border border-amber-900/70 bg-amber-950/90 px-4 py-3 text-sm text-amber-200 shadow-xl">
          Failed to refresh credits: {creditsError}
        </div>
      )}
      {showPaywall && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-700 bg-slate-900/95 p-8 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">Premium Audit Paywall</div>
            <h2 className="mt-4 text-3xl font-black text-white">Your 5 Free Premium Audits are Exhausted.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-400">Unlock the full Star Rate Build-up and VO Commercial Report to claim your RM 50,000+ profit.</p>
            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/70 px-4 py-4 text-sm text-slate-300">
              Current balance: <span className="font-black text-white">{creditsBalance ?? 0}</span> premium audits
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="flex-1 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                onClick={handleTopUpCheckout}
                disabled={isStartingCheckout || !user}
              >
                {isStartingCheckout ? 'Redirecting...' : 'Top Up 50 Credits - RM 499'}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-slate-600 bg-slate-800 px-5 py-4 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
                onClick={() => setShowPaywall(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
