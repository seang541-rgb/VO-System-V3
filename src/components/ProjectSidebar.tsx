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
  History,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProjectFile } from '../hooks/useProjectFiles';
import type { VOComparison } from '../hooks/useVOHistory';
import type { ActiveTab, ModelLoadState } from '../lib/format';
import type { AuditState } from './AuditPanel';

interface ProjectSidebarProps {
  baseFile: ProjectFile | null;
  revisionFile: ProjectFile | null;
  baseState: ModelLoadState;
  revisionState: ModelLoadState;
  baseComponentCount: number;
  revisionComponentCount: number;
  bqFileName: string;
  bqItemCount: number;
  voResults: unknown;
  isRunning: boolean;
  isExporting: boolean;
  activeTab: ActiveTab;
  auditState: AuditState;
  comparisons: VOComparison[];
  selectedComparisonId: string | null;
  onUploadBase: () => void;
  onUploadRevision: () => void;
  onUploadBq: () => void;
  onRunCompare: () => void;
  onExportExcel: () => void;
  onExportBqTemplate: () => void;
  onTabChange: (tab: ActiveTab) => void;
  onRunAudit: () => void;
  onSelectComparison: (id: string) => void;
}

function formatComparisonDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

export default function ProjectSidebar({
  baseFile,
  revisionFile,
  baseState,
  revisionState,
  baseComponentCount,
  revisionComponentCount,
  bqFileName,
  bqItemCount,
  voResults,
  isRunning,
  isExporting,
  activeTab,
  auditState,
  comparisons,
  selectedComparisonId,
  onUploadBase,
  onUploadRevision,
  onUploadBq,
  onRunCompare,
  onExportExcel,
  onExportBqTemplate,
  onTabChange,
  onRunAudit,
  onSelectComparison,
}: ProjectSidebarProps) {
  const { t } = useTranslation();

  const canCompare = baseState === 'ready' && revisionState === 'ready' && !isRunning;
  const canAudit = (baseState === 'ready' || revisionState === 'ready') && auditState !== 'running';
  const showCopilotTab = activeTab === 'copilot';
  const showOverviewTab = activeTab === 'overview';
  const showValuationTab = activeTab === 'valuation';
  const showAuditTab = activeTab === 'audit';

  return (
    <aside className="sticky top-[57px] flex h-[calc(100vh-57px)] w-72 flex-col gap-4 overflow-y-auto border-r border-slate-700 bg-slate-900 px-4 py-4">
      {/* Workspace files */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('workspace.files')}</div>
        <div className="space-y-2">
          {/* Base IFC */}
          <button
            type="button"
            onClick={onUploadBase}
            disabled={isRunning || baseState === 'loading'}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${
              baseState === 'loading'
                ? 'border-blue-500/40 bg-blue-600/10'
                : baseComponentCount > 0
                  ? 'border-blue-600/30 bg-blue-600/5'
                  : baseState === 'error'
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-slate-700 bg-slate-800/50'
            } disabled:cursor-not-allowed`}
          >
            {baseState === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            ) : baseState === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-400" />
            ) : (
              <FileBox className={`h-4 w-4 ${baseComponentCount > 0 ? 'text-blue-400' : 'text-slate-500'}`} />
            )}
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('status.baseIfc')}</div>
              {baseState === 'loading' ? (
                <>
                  <div className="truncate text-xs text-blue-300">{baseFile?.label ?? t('common.loading')}</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full animate-[loading-bar_2s_ease-in-out_infinite] rounded-full bg-blue-500" style={{ width: '60%' }} />
                  </div>
                  <div className="mt-0.5 text-[10px] text-blue-400">{t('sidebar.parsingIfc')}</div>
                </>
              ) : (
                <>
                  <div className={`truncate text-xs ${baseComponentCount > 0 ? 'text-white' : baseState === 'error' ? 'text-red-300' : 'text-slate-400'}`}>
                    {baseFile ? baseFile.label : t('sidebar.notLoaded')}
                  </div>
                  {baseComponentCount > 0 && (
                    <div className="text-[10px] text-slate-500">{baseComponentCount} {t('common.components')}</div>
                  )}
                </>
              )}
            </div>
          </button>

          {/* Revision IFC */}
          <button
            type="button"
            onClick={onUploadRevision}
            disabled={isRunning || revisionState === 'loading'}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${
              revisionState === 'loading'
                ? 'border-blue-500/40 bg-blue-600/10'
                : revisionComponentCount > 0
                  ? 'border-blue-600/30 bg-blue-600/5'
                  : revisionState === 'error'
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-slate-700 bg-slate-800/50'
            } disabled:cursor-not-allowed`}
          >
            {revisionState === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            ) : revisionState === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-400" />
            ) : (
              <FileBox className={`h-4 w-4 ${revisionComponentCount > 0 ? 'text-blue-400' : 'text-slate-500'}`} />
            )}
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('status.revisionIfc')}</div>
              {revisionState === 'loading' ? (
                <>
                  <div className="truncate text-xs text-blue-300">{revisionFile?.label ?? t('common.loading')}</div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full animate-[loading-bar_2s_ease-in-out_infinite] rounded-full bg-blue-500" style={{ width: '60%' }} />
                  </div>
                  <div className="mt-0.5 text-[10px] text-blue-400">{t('sidebar.parsingIfc')}</div>
                </>
              ) : (
                <>
                  <div className={`truncate text-xs ${revisionComponentCount > 0 ? 'text-white' : revisionState === 'error' ? 'text-red-300' : 'text-slate-400'}`}>
                    {revisionFile ? revisionFile.label : t('sidebar.notLoaded')}
                  </div>
                  {revisionComponentCount > 0 && (
                    <div className="text-[10px] text-slate-500">{revisionComponentCount} {t('common.components')}</div>
                  )}
                </>
              )}
            </div>
          </button>

          {/* Awarded BQ */}
          <button
            type="button"
            onClick={onUploadBq}
            disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${
              bqItemCount > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <FileSpreadsheet className={`h-4 w-4 ${bqItemCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('sidebar.awardedBq')}</div>
              <div className={`truncate text-xs ${bqItemCount > 0 ? 'text-white' : 'text-slate-400'}`}>
                {bqFileName || t('sidebar.notLoaded')}
              </div>
              <div className="text-[10px] text-slate-500">{bqItemCount} {t('sidebar.lineItemsReady')}</div>
            </div>
          </button>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('sidebar.quickActions')}</div>
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onRunAudit}
            disabled={!canAudit}
            className="group flex w-full items-center gap-2.5 rounded-lg bg-amber-600 px-3 py-2 text-left text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {auditState === 'running' ? (
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 flex-shrink-0" />
            )}
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{auditState === 'running' ? t('sidebar.auditing') : t('workspace.runAudit')}</div>
              <div className="truncate text-[10px] text-amber-200">{t('sidebar.auditSubtitle')}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={onRunCompare}
            disabled={!canCompare}
            className="group flex w-full items-center gap-2.5 rounded-lg bg-blue-600 px-3 py-2 text-left text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4 flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{t('workspace.runCompare')}</div>
              <div className="truncate text-[10px] text-blue-200">{t('sidebar.voSubtitle')}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            disabled={!voResults || isExporting}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{isExporting ? t('sidebar.checking') : t('workspace.exportExcel')}</div>
              <div className="truncate text-[10px] text-slate-500">{t('sidebar.exportSubtitle')}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={onExportBqTemplate}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
          >
            <FileText className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{t('workspace.bqTemplate')}</div>
              <div className="truncate text-[10px] text-slate-500">{t('sidebar.bqSubtitle')}</div>
            </div>
          </button>
        </div>
      </section>

      {/* Views */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('sidebar.views')}</div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onTabChange('copilot')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showCopilotTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${showCopilotTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('sidebar.copilot')}</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('audit')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showAuditTab ? 'bg-amber-600/20 text-amber-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <BarChart3 className={`h-3.5 w-3.5 flex-shrink-0 ${showAuditTab ? 'text-amber-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('sidebar.auditReport')}</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('overview')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showOverviewTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <Layers3 className={`h-3.5 w-3.5 flex-shrink-0 ${showOverviewTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('sidebar.modelDiff')}</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('valuation')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showValuationTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <ClipboardList className={`h-3.5 w-3.5 flex-shrink-0 ${showValuationTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">{t('sidebar.bqMapping')}</span>
          </button>
        </div>
      </section>

      {/* VO History */}
      <section>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          <History className="h-3 w-3" />
          {t('workspace.voHistory')}
        </div>
        {comparisons.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2.5 text-[11px] text-slate-500">
            {t('workspace.noHistory')}
          </div>
        ) : (
          <div className="space-y-1.5">
            {comparisons.map((comp) => {
              const summary = comp.summary_json;
              const isSelected = comp.id === selectedComparisonId;
              return (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => onSelectComparison(comp.id)}
                  className={`flex w-full flex-col gap-1 rounded-xl border px-3 py-2 text-left transition ${
                    isSelected
                      ? 'border-blue-500/40 bg-blue-600/10 text-blue-200'
                      : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="text-[10px] text-slate-500">{formatComparisonDate(comp.created_at)}</div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {summary.added > 0 && (
                      <span className="text-emerald-400">+{summary.added}</span>
                    )}
                    {summary.deleted > 0 && (
                      <span className="text-red-400">-{summary.deleted}</span>
                    )}
                    {summary.modified > 0 && (
                      <span className="text-amber-400">~{summary.modified}</span>
                    )}
                    <span className="ml-auto text-[10px] text-slate-500">{summary.totalChanges} {t('voCase.changes')}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Status */}
      <section className="mt-auto rounded-xl border border-slate-700 bg-slate-800/50 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('sidebar.status')}</div>
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('status.baseIfc')}</span>
            <span className="flex items-center gap-1">
              {baseState === 'loading' ? (
                <><Loader2 className="h-3 w-3 animate-spin text-blue-400" /><span className="text-blue-400">{t('sidebar.parsing')}</span></>
              ) : baseState === 'error' ? (
                <><AlertCircle className="h-3 w-3 text-red-400" /><span className="text-red-400">{t('sidebar.error')}</span></>
              ) : baseComponentCount > 0 ? (
                <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">{t('common.ready')}</span></>
              ) : (
                <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('common.pending')}</span></>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('status.revisionIfc')}</span>
            <span className="flex items-center gap-1">
              {revisionState === 'loading' ? (
                <><Loader2 className="h-3 w-3 animate-spin text-blue-400" /><span className="text-blue-400">{t('sidebar.parsing')}</span></>
              ) : revisionState === 'error' ? (
                <><AlertCircle className="h-3 w-3 text-red-400" /><span className="text-red-400">{t('sidebar.error')}</span></>
              ) : revisionComponentCount > 0 ? (
                <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">{t('common.ready')}</span></>
              ) : (
                <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('common.pending')}</span></>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t('status.comparison')}</span>
            <span className="flex items-center gap-1">
              {voResults ? (
                <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">{t('sidebar.done')}</span></>
              ) : (
                <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">{t('common.pending')}</span></>
              )}
            </span>
          </div>
        </div>
      </section>
    </aside>
  );
}
