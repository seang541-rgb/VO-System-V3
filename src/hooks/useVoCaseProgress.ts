// VO Case Progress — 分析进度追踪 hook
// 当 Case 处于 analyzing 状态时，定期轮询 Evidence Log 获取最新进度

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEvidenceLog } from '../agent/vo-case-orchestrator';
import type { EvidenceEntry, VoCaseStatus } from '../agent/vo-case-types';

export interface AnalysisProgress {
  /** 当前状态 */
  phase: 'idle' | 'running' | 'done' | 'error';
  /** 已完成的工具步骤 */
  completedSteps: ToolStepProgress[];
  /** 当前正在执行的工具（如果有） */
  activeToolName: string | null;
  /** 总耗时 ms */
  elapsedMs: number;
  /** 最后更新时间 */
  lastUpdate: string | null;
}

export interface ToolStepProgress {
  toolName: string;
  outputSummary: string;
  durationMs: number;
  timestamp: string;
  status: 'success' | 'error';
}

const POLL_INTERVAL_MS = 3000; // 3 秒轮询一次

export function useVoCaseProgress(
  caseId: string | undefined,
  caseStatus: VoCaseStatus | undefined,
): AnalysisProgress {
  const [progress, setProgress] = useState<AnalysisProgress>({
    phase: 'idle',
    completedSteps: [],
    activeToolName: null,
    elapsedMs: 0,
    lastUpdate: null,
  });

  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAnalyzing = caseStatus === 'analyzing';

  // 从 Evidence Log 中提取工具执行进度
  const extractProgress = useCallback((evidence: EvidenceEntry[]): Partial<AnalysisProgress> => {
    const toolEntries = evidence.filter((e) => e.kind === 'tool_execution');
    const completedSteps: ToolStepProgress[] = toolEntries.map((e) => ({
      toolName: e.tool_name ?? 'unknown',
      outputSummary: e.tool_output_summary ?? '',
      durationMs: e.duration_ms ?? 0,
      timestamp: e.timestamp,
      status: (e.metadata as Record<string, unknown>)?.error ? 'error' : 'success',
    }));

    const lastEntry = evidence[evidence.length - 1];

    return {
      completedSteps,
      lastUpdate: lastEntry?.timestamp ?? null,
    };
  }, []);

  // 轮询 Evidence Log
  useEffect(() => {
    if (!caseId || !isAnalyzing) {
      // 停止轮询
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (caseStatus === 'pending_review' || caseStatus === 'approved' || caseStatus === 'reported') {
        setProgress((prev) => ({ ...prev, phase: 'done', activeToolName: null }));
      } else if (caseStatus === 'error') {
        setProgress((prev) => ({ ...prev, phase: 'error', activeToolName: null }));
      } else {
        setProgress({
          phase: 'idle',
          completedSteps: [],
          activeToolName: null,
          elapsedMs: 0,
          lastUpdate: null,
        });
      }
      return;
    }

    // 开始追踪
    startTimeRef.current = Date.now();
    setProgress((prev) => ({
      ...prev,
      phase: 'running',
      elapsedMs: 0,
    }));

    const poll = async () => {
      try {
        const evidence = await fetchEvidenceLog(caseId);
        const extracted = extractProgress(evidence);
        const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;

        setProgress((prev) => ({
          ...prev,
          ...extracted,
          phase: 'running',
          elapsedMs: elapsed,
        }));
      } catch {
        // 轮询失败不影响 UI
      }
    };

    // 立即执行一次
    void poll();

    // 定期轮询
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [caseId, isAnalyzing, caseStatus, extractProgress]);

  return progress;
}
