// Evidence Timeline — VO Case 审计日志时间线
// 显示 Case 生命周期中的所有事件

import React from 'react';
import type { EvidenceEntry } from '../agent/vo-case-types';
import VoCaseStatusBadge from './VoCaseStatusBadge';
import type { VoCaseStatus } from '../agent/vo-case-types';

// ── 图标和颜色映射 ─────────────────────────────────────────────────────────

const KIND_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  status_change:     { icon: '⟳', color: 'text-blue-400',    label: '状态变更' },
  tool_execution:    { icon: '⚙', color: 'text-slate-400',   label: '工具执行' },
  user_action:       { icon: '👤', color: 'text-slate-300',   label: '用户操作' },
  agent_reasoning:   { icon: '🧠', color: 'text-purple-400',  label: 'Agent 推理' },
  approval_decision: { icon: '✓', color: 'text-emerald-400', label: '审批决定' },
  report_generated:  { icon: '📄', color: 'text-emerald-400', label: '报告生成' },
  error:             { icon: '✗', color: 'text-red-400',     label: '错误' },
};

const ACTOR_LABEL: Record<string, string> = {
  user:   '用户',
  agent:  'Agent',
  system: '系统',
};

// ── 时间格式化 ──────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── 单条 Evidence 渲染 ─────────────────────────────────────────────────────

function EvidenceItem({ entry }: { key?: React.Key; entry: EvidenceEntry }) {
  const kind = KIND_CONFIG[entry.kind] ?? KIND_CONFIG.error;
  const actor = ACTOR_LABEL[entry.actor] ?? entry.actor;

  return (
    <div className="group relative flex gap-3 py-3">
      {/* 时间线连接线 */}
      <div className="flex flex-col items-center">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm ${kind.color}`}>
          {kind.icon}
        </div>
        <div className="w-px flex-1 bg-slate-700/50 group-last:hidden" />
      </div>

      {/* 内容 */}
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${kind.color}`}>{kind.label}</span>
          <span className="text-[10px] text-slate-500">{actor}</span>
          <span className="text-[10px] text-slate-600">{formatTimestamp(entry.timestamp)}</span>
        </div>

        {/* 状态转换 */}
        {entry.kind === 'status_change' && entry.from_status && entry.to_status && (
          <div className="mt-1 flex items-center gap-2">
            {entry.from_status && (
              <VoCaseStatusBadge status={entry.from_status as VoCaseStatus} />
            )}
            <span className="text-[10px] text-slate-500">→</span>
            <VoCaseStatusBadge status={entry.to_status as VoCaseStatus} />
          </div>
        )}

        {/* 创建事件（没有 from_status） */}
        {entry.kind === 'status_change' && !entry.from_status && entry.to_status && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-slate-500">创建 →</span>
            <VoCaseStatusBadge status={entry.to_status as VoCaseStatus} />
          </div>
        )}

        {/* 工具执行 */}
        {entry.kind === 'tool_execution' && (
          <div className="mt-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-blue-300">
                {entry.tool_name}
              </code>
              {entry.duration_ms !== undefined && (
                <span className="text-[10px] text-slate-500">
                  {entry.duration_ms < 1000
                    ? `${entry.duration_ms}ms`
                    : `${(entry.duration_ms / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
            {entry.tool_output_summary && (
              <p className="text-[11px] leading-relaxed text-slate-400">
                {entry.tool_output_summary}
              </p>
            )}
          </div>
        )}

        {/* 操作描述 */}
        {entry.action_description && entry.kind !== 'status_change' && (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
            {entry.action_description}
          </p>
        )}

        {/* 备注 */}
        {entry.note && (
          <p className="mt-1 rounded-lg border border-slate-700/50 bg-slate-800/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-400 italic">
            {entry.note}
          </p>
        )}
      </div>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────────────

interface EvidenceTimelineProps {
  evidence: EvidenceEntry[];
  loading?: boolean;
}

export default function EvidenceTimeline({ evidence, loading }: EvidenceTimelineProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
        <span className="ml-2 text-xs text-slate-500">加载 Evidence...</span>
      </div>
    );
  }

  if (evidence.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500">
        暂无操作记录
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {evidence.map((entry) => (
        <EvidenceItem key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
