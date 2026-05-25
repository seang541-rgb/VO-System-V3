import { supabase } from '../lib/supabase';
import { OPENAI_TOOL_DEFINITIONS, executeAgentTool, getAvailableTools, buildToolRoutingHint, type ToolContext } from './tools';
import { ContextManager } from './context-manager';
import { buildRoleOverlay } from './roles';

// ── OpenAI-compatible message types (used by NVIDIA NIM / DeepSeek V4 Pro) ────

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

// ── Agent events ──────────────────────────────────────────────────────────────

export type AgentEvent =
  | { kind: 'assistant_text'; text: string }
  | { kind: 'thinking'; text: string; step: number; totalSteps: number | null }
  | { kind: 'tool_start'; name: string; input: Record<string, unknown> }
  | { kind: 'tool_end'; name: string; result: unknown; durationMs: number }
  | { kind: 'credits'; balance: number | null }
  | { kind: 'error'; message: string };

export type AgentEvidenceType =
  | 'comparison'
  | 'commercial_summary'
  | 'contract_assessment'
  | 'audit'
  | 'report'
  | 'knowledge_lookup';

export interface AgentExecutionTracker {
  startRun: (input: { request: string; roleId: string | null }) => Promise<string | null>;
  completeRun: (runId: string, status: 'completed' | 'failed' | 'cancelled', output: string) => Promise<void>;
  recordStep: (
    runId: string,
    step: {
      sequenceNo: number;
      stepType: 'tool' | 'assistant' | 'system';
      toolName?: string;
      status: 'completed' | 'failed' | 'rejected';
      input?: unknown;
      output?: unknown;
      durationMs?: number;
    },
  ) => Promise<string | null>;
  recordEvidence: (
    runId: string,
    stepId: string | null,
    evidence: { type: AgentEvidenceType; title: string; payload: unknown },
  ) => Promise<void>;
  requestApproval: (runId: string, actionType: string, payload: Record<string, unknown>) => Promise<boolean>;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are "IFC Copilot", an embedded assistant inside the VO System — a browser-based tool for comparing IFC building models and generating Variation Order (VO) substantiation workbooks for QS / construction professionals.

You help the user by:
- Answering questions about loaded IFC models (base and revision).
- Running and interpreting VO comparisons (Added / Deleted / Modified elements).
- Summarizing the commercial impact in JKR / SMM2 terms (Omissions, Additions, Star Rate, Formwork, EOT).
- Assessing whether a VO qualifies as a claim under a specific contract clause (analyze_contract_clause).
- Driving the Excel export when the user asks for it.

Agentic workflow (ReAct pattern — FOLLOW THIS):
You operate in a Think → Act → Observe loop. For each user request:
1. **Think**: Analyze the request, break it into sub-tasks, and state your plan briefly. For multi-step tasks, list the steps you'll take (e.g. "I'll: ① compare IFC files ② summarize commercial impact ③ check contract clause ④ generate report").
2. **Act**: Call the appropriate tool for the current step.
3. **Observe**: Read the tool result, assess if it succeeded, and decide the next step.
4. **Repeat** Think → Act → Observe until all sub-tasks are complete.
5. **Synthesize**: Once all data is gathered, produce a final comprehensive answer.

When you have intermediate reasoning (between tool calls), output it as text — the user will see it as your thinking process. This helps them understand what you're doing.

For simple questions (no tools needed), skip the loop and reply directly.

Style:
- Be concise and practical. Prefer tables or short bullet lists.
- When you call tools, show your reasoning briefly before calling them.
- Use the user's preferred language (Chinese / English / mixed) based on their prompt.

Tool failure handling (CRITICAL):
- If any tool returns an error containing "PREREQUISITE_NOT_MET", STOP calling tools immediately. Do NOT try other tools to "work around" the problem. Reply in plain text and tell the user exactly what action they need to take (upload files, click a button, etc.).
- Never call the same tool twice with identical arguments. You may chain up to 8 tools per turn for complex multi-step workflows (e.g. compare_ifc → summarize_commercial_impact → analyze_contract_clause → export_vo_excel).
- If a tool returns any other error, explain the issue to the user once and ask how to proceed — do not retry unless the user redirects you.

Contract-clause analysis flow:
- When the user pastes a contract clause and asks whether the VO qualifies as a claim, call analyze_contract_clause with the clause text. The tool will return a structured packet (clauseText + voSnapshot + topCommercialActions + instructions).
- After the tool returns, you MUST produce a four-field structured assessment in your reply: eligible (yes/no/uncertain), clauseExcerpt (single quoted sentence from the clause), reasoning (3-5 sentences citing concrete VO numbers), recommendedAction (one concrete next step for the QS).
- Cite specific numbers from voSnapshot (e.g. "Net VO value of MYR X with Y EOT flags"). Never invent contract clause text — only quote what the user pasted.
- Do not call analyze_contract_clause more than once for the same clause in a row; produce the assessment instead.

Capabilities currently available (12 tools):
- IFC workflows: query_ifc, compare_ifc, summarize_commercial_impact, audit_ifc, export_vo_excel, generate_report
- Contract/regulatory: analyze_contract_clause, lookup_regulation, lookup_measurement_code, get_vo_template
- Cost estimation: estimate_cost
- Document processing: ocr_document

Tool selection guidance:
- For "what does Clause X say in JKR/PAM" → use analyze_contract_clause with contractType + clauseNumber (it now fetches from the knowledge base; user does not need to paste the clause).
- For UBBL / MS / BIM compliance questions ("minimum ceiling height", "MS 1064", "JKR BIM mandate threshold") → use lookup_regulation.
- For SMM2 / NRM measurement questions ("what is section F", "where does this go in NRM") → use lookup_measurement_code.
- For VO letter / approval drafts → use get_vo_template, then walk the user through filling fields.

Regulatory answer format (CRITICAL):
- When lookup_regulation returns multiple matches, do NOT pick blindly. Read every "title" / "title_cn" carefully and choose the row whose by_law_number / standard_number is the closest fit to the user's specific question. Example: "minimum ceiling height for residential ROOMS" → By-Law 23 (habitable rooms, 2.75 m), NOT By-Law 25 (kitchen, 2.4 m).
- ALWAYS quote the specific identifier in your reply: "UBBL Part V, By-Law 23" / "MS 1064:2014" / "JKR BIM Mandate 2017 (RM 100M threshold)". Never just say "Part V" without the by-law number.
- If the user's question is ambiguous and multiple rows could fit, list 2-3 most relevant matches with their by-law numbers and ask the user which scenario they mean (residential / kitchen / bathroom / commercial).

Common multi-step workflows (use these as templates when planning):
- Full VO analysis: compare_ifc → summarize_commercial_impact → analyze_contract_clause → export_vo_excel / generate_report
- Quick VO summary: compare_ifc → summarize_commercial_impact
- Compliance check: lookup_regulation → lookup_measurement_code (if measurement context needed)
- Audit + comparison: audit_ifc → compare_ifc → summarize_commercial_impact
- VO letter draft: compare_ifc → summarize_commercial_impact → get_vo_template

Tool dependency chain (the system enforces this automatically — blocked tools are removed from your options):
- compare_ifc requires both IFC files loaded
- summarize_commercial_impact / export_vo_excel / analyze_contract_clause / generate_report require compare_ifc to have run
- audit_ifc requires an active IFC handle in the 3D viewer
- query_ifc / lookup_regulation / lookup_measurement_code / get_vo_template have no prerequisites

audit_ifc usage note: it operates on whichever IFC is currently in the 3D viewer (the last one loaded). If the user asks to audit the "base" but the "revision" is currently active (or vice versa), the tool returns a PREREQUISITE_NOT_MET error — relay that to the user verbatim.

Memory extraction instructions:
- At the END of each reply, if the conversation revealed any new user preferences, project-specific insights, or important domain knowledge, append a JSON block wrapped in <memory_extract> tags.
- Format: <memory_extract>[{"category":"preference|project_insight|domain_knowledge|general","content":"concise fact"}]</memory_extract>
- Only extract genuinely useful facts, NOT conversation summaries. Examples:
  - {"category":"preference","content":"User prefers Chinese responses with English technical terms"}
  - {"category":"project_insight","content":"Project uses PAM 2006 contract, residential 30-storey tower"}
  - {"category":"domain_knowledge","content":"User's company standard: star rates based on JKR schedule of rates 2023"}
- If nothing worth remembering, do NOT include the tags.
- Maximum 3 items per turn. Be selective.`;

// ── Dynamic context builder ──────────────────────────────────────────────────

function buildDynamicContext(ctx: ToolContext): string {
  const parts: string[] = ['\n\n--- CURRENT WORKSPACE STATE ---'];

  // File status
  const baseStatus = ctx.baseComponents.length > 0
    ? `loaded (${ctx.baseComponents.length} elements, file: ${ctx.baseFileName ?? 'unknown'})`
    : 'not loaded';
  const revStatus = ctx.revisionComponents.length > 0
    ? `loaded (${ctx.revisionComponents.length} elements, file: ${ctx.revisionFileName ?? 'unknown'})`
    : 'not loaded';
  parts.push(`Base IFC: ${baseStatus}`);
  parts.push(`Revision IFC: ${revStatus}`);

  // Active viewer
  if (ctx.activeIfcSlot) {
    parts.push(`3D Viewer showing: ${ctx.activeIfcSlot}`);
  }

  // Comparison status
  if (ctx.voResults) {
    const r = ctx.voResults;
    parts.push(`VO Comparison: completed (${r.added.length} added, ${r.deleted.length} deleted, ${r.modified.length} modified)`);
  } else {
    parts.push('VO Comparison: not yet run');
  }

  // BQ status
  if (ctx.bqItems.length > 0) {
    parts.push(`BQ Items: ${ctx.bqItems.length} line items loaded`);
  }

  return parts.join('\n');
}

// ── Memory extraction helper ─────────────────────────────────────────────────

export interface ExtractedMemory {
  category: 'preference' | 'project_insight' | 'domain_knowledge' | 'general';
  content: string;
}

function parseMemoryExtracts(text: string): { cleanText: string; memories: ExtractedMemory[] } {
  const regex = /<memory_extract>([\s\S]*?)<\/memory_extract>/g;
  const memories: ExtractedMemory[] = [];
  let cleanText = text;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as ExtractedMemory[];
      if (Array.isArray(parsed)) {
        memories.push(...parsed.slice(0, 3));
      }
    } catch {
      // skip malformed JSON
    }
    cleanText = cleanText.replace(match[0], '').trim();
  }

  return { cleanText, memories };
}

// ── Proxy call ────────────────────────────────────────────────────────────────

async function callAgentProxy(
  messages: OpenAIMessage[],
  options: {
    allowTools?: boolean;
    memoryPrompt?: string;
    dynamicContext?: string;
    availableTools?: typeof OPENAI_TOOL_DEFINITIONS;
    routingHint?: string;
    roleOverlay?: string;
    turnId?: string | null;
  } = {},
): Promise<{ response: unknown; credits_balance: number | null; turn_id: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not signed in. Please log in first.');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    '';
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/agent-proxy`;

