// VO Case Status Badge — status label component with i18n support

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { VoCaseStatus } from '../agent/vo-case-types';

const STATUS_STYLE: Record<VoCaseStatus, { bg: string; text: string; dot: string; key: string }> = {
  draft:          { bg: 'bg-slate-700/60',   text: 'text-slate-300',   dot: 'bg-slate-400',   key: 'voCase.statusDraft' },
  analyzing:      { bg: 'bg-blue-900/40',    text: 'text-blue-300',    dot: 'bg-blue-400',    key: 'voCase.statusAnalyzing' },
  pending_review: { bg: 'bg-amber-900/40',   text: 'text-amber-300',   dot: 'bg-amber-400',   key: 'voCase.statusPendingReview' },
  approved:       { bg: 'bg-emerald-900/40', text: 'text-emerald-300', dot: 'bg-emerald-400', key: 'voCase.statusApproved' },
  reported:       { bg: 'bg-emerald-900/40', text: 'text-emerald-300', dot: 'bg-emerald-400', key: 'voCase.statusReported' },
  revision:       { bg: 'bg-amber-900/40',   text: 'text-amber-300',   dot: 'bg-amber-400',   key: 'voCase.statusRevision' },
  cancelled:      { bg: 'bg-slate-700/60',   text: 'text-slate-400',   dot: 'bg-slate-500',   key: 'voCase.statusCancelled' },
  error:          { bg: 'bg-red-900/40',     text: 'text-red-300',     dot: 'bg-red-400',     key: 'voCase.statusError' },
};

interface VoCaseStatusBadgeProps {
  status: VoCaseStatus;
  size?: 'sm' | 'md';
}

export default function VoCaseStatusBadge({ status, size = 'sm' }: VoCaseStatusBadgeProps) {
  const { t } = useTranslation();
  const config = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  const sizeClass = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bg} ${config.text} ${sizeClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${status === 'analyzing' ? 'animate-pulse' : ''}`} />
      {t(config.key)}
    </span>
  );
}
