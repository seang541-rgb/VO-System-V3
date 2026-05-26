import { supabase } from '../lib/supabase';
import { OPENAI_TOOL_DEFINITIONS, executeAgentTool, getAvailableTools, buildToolRoutingHint, type ToolContext } from './tools';
import { ContextManager } from './context-manager';

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
  | { kind: 'assistant_delta'; text: string }
  | { kind: 'thinking'; text: string; step: number; totalSteps: number | null }
  | { kind: 'tool_start'; name: string; input: Record<string, unknown> }
  | { kind: 'tool_end'; name: string; result: unknown; durationMs: number }
  | { kind: 'credits'; balance: number | null }
  | { kind: 'stopped'; message: string }
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
  consumeApproval: (runId: string, actionType: string) => Promise<void>;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are "VO Copilot", an embedded assistant inside the VO System — a browser-based tool for comparing IFC building models and reading project documents to generate Variation Order (VO) substantiation workbooks for QS / construction professionals.

You help the user by:
- Answering questions about loaded IFC models (base and revision).
- Running and interpreting VO comparisons (Added / Deleted / Modified elements).
- Summarizing the commercial impact in JKR / SMM2 terms (Omissions, Additions, Star Rate, Formwork, EOT).
- Assessing whether a VO qualifies as a claim under a specific contract clause (analyze_contract_clause).
- Driving the Excel export when the user asks for it.

Interaction gate (HIGHEST PRIORITY):
- Greetings, thanks, casual conversation, and questions about your capabilities require NO tool calls. Reply directly.
- Only inspect IFC data when the user's CURRENT message explicitly asks about model contents, comparison, audit, VO quantities, or report generation.
- Do not repeat or infer a tool task from earlier conversation history when the current message does not request it.

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

Evidence discipline (HIGHEST PRIORITY):
- Facts about project files, comparison quantities, contract clauses, regulations, measurement rules, templates, or rates are verified only when they are supplied by the user or returned by an appropriate tool.
- If a lookup tool returns zero matches, no template, or an error, say that the system could not verify the answer. Do NOT fill gaps from general model knowledge, invent citations, or state a number as confirmed.
- General background knowledge may be offered only when the user explicitly asks for an unverified explanation, and it must be labeled as unverified. It must never be used as a compliance, valuation, or claim conclusion.

Tool failure handling (CRITICAL):
- If any tool returns an error containing "PREREQUISITE_NOT_MET", STOP calling tools immediately. Do NOT try other tools to "work around" the problem. Reply in plain text and tell the user exactly what action they need to take (upload files, click a button, etc.).
- Formal deliverables from export_vo_excel or generate_report require recorded human approval. If approval is rejected or unavailable, acknowledge it and do not request another formal output in the same turn.
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
- When lookup_regulation returns multiple matches, do NOT pick blindly. Read every "title" / "title_cn" carefully and choose only a row whose described scenario explicitly fits the user's question (for example, do not substitute a kitchen requirement for a habitable-room question).
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

function directConversationReply(userText: string): string | null {
  const normalized = userText
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:，。！？；：]+$/u, '')
    .trim();

  if (/^(hi|hello|hey|hello there|你好|嗨|哈喽|您好)$/u.test(normalized)) {
    return /[\u4e00-\u9fff]/u.test(normalized)
      ? '你好。你可以让我检查 IFC、分析 VO 或准备报告。'
      : 'Hello. I can help inspect IFC data, analyze a VO, or prepare a report.';
  }

  if (/^(thanks|thank you|thx|谢谢|多谢)$/u.test(normalized)) {
    return /[\u4e00-\u9fff]/u.test(normalized) ? '不客气。' : 'You are welcome.';
  }

  return null;
}

interface AgentProxyResult {
  response: unknown;
  credits_balance: number | null;
  turn_id: string | null;
}

interface StreamingMessageDelta {
  role?: OpenAIMessage['role'];
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: 'function';
    function?: { name?: string; arguments?: string };
  }>;
}

