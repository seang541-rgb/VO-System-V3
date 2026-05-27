import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Sparkles, Send, Square, Wrench, Loader2, ShieldCheck, FileUp, FileText } from 'lucide-react';
import { AgentSession, type AgentEvent, type BillingMode, type OpenAIMessage } from '../agent/agent-client';
import { extractEvidenceReferences, summarizeEvidenceCounts, type AnswerEvidence, type EvidenceReference } from '../agent/evidence';
import type { ToolContext } from '../agent/tools';
import { useCopilotHistory } from '../hooks/useCopilotHistory';
import { useCopilotConversations } from '../hooks/useCopilotConversations';
import { useAgentRuns } from '../hooks/useAgentRuns';

interface ChatEntry {
  id: string;
  kind: 'user' | 'assistant' | 'tool' | 'error';
  text: string;
  meta?: string;
  evidence?: AnswerEvidence;
}

interface CopilotPanelProps {
  toolContext: ToolContext;
  signedIn: boolean;
  projectId?: string;
  userId?: string;
  onCreditsUpdate?: (balance: number) => void;
  onDocumentSelected?: (file: File) => void;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function evidenceSummary(evidence: AnswerEvidence) {
  const references = evidence.cited.length > 0 ? evidence.cited : evidence.available;
  const counts = summarizeEvidenceCounts(references);
  return Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(' / ');
}

function evidenceLocation(reference: EvidenceReference) {
  if (reference.pageNumber) return `Page ${reference.pageNumber}`;
  if (reference.locator?.itemReference) return reference.locator.itemReference;
  if (reference.locator?.ifcId) return reference.locator.ifcId;
  if (typeof reference.locator?.expressID === 'number') return `#${reference.locator.expressID}`;
  return null;
}

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export default function CopilotPanel({ toolContext, signedIn, projectId, userId, onCreditsUpdate, onDocumentSelected }: CopilotPanelProps) {
  const sessionRef = useRef<AgentSession | null>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  const [agentStep, setAgentStep] = useState(0);
  const [billingMode, setBillingMode] = useState<BillingMode>('metered');
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeConversationRef = useRef<string | null>(null);

  const { activeId: activeConvId, create: createConv } = useCopilotConversations(projectId);
  const { persistMessage } = useCopilotHistory(projectId, activeConvId);
  const { runs, pendingApproval, tracker, decideApproval, bindConversation } = useAgentRuns(projectId, userId, activeConvId);

  const effectiveToolContext = useMemo<ToolContext>(() => ({
    ...toolContext,
    ocrFile: documentFile ?? toolContext.ocrFile ?? null,
  }), [documentFile, toolContext]);
  const attachedDocument = effectiveToolContext.ocrFile;
  const baseReady = toolContext.baseComponents.length > 0;
  const revReady = toolContext.revisionComponents.length > 0;
  const compareReady = !!toolContext.voResults;
  const hasWorkspaceInput = baseReady || revReady || compareReady || !!attachedDocument;
  const recoveredApprovalNeedsResult = Boolean(pendingApproval?.recovered && !compareReady);

  useEffect(() => {
    activeConversationRef.current = activeConvId;
    bindConversation(activeConvId);
  }, [activeConvId, bindConversation]);

  useEffect(() => {
    if (!sessionRef.current) {
      sessionRef.current = new AgentSession(effectiveToolContext);
    } else {
      sessionRef.current.updateContext(effectiveToolContext);
    }
    sessionRef.current.setOnPersistMessage((msg: OpenAIMessage) => {
      void persistMessage(msg, activeConversationRef.current);
    });
    sessionRef.current.setExecutionTracker(tracker);
  }, [effectiveToolContext, persistMessage, tracker]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, busy, activeToolLabel]);

