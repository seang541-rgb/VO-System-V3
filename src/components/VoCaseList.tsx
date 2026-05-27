// VO Case List — 项目级 Case 列表组件
// 显示所有 VO Case，支持创建新 Case

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VoCase } from '../agent/vo-case-types';
import VoCaseStatusBadge from './VoCaseStatusBadge';
import { Plus, FileText, ChevronRight, Loader2 } from 'lucide-react';

// ── 时间格式化 ──────────────────────────────────────────────────────────────

function useFormatRelativeTime() {
  const { t } = useTranslation();
  return (iso: string): string => {
    try {
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHour = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return t('evidence.justNow');
      if (diffMin < 60) return `${diffMin} ${t('evidence.minutesAgo')}`;
      if (diffHour < 24) return `${diffHour} ${t('evidence.hoursAgo')}`;
      if (diffDay < 7) return `${diffDay}d`;

      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };
}

// ── Case 卡片 ───────────────────────────────────────────────────────────────

function CaseCard({
  voCase,
  onClick,
}: {
  key?: React.Key;
  voCase: VoCase;
  onClick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const formatRelativeTime = useFormatRelativeTime();
  const snapshot = voCase.analysis_snapshot;

  return (
    <button
      type="button"
      onClick={() => onClick(voCase.id)}
      className="group flex w-full items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-3 text-left transition-all hover:border-slate-600 hover:bg-slate-800"
    >
      {/* 图标 */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
        <FileText className="h-4 w-4 text-slate-400" />
      </div>

      {/* 内容 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">
            {voCase.title || t('voCase.unnamed')}
          </span>
          <VoCaseStatusBadge status={voCase.status} />
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
          <span>{formatRelativeTime(voCase.updated_at)}</span>
          {snapshot && (
            <>
              <span className="text-slate-700">|</span>
              <span>{snapshot.total_changes} {t('voCase.changes')}</span>
              {snapshot.net_value !== 0 && (
                <>
                  <span className="text-slate-700">|</span>
                  <span className={snapshot.net_value > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    RM {snapshot.net_value.toLocaleString()}
                  </span>
                </>
              )}
            </>
          )}
          {voCase.base_file_name && (
            <>
              <span className="text-slate-700">|</span>
              <span className="max-w-[120px] truncate">{voCase.base_file_name}</span>
            </>
          )}
        </div>
      </div>

      {/* 箭头 */}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400" />
    </button>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────────────

interface VoCaseListProps {
  cases: VoCase[];
  loading: boolean;
  error: string | null;
  onSelectCase: (caseId: string) => void;
  onCreateCase: (title: string) => Promise<void>;
}

export default function VoCaseList({
  cases,
  loading,
  error,
  onSelectCase,
  onCreateCase,
}: VoCaseListProps) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setIsCreating(true);
    try {
      await onCreateCase(title);
      setNewTitle('');
      setShowCreateInput(false);
    } catch {
      // error handled by parent
    } finally {
      setIsCreating(false);
    }
  };

  const activeCases = cases.filter((c) => c.status !== 'cancelled');
  const cancelledCases = cases.filter((c) => c.status === 'cancelled');

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{t('voCase.title')}</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {cases.length} {t('voCase.caseCount')}{activeCases.length !== cases.length && ` (${activeCases.length} ${t('voCase.active')})`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateInput(!showCreateInput)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('voCase.newCase')}
        </button>
      </div>

      {/* 创建输入框 */}
      {showCreateInput && (
        <div className="flex gap-2 rounded-xl border border-blue-800/50 bg-blue-950/20 p-3">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
              if (e.key === 'Escape') setShowCreateInput(false);
            }}
            placeholder={t('voCase.inputTitle')}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-600"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!newTitle.trim() || isCreating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('voCase.create')}
          </button>
          <button
            type="button"
            onClick={() => setShowCreateInput(false)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            {t('voCase.cancel')}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <span className="ml-2 text-xs text-slate-500">{t('voCase.loading')}</span>
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Case 列表 */}
      {!loading && !error && (
        <>
          {activeCases.length === 0 && cancelledCases.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-slate-600" />
              <p className="mt-3 text-xs text-slate-500">{t('voCase.noCase')}</p>
              <p className="mt-1 text-[10px] text-slate-600">
                {t('voCase.noCaseHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeCases.map((voCase) => (
                <CaseCard key={voCase.id} voCase={voCase} onClick={onSelectCase} />
              ))}

              {/* 已取消的 Case（折叠显示） */}
              {cancelledCases.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-[10px] text-slate-600 hover:text-slate-400">
                    {cancelledCases.length} {t('voCase.cancelledCases')}
                  </summary>
                  <div className="mt-2 space-y-2 opacity-60">
                    {cancelledCases.map((voCase) => (
                      <CaseCard key={voCase.id} voCase={voCase} onClick={onSelectCase} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
