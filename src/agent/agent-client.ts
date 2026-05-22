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

const SYSTEM_PROMPT = `You are "IFC Copilot", an embedded assistant inside the VO System — a browser-based tool for comparing IFC building models and generating Variation Order (VO) substantiation workbooks for QS / construction professionals.

You help the user by:
- Answering questions about loaded IFC models (base and revision).
- Running and interpreting VO comparisons (Added / Deleted / Modified elements).
- Summarizing the commercial impact in JKR / SMM2 terms (Omissions, Additions, Star Rate, Formwork, EOT).
- Assessing whether a VO qualifies as a claim under a specific contract clause (analyze_contract_clause).
- Driving the Excel export when the user asks for it.

Style:
- Be concise and practical. Prefer tables or short bullet lists.
- When you call tools, reason briefly about why, then read the tool result before drafting the reply.
- Use the user's preferred language (Chinese / English / mixed) based on their prompt.

Tool failure handling (CRITICAL):
- If any tool returns an error containing "PREREQUISITE_NOT_MET", STOP calling tools immediately. Do NOT try other tools to "work around" the problem. Reply in plain text and tell the user exactly what action they need to take (upload files, click a button, etc.).
- Never call the same tool twice with identical arguments. Never call more than 3 tools per user turn unless the workflow legitimately requires it (e.g. compare_ifc → summarize_commercial_impact → export_vo_excel).
- If a tool returns any other error, explain the issue to the user once and ask how to proceed — do not retry unless the user redirects you.

Contract-clause analysis flow:
- When the user pastes a contract clause and asks whether the VO qualifies as a claim, call analyze_contract_clause with the clause text. The tool will return a structured packet (clauseText + voSnapshot + topCommercialActions + instructions).
- After the tool returns, you MUST produce a four-field structured assessment in your reply: eligible (yes/no/uncertain), clauseExcerpt (single quoted sentence from the clause), reasoning (3-5 sentences citing concrete VO numbers), recommendedAction (one concrete next step for the QS).
- Cite specific numbers from voSnapshot (e.g. "Net VO value of MYR X with Y EOT flags"). Never invent contract clause text — only quote what the user pasted.
- Do not call analyze_contract_clause more than once for the same clause in a row; produce the assessment instead.

Capabilities currently available (9 tools):
- IFC workflows: query_ifc, compare_ifc, summarize_commercial_impact, audit_ifc, export_vo_excel
- Contract/regulatory: analyze_contract_clause, lookup_regulation, lookup_measurement_code, get_vo_template

Tool selection guidance:
- For "what does Clause X say in JKR/PAM" → use analyze_contract_clause with contractType + clauseNumber (it now fetches from the knowledge base; user does not need to paste the clause).
- For UBBL / MS / BIM compliance questions ("minimum ceiling height", "MS 1064", "JKR BIM mandate threshold") → use lookup_regulation.
- For SMM2 / NRM measurement questions ("what is section F", "where does this go in NRM") → use lookup_measurement_code.
- For VO letter / approval drafts → use get_vo_template, then walk the user through filling fields.

Regulatory answer format (CRITICAL):
- When lookup_regulation returns multiple matches, do NOT pick blindly. Read every "title" / "title_cn" carefully and choose the row whose by_law_number / standard_number is the closest fit to the user's specific question. Example: "minimum ceiling height for residential ROOMS" → By-Law 23 (habitable rooms, 2.75 m), NOT By-Law 25 (kitchen, 2.4 m).
- ALWAYS quote the specific identifier in your reply: "UBBL Part V, By-Law 23" / "MS 1064:2014" / "JKR BIM Mandate 2017 (RM 100M threshold)". Never just say "Part V" without the by-law number.
- If the user's question is ambiguous and multiple rows could fit, list 2-3 most relevant matches with their by-law numbers and ask the user which scenario they mean (residential / kitchen / bathroom / commercial).

audit_ifc usage note: it operates on whichever IFC is currently in the 3D viewer (the last one loaded). If the user asks to audit the "base" but the "revision" is currently active (or vice versa), the tool returns a PREREQUISITE_NOT_MET error — relay that to the user verbatim.`;

// ── Proxy call ────────────────────────────────────────────────────────────────

async function callAgentProxy(
  messages: OpenAIMessage[],
  options: { allowTools?: boolean; memoryPrompt?: string } = {},
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
      system: SYSTEM_PROMPT + (options.memoryPrompt || ''),
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

export class AgentSession {
  private messages: OpenAIMessage[] = [];
  private memoryPrompt = '';
  private onPersistMessage: ((msg: OpenAIMessage) => void) | null = null;

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

  /** Restore messages from DB (called on project load) */
  restoreMessages(messages: OpenAIMessage[]) {
    this.messages = [...messages];
  }

  reset() {
    this.messages = [];
  }

  getMessages(): readonly OpenAIMessage[] {
    return this.messages;
  }

  async send(userText: string, onEvent: (event: AgentEvent) => void): Promise<string> {
    const userMsg: OpenAIMessage = { role: 'user', content: userText };
    this.messages.push(userMsg);
    this.onPersistMessage?.(userMsg);

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
        proxyResult = await callAgentProxy(this.messages, { allowTools, memoryPrompt: this.memoryPrompt });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onEvent({ kind: 'error', message });
        throw err;
      }

      onEvent({ kind: 'credits', balance: proxyResult.credits_balance });

      const assistantMsg = extractAssistantMessage(proxyResult.response);
      if (!assistantMsg) {
        onEvent({ kind: 'error', message: 'Empty model response.' });
        return '';
      }

      // Append assistant message to history (preserve tool_calls for the next round)
      this.messages.push(assistantMsg);
      this.onPersistMessage?.(assistantMsg);

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
        const toolMsg: OpenAIMessage = {
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        };
        this.messages.push(toolMsg);
        this.onPersistMessage?.(toolMsg);
      }
    }

    const msg = `Agent stopped after ${MAX_HOPS} tool hops without a final answer.`;
    onEvent({ kind: 'error', message: msg });
    return msg;
  }
}
