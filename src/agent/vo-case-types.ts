// ── VO Case Orchestrator — 类型定义 ──────────────────────────────────────────
//
// VO Case 是系统的核心业务单元，代表一次完整的 Variation Order 分析流程。
// 状态机驱动生命周期，每一步都有 evidence log 记录。

// ── Case 状态机 ─────────────────────────────────────────────────────────────

/**
 * VO Case 生命周期状态
 *
 *   draft → analyzing → pending_review → approved → reported
 *                ↑            ↓
 *                └── revision ←┘  (审批打回，重新分析)
 *
 *   任何状态 → cancelled (用户手动取消)
 *   任何状态 → error     (系统异常)
 */
export type VoCaseStatus =
  | 'draft'           // 刚创建，还没开始分析
  | 'analyzing'       // Planner/Agent 正在执行工具链
  | 'pending_review'  // 分析完成，等用户审批
  | 'approved'        // 用户已确认结果
  | 'reported'        // 报告已生成
  | 'revision'        // 审批打回，需要修改
  | 'cancelled'       // 用户取消
  | 'error';          // 系统错误

/** 允许的状态转换 */
export const VALID_TRANSITIONS: Record<VoCaseStatus, VoCaseStatus[]> = {
  draft:          ['analyzing', 'cancelled'],
  analyzing:      ['pending_review', 'error', 'cancelled'],
  pending_review: ['approved', 'revision', 'cancelled'],
  approved:       ['reported', 'cancelled'],
  reported:       [],  // 终态
  revision:       ['analyzing', 'cancelled'],
  cancelled:      [],  // 终态
  error:          ['draft', 'cancelled'],  // 可以从 error 重试回 draft
};

// ── Case 数据模型 ────────────────────────────────────────────────────────────

export interface VoCase {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  status: VoCaseStatus;

  /** IFC 文件信息 */
  base_file_name: string | null;
  revision_file_name: string | null;

  /** 分析结果快照（analyzing → pending_review 时写入） */
  analysis_snapshot: VoCaseAnalysisSnapshot | null;

  /** 审批信息 */
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;

  /** 报告信息 */
  report_url: string | null;
  report_generated_at: string | null;

  created_at: string;
  updated_at: string;
}

export interface VoCaseAnalysisSnapshot {
  /** 变更统计 */
  added_count: number;
  deleted_count: number;
  modified_count: number;
  total_changes: number;

  /** 商业影响 */
  omissions: number;
  additions: number;
  net_value: number;
  pending_rate_actions: number;
  protected_value: number;
  formwork_alerts: number;
  star_rate_candidates: number;
  eot_flags: number;

  /** BQ 映射状态 */
  mapped_labels: number;
  total_labels: number;
  contract_bq_count: number;

  /** Agent 执行的工具步骤 */
  tool_steps: VoCaseToolStep[];
}

export interface VoCaseToolStep {
  tool_name: string;
  input_summary: string;
  output_summary: string;
  duration_ms: number;
  timestamp: string;
  status: 'success' | 'error';
  error_message?: string;
}

// ── Evidence Log ─────────────────────────────────────────────────────────────

export type EvidenceKind =
  | 'status_change'      // 状态转换
  | 'tool_execution'     // 工具调用
  | 'user_action'        // 用户操作（上传文件、审批等）
  | 'agent_reasoning'    // Agent 推理过程
  | 'approval_decision'  // 审批决定
  | 'report_generated'   // 报告生成
  | 'error';             // 错误

export interface EvidenceEntry {
  id: string;
  case_id: string;
  kind: EvidenceKind;
  timestamp: string;
  actor: 'user' | 'agent' | 'system';

  /** 状态转换 */
  from_status?: VoCaseStatus;
  to_status?: VoCaseStatus;

  /** 工具执行 */
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output_summary?: string;
  duration_ms?: number;

  /** 人类操作 */
  action_description?: string;
  note?: string;

  /** 结构化数据（任意补充信息） */
  metadata?: Record<string, unknown>;
}

// ── Orchestrator 动作 ────────────────────────────────────────────────────────

/** 用户或系统可以触发的动作 */
export type OrchestratorAction =
  | { type: 'start_analysis' }                           // draft → analyzing
  | { type: 'analysis_complete'; snapshot: VoCaseAnalysisSnapshot }  // analyzing → pending_review
  | { type: 'approve'; note?: string }                   // pending_review → approved
  | { type: 'request_revision'; note: string }           // pending_review → revision
  | { type: 'restart_analysis' }                         // revision → analyzing
  | { type: 'generate_report'; report_url: string }      // approved → reported
  | { type: 'cancel'; reason?: string }                  // any → cancelled
  | { type: 'report_error'; error: string }              // any → error
  | { type: 'retry' };                                   // error → draft
