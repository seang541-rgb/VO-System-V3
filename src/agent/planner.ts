// ── Planner — 轻量级任务计划解析 ──────────────────────────────────────────────
//
// Parses structured plans from the agent's first-hop thinking text.
// The agent is already prompted to output numbered steps (①②③).
// This module extracts and tracks them for progress display.

export interface AgentPlan {
  /** Detected steps from the agent's thinking */
  steps: string[];
  /** Total number of planned steps */
  totalSteps: number;
  /** Current step being executed (0-based index, -1 if not started) */
  currentStep: number;
}

/** Step numbering patterns the agent uses */
const STEP_PATTERNS = [
  // ① ② ③ style
  /[①②③④⑤⑥⑦⑧⑨⑩]\s*([^\n①②③④⑤⑥⑦⑧⑨⑩]+)/g,
  // 1. 2. 3. style
  /(?:^|\n)\s*(\d+)[.)]\s+([^\n]+)/g,
  // Step 1: Step 2: style
  /Step\s*(\d+)\s*[:：]\s*([^\n]+)/gi,
  // - First, ... - Then, ... - Finally, style
  /(?:^|\n)\s*[-•]\s*((?:First|Then|Next|Finally|Last|接下来|首先|然后|最后)[,，：:\s][^\n]+)/gi,
];

/**
 * Try to extract a structured plan from the agent's thinking text.
 * Returns null if no plan structure is detected.
 */
export function parsePlan(thinkingText: string): AgentPlan | null {
  if (!thinkingText || thinkingText.length < 20) return null;

  // Try each pattern
  for (const pattern of STEP_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(thinkingText)) !== null) {
      // Use the last capture group (the step description)
      const stepText = match[match.length - 1].trim();
      if (stepText.length > 5) {
        matches.push(stepText);
      }
    }

    if (matches.length >= 2) {
      return {
        steps: matches,
        totalSteps: matches.length,
        currentStep: 0,
      };
    }
  }

  return null;
}

/**
 * Given a tool name being called, try to advance the plan's current step.
 * Matches tool names against step descriptions.
 */
export function advancePlan(plan: AgentPlan, toolName: string): AgentPlan {
  if (plan.currentStep >= plan.totalSteps - 1) return plan;

  // Simple heuristic: each tool call advances one step
  return {
    ...plan,
    currentStep: Math.min(plan.currentStep + 1, plan.totalSteps - 1),
  };
}

/** Tool-to-keyword mapping for smarter step matching */
const TOOL_KEYWORDS: Record<string, string[]> = {
  compare_ifc: ['compare', 'comparison', '比较', 'diff'],
  summarize_commercial_impact: ['summarize', 'commercial', 'impact', '总结', '商业'],
  analyze_contract_clause: ['contract', 'clause', 'analyze', '合同', '条款'],
  export_vo_excel: ['export', 'excel', '导出', 'workbook'],
  generate_report: ['report', 'generate', '报告', '生成'],
  audit_ifc: ['audit', '审计', 'quantity'],
  query_ifc: ['query', 'search', '查询', 'find'],
  lookup_regulation: ['regulation', 'UBBL', 'standard', '法规'],
  lookup_measurement_code: ['measurement', 'SMM2', 'NRM', '计量'],
  estimate_cost: ['cost', 'estimate', '成本', '估价'],
  ocr_document: ['OCR', 'scan', 'document', '扫描'],
  get_vo_template: ['template', 'letter', '模板', '范本'],
};

/**
 * Find which plan step best matches a tool call.
 * Returns the step index, or -1 if no good match.
 */
export function matchToolToStep(plan: AgentPlan, toolName: string): number {
  const keywords = TOOL_KEYWORDS[toolName] ?? [toolName];

  for (let i = plan.currentStep; i < plan.steps.length; i++) {
    const stepLower = plan.steps[i].toLowerCase();
    for (const kw of keywords) {
      if (stepLower.includes(kw.toLowerCase())) {
        return i;
      }
    }
  }

  return -1;
}
