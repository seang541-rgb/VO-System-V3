import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabase';
import { AgentSession, type AgentExecutionTracker } from './agent-client';
import { executeAgentTool, type ToolContext } from './tools';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: { credits_balance: 3 }, error: null }),
  },
}));

vi.mock('./tools', () => ({
  OPENAI_TOOL_DEFINITIONS: [],
  getAvailableTools: vi.fn().mockReturnValue([]),
  buildToolRoutingHint: vi.fn().mockReturnValue(''),
  executeAgentTool: vi.fn(),
}));

function proxyResponse(message: Record<string, unknown>): Response {
  return new Response(JSON.stringify({
    response: { choices: [{ message }] },
    credits_balance: 4,
    turn_id: 'turn-1',
  }), { status: 200 });
}

function formalOutputTurn() {
  return proxyResponse({
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call-1',
      type: 'function',
      function: { name: 'export_vo_excel', arguments: '{}' },
    }],
  });
}

function finalTurn() {
  return proxyResponse({ role: 'assistant', content: 'Output was not generated.' });
}

function streamedTurn(...frames: string[]): Response {
  return new Response(frames.join('\n\n') + '\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function buildTracker(): AgentExecutionTracker {
  return {
    startRun: vi.fn().mockResolvedValue('run-1'),
    completeRun: vi.fn().mockResolvedValue(undefined),
    recordStep: vi.fn().mockResolvedValue('step-1'),
    recordEvidence: vi.fn().mockResolvedValue(undefined),
    requestApproval: vi.fn().mockResolvedValue(false),
    consumeApproval: vi.fn().mockResolvedValue(undefined),
  };
}

function emptyToolContext(): ToolContext {
  return {
    baseComponents: [],
    revisionComponents: [],
    voResults: null,
    bqItems: [],
  } as unknown as ToolContext;
}

describe('Agent formal output approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(formalOutputTurn())
      .mockResolvedValueOnce(finalTurn()));
  });

  it('does not execute a formal output tool after the user rejects approval', async () => {
    const tracker = buildTracker();
    const session = new AgentSession(emptyToolContext());
    session.setExecutionTracker(tracker);

    await session.send('Export the official workbook', vi.fn());

    expect(tracker.requestApproval).toHaveBeenCalledWith('run-1', 'export_vo_excel', {});
    expect(executeAgentTool).not.toHaveBeenCalled();
    expect(tracker.recordStep).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ toolName: 'export_vo_excel', status: 'rejected' }),
    );
  });

  it('does not execute a formal output tool without an auditable run tracker', async () => {
    const session = new AgentSession(emptyToolContext());

    await session.send('Export the official workbook', vi.fn());

    expect(executeAgentTool).not.toHaveBeenCalled();
  });

  it('resumes a claimed formal output and closes its original run', async () => {
    const tracker = buildTracker();
    const session = new AgentSession(emptyToolContext());
    const onEvent = vi.fn();
    vi.mocked(executeAgentTool).mockResolvedValueOnce({ ok: true });
    session.setExecutionTracker(tracker);

    const result = await session.resumeApprovedAction('run-1', 'export_vo_excel', {}, onEvent);

    expect(executeAgentTool).toHaveBeenCalledWith('export_vo_excel', {}, expect.any(Object));
    expect(tracker.recordEvidence).toHaveBeenCalledWith(
      'run-1',
      'step-1',
      expect.objectContaining({ type: 'report' }),
    );
    expect(tracker.completeRun).toHaveBeenCalledWith('run-1', 'completed', result);
    expect(tracker.consumeApproval).toHaveBeenCalledWith('run-1', 'export_vo_excel');
  });

  it('runs the autonomous report pack through evidence, approval, billing, and formal output', async () => {
    const tracker = buildTracker();
    vi.mocked(tracker.requestApproval).mockResolvedValueOnce(true);
    vi.mocked(executeAgentTool).mockResolvedValue({ ok: true });
    const session = new AgentSession(emptyToolContext());
    session.setExecutionTracker(tracker);

    const result = await session.runVoReportWorkflow(vi.fn());

    expect(vi.mocked(executeAgentTool).mock.calls.map(([name]) => name)).toEqual([
      'compare_ifc',
      'summarize_commercial_impact',
      'generate_report',
    ]);
    expect(tracker.requestApproval).toHaveBeenCalledWith(
      'run-1',
      'generate_report',
      { __autonomousWorkflow: true },
    );
    expect(supabase.rpc).toHaveBeenCalledWith('consume_credit');
    expect(tracker.consumeApproval).toHaveBeenCalledWith('run-1', 'generate_report');
    expect(tracker.completeRun).toHaveBeenCalledWith('run-1', 'completed', result);
  });

  it('answers a greeting locally without charging a model turn or calling tools', async () => {
    const tracker = buildTracker();
    const session = new AgentSession(emptyToolContext());
    const onEvent = vi.fn();
    session.setExecutionTracker(tracker);

    const result = await session.send('hi', onEvent);

    expect(result).toContain('Hello');
    expect(tracker.startRun).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(executeAgentTool).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'assistant_text' }));
  });

  it('does not continue an earlier IFC tool task when the new message is only a greeting', async () => {
    const session = new AgentSession(emptyToolContext());
    session.restoreMessages([
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'old-query',
          type: 'function',
          function: { name: 'query_ifc', arguments: '{"model":"base","typeFilter":"IfcWall"}' },
        }],
      },
      {
        role: 'tool',
        tool_call_id: 'old-query',
        content: '{"model":"base","matched":0}',
      },
    ]);

    const result = await session.send('你好', vi.fn());

    expect(result).toContain('你好');
    expect(fetch).not.toHaveBeenCalled();
    expect(executeAgentTool).not.toHaveBeenCalled();
  });

  it('reconstructs streamed assistant content and exposes text deltas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(streamedTurn(
      'event: meta\ndata: {"credits_balance":3,"turn_id":"turn-stream"}',
      'data: {"choices":[{"delta":{"role":"assistant","content":"正在"}}]}',
      'data: {"choices":[{"delta":{"content":"分析"}}]}',
      'data: [DONE]',
    )));
    const session = new AgentSession(emptyToolContext());
    const onEvent = vi.fn();

    const result = await session.send('分析当前任务', onEvent);

    expect(result).toBe('正在分析');
    expect(onEvent).toHaveBeenCalledWith({ kind: 'assistant_delta', text: '正在' });
    expect(onEvent).toHaveBeenCalledWith({ kind: 'assistant_delta', text: '分析' });
    expect(onEvent).toHaveBeenCalledWith({ kind: 'credits', balance: 3 });
  });

  it('reconstructs a streamed tool call before executing the tool', async () => {
    vi.mocked(executeAgentTool).mockResolvedValueOnce({ model: 'base', matched: 0 });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(streamedTurn(
        'event: meta\ndata: {"credits_balance":3,"turn_id":"turn-tool"}',
        'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call-stream","type":"function","function":{"name":"query_","arguments":"{\\"model\\":\\"base\\""}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"ifc","arguments":",\\"typeFilter\\":\\"IfcWall\\"}"}}]}}]}',
        'data: [DONE]',
      ))
      .mockResolvedValueOnce(streamedTurn(
        'event: meta\ndata: {"credits_balance":3,"turn_id":"turn-tool"}',
        'data: {"choices":[{"delta":{"role":"assistant","content":"No walls found."}}]}',
        'data: [DONE]',
      )));
    const session = new AgentSession(emptyToolContext());

    const result = await session.send('Count base walls', vi.fn());

    expect(executeAgentTool).toHaveBeenCalledWith(
      'query_ifc',
      { model: 'base', typeFilter: 'IfcWall' },
      expect.any(Object),
    );
    expect(result).toBe('No walls found.');
  });

  it('cancels an active generated reply when stopped by the user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options?: RequestInit) => {
      if (options?.signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }
      return Promise.reject(new Error('Expected request to be aborted before fetch.'));
    }));
    const session = new AgentSession(emptyToolContext());
    const onEvent = vi.fn();

    const pending = session.send('分析一个较长的任务', onEvent);
    expect(session.stop()).toBe(true);
    await expect(pending).resolves.toBe('');

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stopped' }));
  });
});
