// VO Case Status Badge — 状态标签组件
// 每个状态对应不同的颜色和中文标签

import React from 'react';
import type { VoCaseStatus } from '../agent/vo-case-types';

const STATUS_CONFIG: Record<VoCaseStatus, { label: string; bg: string; text: string; dot: string }> = {
  draft:          { label: '草稿',     bg: 'bg-slate-700/60',   text: 'text-slate-300',   dot: 'bg-slate-400' },
  analyzing:      { label: '分析中',   bg: 'bg-blue-900/40',    text: 'text-blue-300',    dot: 'bg-blue-400' },
  pending_review: { label: '待审批',   bg: 'bg-amber-900/40',   text: 'text-amber-300',   dot: 'bg-amber-400' },
  approved:       { label: '已批准',   bg: 'bg-emerald-900/40', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  reported:       { label: '已出报告', bg: 'bg-emerald-900/40', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  revision:       { label: '修改中',   bg: 'bg-amber-900/40',   text: 'text-amber-300',   dot: 'bg-amber-400' },
  cancelled:      { label: '已取消',   bg: 'bg-slate-700/60',   text: 'text-slate-400',   dot: 'bg-slate-500' },
  error:          { label: '错误',     bg: 'bg-red-900/40',     text: 'text-red-300',     dot: 'bg-red-400' },
};

interface VoCaseStatusBadgeProps {
  status: VoCaseStatus;
  size?: 'sm' | 'md';
}

export default function VoCaseStatusBadge({ status, size = 'sm' }: VoCaseStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const sizeClass = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${sizeClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${status === 'analyzing' ? 'animate-pulse' : ''}`} />
      {config.label}
    </span>
  );
}