function appendStreamDelta(message: OpenAIMessage, delta: StreamingMessageDelta) {
  if (delta.role) message.role = delta.role;
  if (typeof delta.content === 'string') {
    message.content = `${message.content ?? ''}${delta.content}`;
  }
  if (!Array.isArray(delta.tool_calls)) return;

  const toolCalls = message.tool_calls ?? [];
  for (const part of delta.tool_calls) {
    const index = typeof part.index === 'number' ? part.index : toolCalls.length;
    const existing = toolCalls[index] ?? {
      id: part.id ?? `tool-${index}`,
      type: 'function' as const,
      function: { name: '', arguments: '' },
    };
    if (part.id) existing.id = part.id;
    if (part.function?.name) existing.function.name += part.function.name;
    if (part.function?.arguments) existing.function.arguments += part.function.arguments;
    toolCalls[index] = existing;
  }
  message.tool_calls = toolCalls;
}

async function readStreamResponse(
  res: Response,
  onTextDelta?: (text: string) => void,
): Promise<AgentProxyResult> {
  if (!res.body) throw new Error('Agent proxy returned an empty stream.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const message: OpenAIMessage = { role: 'assistant', content: '' };
  let creditsBalance: number | null = null;
  let turnId: string | null = null;
  let buffer = '';

  const acceptFrame = (frame: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/u)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    const data = dataLines.join('\n');
    if (!data || data === '[DONE]') return;

    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (eventName === 'meta') {
      creditsBalance = typeof parsed.credits_balance === 'number' ? parsed.credits_balance : null;
      turnId = typeof parsed.turn_id === 'string' ? parsed.turn_id : null;
      return;
    }
    if (eventName === 'error') {
      throw new Error(typeof parsed.error === 'string' ? parsed.error : 'Agent stream failed.');
    }

    const choices = parsed.choices;
    if (!Array.isArray(choices) || choices.length === 0) return;
    const delta = (choices[0] as { delta?: StreamingMessageDelta }).delta;
    if (!delta) return;
    appendStreamDelta(message, delta);
    if (typeof delta.content === 'string' && delta.content) onTextDelta?.(delta.content);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/u);
    buffer = frames.pop() ?? '';
    for (const frame of frames) acceptFrame(frame);
    if (done) break;
  }
  if (buffer.trim()) acceptFrame(buffer);

  return {
    response: { choices: [{ message }] },
    credits_balance: creditsBalance,
    turn_id: turnId,
  };
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
    turnId?: string | null;
    signal?: AbortSignal;
    onTextDelta?: (text: string) => void;
  } = {},
): Promise<AgentProxyResult> {
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
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      tools,
      turn_id: options.turnId ?? null,
      system: SYSTEM_PROMPT + (options.dynamicContext || '') + (options.routingHint || '') + (options.memoryPrompt || ''),
    }),
  });

  const contentType = res.headers.get('Content-Type') ?? '';
  if (res.ok && contentType.includes('text/event-stream')) {
    return await readStreamResponse(res, options.onTextDelta);
  }

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
const GROUNDED_LOOKUP_TOOLS = new Set([
  'lookup_regulation',
  'lookup_measurement_code',
  'get_vo_template',
  'estimate_cost',
]);

function toolError(result: unknown): string | null {
  if (!result || typeof result !== 'object' || !('error' in result)) return null;
  return String((result as Record<string, unknown>).error ?? 'Tool failed.');
}

function groundedLookupHasEvidence(name: string, result: unknown): boolean | null {
  if (!GROUNDED_LOOKUP_TOOLS.has(name)) return null;
  if (!result || typeof result !== 'object' || 'error' in result) return false;
  const row = result as Record<string, unknown>;

  if (name === 'get_vo_template') return !!row.template;

  if (typeof row.count === 'number') return row.count > 0;
  if (name === 'lookup_regulation' && row.counts && typeof row.counts === 'object') {
    return Object.values(row.counts as Record<string, unknown>)
      .some((count) => typeof count === 'number' && count > 0);
  }
  return false;
}

function unverifiedLookupReply(userText: string): string {
  if (/[\u4e00-\u9fff]/u.test(userText)) {
    return '我已经查询了当前知识库，但没有找到能够支撑结论的匹配记录。因此我不能可靠地给出具体条文、编号、标准数值、模板或报价。请提供更具体的关键词或补充资料后，我可以继续核验。';
  }
  return 'I searched the current knowledge base but found no matching record that supports a conclusion. I cannot reliably provide a specific citation, standard value, template, or rate without evidence. Please provide a narrower term or source material and I can verify it.';
}