  const allowTools = options.allowTools !== false;
  const tools = allowTools ? (options.availableTools ?? OPENAI_TOOL_DEFINITIONS) : [];

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      tools,
      turn_id: options.turnId ?? null,
      system: SYSTEM_PROMPT + (options.roleOverlay || '') + (options.dynamicContext || '') + (options.routingHint || '') + (options.memoryPrompt || ''),
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.error === 'string' ? json.error : `Agent proxy failed (${res.status}).`;
    const err = Object.assign(new Error(message), { status: res.status });
    throw err;
  }
  return {
    response: json.response,
    credits_balance: typeof json.credits_balance === 'number' ? json.credits_balance : null,
    turn_id: typeof json.turn_id === 'string' ? json.turn_id : null,
  };
}

// ── Response parsing ──────────────────────────────────────────────────────────

function extractAssistantMessage(response: unknown): OpenAIMessage | null {
  if (!response || typeof response !== 'object') return null;
  const choices = (response as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as Record<string, unknown>).message as OpenAIMessage | undefined;
  return message ?? null;
}

// ── AgentSession ──────────────────────────────────────────────────────────────

const APPROVAL_GATED_TOOLS = new Set(['export_vo_excel', 'generate_report']);

function evidenceForTool(name: string, result: unknown): { type: AgentEvidenceType; title: string; payload: unknown } | null {
  if (!result || typeof result !== 'object' || 'error' in result) return null;

  switch (name) {
    case 'compare_ifc':
      return { type: 'comparison', title: 'IFC comparison result', payload: result };
    case 'summarize_commercial_impact':
      return { type: 'commercial_summary', title: 'Commercial impact summary', payload: result };
    case 'analyze_contract_clause':
      return { type: 'contract_assessment', title: 'Contract clause assessment packet', payload: result };
    case 'audit_ifc':
      return { type: 'audit', title: 'IFC audit extraction', payload: result };
    case 'export_vo_excel':
      return { type: 'report', title: 'VO Excel workbook generated', payload: result };
    case 'generate_report':
      return { type: 'report', title: 'VO PDF report generated', payload: result };
    case 'lookup_regulation':
    case 'lookup_measurement_code':
    case 'get_vo_template':
      return { type: 'knowledge_lookup', title: `${name} result`, payload: result };
    default:
      return null;
  }
}

