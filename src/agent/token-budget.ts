// ── Token Budget — 上下文窗口管理 ──────────────────────────────────────────
//
// 估算消息的 token 数量，在接近上限时自动压缩历史消息。
// 使用粗略估算（1 token ≈ 4 chars for English, ≈ 2 chars for Chinese），
// 不需要真正的 tokenizer 库。

import type { OpenAIMessage } from './agent-client';

// ── 配置 ────────────────────────────────────────────────────────────────────

/** 模型上下文窗口大小（tokens） */
const MODEL_CONTEXT_LIMIT = 32_000;

/** 保留给模型输出的 token 数 */
const RESERVED_FOR_OUTPUT = 4_000;

/** 系统提示词的估算 token 数（SYSTEM_PROMPT + dynamic context） */
const SYSTEM_PROMPT_ESTIMATE = 3_000;

/** 有效的消息 token 预算 */
const MESSAGE_BUDGET = MODEL_CONTEXT_LIMIT - RESERVED_FOR_OUTPUT - SYSTEM_PROMPT_ESTIMATE;

/** 单个工具结果的最大字符数 */
const MAX_TOOL_RESULT_CHARS = 8_000;

/** 当消息总 token 超过此比例时触发压缩 */
const COMPRESSION_THRESHOLD = 0.85;

/** 压缩后保留最近几轮的完整消息 */
const KEEP_RECENT_TURNS = 3;

// ── Token 估算 ─────────────────────────────────────────────────────────────

/**
 * 粗略估算文本的 token 数。
 * 混合中英文场景下，使用加权平均：
 *   - ASCII 字符：~4 chars/token
 *   - CJK 字符：~1.5 chars/token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let asciiCount = 0;
  let cjkCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x4E00 && code < 0x9FFF) {
      cjkCount++;
    } else {
      asciiCount++;
    }
  }

  return Math.ceil(asciiCount / 4 + cjkCount / 1.5);
}

/** 估算单条消息的 token 数 */
export function estimateMessageTokens(msg: OpenAIMessage): number {
  let tokens = 4; // message overhead (role, separators)

  if (msg.content) {
    tokens += estimateTokens(msg.content);
  }

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      tokens += estimateTokens(tc.function.name);
      tokens += estimateTokens(tc.function.arguments);
      tokens += 10; // tool_call overhead
    }
  }

  if (msg.tool_call_id) {
    tokens += 5; // tool response overhead
  }

  return tokens;
}

/** 估算消息列表的总 token 数 */
export function estimateTotalTokens(messages: OpenAIMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// ── 工具结果截断 ────────────────────────────────────────────────────────────

/**
 * 截断过大的工具结果，保留结构化摘要。
 * 直接修改 content 字段。
 */
export function truncateToolResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) return content;

  // 尝试保留 JSON 结构的前部分
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      // 如果有 components 数组，截断它
      if (Array.isArray(parsed.components) && parsed.components.length > 10) {
        const truncated = {
          ...parsed,
          components: parsed.components.slice(0, 10),
          _truncated: true,
          _originalCount: parsed.components.length,
          _note: `Showing first 10 of ${parsed.components.length} items. Use more specific filters to narrow results.`,
        };
        return JSON.stringify(truncated);
      }
      // 如果有 topActions 数组，截断它
      if (Array.isArray(parsed.topActions) && parsed.topActions.length > 10) {
        const truncated = {
          ...parsed,
          topActions: parsed.topActions.slice(0, 10),
          _truncated: true,
          _originalCount: parsed.topActions.length,
        };
        return JSON.stringify(truncated);
      }
      // 如果有 results 数组，截断它
      if (Array.isArray(parsed.results) && parsed.results.length > 15) {
        const truncated = {
          ...parsed,
          results: parsed.results.slice(0, 15),
          _truncated: true,
          _originalCount: parsed.results.length,
        };
        return JSON.stringify(truncated);
      }
    }
  } catch {
    // 不是 JSON，直接截断
  }

  return content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n... [truncated, original length: ' + content.length + ' chars]';
}