function prerequisiteReply(error: string, userText: string): string {
  const zh = /[\u4e00-\u9fff]/u.test(userText);
  if (error.includes('no queryable components') || error.includes('No IFC model is currently loaded')) {
    return zh
      ? '当前没有可查询的 IFC 模型内容，因此我不能判断模型中是否存在相关构件。请先加载或重新加载要查询的 IFC 文件，再重新提问。'
      : 'There is no queryable IFC model content available, so I cannot determine whether matching elements exist. Please load or reload the IFC file and ask again.';
  }
  if (error.includes('not loaded both IFC files') || error.includes('has not loaded IFC files')) {
    return zh
      ? '当前缺少完整的 IFC 输入，无法进行比较或基于比较的分析。请先上传 Base IFC 与 Revision IFC，然后重新提问。'
      : 'The complete IFC input is not available, so I cannot run a comparison or comparison-based analysis. Please load both the Base IFC and Revision IFC files and ask again.';
  }
  if (error.includes('no VO comparison has been run') || error.includes('No comparison results available')) {
    return zh
      ? '当前还没有 VO 比较结果，因此我不能进行后续结论或正式输出。请先运行 VO Comparison，再重新提问。'
      : 'There is no VO comparison result yet, so I cannot provide downstream conclusions or formal output. Please run VO Comparison and ask again.';
  }
  if (error.includes('No image file available for OCR') || error.includes('No evidence document is available for reading')) {
    return zh
      ? '当前没有可供 OCR 分析的文件。请先上传扫描图片或 PDF，再重新提问。'
      : 'There is no file available for OCR. Please upload a scanned image or PDF and ask again.';
  }
  if (error.includes('currently loaded model is')) {
    return zh
      ? '当前 3D 视图中的模型与所请求的审核对象不一致，因此我不能生成审核结论。请切换到目标模型后重试。'
      : 'The model currently shown in the 3D viewer does not match the requested audit target. Switch to the target model and try again.';
  }
  return zh
    ? '当前缺少执行此分析所需的输入或状态，因此我不能可靠地下结论。请先完成界面提示的准备步骤后重新提问。'
    : 'A required input or workspace state is missing, so I cannot provide a reliable conclusion. Complete the required preparation step and ask again.';
}

function localWorkspaceGateReply(userText: string, ctx: ToolContext): string | null {
  const text = userText.trim().toLowerCase();
  const isChinese = /[\u4e00-\u9fff]/u.test(userText);
  const compareIntent =
    /(比较|对比|变更|差异|compare|comparison|differences?|changes?)/iu.test(text)
    && /(base|revision|基准|修订|ifc|模型|vo)/iu.test(text);
  if (compareIntent && (ctx.baseComponents.length === 0 || ctx.revisionComponents.length === 0)) {
    const missing: string[] = [];
    if (ctx.baseComponents.length === 0) missing.push('Base IFC');
    if (ctx.revisionComponents.length === 0) missing.push('Revision IFC');
    return isChinese
      ? `当前无法执行比较，因为还没有加载 ${missing.join(' 与 ')}。请先加载所需 IFC 文件，再重新提问。`
      : `I cannot run the comparison because ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not loaded. Please load the required IFC file${missing.length > 1 ? 's' : ''} and ask again.`;
  }

  const ocrIntent = /(ocr|文字识别|识别(?:这|该|图片|扫描|文件|pdf)|读取(?:这|该|上传的)?(?:pdf|文档|扫描件)|扫描件|pdf\s*(?:内容|文字)|scan(?:ned)?\s+(?:image|document|file)|extract\s+text)/iu.test(text);
  if (ocrIntent && !ctx.ocrFile) {
    return isChinese
      ? '当前没有可供 OCR 分析的文件。请先上传扫描图片或 PDF，再重新提问。'
      : 'There is no file available for OCR. Please upload a scanned image or PDF and ask again.';
  }

  const explicitBase = /(base|基准)/iu.test(text);
  const explicitRevision = /(revision|修订)/iu.test(text);
  const modelQueryIntent =
    /(ifc|模型|构件|墙|梁|柱|板|wall|beam|column|slab|component)/iu.test(text)
    && /(多少|有无|有没有|查询|检查|查找|列出|里面有|包含|count|how many|find|show|list|contain|inspect|check)/iu.test(text);
  if (modelQueryIntent) {
    const targets: string[] = [];
    if (explicitBase && ctx.baseComponents.length === 0) targets.push('Base IFC');
    if (explicitRevision && ctx.revisionComponents.length === 0) targets.push('Revision IFC');
    if (!explicitBase && !explicitRevision && ctx.baseComponents.length === 0 && ctx.revisionComponents.length === 0) {
      targets.push('IFC model');
    }
    if (targets.length > 0) {
      return isChinese
        ? `当前没有可查询的 ${targets.join(' 或 ')} 模型内容，因此我不能判断其中是否存在相关构件。请先加载对应 IFC 文件，再重新提问。`
        : `There is no queryable ${targets.join(' or ')} model content available, so I cannot determine whether matching elements exist. Please load the corresponding IFC file and ask again.`;
    }
  }

  return null;
}

