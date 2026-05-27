// ── VO Case Orchestrator — 状态机 + 生命周期管理 ─────────────────────────────
//
// Orchestrator 管理 VO Case 的完整生命周期。
// 每次状态转换都会：
//   1. 验证转换合法性
//   2. 执行副作用（更新 DB、触发 Agent 等）
//   3. 写入 Evidence Log
//
// Orchestrator 不直接调用 LLM。它通过回调通知上层（UI 或测试）
// 何时需要启动 Agent 分析。

import { supabase } from '../lib/supabase';
import type {
  VoCase,
  VoCaseStatus,
  VoCaseAnalysisSnapshot,
  EvidenceEntry,
  EvidenceKind,
  OrchestratorAction,
} from './vo-case-types';
import { VALID_TRANSITIONS } from './vo-case-types';

// ── Orchestrator 事件回调 ────────────────────────────────────────────────────

export interface OrchestratorCallbacks {
  /** 状态变更后通知 UI 刷新 */
  onStatusChange?: (caseData: VoCase, from: VoCaseStatus, to: VoCaseStatus) => void;
  /** 进入 analyzing 状态时，通知上层启动 Agent */
  onAnalysisNeeded?: (caseData: VoCase) => void;
  /** 进入 pending_review 时，通知上层显示审批 UI */
  onReviewNeeded?: (caseData: VoCase) => void;
  /** 报告生成完成 */
  onReportReady?: (caseData: VoCase, reportUrl: string) => void;
  /** 错误通知 */
  onError?: (caseData: VoCase, error: string) => void;
}

// ── Evidence Log 写入 ────────────────────────────────────────────────────────

async function writeEvidence(entry: Omit<EvidenceEntry, 'id' | 'timestamp'>): Promise<void> {
  const { error } = await supabase.from('vo_case_evidence').insert({
    case_id: entry.case_id,
    kind: entry.kind,
    actor: entry.actor,
    from_status: entry.from_status ?? null,
    to_status: entry.to_status ?? null,
    tool_name: entry.tool_name ?? null,
    tool_input: entry.tool_input ?? null,
    tool_output_summary: entry.tool_output_summary ?? null,
    duration_ms: entry.duration_ms ?? null,
    action_description: entry.action_description ?? null,
    note: entry.note ?? null,
    metadata: entry.metadata ?? null,
  });
  if (error) {
    console.error('[Orchestrator] Evidence write failed:', error.message);
  }
}

// ── Case CRUD ────────────────────────────────────────────────────────────────

export async function createCase(
  projectId: string,
  userId: string,
  title: string,
): Promise<VoCase> {
  const { data, error } = await supabase
    .from('vo_cases')
    .insert({
      project_id: projectId,
      user_id: userId,
      title,
      status: 'draft' as VoCaseStatus,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`创建 VO Case 失败: ${error?.message ?? '未知错误'}`);
  }

  const voCase = data as VoCase;

  await writeEvidence({
    case_id: voCase.id,
    kind: 'status_change',
    actor: 'user',
    to_status: 'draft',
    action_description: `VO Case 创建: ${title}`,
  });

  return voCase;
}

export async function fetchCase(caseId: string): Promise<VoCase> {
  const { data, error } = await supabase
    .from('vo_cases')
    .select('*')
    .eq('id', caseId)
    .single();

  if (error || !data) {
    throw new Error(`获取 VO Case 失败: ${error?.message ?? '未找到'}`);
  }

  return data as VoCase;
}

export async function listCases(projectId: string): Promise<VoCase[]> {
  const { data, error } = await supabase
    .from('vo_cases')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`列出 VO Cases 失败: ${error.message}`);
  }

  return (data ?? []) as VoCase[];
}

export async function fetchEvidenceLog(caseId: string): Promise<EvidenceEntry[]> {
  const { data, error } = await supabase
    .from('vo_case_evidence')
    .select('*')
    .eq('case_id', caseId)
    .order('timestamp', { ascending: true });

  if (error) {
    throw new Error(`获取 Evidence Log 失败: ${error.message}`);
  }

  return (data ?? []) as EvidenceEntry[];
}

// ── 状态机核心 ───────────────────────────────────────────────────────────────

function validateTransition(from: VoCaseStatus, to: VoCaseStatus): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`非法状态转换: ${from} → ${to}`);
  }
}

