import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, RefreshCw, Wrench } from 'lucide-react';
import { AgentSession, type AgentEvent } from '../agent/agent-client';
import type { ToolContext } from '../agent/tools';

interface ChatEntry {
  id: string;
  kind: 'user' | 'assistant' | 'tool' | 'error';
  text: string;
  meta?: string;
}

interface CopilotPanelProps {
  toolContext: ToolContext;
  signedIn: boolean;
  onCreditsUpdate?: (balance: number) => void;
}

const SAMPLE_PROMPTS = [
  '帮我对比 base 同 revision 两个 IFC，总结主要差异',
  'List the top 10 omissions and additions with amounts',
  'Base 模型里面有几多道 IfcWall？',
  '生成 VO Excel workbook',
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function truncate(str: string, n = 400) {
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

export default function CopilotPanel({ toolContext, signedIn, onCreditsUpdate }: CopilotPanelProps) {
  const sessionRef = useRef<AgentSession | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const baseReady = toolContext.baseComponents.length > 0;
  const revReady = toolContext.revisionComponents.length > 0;
  const compareReady = !!toolContext.voResults;

  useEffect(() => {
    if (!sessionRef.current) {
      sessionRef.current = new AgentSession(toolContext);
    } else {
      sessionRef.current.updateContext(toolContext);
    }
  }, [toolContext]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, busy, activeToolLabel]);

  const pushEntry = useCallback((entry: ChatEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      if (!signedIn) {
        pushEntry({ id: newId(), kind: 'error', text: '请先登录再使用 Copilot。' });
        return;
      }
      if (!sessionRef.current) sessionRef.current = new AgentSession(toolContext);
      else sessionRef.current.updateContext(toolContext);

      pushEntry({ id: newId(), kind: 'user', text: trimmed });
      setInput('');
      setBusy(true);
      setActiveToolLabel(null);

      const handleEvent = (event: AgentEvent) => {
        switch (event.kind) {
          case 'assistant_text':
            if (event.text) pushEntry({ id: newId(), kind: 'assistant', text: event.text });
            break;
          case 'tool_start':
            setActiveToolLabel(event.name);
            pushEntry({
              id: newId(),
              kind: 'tool',
              text: `${event.name}`,
              meta: truncate(JSON.stringify(event.input), 200),
            });
            break;
          case 'tool_end':
            setActiveToolLabel(null);
            pushEntry({
              id: newId(),
              kind: 'tool',
              text: `${event.name} · ${event.durationMs}ms`,
              meta: truncate(JSON.stringify(event.result), 400),
            });
            break;
          case 'credits':
            if (typeof event.balance === 'number' && onCreditsUpdate) onCreditsUpdate(event.balance);
            break;
          case 'error':
            pushEntry({ id: newId(), kind: 'error', text: event.message });
            break;
        }
      };

      try {
        await sessionRef.current.send(trimmed, handleEvent);
      } catch (err) {
        pushEntry({
          id: newId(),
          kind: 'error',
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
        setActiveToolLabel(null);
      }
    },
    [busy, onCreditsUpdate, pushEntry, signedIn, toolContext],
  );

  const handleReset = () => {
    sessionRef.current?.reset();
    setEntries([]);
    setActiveToolLabel(null);
  };

  const statusLine = useMemo(() => {
    const parts = [
      `Base IFC: ${baseReady ? `${toolContext.baseComponents.length} components` : 'not loaded'}`,
      `Revision IFC: ${revReady ? `${toolContext.revisionComponents.length} components` : 'not loaded'}`,
      `Comparison: ${compareReady ? 'cached' : 'not run'}`,
    ];
    return parts.join(' · ');
  }, [baseReady, compareReady, revReady, toolContext.baseComponents.length, toolContext.revisionComponents.length]);

  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-900/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-300" />
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-sky-300">IFC Copilot</div>
            <div className="text-[11px] text-zinc-400">{statusLine}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> Reset
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {entries.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-4 text-sm text-zinc-300">
              <div className="font-semibold text-sky-300">你好，我系 VO System 内嵌嘅 IFC Copilot。</div>
              <div className="mt-1 text-xs text-zinc-400">
                上传 base / revision IFC 后可以叫我对比、总结商业影响、或直接生成 Excel。每次对话会消耗 1 个 credit。
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {SAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 text-left text-xs text-zinc-300 hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-white"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <div key={entry.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-sky-600/90 px-3.5 py-2 text-sm text-white shadow">
                  {entry.text}
                </div>
              </div>
            );
          }
          if (entry.kind === 'assistant') {
            return (
              <div key={entry.id} className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-white/10 bg-zinc-900/80 px-3.5 py-2 text-sm text-zinc-100 shadow">
                  {entry.text}
                </div>
              </div>
            );
          }
          if (entry.kind === 'tool') {
            return (
              <div key={entry.id} className="flex justify-start">
                <details className="w-full max-w-[85%] rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200">
                  <summary className="flex cursor-pointer items-center gap-2 font-mono">
                    <Wrench className="h-3 w-3" /> {entry.text}
                  </summary>
                  {entry.meta && (
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-[11px] text-amber-100">
                      {entry.meta}
                    </pre>
                  )}
                </details>
              </div>
            );
          }
          return (
            <div key={entry.id} className="flex justify-start">
              <div className="max-w-[85%] rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {entry.text}
              </div>
            </div>
          );
        })}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400" />
            {activeToolLabel ? `Running tool: ${activeToolLabel}` : 'Thinking...'}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend(input);
        }}
        className="border-t border-white/10 bg-zinc-900/80 p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend(input);
              }
            }}
            rows={2}
            placeholder={signedIn ? '输入问题或指令… (Enter 发送, Shift+Enter 换行)' : '请先登录'}
            disabled={busy || !signedIn}
            className="flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-sky-500/60 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !signedIn || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> 发送
          </button>
        </div>
        <div className="mt-2 text-[11px] text-zinc-500">
          每次对话消耗 1 个 credit（与 Excel 导出共用同一余额）。
        </div>
      </form>
    </div>
  );
}
