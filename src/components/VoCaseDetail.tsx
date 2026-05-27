// VO Case Detail — 单个 Case 的详情视图
// 包含：状态信息、分析快照、审批操作、Evidence 时间线

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VoCase, EvidenceEntry, OrchestratorAction, VoCaseAnalysisSnapshot } from '../agent/vo-case-types';
import VoCaseStatusBadge from './VoCaseStatusBadge';
import EvidenceTimeline from './EvidenceTimeline';
import { useVoCaseProgress, type ToolStepProgress } from '../hooks/useVoCaseProgress';
import {
  ArrowLeft,
  Play,
  Check,
  RotateCcw,
  XCircle,
  FileText,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

// ── 分析进度面板 ────────────────────────────────────────────────────────────

function AnalysisProgressPanel({ steps, elapsedMs, activeToolName }: {
  steps: ToolStepProgress[];
  elapsedMs: number;
  activeToolName: string | null;
}) {
  const { t } = useTranslation();
  const elapsedSec = (elapsedMs / 1000).toFixed(0);

  return (
    <div className="rounded-xl border border-blue-800/50 bg-blue-950/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          <span className="text-xs font-semibold text-blue-300">{t('voCase.agentAnalyzing')}</span>
        </div>
        <span className="text-[10px] text-slate-500">{t('voCase.elapsed')} {elapsedSec}s</span>
      </div>

      {activeToolName && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-700/30 bg-blue-900/20 px-3 py-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
          <code className="text-xs font-mono text-blue-300">{activeToolName}</code>
          <span className="text-[10px] text-slate-500">{t('voCase.executing')}</span>
        </div>
      )}

      {/* 已完成步骤 */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          {steps.map((step, i) => (
            <div key={`${step.toolName}-${step.timestamp}`} className="flex items-center gap-2 text-[10px]">
              <span className="w-4 text-center text-slate-600">{i + 1}</span>
              <span className={step.status === 'error' ? 'text-red-400' : 'text-emerald-400'}>
                {step.status === 'error' ? '✗' : '✓'}
              </span>
              <code className="text-blue-300">{step.toolName}</code>
              <span className="text-slate-600">
                {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
              </span>
              <span className="flex-1 truncate text-slate-500">{step.outputSummary}</span>
            </div>
          ))}
        </div>
      )}

      {steps.length === 0 && !activeToolName && (
        <div className="text-[10px] text-slate-500">{t('voCase.waitingAgent')}</div>
      )}
    </div>
  );
}

// ── 分析快照摘要 ────────────────────────────────────────────────────────────