async function transitionCase(
  caseId: string,
  toStatus: VoCaseStatus,
  updates: Partial<VoCase> = {},
  evidenceNote?: string,
): Promise<VoCase> {
  // 先读取当前状态（乐观锁检查）
  const current = await fetchCase(caseId);
  validateTransition(current.status, toStatus);

  const fromStatus = current.status;

  const { data, error } = await supabase
    .from('vo_cases')
    .update({
      ...updates,
      status: toStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId)
    .eq('status', fromStatus) // 乐观锁：只有状态没变才更新
    .select()
    .single();

  if (error || !data) {
    throw new Error(`状态转换失败 (${fromStatus} → ${toStatus}): ${error?.message ?? '并发冲突'}`);
  }

  await writeEvidence({
    case_id: caseId,
    kind: 'status_change',
    actor: 'system',
    from_status: fromStatus,
    to_status: toStatus,
    note: evidenceNote,
  });

  return data as VoCase;
}

// ── Orchestrator 主入口 ──────────────────────────────────────────────────────

export async function dispatch(
  caseId: string,
  action: OrchestratorAction,
  callbacks?: OrchestratorCallbacks,
): Promise<VoCase> {
  const current = await fetchCase(caseId);

  switch (action.type) {
    case 'start_analysis': {
      const updated = await transitionCase(caseId, 'analyzing', {}, '开始 VO 分析');
      callbacks?.onStatusChange?.(updated, current.status, 'analyzing');
      callbacks?.onAnalysisNeeded?.(updated);
      return updated;
    }

    case 'analysis_complete': {
      const updated = await transitionCase(
        caseId,
        'pending_review',
        { analysis_snapshot: action.snapshot as unknown as VoCaseAnalysisSnapshot },
        `分析完成: ${action.snapshot.total_changes} 个变更, 净值 ${action.snapshot.net_value}`,
      );
      callbacks?.onStatusChange?.(updated, current.status, 'pending_review');
      callbacks?.onReviewNeeded?.(updated);
      return updated;
    }

    case 'approve': {
      const now = new Date().toISOString();
      const updated = await transitionCase(
        caseId,
        'approved',
        {
          approved_by: current.user_id,
          approved_at: now,
          approval_note: action.note ?? null,
        },
        `用户审批通过${action.note ? `: ${action.note}` : ''}`,
      );

      await writeEvidence({
        case_id: caseId,
        kind: 'approval_decision',
        actor: 'user',
        action_description: '审批通过',
        note: action.note,
      });

      callbacks?.onStatusChange?.(updated, current.status, 'approved');
      return updated;
    }

    case 'request_revision': {
      const updated = await transitionCase(
        caseId,
        'revision',
        {
          approved_by: null,
          approved_at: null,
          approval_note: null,
        },
        `审批打回: ${action.note}`,
      );

      await writeEvidence({
        case_id: caseId,
        kind: 'approval_decision',
        actor: 'user',
        action_description: '审批打回，要求修改',
        note: action.note,
      });

      callbacks?.onStatusChange?.(updated, current.status, 'revision');
      return updated;
    }

    case 'restart_analysis': {
      const updated = await transitionCase(caseId, 'analyzing', {}, '重新开始分析（修改后）');
      callbacks?.onStatusChange?.(updated, current.status, 'analyzing');
      callbacks?.onAnalysisNeeded?.(updated);
      return updated;
    }

    case 'generate_report': {
      const now = new Date().toISOString();
      const updated = await transitionCase(
        caseId,
        'reported',
        {
          report_url: action.report_url,
          report_generated_at: now,
        },
        '报告生成完成',
      );

      await writeEvidence({
        case_id: caseId,
        kind: 'report_generated',
        actor: 'system',
        action_description: '报告已生成',
        metadata: { report_url: action.report_url },
      });

      callbacks?.onStatusChange?.(updated, current.status, 'reported');
      callbacks?.onReportReady?.(updated, action.report_url);
      return updated;
    }

    case 'cancel': {
      const updated = await transitionCase(caseId, 'cancelled', {}, action.reason ?? '用户取消');

      await writeEvidence({
        case_id: caseId,
        kind: 'user_action',
        actor: 'user',
        action_description: '取消 VO Case',
        note: action.reason,
      });

      callbacks?.onStatusChange?.(updated, current.status, 'cancelled');
      return updated;
    }

    case 'report_error': {
      const updated = await transitionCase(caseId, 'error', {}, action.error);
      callbacks?.onStatusChange?.(updated, current.status, 'error');
      callbacks?.onError?.(updated, action.error);
      return updated;
    }

    case 'retry': {
      const updated = await transitionCase(
        caseId,
        'draft',
        { analysis_snapshot: null },
        '从错误状态重试',
      );
      callbacks?.onStatusChange?.(updated, current.status, 'draft');
      return updated;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`未知 Orchestrator 动作: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ── Evidence 辅助：记录工具执行 ──────────────────────────────────────────────

export async function logToolExecution(
  caseId: string,
  toolName: string,
  input: Record<string, unknown>,
  outputSummary: string,
  durationMs: number,
  status: 'success' | 'error',
  errorMessage?: string,
): Promise<void> {
  await writeEvidence({
    case_id: caseId,
    kind: 'tool_execution',
    actor: 'agent',
    tool_name: toolName,
    tool_input: input,
    tool_output_summary: outputSummary,
    duration_ms: durationMs,
    metadata: status === 'error' ? { error: errorMessage } : undefined,
  });
}

// ── Evidence 辅助：记录 Agent 推理 ───────────────────────────────────────────

export async function logAgentReasoning(
  caseId: string,
  reasoning: string,
  step: number,
): Promise<void> {
  await writeEvidence({
    case_id: caseId,
    kind: 'agent_reasoning',
    actor: 'agent',
    action_description: reasoning,
    metadata: { step },
  });
}