  const pushEntry = useCallback((entry: ChatEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const handleDocumentSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const supported = file.type === 'application/pdf'
      || file.type.startsWith('image/')
      || /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
    if (!supported) {
      pushEntry({ id: newId(), kind: 'error', text: '请上传 PDF、JPG、PNG 或 WEBP 文件。' });
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      pushEntry({ id: newId(), kind: 'error', text: '文件超过 25 MB，请先压缩或拆分后再上传。' });
      return;
    }

    setDocumentFile(file);
    onDocumentSelected?.(file);
  }, [onDocumentSelected, pushEntry]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      if (!signedIn) {
        pushEntry({ id: newId(), kind: 'error', text: '请先登录再使用 Copilot。' });
        return;
      }
      if (!sessionRef.current) sessionRef.current = new AgentSession(effectiveToolContext);
      else sessionRef.current.updateContext(effectiveToolContext);

      // Auto-create conversation on first message if none exists
      if (!activeConversationRef.current && projectId) {
        const title = trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
        const conversationId = await createConv(title);
        if (conversationId) {
          activeConversationRef.current = conversationId;
          bindConversation(conversationId);
        }
      }

      pushEntry({ id: newId(), kind: 'user', text: trimmed });
      setInput('');
      setBusy(true);
      setCanStop(true);
      setStreamingText('');
      setActiveToolLabel(null);
      setAgentStep(0);

      const handleEvent = (event: AgentEvent) => {
        switch (event.kind) {
          case 'assistant_text':
            setStreamingText('');
            if (event.text) pushEntry({ id: newId(), kind: 'assistant', text: event.text, evidence: event.evidence });
            break;
          case 'assistant_delta':
            setStreamingText((current) => current + event.text);
            break;
          case 'tool_start':
            setStreamingText('');
            setAgentStep((step) => step + 1);
            setActiveToolLabel(event.name);
            pushEntry({
              id: newId(),
              kind: 'tool',
              text: `${event.name}`,
              meta: 'Processing workspace evidence',
            });
            break;
          case 'tool_end':
            setActiveToolLabel(null);
            {
              const references = extractEvidenceReferences(event.result);
            pushEntry({
              id: newId(),
              kind: 'tool',
              text: `${event.name} · ${event.durationMs}ms`,
              meta: references.length > 0 ? `${references.length} evidence reference(s) recorded` : 'Step completed',
            });
            }
            break;
          case 'credits':
            setBillingMode(event.billingMode);
            if (event.billingMode === 'metered' && typeof event.balance === 'number' && onCreditsUpdate) onCreditsUpdate(event.balance);
            break;
          case 'error':
            setStreamingText('');
            pushEntry({ id: newId(), kind: 'error', text: event.message });
            break;
          case 'stopped':
            setStreamingText('');
            pushEntry({ id: newId(), kind: 'assistant', text: event.message });
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
        setCanStop(false);
        setStreamingText('');
        setActiveToolLabel(null);
      }
    },
    [bindConversation, busy, createConv, effectiveToolContext, onCreditsUpdate, projectId, pushEntry, signedIn],
  );

  const handleStop = useCallback(() => {
    sessionRef.current?.stop();
  }, []);