function AnalysisSnapshotCard({ snapshot }: { snapshot: VoCaseAnalysisSnapshot }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {t('voCase.analysisResult')}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCell label={t('voCase.added')} value={snapshot.added_count} color="text-emerald-400" />
        <StatCell label={t('voCase.deleted')} value={snapshot.deleted_count} color="text-red-400" />
        <StatCell label={t('voCase.modified')} value={snapshot.modified_count} color="text-amber-400" />
        <StatCell label={t('voCase.totalChanges')} value={snapshot.total_changes} color="text-white" />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-3 border-t border-slate-700/50 pt-3">
        <StatCell label={t('voCase.omissions')} value={snapshot.omissions} color="text-red-400" />
        <StatCell label={t('voCase.additions')} value={snapshot.additions} color="text-emerald-400" />
        <StatCell
          label={t('voCase.netValue')}
          value={`RM ${snapshot.net_value.toLocaleString()}`}
          color={snapshot.net_value >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCell label={t('voCase.pendingRates')} value={snapshot.pending_rate_actions} color="text-amber-400" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-700/50 pt-3">
        <StatCell
          label={t('voCase.bqMapping')}
          value={`${snapshot.mapped_labels}/${snapshot.total_labels}`}
          color="text-blue-400"
        />
        <StatCell label={t('voCase.protectedValue')} value={`RM ${snapshot.protected_value.toLocaleString()}`} color="text-emerald-400" />
        <StatCell label={t('voCase.formworkAlerts')} value={snapshot.formwork_alerts} color="text-amber-400" />
      </div>

      {snapshot.tool_steps.length > 0 && (
        <details className="mt-3 border-t border-slate-700/50 pt-3">
          <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300">
            {snapshot.tool_steps.length} {t('voCase.toolSteps')}
          </summary>
          <div className="mt-2 space-y-1">
            {snapshot.tool_steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className={step.status === 'error' ? 'text-red-400' : 'text-emerald-400'}>
                  {step.status === 'error' ? '✗' : '✓'}
                </span>
                <code className="text-blue-300">{step.tool_name}</code>
                <span className="text-slate-600">
                  {step.duration_ms < 1000 ? `${step.duration_ms}ms` : `${(step.duration_ms / 1000).toFixed(1)}s`}
                </span>
                <span className="flex-1 truncate text-slate-500">{step.output_summary}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

// ── 操作按钮区 ──────────────────────────────────────────────────────────────

function ActionBar({
  voCase,
  onAction,
  acting,
}: {
  voCase: VoCase;
  onAction: (action: OrchestratorAction) => void;
  acting: boolean;
}) {
  const { t } = useTranslation();
  const [revisionNote, setRevisionNote] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [showApprovalInput, setShowApprovalInput] = useState(false);

  const status = voCase.status;

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {t('voCase.actions')}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* draft → analyzing */}
        {status === 'draft' && (
          <ActionButton
            icon={<Play className="h-3.5 w-3.5" />}
            label={t('voCase.startAnalysis')}
            color="bg-blue-600 hover:bg-blue-500"
            disabled={acting}
            onClick={() => onAction({ type: 'start_analysis' })}
          />
        )}

        {/* pending_review → approved */}
        {status === 'pending_review' && !showApprovalInput && !showRevisionInput && (
          <>
            <ActionButton
              icon={<Check className="h-3.5 w-3.5" />}
              label={t('voCase.approve')}
              color="bg-emerald-600 hover:bg-emerald-500"
              disabled={acting}
              onClick={() => setShowApprovalInput(true)}
            />
            <ActionButton
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              label={t('voCase.sendBack')}
              color="bg-amber-600 hover:bg-amber-500"
              disabled={acting}
              onClick={() => setShowRevisionInput(true)}
            />
          </>
        )}

        {/* 批准确认 */}
        {status === 'pending_review' && showApprovalInput && (
          <div className="flex w-full items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="text-[10px] text-slate-500">{t('voCase.approveNote')}</label>
              <input
                type="text"
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder={t('voCase.notePlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-600"
              />
            </div>
            <button
              type="button"
              disabled={acting}
              onClick={() => {
                onAction({ type: 'approve', note: approvalNote || undefined });
                setShowApprovalInput(false);
                setApprovalNote('');
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {t('voCase.confirmApprove')}
            </button>
            <button
              type="button"
              onClick={() => { setShowApprovalInput(false); setApprovalNote(''); }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-400 hover:bg-slate-700"
            >
              {t('voCase.cancel')}
            </button>
          </div>
        )}

        {/* 打回确认 */}
        {status === 'pending_review' && showRevisionInput && (
          <div className="flex w-full items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="text-[10px] text-slate-500">{t('voCase.rejectReason')}</label>
              <input
                type="text"
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder={t('voCase.rejectPlaceholder')}
                autoFocus
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-600"
              />
            </div>
            <button
              type="button"
              disabled={acting || !revisionNote.trim()}
              onClick={() => {
                onAction({ type: 'request_revision', note: revisionNote.trim() });
                setShowRevisionInput(false);
                setRevisionNote('');
              }}
              className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {t('voCase.confirmReject')}
            </button>
            <button
              type="button"
              onClick={() => { setShowRevisionInput(false); setRevisionNote(''); }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-400 hover:bg-slate-700"
            >
              {t('voCase.cancel')}
            </button>
          </div>
        )}

        {/* revision → analyzing */}
        {status === 'revision' && (
          <ActionButton
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label={t('voCase.reAnalyze')}
            color="bg-blue-600 hover:bg-blue-500"
            disabled={acting}
            onClick={() => onAction({ type: 'restart_analysis' })}
          />
        )}

        {/* approved → reported */}
        {status === 'approved' && (
          <ActionButton
            icon={<FileText className="h-3.5 w-3.5" />}
            label={t('voCase.generateReport')}
            color="bg-emerald-600 hover:bg-emerald-500"
            disabled={acting}
            onClick={() => onAction({ type: 'generate_report', report_url: '' })}
          />
        )}

        {/* error → draft (retry) */}
        {status === 'error' && (
          <ActionButton
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            label={t('voCase.retry')}
            color="bg-blue-600 hover:bg-blue-500"
            disabled={acting}
            onClick={() => onAction({ type: 'retry' })}
          />
        )}

        {/* 通用：取消操作（终态不显示） */}
        {status !== 'cancelled' && status !== 'reported' && (
          <ActionButton
            icon={<XCircle className="h-3.5 w-3.5" />}
            label={t('voCase.cancelCase')}
            color="border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-300"
            disabled={acting}
            onClick={() => onAction({ type: 'cancel' })}
          />
        )}
      </div>

      {acting && (
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('common.processing')}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  color,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${color}`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────────────

interface VoCaseDetailProps {
  voCase: VoCase | null;
  evidence: EvidenceEntry[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onAction: (action: OrchestratorAction) => Promise<void>;
  /** 跳转到 Copilot 讨论此 Case */
  onSwitchToCopilot?: () => void;
}

export default function VoCaseDetail({
  voCase,
  evidence,
  loading,
  error,
  onBack,
  onAction,
  onSwitchToCopilot,
}: VoCaseDetailProps) {
  const { t } = useTranslation();
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const progress = useVoCaseProgress(voCase?.id, voCase?.status);

  const handleAction = async (action: OrchestratorAction) => {
    setActing(true);
    setActionError(null);
    try {
      await onAction(action);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActing(false);
    }
  };

  if (loading || !voCase) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        <span className="ml-2 text-sm text-slate-500">{t('voCase.loadingCase')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('voCase.backToList')}
        </button>
        <div className="flex-1" />
        {onSwitchToCopilot && (
          <button
            type="button"
            onClick={onSwitchToCopilot}
            className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300 transition hover:border-blue-400 hover:bg-blue-500/20"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('voCase.discussInCopilot')}
          </button>
        )}
      </div>

      {/* Case 标题和状态 */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">{voCase.title || t('voCase.unnamed')}</h2>
            <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
              <span>{t('voCase.caseId')}: {voCase.id.slice(0, 8)}</span>
              <span>{t('voCase.created')}: {new Date(voCase.created_at).toLocaleDateString()}</span>
              <span>{t('voCase.updated')}: {new Date(voCase.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
          <VoCaseStatusBadge status={voCase.status} size="md" />
        </div>

        {/* 文件信息 */}
        {(voCase.base_file_name || voCase.revision_file_name) && (
          <div className="mt-3 flex gap-4 border-t border-slate-700/50 pt-3 text-[11px] text-slate-400">
            {voCase.base_file_name && (
              <span>{t('voCase.base')}: <span className="text-slate-300">{voCase.base_file_name}</span></span>
            )}
            {voCase.revision_file_name && (
              <span>{t('voCase.revision')}: <span className="text-slate-300">{voCase.revision_file_name}</span></span>
            )}
          </div>
        )}

        {/* 审批信息 */}
        {voCase.approved_at && (
          <div className="mt-3 flex items-center gap-2 border-t border-slate-700/50 pt-3 text-[11px]">
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-emerald-400">
              {t('voCase.approved')} · {new Date(voCase.approved_at).toLocaleDateString()}
            </span>
            {voCase.approval_note && (
              <span className="text-slate-500">— {voCase.approval_note}</span>
            )}
          </div>
        )}

        {/* 报告信息 */}
        {voCase.report_url && (
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <FileText className="h-3.5 w-3.5 text-emerald-400" />
            <a
              href={voCase.report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline hover:text-blue-300"
            >
              {t('voCase.viewReport')}
            </a>
            {voCase.report_generated_at && (
              <span className="text-slate-500">
                · {new Date(voCase.report_generated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {(error || actionError) && (
        <div className="flex items-center gap-2 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {actionError || error}
        </div>
      )}

      {/* 分析进度（analyzing 状态时显示） */}
      {voCase.status === 'analyzing' && progress.phase === 'running' && (
        <AnalysisProgressPanel
          steps={progress.completedSteps}
          elapsedMs={progress.elapsedMs}
          activeToolName={progress.activeToolName}
        />
      )}

      {/* 分析快照 */}
      {voCase.analysis_snapshot && (
        <AnalysisSnapshotCard snapshot={voCase.analysis_snapshot} />
      )}

      {/* 操作按钮 */}
      <ActionBar voCase={voCase} onAction={handleAction} acting={acting} />

      {/* Evidence 时间线 */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {t('voCase.actionLog')}
        </div>
        <EvidenceTimeline evidence={evidence} loading={loading} />
      </div>
    </div>
  );
}
