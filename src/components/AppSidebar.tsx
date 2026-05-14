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
} from 'lucide-react';
import type { BimComponent, BqLineItem, VoComparisonResults } from '../BimEngine';
import type { ActiveTab, ModelLoadState } from '../lib/format';

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
}

export default function AppSidebar({
  v1File, v2File, bqFileName,
  v1Components, v2Components, bqItems,
  v1State, v2State, voResults,
  isRunning, isExporting, activeTab,
  onUploadBase, onUploadRevision, onUploadBq,
  onRunCompare, onExportExcel, onExportBqTemplate,
  onTabChange,
}: AppSidebarProps) {
  const canCompare = v1State === 'ready' && v2State === 'ready' && !isRunning;
  const showCopilotTab = activeTab === 'copilot';
  const showOverviewTab = activeTab === 'overview';
  const showValuationTab = activeTab === 'valuation';

  return (
    <aside className="sticky top-[57px] flex h-[calc(100vh-57px)] w-72 flex-col gap-4 overflow-y-auto border-r border-slate-700 bg-slate-900 px-4 py-4">
      {/* Workspace files */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Workspace</div>
        <div className="space-y-2">
          <button type="button" onClick={onUploadBase} disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${v1Components.length > 0 ? 'border-blue-600/30 bg-blue-600/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FileBox className={`h-4 w-4 ${v1Components.length > 0 ? 'text-blue-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Base IFC</div>
              <div className={`truncate text-xs ${v1Components.length > 0 ? 'text-white' : 'text-slate-400'}`}>
                {v1File ? v1File.name : 'Not loaded · click to upload'}
              </div>
              {v1Components.length > 0 && <div className="text-[10px] text-slate-500">{v1Components.length} components</div>}
            </div>
          </button>
          <button type="button" onClick={onUploadRevision} disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${v2Components.length > 0 ? 'border-blue-600/30 bg-blue-600/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FileBox className={`h-4 w-4 ${v2Components.length > 0 ? 'text-blue-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Revision IFC</div>
              <div className={`truncate text-xs ${v2Components.length > 0 ? 'text-white' : 'text-slate-400'}`}>
                {v2File ? v2File.name : 'Not loaded · click to upload'}
              </div>
              {v2Components.length > 0 && <div className="text-[10px] text-slate-500">{v2Components.length} components</div>}
            </div>
          </button>
          <button type="button" onClick={onUploadBq} disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${bqItems.length > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FileSpreadsheet className={`h-4 w-4 ${bqItems.length > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Awarded BQ</div>
              <div className={`truncate text-xs ${bqItems.length > 0 ? 'text-white' : 'text-slate-400'}`}>
                {bqFileName || 'Built-in Test BQ Library'}
              </div>
              <div className="text-[10px] text-slate-500">{bqItems.length} line items ready</div>
            </div>
          </button>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Quick Actions</div>
        <div className="space-y-1.5">
          <button type="button" onClick={onRunCompare} disabled={!canCompare}
            className="group flex w-full items-center gap-2.5 rounded-lg bg-blue-600 px-3 py-2 text-left text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-4 w-4 flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">Run VO Comparison</div>
              <div className="truncate text-[10px] text-blue-200">对比 base / revision</div>
            </div>
          </button>
          <button type="button" onClick={onExportExcel} disabled={!voResults || isExporting}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Download className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{isExporting ? 'Checking...' : 'Export VO Excel'}</div>
              <div className="truncate text-[10px] text-slate-500">生成实证报告</div>
            </div>
          </button>
          <button type="button" onClick={onExportBqTemplate}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white">
            <FileText className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">BQ Template</div>
              <div className="truncate text-[10px] text-slate-500">下载模板</div>
            </div>
          </button>
        </div>
      </section>

      {/* Views */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Views</div>
        <div className="space-y-1">
          <button type="button" onClick={() => onTabChange('copilot')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showCopilotTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${showCopilotTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">IFC Copilot</span>
          </button>
          <button type="button" onClick={() => onTabChange('overview')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showOverviewTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Layers3 className={`h-3.5 w-3.5 flex-shrink-0 ${showOverviewTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">3D Model & Diff</span>
          </button>
          <button type="button" onClick={() => onTabChange('valuation')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showValuationTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <ClipboardList className={`h-3.5 w-3.5 flex-shrink-0 ${showValuationTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">BQ Mapping & Valuation</span>
          </button>
        </div>
      </section>

      {/* Status */}
      <section className="mt-auto rounded-xl border border-slate-700 bg-slate-800/50 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Status</div>
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Base IFC</span>
            <span className="flex items-center gap-1">
              {v1Components.length > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Ready</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">Pending</span></>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Revision IFC</span>
            <span className="flex items-center gap-1">
              {v2Components.length > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Ready</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">Pending</span></>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Comparison</span>
            <span className="flex items-center gap-1">
              {voResults ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Done</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">Pending</span></>}
            </span>
          </div>
        </div>
      </section>
    </aside>
  );
}