  const handleApprovalDecision = useCallback(async (approved: boolean) => {
    const recovered = pendingApproval?.recovered ?? false;
    if (recovered) {
      setBusy(true);
      setActiveToolLabel(null);
    }
    try {
      const resumableAction = await decideApproval(approved);
      if (!resumableAction) return;
      if (!sessionRef.current) sessionRef.current = new AgentSession(effectiveToolContext);
      else sessionRef.current.updateContext(effectiveToolContext);
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
              meta: extractEvidenceReferences(event.result).length > 0
                ? `${extractEvidenceReferences(event.result).length} evidence reference(s) recorded`
                : 'Step completed',
            });
          } else if (event.kind === 'assistant_text') {
            pushEntry({ id: newId(), kind: 'assistant', text: event.text, evidence: event.evidence });
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
  }, [decideApproval, effectiveToolContext, pendingApproval, pushEntry, tracker]);

  const statusLine = useMemo(() => {
    const parts = [
      `Base IFC: ${baseReady ? `${toolContext.baseComponents.length} components` : 'not loaded'}`,
      `Revision IFC: ${revReady ? `${toolContext.revisionComponents.length} components` : 'not loaded'}`,
      `Comparison: ${compareReady ? 'cached' : 'not run'}`,
    ];
    if (attachedDocument) parts.push(`Document: ${attachedDocument.name}`);
    return parts.join(' · ');
  }, [attachedDocument, baseReady, compareReady, revReady, toolContext.baseComponents.length, toolContext.revisionComponents.length]);

  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80">
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        onChange={handleDocumentSelect}
        className="hidden"
      />
      <div className="border-b border-slate-700 bg-slate-800/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-blue-400">VO Copilot</div>
              <div className="text-[11px] text-slate-400">
                {hasWorkspaceInput ? statusLine : '请上传 IFC 模型或 PDF / 扫描文件开始分析'}
              </div>
            </div>
          </div>
        </div>
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

      {entries.length > 0 && runs.length > 0 && (
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
        {entries.length === 0 && !pendingApproval && (
          <div className="flex min-h-[14rem] items-center justify-center px-4 text-center">
            <div>
              {attachedDocument
                ? <FileText className="mx-auto h-5 w-5 text-emerald-400" />
                : <Sparkles className="mx-auto h-5 w-5 text-blue-400" />}
              <div className="mt-3 text-sm font-medium text-slate-200">
                {attachedDocument ? attachedDocument.name : '欢迎使用 VO Copilot'}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {attachedDocument
                  ? '文档已准备好，请输入需要提取、核验或比较的内容'
                  : '请加载 IFC 模型，或上传 PDF / 扫描文件开始分析'}
              </div>
              <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                disabled={busy}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:border-blue-500/50 hover:text-blue-300 disabled:opacity-50"
              >
                <FileUp className="h-3.5 w-3.5" />
                {attachedDocument ? '更换 PDF / 扫描文件' : '上传 PDF / 扫描文件'}
              </button>
            </div>
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
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-sm text-slate-100 shadow">
                  <div className="whitespace-pre-wrap">{entry.text}</div>
                  {entry.evidence && (
                    <details className="mt-3 border-t border-slate-700/80 pt-2 text-xs text-slate-300">
                      <summary className="flex cursor-pointer items-center gap-2 text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {entry.evidence.missingCitation
                          ? '未绑定可核验依据'
                          : `依据 ${entry.evidence.cited.length} 项：${evidenceSummary(entry.evidence)}`}
                      </summary>
                      {entry.evidence.invalidIds.length > 0 && (
                        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">
                          未验证引用已忽略：{entry.evidence.invalidIds.join(', ')}
                        </div>
                      )}
                      <div className="mt-2 space-y-2">
                        {(entry.evidence.cited.length > 0 ? entry.evidence.cited : entry.evidence.available).map((reference) => (
                          <div key={reference.id} className="rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-2">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-mono font-semibold text-blue-300">{reference.id}</span>
                              <span className="text-slate-200">{reference.label}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">
                              {[reference.sourceFileName, evidenceLocation(reference)].filter(Boolean).join(' / ') || 'Workspace evidence'}
                            </div>
                            {reference.excerpt && (
                              <div className="mt-1.5 text-[11px] text-slate-300">{reference.excerpt}</div>
                            )}
                            {reference.limitation && (
                              <div className="mt-1.5 text-[11px] text-amber-300">{reference.limitation}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
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

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-blue-500/30 bg-slate-800/80 px-3.5 py-2 text-sm text-slate-100 shadow">
              {streamingText}
              <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-blue-400 align-middle" />
            </div>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-blue-300">
                {activeToolLabel
                  ? `Step ${agentStep} · 正在执行: ${activeToolLabel}`
                  : 'Copilot 正在生成回复…'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {activeToolLabel ? '工具调用中，请稍候' : '正在处理本次请求'}
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
          <button
            type="button"
            onClick={() => documentInputRef.current?.click()}
            disabled={busy}
            title={attachedDocument ? `更换文档: ${attachedDocument.name}` : '上传 PDF 或扫描文件'}
            className={`inline-flex h-[3.75rem] w-11 shrink-0 items-center justify-center rounded-xl border disabled:opacity-50 ${
              attachedDocument
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-blue-500/50 hover:text-blue-300'
            }`}
          >
            <FileUp className="h-4 w-4" />
          </button>
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
          {canStop ? (
            <button
              type="button"
              onClick={handleStop}
              title="停止生成（已开始的分析可能已经计费）"
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200 shadow hover:bg-red-500/20"
            >
              <Square className="h-4 w-4 fill-current" /> 停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy || !signedIn || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> 发送
            </button>
          )}
        </div>
        {attachedDocument && (
          <div className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-emerald-300">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{attachedDocument.name}</span>
          </div>
        )}
        {billingMode === 'owner_test_bypass' && (
          <div className="mt-2 text-[11px] text-emerald-300">
            测试模式：本次 Copilot 请求不扣 credits。
          </div>
        )}
        <div className="mt-2 text-[11px] text-slate-500">
          AI 分析任务消耗 1 个 credit；简单问候免费。停止生成不会撤销已经开始的计费回合。
        </div>
      </form>
    </div>
  );
}
