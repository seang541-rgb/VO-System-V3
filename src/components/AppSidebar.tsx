import {
  FileBox,
  FileSpreadsheet,
  FileText,
  Play,
  Download,
  Sparkles,
  Layers3,
  ClipboardList,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Zap,
  BarChart3,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BimComponent, BqLineItem, VoComparisonResults } from '../BimEngine';
import type { ActiveTab, ModelLoadState } from '../lib/format';
import type { AuditState } from './AuditPanel';

interface AppSidebarProps {
  v1File: File | null;
  v2File: File | null;
  bqFileName: string;
  v1Components: BimComponent[];
  v2Components: BimComponent[];
  bqItems: BqLineItem[];
  v1State: ModelLoadState;
  v2State: ModelLoadState;
  voResults: VoComparisonResults | null;
  isRunning: boolean;
  isExporting: boolean;
  activeTab: ActiveTab;
  onUploadBase: () => void;
  onUploadRevision: () => void;
  onUploadBq: () => void;
  onRunCompare: () => void;
  onExportExcel: () => void;
  onExportBqTemplate: () => void;
  onTabChange: (tab: ActiveTab) => void;
  onRunAudit: () => void;
  auditState: AuditState;
}

export default function AppSidebar({
  v1File, v2File, bqFileName,
  v1Components, v2Components, bqItems,
  v1State, v2State, voResults,
  isRunning, isExporting, activeTab,
  onUploadBase, onUploadRevision, onUploadBq,
  onRunCompare, onExportExcel, onExportBqTemplate,
  onTabChange, onRunAudit, auditState,
}: AppSidebarProps) {
  const { t } = useTranslation();
  const canCompare = v1State === 'ready' && v2State === 'ready' && !isRunning;
  const canAudit = (v1State === 'ready' || v2State === 'ready') && auditState !== 'running';
  const showCopilotTab = activeTab === 'copilot';
  const showOverviewTab = activeTab === 'overview';
  const showValuationTab = activeTab === 'valuation';
  const showAuditTab = activeTab === 'audit';

  return (
    <aside className="sticky top-[57px] flex h-[calc(100vh-57px)] w-72 flex-col gap-4 overflow-y-auto border-r border-slate-700 bg-slate-900 px-4 py-4">
      {/* Workspace files */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('sidebar.workspace')}</div>
        <div className="space-y-2">
          <button type="button" onClick={onUploadBase} disabled={isRunning || v1State === 'loading'}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${v1State === 'loading' ? 'border-blue-500/40 bg-blue-600/10' : v1Components.length > 0 ? 'border-blue-600/30 bg-blue-600/5' : v1State === 'error' ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed`}>
            {v1State === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : v1State === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" /> : <FileBox className={`h-4 w-4 ${v1Components.length > 0 ? 'text-blue-400' : 'text-slate-500'}`} />}
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('sidebar.baseIfc')}</div>
              {v1State === 'loading' ? (
                <>
                  <div className="truncate text-xs text-blue-300">{v1File?.name ?? 'Loading...'}</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full animate-[loading-bar_2s_ease-in-out_infinite] rounded-full bg-blue-500" style={{ width: '60%' }} />
                  </div>
                  <div className="mt-0.5 text-[10px] text-blue-400">{t('sidebar.parsingIfc')}</div>
                </>
              ) : (
                <>
                  <div className={`truncate text-xs ${v1Components.length > 0 ? 'text-white' : v1State === 'error' ? 'text-red-300' : 'text-slate-400'}`}>
                    {v1File ? v1File.name : t('sidebar.notLoaded')}
                  </div>
                  {v1Components.length > 0 && <div className="text-[10px] text-slate-500">{v1Components.length} {t('sidebar.components')}</div>}
                </>
              )}
            </div>
          </button>
          <button type="button" onClick={onUploadRevision} disabled={isRunning || v2State === 'loading'}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${v2State === 'loading' ? 'border-blue-500/40 bg-blue-600/10' : v2Components.length > 0 ? 'border-blue-600/30 bg-blue-600/5' : v2State === 'error' ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed`}>
            {v2State === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : v2State === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" /> : <FileBox className={`h-4 w-4 ${v2Components.length > 0 ? 'text-blue-400' : 'text-slate-500'}`} />}
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('sidebar.revisionIfc')}</div>
              {v2State === 'loading' ? (
                <>
                  <div className="truncate text-xs text-blue-300">{v2File?.name ?? 'Loading...'}</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full animate-[loading-bar_2s_ease-in-out_infinite] rounded-full bg-blue-500" style={{ width: '60%' }} />
                  </div>
                  <div className="mt-0.5 text-[10px] text-blue-400">{t('sidebar.parsingIfc')}</div>
                </>
              ) : (
                <>
                  <div className={`truncate text-xs ${v2Components.length > 0 ? 'text-white' : v2State === 'error' ? 'text-red-300' : 'text-slate-400'}`}>
                    {v2File ? v2File.name : t('sidebar.notLoaded')}
                  </div>
                  {v2Components.length > 0 && <div className="text-[10px] text-slate-500">{v2Components.length} {t('sidebar.components')}</div>}
                </>
              )}
            </div>
          </button>
          <button type="button" onClick={onUploadBq} disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${bqItems.length > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FileSpreadsheet className={`h-4 w-4 ${bqItems.length > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('sidebar.awardedBq')}</div>
              <div className={`truncate text-xs ${bqItems.length > 0 ? 'text-white' : 'text-slate-400'}`}>
                {bqFileName || 'Built-in Test BQ Library'}
              </div>
              <div className="text-[10px] text-slate-500">{bqItems.length} {t('sidebar.lineItemsReady')}</div>
            </div>
          </button>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('sidebar.quickActions')}</div>
        <div className="space-y-1.5">
          <button type="button" onClick={onRunAudit} disabled={!canAudit}
            className="group flex w-full items-center gap-2.5 rounded-lg bg-amber-600 px-3 py-2 text-left text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40">
            {auditState === 'running' ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" /> : <Zap className="h-4 w-4 flex-shrink-0" />}
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{auditState === 'running' ? t('sidebar.auditing') : t('sidebar.runAudit')}</div>
              <div className="truncate text-[10px] text-amber-200">{t('sidebar.auditSubtitle')}</div>
            </div>
          </button>
          <button type="button" onClick={onRunCompare} disabled={!canCompare}
            className="group flex w-full items-center gap-2.5 rounded-lg bg-blue-600 px-3 py-2 text-left text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-4 w-4 flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{t('sidebar.runVo')}</div>
              <div className="truncate text-[10px] text-blue-200">{t('sidebar.voSubtitle')}</div>
            </div>
          </button>
          <button type="button" onClick={onExportExcel} disabled={!voResults || isExporting}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Download className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{isExporting ? t('sidebar.checking') : t('sidebar.exportExcel')}</div>
              <div className="truncate text-[10px] text-slate-500">{t('sidebar.exportSubtitle')}</div>
            </div>
          </button>
          <button type="button" onClick={onExportBqTemplate}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white">
            <FileText className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{t('sidebar.bqTemplate')}</div>
              <div className="truncate text-[10px] text-slate-500">{t('sidebar.bqSubtitle')}</div>
            </div>
          </button>
        </div>
      </section>

      {/* Views */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('sidebar.views')}</div>
        <div className="space-y-1">
          <button type="button" onClick={() => onTabChange('copilot')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showCopilotTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${showCopilotTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('sidebar.copilot')}</span>
          </button>
          <button type="button" onClick={() => onTabChange('audit')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showAuditTab ? 'bg-amber-600/20 text-amber-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <BarChart3 className={`h-3.5 w-3.5 flex-shrink-0 ${showAuditTab ? 'text-amber-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('sidebar.auditReport')}</span>
          </button>
          <button type="button" onClick={() => onTabChange('overview')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showOverviewTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Layers3 className={`h-3.5 w-3.5 flex-shrink-0 ${showOverviewTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('sidebar.modelDiff')}</span>
          </button>
          <button type="button" onClick={() => onTabChange('valuation')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showValuationTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <ClipboardList className={`h-3.5 w-3.5 flex-shrink-0 ${showValuationTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('sidebar.bqMapping')}</span>
          </button>
        </div>
      </section>

      {/* Status */}
      <section className="mt-auto rounded-xl border border-slate-700 bg-slate-800/50 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('sidebar.status')}</div>
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('sidebar.baseIfc')}</span>
            <span className="flex items-center gap-1">
              {v1State === 'loading' ? <><Loader2 className="h-3 w-3 animate-spin text-blue-400" /><span className="text-blue-400">{t('sidebar.parsing')}</span></> : v1State === 'error' ? <><AlertCircle className="h-3 w-3 text-red-400" /><span className="text-red-400">{t('sidebar.error')}</span></> : v1Components.length > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">{t('sidebar.ready')}</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('sidebar.pending')}</span></>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('sidebar.revisionIfc')}</span>
            <span className="flex items-center gap-1">
              {v2State === 'loading' ? <><Loader2 className="h-3 w-3 animate-spin text-blue-400" /><span className="text-blue-400">{t('sidebar.parsing')}</span></> : v2State === 'error' ? <><AlertCircle className="h-3 w-3 text-red-400" /><span className="text-red-400">{t('sidebar.error')}</span></> : v2Components.length > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">{t('sidebar.ready')}</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('sidebar.pending')}</span></>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('sidebar.comparison')}</span>
            <span className="flex items-center gap-1">
              {voResults ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">{t('sidebar.done')}</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('sidebar.pending')}</span></>}
            </span>
          </div>
        </div>
      </section>
    </aside>
  );
}