function evidenceForTool(name: string, result: unknown): { type: AgentEvidenceType; title: string; payload: unknown } | null {
  if (!result || typeof result !== 'object' || 'error' in result) return null;
  if (groundedLookupHasEvidence(name, result) === false) return null;

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
  private onPersistMessage: ((msg: OpenAIMessage) => void) | null = null;
  private onMemoryExtracted: ((memories: ExtractedMemory[]) => void) | null = null;
  private executionTracker: AgentExecutionTracker | null = null;
  private contextManager = new ContextManager();
  private activeController: AbortController | null = null;

  constructor(private ctx: ToolContext) {}

  updateContext(ctx: ToolContext) {
    this.ctx = ctx;
  }

  /** Set the long-term memory text to append to system prompt */
  setMemoryPrompt(prompt: string) {
    this.memoryPrompt = prompt;
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
    this.stop();
    this.messages = [];
    this.contextManager.reset();
  }

  stop(): boolean {
    if (!this.activeController) return false;
    this.activeController.abort();
    this.activeController = null;
    return true;
  }

  getMessages(): readonly OpenAIMessage[] {
    return this.messages;
  }

  async resumeApprovedAction(
    runId: string,
    name: string,
    args: Record<string, unknown>,
    onEvent: (event: AgentEvent) => void,
  ): Promise<string> {
    const tracker = this.executionTracker;
    if (!tracker || !APPROVAL_GATED_TOOLS.has(name)) {
      throw new Error('This approved action cannot be resumed.');
    }

    onEvent({ kind: 'tool_start', name, input: args });
    const started = performance.now();
    let result: unknown;
    try {
      result = await executeAgentTool(name, args, this.ctx);
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    const durationMs = Math.round(performance.now() - started);
    onEvent({ kind: 'tool_end', name, result, durationMs });

    const errorText =
      result && typeof result === 'object' && 'error' in result
        ? String((result as Record<string, unknown>).error ?? 'Approved action failed.')
        : null;
    const stepId = await tracker.recordStep(runId, {
      sequenceNo: 1,
      stepType: 'tool',
      toolName: name,
      status: errorText ? 'failed' : 'completed',
      input: args,
      output: result,
      durationMs,
    });
    const evidence = evidenceForTool(name, result);
    if (evidence) await tracker.recordEvidence(runId, stepId, evidence);

    if (errorText) {
      onEvent({ kind: 'error', message: errorText });
      await tracker.completeRun(runId, 'failed', errorText);
      return errorText;
    }

    await tracker.consumeApproval(runId, name);
    const message = `${name} completed after recorded approval.`;
    onEvent({ kind: 'assistant_text', text: message });
    await tracker.completeRun(runId, 'completed', message);
    return message;
  }

  async send(userText: string, onEvent: (event: AgentEvent) => void): Promise<string> {
    const userMsg: OpenAIMessage = { role: 'user', content: userText };
    this.messages.push(userMsg);
    this.onPersistMessage?.(userMsg);

    const directReply = directConversationReply(userText);
    if (directReply) {
      const assistantMsg: OpenAIMessage = { role: 'assistant', content: directReply };
      this.messages.push(assistantMsg);
      this.onPersistMessage?.(assistantMsg);
      onEvent({ kind: 'assistant_text', text: directReply });
      return directReply;
    }

    const gatedReply = localWorkspaceGateReply(userText, this.ctx);
    if (gatedReply) {
      const assistantMsg: OpenAIMessage = { role: 'assistant', content: gatedReply };
      this.messages.push(assistantMsg);
      this.onPersistMessage?.(assistantMsg);
      onEvent({ kind: 'assistant_text', text: gatedReply });
      return gatedReply;
    }

    const controller = new AbortController();
    this.activeController = controller;
    const tracker = this.executionTracker;
    const runId = await tracker?.startRun({ request: userText, roleId: null }) ?? null;

    const MAX_HOPS = 10;
    const seenCallKeys = new Set<string>();
    let prerequisiteFailed = false;
    let toolStep = 0;
    let ledgerStep = 0;
    let consecutiveEmptyHops = 0;
    let turnId: string | null = null;
    const unresolvedGroundedLookups = new Set<string>();
    let blockedReply: string | null = null;

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
          turnId,
          signal: controller.signal,
          onTextDelta:
            blockedReply || unresolvedGroundedLookups.size > 0
              ? undefined
              : (text) => onEvent({ kind: 'assistant_delta', text }),
        });
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          const message = '生成已停止。已开始的分析回合可能已经计费。';
          onEvent({ kind: 'stopped', message });
          if (runId) await tracker?.completeRun(runId, 'cancelled', message);
          if (this.activeController === controller) this.activeController = null;
          return '';
        }
        const message = err instanceof Error ? err.message : String(err);
        onEvent({ kind: 'error', message });
        if (runId) await tracker?.completeRun(runId, 'failed', message);
        if (this.activeController === controller) this.activeController = null;
        throw err;
      }

      turnId = proxyResult.turn_id ?? turnId;
      onEvent({ kind: 'credits', balance: proxyResult.credits_balance });

      let assistantMsg = extractAssistantMessage(proxyResult.response);
      if (!assistantMsg) {
        onEvent({ kind: 'error', message: 'Empty model response.' });
        if (runId) await tracker?.completeRun(runId, 'failed', 'Empty model response.');
        if (this.activeController === controller) this.activeController = null;
        return '';
      }

      let rawText = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
      const toolCalls = assistantMsg.tool_calls ?? [];

      if (rawText && toolCalls.length === 0) {
        if (blockedReply) rawText = blockedReply;
        else if (unresolvedGroundedLookups.size > 0) rawText = unverifiedLookupReply(userText);
        assistantMsg = { ...assistantMsg, content: rawText };
      }

      this.messages.push(assistantMsg);
      this.onPersistMessage?.(assistantMsg);

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
        if (this.activeController === controller) this.activeController = null;
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
          if (this.activeController === controller) this.activeController = null;
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
        if (prerequisiteFailed) {
          result = {
            error:
              'SKIPPED_AFTER_PREREQUISITE_FAILURE: An earlier tool in this turn requires user action first. No additional tools were executed.',
          };
        } else if (seenCallKeys.has(callKey)) {
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

        const groundedResult = groundedLookupHasEvidence(name, result);
        if (groundedResult !== null) {
          if (groundedResult) unresolvedGroundedLookups.delete(name);
          else unresolvedGroundedLookups.add(name);
        }

        if (result && typeof result === 'object' && 'error' in result) {
          const errStr = String((result as Record<string, unknown>).error ?? '');
          if (
            errStr.includes('PREREQUISITE_NOT_MET')
            || errStr.includes('APPROVAL_REJECTED')
            || errStr.includes('APPROVAL_UNAVAILABLE')
          ) {
            prerequisiteFailed = true;
          }
          if (errStr.includes('PREREQUISITE_NOT_MET') && !blockedReply) {
            blockedReply = prerequisiteReply(errStr, userText);
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
          if (!outputError && APPROVAL_GATED_TOOLS.has(name)) {
            await tracker?.consumeApproval(runId, name);
          }
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
    if (this.activeController === controller) this.activeController = null;
    return msg;
  }
}
