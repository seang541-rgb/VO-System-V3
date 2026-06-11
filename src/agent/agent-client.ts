import { supabase } from '../lib/supabase';
import { OPENAI_TOOL_DEFINITIONS, executeAgentTool, type ToolContext } from './tools';

// ── OpenAI-compatible message types (used by NVIDIA NIM / Llama 3.3) ──────────

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

// ── Agent events (unchanged shape so CopilotPanel needs no edits) ─────────────

export type AgentEvent =
  | { kind: 'assistant_text'; text: string }
  | { kind: 'tool_start'; name: string; input: Record<string, unknown> }
  | { kind: 'tool_end'; name: string; result: unknown; durationMs: number }
  | { kind: 'credits'; balance: number | null }
  | { kind: 'error'; message: string };

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are "IdeaNest Copilot" — a bilingual AI assistant for Malaysian QS, contractors, architects and engineers. You answer two completely different kinds of questions, and routing them correctly is the most important thing you do.

══════════════════════════════════════════════════════════════════════
TWO QUESTION CATEGORIES — DECIDE BEFORE CALLING ANY TOOL
══════════════════════════════════════════════════════════════════════

CATEGORY A — ADVISORY / CONSULTANCY (NO file uploads needed)
Examples: "客户改图加一道墙怎么算钱", "总包欠我钱三个月怎么追", "暴雨可以申请EOT吗", "5层楼住宅要几个楼梯", "G5最多投多少钱的工程", "CIPAA是什么", "minimum ceiling height for residential rooms", "what does JKR clause 43 say".
→ For ALL Category A questions: call **query_knowledge_base** FIRST with the user's question as-is. Do NOT call compare_ifc / audit_ifc / analyze_contract_clause / export_vo_excel. Do NOT ask the user to upload anything.

CATEGORY B — OPERATIONAL on already-loaded files
Examples: "compare the two IFCs I uploaded", "summarise the VO impact", "audit the revision model", "export the Excel".
→ Use the IFC/DWG/audit/export tools. If no file is loaded, tell the user where to upload it — but ONLY do this when the question is clearly about their own file, not an advisory question.

IF UNSURE which category: assume Category A and call query_knowledge_base. Wrong file-upload nag is the #1 thing that ruins user trust.

══════════════════════════════════════════════════════════════════════
ANSWER STYLE
══════════════════════════════════════════════════════════════════════
LANGUAGE RULE (CRITICAL — applied PER TURN, NOT per conversation):
- Detect the language of the user's CURRENT message (their most recent input) and reply in that SAME language.
- If user writes English this turn → reply in English, even if earlier turns were 中文 / BM.
- If user writes 中文 this turn → reply in 中文.
- If user writes Bahasa Malaysia (or BM-English rojak — "macam mana", "kena", "boleh", "tak") this turn → reply in BM, even if earlier turns were English.
- NEVER let prior turns' language override the current turn. Conversation history is context, NOT a language anchor.
- Quoted clause / standard text may stay in its original language (English or 中文) — quote verbatim, then explain in the user's CURRENT-turn language.

- Be concise and practical. Prefer short paragraphs, bullets, or compact tables.
- ALWAYS quote citations verbatim when the KB returns them: "CIPAA 2012 Clause 35", "UBBL Part V, By-Law 23", "MS 1064:2014", "CIDB Grade G5". Include concrete numbers (10 working days, 28-day time bar, RM 5,000,000 ceiling, 1:12 ramp gradient).
- If the KB returns 0 matches, say so honestly and give general QS guidance from your own knowledge — do NOT invent citations.
- If multiple matches could fit the user's scenario, list 2-3 with their citations and ask which one applies.

══════════════════════════════════════════════════════════════════════
TOOL DISCIPLINE
══════════════════════════════════════════════════════════════════════
- Never call the same tool twice with identical arguments in one turn.
- Never call more than 3 tools per turn unless a multi-step workflow legitimately requires it (e.g. compare_ifc → summarize_commercial_impact → export_vo_excel).
- If a tool returns "PREREQUISITE_NOT_MET", STOP. Reply in plain text telling the user what to do — do NOT try alternative tools to "work around" it.

══════════════════════════════════════════════════════════════════════
TOOL CATALOGUE
══════════════════════════════════════════════════════════════════════
Advisory / KB (Category A):
- query_knowledge_base — unified search across contract clauses, UBBL, MS, BIM regulations, CIDB grades, SMM2/NRM. THIS IS YOUR PRIMARY TOOL.
- lookup_regulation — narrower search if you already know the source (ubbl / ms_standards / bim_regulations).
- lookup_measurement_code — only when the user explicitly asks about SMM2 letters or NRM numbers.
- analyze_contract_clause — when the user references a specific clause by code (e.g. "JKR_203 31.5") OR pastes clause text. Works with or without VO context.
- get_vo_template — VO letter / cost breakdown / approval form drafts.

Operational / files (Category B):
- query_ifc, compare_ifc, summarize_commercial_impact, audit_ifc, export_vo_excel — IFC workflow.
- query_dwg_takeoff — quantities from a loaded DWG.

