import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, RefreshCw, Wrench, Loader2, Brain, Plus, MessageSquare, ChevronDown, UserCog, Lightbulb, X, ShieldCheck, FileCheck2 } from 'lucide-react';
import { AgentSession, type AgentEvent, type OpenAIMessage, type ExtractedMemory } from '../agent/agent-client';
import type { ToolContext } from '../agent/tools';
import { useCopilotHistory } from '../hooks/useCopilotHistory';
import { useCopilotConversations } from '../hooks/useCopilotConversations';
import { useCopilotMemory, type MemoryCategory } from '../hooks/useCopilotMemory';
import { useAgentRuns } from '../hooks/useAgentRuns';
import { AGENT_ROLES, type AgentRole } from '../agent/roles';
import { analyzeWorkspace, type ProactiveSuggestion } from '../agent/proactive-discovery';

interface ChatEntry {
  id: string;
  kind: 'user' | 'assistant' | 'tool' | 'error' | 'thinking';
  text: string;
  meta?: string;
}

interface CopilotPanelProps {
  toolContext: ToolContext;
  signedIn: boolean;
  projectId?: string;
  userId?: string;
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

export default function CopilotPanel({ toolContext, signedIn, projectId, userId, onCreditsUpdate }: CopilotPanelProps) {
  const sessionRef = useRef<AgentSession | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  const [agentStep, setAgentStep] = useState(0);
  const [showConvList, setShowConvList] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [activeRole, setActiveRole] = useState<AgentRole | null>(null);
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRestoredRef = useRef(false);

  const { conversations, activeId: activeConvId, create: createConv, switchTo: switchConv, remove: removeConv } = useCopilotConversations(projectId);
  const { restoredMessages, persistMessage, clearHistory } = useCopilotHistory(projectId, activeConvId);
  const { buildMemoryPrompt, addMemory } = useCopilotMemory(userId);
  const { runs, pendingApproval, tracker, decideApproval } = useAgentRuns(projectId, userId, activeConvId);

  const baseReady = toolContext.baseComponents.length > 0;
  const revReady = toolContext.revisionComponents.length > 0;
  const compareReady = !!toolContext.voResults;
  const recoveredApprovalNeedsResult = Boolean(pendingApproval?.recovered && !compareReady);
  const canRunVoPack = signedIn && !busy && !pendingApproval && (compareReady || (baseReady && revReady));

  // Proactive suggestions — recalculate when workspace state changes
  useEffect(() => {
    const newSuggestions = analyzeWorkspace(toolContext)
      .filter((s) => !dismissedSuggestions.has(s.id));
    setSuggestions(newSuggestions);
  }, [toolContext, dismissedSuggestions]);

  useEffect(() => {
    if (!sessionRef.current) {
      sessionRef.current = new AgentSession(toolContext);
    } else {
      sessionRef.current.updateContext(toolContext);
    }
    // Inject memory, role, persistence, and memory extraction callbacks
    sessionRef.current.setMemoryPrompt(buildMemoryPrompt());
    sessionRef.current.setRole(activeRole?.id ?? null);
    sessionRef.current.setOnPersistMessage((msg: OpenAIMessage) => {
      void persistMessage(msg);
    });
    sessionRef.current.setOnMemoryExtracted((memories: ExtractedMemory[]) => {
      for (const m of memories) {
        void addMemory(m.category as MemoryCategory, m.content, projectId);
      }
    });
    sessionRef.current.setExecutionTracker(tracker);
  }, [toolContext, buildMemoryPrompt, persistMessage, addMemory, projectId, activeRole, tracker]);

  // Restore chat history from DB on first load
  useEffect(() => {
    if (historyRestoredRef.current || restoredMessages.length === 0) return;
    historyRestoredRef.current = true;

    // Rebuild chat entries from restored messages
    const restored: ChatEntry[] = [];
    for (const msg of restoredMessages) {
      if (msg.role === 'user' && msg.content) {
        restored.push({ id: newId(), kind: 'user', text: msg.content });
      } else if (msg.role === 'assistant' && msg.content) {
        restored.push({ id: newId(), kind: 'assistant', text: msg.content });
      } else if (msg.role === 'tool' && msg.content) {
        restored.push({ id: newId(), kind: 'tool', text: 'tool result', meta: truncate(msg.content, 200) });
      }
    }
    setEntries(restored);

    // Restore agent session messages
    if (sessionRef.current) {
      sessionRef.current.restoreMessages(restoredMessages);
    }
  }, [restoredMessages]);

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

      // Auto-create conversation on first message if none exists
      if (!activeConvId && projectId) {
        const title = trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
        await createConv(title);
      }

      pushEntry({ id: newId(), kind: 'user', text: trimmed });
      setInput('');
      setBusy(true);
      setActiveToolLabel(null);
      setAgentStep(0);

      const handleEvent = (event: AgentEvent) => {
        switch (event.kind) {
          case 'assistant_text':
            if (event.text) pushEntry({ id: newId(), kind: 'assistant', text: event.text });
            break;
          case 'thinking':
            setAgentStep(event.step);
            if (event.text) pushEntry({ id: newId(), kind: 'thinking', text: event.text, meta: `Step ${event.step}` });
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

  const handleApprovalDecision = useCallback(async (approved: boolean) => {
    const recovered = pendingApproval?.recovered ?? false;
    if (recovered) {
      setBusy(true);
      setActiveToolLabel(null);
    }
    try {
      const resumableAction = await decideApproval(approved);
      if (!resumableAction) return;
      if (!sessionRef.current) sessionRef.current = new AgentSession(toolContext);
      else sessionRef.current.updateContext(toolContext);
      sessionRef.current.setExecutionTracker(tracker);
      await sessionRef.current.resumeApprovedAction(
        resumableAction.runId,
        resumableAction.actionType,
        resumableAction.payload,
        (event) => {
          if (event.kind === 'tool_start') {
            setActiveToolLabel(event.name);
            pushEntry({ id: newId(), kind: 'tool', text: event.name, meta: 'Resumed after approval' });
          } else if (event.kind === 'tool_end') {
            setActiveToolLabel(null);
            pushEntry({
              id: newId(),
              kind: 'tool',
              text: `${event.name} - ${event.durationMs}ms`,
              meta: truncate(JSON.stringify(event.result), 400),
            });
          } else if (event.kind === 'assistant_text') {
            pushEntry({ id: newId(), kind: 'assistant', text: event.text });
          } else if (event.kind === 'error') {
            pushEntry({ id: newId(), kind: 'error', text: event.message });
          }
        },
      );
    } catch (error) {
      pushEntry({
        id: newId(),
        kind: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (recovered) {
        setBusy(false);
        setActiveToolLabel(null);
      }
    }
  }, [decideApproval, pendingApproval, pushEntry, toolContext, tracker]);

  const handleRunVoPack = useCallback(async () => {
    if (!canRunVoPack) return;
    if (!sessionRef.current) sessionRef.current = new AgentSession(toolContext);
    else sessionRef.current.updateContext(toolContext);
    sessionRef.current.setExecutionTracker(tracker);

    if (!activeConvId && projectId) {
      await createConv('Autonomous VO Report Pack');
    }

    pushEntry({ id: newId(), kind: 'user', text: 'Run Autonomous VO Report Pack' });
    setBusy(true);
    setActiveToolLabel(null);
    setAgentStep(0);
    try {
      await sessionRef.current.runVoReportWorkflow((event) => {
        switch (event.kind) {
          case 'assistant_text':
            pushEntry({ id: newId(), kind: 'assistant', text: event.text });
            break;
          case 'thinking':
            setAgentStep(event.step);
            pushEntry({ id: newId(), kind: 'thinking', text: event.text, meta: `Step ${event.step}/${event.totalSteps ?? '?'}` });
            break;
          case 'tool_start':
            setActiveToolLabel(event.name);
            pushEntry({ id: newId(), kind: 'tool', text: event.name, meta: 'Autonomous workflow' });
            break;
          case 'tool_end':
            setActiveToolLabel(null);
            pushEntry({
              id: newId(),
              kind: 'tool',
              text: `${event.name} - ${event.durationMs}ms`,
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
      });
    } catch (error) {
      pushEntry({ id: newId(), kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
      setActiveToolLabel(null);
    }
  }, [activeConvId, canRunVoPack, createConv, onCreditsUpdate, projectId, pushEntry, toolContext, tracker]);

  const handleReset = () => {
    sessionRef.current?.reset();
    setEntries([]);
    setActiveToolLabel(null);
    setAgentStep(0);
    historyRestoredRef.current = false;
    void clearHistory();
  };

  const handleNewConversation = async () => {
    sessionRef.current?.reset();
    setEntries([]);
    setActiveToolLabel(null);
    setAgentStep(0);
    historyRestoredRef.current = false;
    setShowConvList(false);
    await createConv();
  };

  const handleSwitchConversation = (id: string) => {
    sessionRef.current?.reset();
    setEntries([]);
    setActiveToolLabel(null);
    setAgentStep(0);
    historyRestoredRef.current = false;
    switchConv(id);
    setShowConvList(false);
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
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80">
      <div className="border-b border-slate-700 bg-slate-800/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-blue-400">IFC Copilot</div>
              <div className="text-[11px] text-slate-400">{statusLine}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleRunVoPack()}
              disabled={!canRunVoPack}
              title="Run Autonomous VO Report Pack"
              className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
            >
              <FileCheck2 className="h-3 w-3" />
              VO Pack
            </button>
            {/* Role selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRoleMenu((v) => !v)}
                disabled={busy}
                title={activeRole ? `Role: ${activeRole.nameCn}` : 'Select role'}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50 ${
                  activeRole
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400'
                    : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
                }`}
              >
                <UserCog className="h-3 w-3" />
                {activeRole && <span className="max-w-[4rem] truncate">{activeRole.nameCn}</span>}
              </button>
              {showRoleMenu && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-700 bg-slate-900/95 p-1.5 shadow-xl backdrop-blur">
                  {activeRole && (
                    <button
                      type="button"
                      onClick={() => { setActiveRole(null); setShowRoleMenu(false); }}
                      className="mb-1 w-full rounded-lg px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                      ✕ 清除角色
                    </button>
                  )}
                  {AGENT_ROLES.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => { setActiveRole(role); setShowRoleMenu(false); }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-xs ${
                        activeRole?.id === role.id
                          ? 'bg-emerald-600/20 text-emerald-300'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="font-semibold">{role.nameCn} <span className="font-normal text-slate-500">{role.name}</span></div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{role.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleNewConversation()}
              disabled={busy}
              title="New conversation"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:border-blue-500/50 hover:text-blue-300 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
            </button>
            {conversations.length > 0 && (
              <button
                type="button"
                onClick={() => setShowConvList((v) => !v)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
              >
                <MessageSquare className="h-3 w-3" />
                <span>{conversations.length}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showConvList ? 'rotate-180' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>
        {showConvList && conversations.length > 0 && (
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/90 p-1.5">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${
                  c.id === activeConvId
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSwitchConversation(c.id)}
                  className="flex-1 truncate text-left"
                >
                  {c.title}
                </button>
                {c.id !== activeConvId && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void removeConv(c.id); }}
                    className="ml-2 text-slate-600 hover:text-red-400"
                    title="Delete"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingApproval && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Approval Required</div>
              <div className="mt-1 text-sm text-slate-100">
                Copilot wants to execute <span className="font-mono text-amber-200">{pendingApproval.actionType}</span>.
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {recoveredApprovalNeedsResult
                  ? 'Loading the latest saved comparison before this approved output can resume.'
                  : pendingApproval.status === 'approved'
                    ? 'The formal output is approved and ready to resume execution.'
                  : pendingApproval.recovered
                  ? 'This interrupted task is waiting for your recorded decision. Approval resumes the output.'
                  : 'This creates a formal downloadable output. The decision is recorded in the run ledger.'}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleApprovalDecision(true)}
                  disabled={(pendingApproval.recovered && busy) || recoveredApprovalNeedsResult}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {pendingApproval.status === 'approved' ? 'Resume Output' : 'Approve Output'}
                </button>
                {pendingApproval.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void handleApprovalDecision(false)}
                    disabled={pendingApproval.recovered && busy}
                    className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div className="border-b border-slate-700/70 bg-slate-900 px-4 py-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <ShieldCheck className="h-3 w-3" />
            Recent Agent Runs
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {runs.slice(0, 3).map((run) => (
              <div key={run.id} className="flex max-w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px]">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  run.status === 'completed'
                    ? 'bg-emerald-400'
                    : run.status === 'failed' || run.status === 'cancelled'
                      ? 'bg-red-400'
                      : run.status === 'waiting_approval'
                        ? 'bg-amber-300'
                        : 'bg-blue-400'
                }`} />
                <span className="max-w-[11rem] truncate text-slate-300">{run.user_request}</span>
                <span className="uppercase text-slate-500">{run.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {entries.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-4 text-sm text-slate-300">
              <div className="font-semibold text-blue-400">你好，我系 VO System 内嵌嘅 IFC Copilot。</div>
              <div className="mt-1 text-xs text-slate-400">
                上传 base / revision IFC 后可以叫我对比、总结商业影响、或直接生成 Excel。每次对话会消耗 1 个 credit。
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {SAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  className="rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-left text-xs text-slate-300 hover:border-blue-600/40 hover:bg-blue-600/10 hover:text-white"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Proactive suggestions */}
        {suggestions.length > 0 && !busy && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400/80">
              <Lightbulb className="h-3 w-3" /> 建议操作
            </div>
            {suggestions.slice(0, 3).map((s) => (
              <div
                key={s.id}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${
                  s.priority === 'high'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-slate-700/50 bg-slate-800/40'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-200">{s.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{s.description}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {s.action && (
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedSuggestions((prev) => new Set([...prev, s.id]));
                        void handleSend(s.action!);
                      }}
                      className="rounded-lg bg-blue-600/80 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
                    >
                      执行
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissedSuggestions((prev) => new Set([...prev, s.id]))}
                    className="rounded p-0.5 text-slate-600 hover:text-slate-300"
                    title="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <div key={entry.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-blue-600 px-3.5 py-2 text-sm text-white shadow">
                  {entry.text}
                </div>
              </div>
            );
          }
          if (entry.kind === 'assistant') {
            return (
              <div key={entry.id} className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-sm text-slate-100 shadow">
                  {entry.text}
                </div>
              </div>
            );
          }
          if (entry.kind === 'thinking') {
            return (
              <div key={entry.id} className="flex justify-start">
                <details className="w-full max-w-[85%] rounded-xl border border-purple-500/30 bg-purple-500/5 px-3 py-1.5 text-xs">
                  <summary className="flex cursor-pointer items-center gap-2 text-purple-300">
                    <Brain className="h-3 w-3" />
                    <span className="font-semibold">{entry.meta ?? 'Thinking'}</span>
                    <span className="text-slate-500">— Agent 推理中</span>
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap text-slate-300">{entry.text}</div>
                </details>
              </div>
            );
          }
          if (entry.kind === 'tool') {
            return (
              <div key={entry.id} className="flex justify-start">
                <details className="w-full max-w-[85%] rounded-xl border border-slate-700 bg-amber-500/5 px-3 py-1.5 text-xs text-slate-400">
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
          <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-blue-300">
                {activeToolLabel
                  ? `Step ${agentStep} · 正在执行: ${activeToolLabel}`
                  : agentStep > 0
                    ? `Step ${agentStep} · Agent 推理中…`
                    : 'Copilot 正在思考…'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {activeToolLabel ? '工具调用中，请稍候' : '分析任务并规划执行步骤'}
              </div>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend(input);
        }}
        className="border-t border-slate-700 bg-slate-800/80 p-3"
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
            className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-600/60 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !signedIn || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> 发送
          </button>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          每次对话消耗 1 个 credit（与 Excel 导出共用同一余额）。
        </div>
      </form>
    </div>
  );
}