// ── 消息压缩 ────────────────────────────────────────────────────────────────

/**
 * 识别消息中的"轮次"边界。
 * 一轮 = user消息 + 后续的 assistant/tool 消息，直到下一个 user 消息。
 */
function identifyTurns(messages: OpenAIMessage[]): { start: number; end: number }[] {
  const turns: { start: number; end: number }[] = [];
  let currentStart = -1;

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      if (currentStart >= 0) {
        turns.push({ start: currentStart, end: i - 1 });
      }
      currentStart = i;
    }
  }

  if (currentStart >= 0) {
    turns.push({ start: currentStart, end: messages.length - 1 });
  }

  return turns;
}

/**
 * 将一轮对话压缩成一条摘要消息。
 */
function summarizeTurn(messages: OpenAIMessage[], start: number, end: number): OpenAIMessage {
  const userMsg = messages[start];
  const userText = userMsg.content?.slice(0, 100) ?? '';

  const toolNames: string[] = [];
  let assistantSummary = '';

  for (let i = start + 1; i <= end; i++) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolNames.push(tc.function.name);
      }
    }
    if (msg.role === 'assistant' && msg.content && !msg.tool_calls) {
      // 最终回复，取前 200 字符
      assistantSummary = msg.content.slice(0, 200);
    }
  }

  const parts = [`[Previous turn] User: "${userText}"`];
  if (toolNames.length > 0) {
    parts.push(`Tools used: ${toolNames.join(', ')}`);
  }
  if (assistantSummary) {
    parts.push(`Response: ${assistantSummary}${assistantSummary.length >= 200 ? '...' : ''}`);
  }

  return {
    role: 'user' as const,
    content: parts.join(' | '),
  };
}

/**
 * 压缩消息历史，保留最近几轮的完整消息，
 * 将更早的轮次压缩为摘要。
 */
export function compressMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
  const totalTokens = estimateTotalTokens(messages);
  const threshold = MESSAGE_BUDGET * COMPRESSION_THRESHOLD;

  // 不需要压缩
  if (totalTokens <= threshold) return messages;

  const turns = identifyTurns(messages);

  // 至少需要 2 轮才能压缩（保留最近的，压缩更早的）
  if (turns.length <= KEEP_RECENT_TURNS) return messages;

  // 保留最近 N 轮完整消息
  const keepFrom = turns[turns.length - KEEP_RECENT_TURNS].start;
  const recentMessages = messages.slice(keepFrom);

  // 将更早的轮次压缩为摘要
  const turnsToCompress = turns.slice(0, turns.length - KEEP_RECENT_TURNS);
  const summaries: OpenAIMessage[] = [];

  for (const turn of turnsToCompress) {
    summaries.push(summarizeTurn(messages, turn.start, turn.end));
  }

  // 添加分隔提示
  const separator: OpenAIMessage = {
    role: 'user' as const,
    content: '[--- Earlier conversation was summarized above. Full details below are from recent turns. ---]',
  };

  const compressed = [...summaries, separator, ...recentMessages];

  return compressed;
}

// ── 公开 API ────────────────────────────────────────────────────────────────

export interface BudgetStatus {
  /** 当前消息总 token 估算 */
  currentTokens: number;
  /** 消息 token 预算 */
  budgetTokens: number;
  /** 使用率 (0~1) */
  utilization: number;
  /** 是否需要压缩 */
  needsCompression: boolean;
}

/** 获取当前 token 预算状态 */
export function getBudgetStatus(messages: OpenAIMessage[]): BudgetStatus {
  const currentTokens = estimateTotalTokens(messages);
  const utilization = currentTokens / MESSAGE_BUDGET;
  return {
    currentTokens,
    budgetTokens: MESSAGE_BUDGET,
    utilization,
    needsCompression: utilization >= COMPRESSION_THRESHOLD,
  };
}