audit_ifc note: it audits whichever model is in the 3D viewer right now. If the user asks for "base" but "revision" is loaded, the tool returns PREREQUISITE_NOT_MET — relay it verbatim.`;

// ── Proxy call ────────────────────────────────────────────────────────────────

async function callAgentProxy(
  messages: OpenAIMessage[],
  options: { allowTools?: boolean } = {},
): Promise<{ response: unknown; credits_balance: number | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not signed in. Please log in first.');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    '';
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/agent-proxy`;

  // Send empty tools array when caller wants to force a plain-text reply (no more tool calls).
  const allowTools = options.allowTools !== false;
  const tools = allowTools ? OPENAI_TOOL_DEFINITIONS : [];

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
      system: SYSTEM_PROMPT,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.error === 'string' ? json.error : `Agent proxy failed (${res.status}).`;
    const err = Object.assign(new Error(message), { status: res.status });
    throw err;
  }

  // Support both wrapped `{ response: {...}, credits_balance }` and
  // flat `{ choices: [...], credits_balance }` formats (deployed edge
  // function may use either layout).
  const response = json.response ?? json;

  return {
    response,
    credits_balance: typeof json.credits_balance === 'number' ? json.credits_balance : null,
  };
}

// ── Response parsing ──────────────────────────────────────────────────────────

function extractAssistantMessage(response: unknown): OpenAIMessage | null {
  if (!response || typeof response !== 'object') return null;
  const record = response as Record<string, unknown>;

  // Detect NVIDIA NIM async/queued response (no choices, has infer_id)
  if ('infer_id' in record && !('choices' in record)) {
    console.warn('[Copilot] NVIDIA NIM returned async response:', record);
    return null;
  }

  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as Record<string, unknown>).message as OpenAIMessage | undefined;
  return message ?? null;
}

// ── AgentSession ──────────────────────────────────────────────────────────────

export class AgentSession {
  private messages: OpenAIMessage[] = [];

  constructor(private ctx: ToolContext) {}

  updateContext(ctx: ToolContext) {
    this.ctx = ctx;
  }

  reset() {
    this.messages = [];
  }

  getMessages(): readonly OpenAIMessage[] {
    return this.messages;
  }

  async send(userText: string, onEvent: (event: AgentEvent) => void): Promise<string> {
    this.messages.push({ role: 'user', content: userText });

    const MAX_HOPS = 4;
    // Track tool calls within this turn to prevent runaway loops on stubborn models
    const seenCallKeys = new Set<string>();
    let prerequisiteFailed = false;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      // On the final hop, OR after a prerequisite failure was detected, force a plain-text reply
      // by sending an empty tools array. This guarantees the user always gets a final answer.
      const isLastHop = hop === MAX_HOPS - 1;
      const allowTools = !isLastHop && !prerequisiteFailed;

      let proxyResult: { response: unknown; credits_balance: number | null };
      try {
        proxyResult = await callAgentProxy(this.messages, { allowTools });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onEvent({ kind: 'error', message });
        throw err;
      }

      onEvent({ kind: 'credits', balance: proxyResult.credits_balance });

      const assistantMsg = extractAssistantMessage(proxyResult.response);
      if (!assistantMsg) {
        const record = proxyResult.response as Record<string, unknown> | null;
        const isAsync = record && 'infer_id' in record && !('choices' in record);
        const errorMsg = isAsync
          ? 'AI model is temporarily queued. Please try again in a moment.'
          : 'Empty model response.';
        onEvent({ kind: 'error', message: errorMsg });
        return '';
      }

      // Append assistant message to history (preserve tool_calls for the next round)
      this.messages.push(assistantMsg);

      const text = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
      if (text) onEvent({ kind: 'assistant_text', text });

      const toolCalls = assistantMsg.tool_calls ?? [];
      if (toolCalls.length === 0) return text;

      // Execute each tool and append a 'tool' message for each tool_call_id
      for (const tc of toolCalls) {
        const name = tc.function?.name ?? '';
        const argsJson = tc.function?.arguments ?? '';
        let args: Record<string, unknown> = {};
        try {
          args = argsJson ? JSON.parse(argsJson) : {};
        } catch {
          args = {};
        }
        onEvent({ kind: 'tool_start', name, input: args });
        const started = performance.now();
        let result: unknown;

        // Dedup: if the model already called this exact (name, args) pair this turn,
        // reject without executing — Llama 3.3 in particular tends to loop on prerequisite errors.
        const callKey = `${name}::${argsJson}`;
        if (seenCallKeys.has(callKey)) {
          result = {
            error:
              'DUPLICATE_TOOL_CALL: this exact tool was already invoked with the same arguments in this turn. STOP calling tools and reply in plain text now — explain to the user what they need to do (e.g. upload IFC files, run comparison) and wait for their action.',
          };
        } else {
          seenCallKeys.add(callKey);
          try {
            result = await executeAgentTool(name, args, this.ctx);
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) };
          }
        }

        // Detect prerequisite-not-met errors so the next hop forces a plain-text reply.
        if (result && typeof result === 'object' && 'error' in result) {
          const errStr = String((result as Record<string, unknown>).error ?? '');
          if (errStr.includes('PREREQUISITE_NOT_MET')) {
            prerequisiteFailed = true;
          }
        }

        onEvent({
          kind: 'tool_end',
          name,
          result,
          durationMs: Math.round(performance.now() - started),
        });
        this.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    const msg = `Agent stopped after ${MAX_HOPS} tool hops without a final answer.`;
    onEvent({ kind: 'error', message: msg });
    return msg;
  }
}