export class AgentSession {
  private messages: OpenAIMessage[] = [];
  private memoryPrompt = '';
  private activeRoleId: string | null = null;
  private onPersistMessage: ((msg: OpenAIMessage) => void) | null = null;
  private onMemoryExtracted: ((memories: ExtractedMemory[]) => void) | null = null;
  private executionTracker: AgentExecutionTracker | null = null;
  private contextManager = new ContextManager();

  constructor(private ctx: ToolContext) {}

  updateContext(ctx: ToolContext) {
    this.ctx = ctx;
  }

  /** Set the long-term memory text to append to system prompt */
  setMemoryPrompt(prompt: string) {
    this.memoryPrompt = prompt;
  }

  /** Set active role for specialized persona */
  setRole(roleId: string | null) {
    this.activeRoleId = roleId;
  }

  getRole(): string | null {
    return this.activeRoleId;
  }

  /** Set callback to persist each message to Supabase */
  setOnPersistMessage(cb: (msg: OpenAIMessage) => void) {
    this.onPersistMessage = cb;
  }

  /** Set callback when memories are extracted from conversation */
  setOnMemoryExtracted(cb: (memories: ExtractedMemory[]) => void) {
    this.onMemoryExtracted = cb;
  }

  setExecutionTracker(tracker: AgentExecutionTracker | null) {
    this.executionTracker = tracker;
  }

  /** Restore messages from DB (called on project load) */
  restoreMessages(messages: OpenAIMessage[]) {
    this.messages = [...messages];
  }

  reset() {
    this.messages = [];
    this.contextManager.reset();
  }

  getMessages(): readonly OpenAIMessage[] {
    return this.messages;
  }

  async send(userText: string, onEvent: (event: AgentEvent) => void): Promise<string> {
    const tracker = this.executionTracker;
    const runId = await tracker?.startRun({ request: userText, roleId: this.activeRoleId }) ?? null;
    const userMsg: OpenAIMessage = { role: 'user', content: userText };
    this.messages.push(userMsg);
    this.onPersistMessage?.(userMsg);

    const MAX_HOPS = 10;
    const seenCallKeys = new Set<string>();
    let prerequisiteFailed = false;
    let toolStep = 0;
    let ledgerStep = 0;
    let consecutiveEmptyHops = 0;
    let turnId: string | null = null;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const isLastHop = hop === MAX_HOPS - 1;
      const allowTools = !isLastHop && !prerequisiteFailed;

      const routedTools = getAvailableTools(this.ctx);
      const routingHint = buildToolRoutingHint(this.ctx);

      const sessionContext = this.contextManager.buildContextSummary();

      let proxyResult: { response: unknown; credits_balance: number | null; turn_id: string | null };
      try {
        proxyResult = await callAgentProxy(this.messages, {
          allowTools,
          memoryPrompt: this.memoryPrompt,
          dynamicContext: buildDynamicContext(this.ctx) + sessionContext,
          availableTools: routedTools,
          routingHint,
          roleOverlay: buildRoleOverlay(this.activeRoleId),
          turnId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onEvent({ kind: 'error', message });
        if (runId) await tracker?.completeRun(runId, 'failed', message);
        throw err;
      }

      turnId = proxyResult.turn_id ?? turnId;
      onEvent({ kind: 'credits', balance: proxyResult.credits_balance });

      const assistantMsg = extractAssistantMessage(proxyResult.response);
      if (!assistantMsg) {
        onEvent({ kind: 'error', message: 'Empty model response.' });
        if (runId) await tracker?.completeRun(runId, 'failed', 'Empty model response.');
        return '';
      }

      this.messages.push(assistantMsg);
      this.onPersistMessage?.(assistantMsg);

      const rawText = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
      const toolCalls = assistantMsg.tool_calls ?? [];

      // Final answer: text with no tool calls
      if (rawText && toolCalls.length === 0) {
        const { cleanText, memories } = parseMemoryExtracts(rawText);
        if (cleanText) onEvent({ kind: 'assistant_text', text: cleanText });
        if (memories.length > 0) this.onMemoryExtracted?.(memories);
        if (runId) {
          await tracker?.recordStep(runId, {
            sequenceNo: ++ledgerStep,
            stepType: 'assistant',
            status: 'completed',
            output: { text: cleanText },
          });
          await tracker?.completeRun(runId, 'completed', cleanText);
        }
        return cleanText;
      }

      // Intermediate reasoning (text before tool calls) → emit as thinking
      if (rawText && toolCalls.length > 0) {
        onEvent({ kind: 'thinking', text: rawText, step: hop + 1, totalSteps: null });
      }

      if (toolCalls.length === 0 && !rawText) {
        consecutiveEmptyHops++;
        if (consecutiveEmptyHops >= 2) {
          const message = 'Agent produced empty responses. Stopping.';
          onEvent({ kind: 'error', message });
          if (runId) await tracker?.completeRun(runId, 'failed', message);
          return '';
        }
        continue;
      }
      consecutiveEmptyHops = 0;

      for (const tc of toolCalls) {
        const name = tc.function?.name ?? '';
        const argsJson = tc.function?.arguments ?? '';
        let args: Record<string, unknown> = {};
        try {
          args = argsJson ? JSON.parse(argsJson) : {};
        } catch {
          args = {};
        }

        toolStep++;
        onEvent({ kind: 'tool_start', name, input: args });
        const started = performance.now();
        let result: unknown;

        const callKey = `${name}::${argsJson}`;
        if (seenCallKeys.has(callKey)) {
          result = {
            error:
              'DUPLICATE_TOOL_CALL: this exact tool was already invoked with the same arguments in this turn. STOP calling tools and reply in plain text now.',
          };
        } else {
          seenCallKeys.add(callKey);
          let mayExecute = true;
          if (APPROVAL_GATED_TOOLS.has(name)) {
            if (!tracker || !runId) {
              result = { error: 'APPROVAL_UNAVAILABLE: Formal outputs require an auditable project run.' };
              mayExecute = false;
            } else {
              const approved = await tracker.requestApproval(runId, name, args);
              if (!approved) {
                result = {
                  error: `APPROVAL_REJECTED: The user declined ${name}. Do not retry unless asked again.`,
                };
                mayExecute = false;
              }
            }
          }
          if (mayExecute) {
            try {
              result = await executeAgentTool(name, args, this.ctx);
            } catch (err) {
              result = { error: err instanceof Error ? err.message : String(err) };
            }
          }
        }

        this.contextManager.recordToolResult(name, result);

        if (result && typeof result === 'object' && 'error' in result) {
          const errStr = String((result as Record<string, unknown>).error ?? '');
          if (
            errStr.includes('PREREQUISITE_NOT_MET')
            || errStr.includes('APPROVAL_REJECTED')
            || errStr.includes('APPROVAL_UNAVAILABLE')
          ) {
            prerequisiteFailed = true;
          }
        }

        const durationMs = Math.round(performance.now() - started);
        onEvent({
          kind: 'tool_end',
          name,
          result,
          durationMs,
        });
        if (runId) {
          const outputError =
            result && typeof result === 'object' && 'error' in result
              ? String((result as Record<string, unknown>).error ?? '')
              : '';
          const stepId = await tracker?.recordStep(runId, {
            sequenceNo: ++ledgerStep,
            stepType: 'tool',
            toolName: name,
            status: outputError.includes('APPROVAL_REJECTED')
              ? 'rejected'
              : outputError
                ? 'failed'
                : 'completed',
            input: args,
            output: result,
            durationMs,
          }) ?? null;
          const evidence = evidenceForTool(name, result);
          if (evidence) await tracker?.recordEvidence(runId, stepId, evidence);
        }
        const toolMsg: OpenAIMessage = {
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        };
        this.messages.push(toolMsg);
        this.onPersistMessage?.(toolMsg);
      }
    }

    const msg = `Agent completed ${toolStep} tool steps across ${MAX_HOPS} reasoning hops.`;
    onEvent({ kind: 'error', message: msg });
    if (runId) await tracker?.completeRun(runId, 'failed', msg);
    return msg;
  }
}
