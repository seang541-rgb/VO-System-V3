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

function baseLoadedToolContext(): ToolContext {
  return {
    ...emptyToolContext(),
    baseComponents: [{}] as ToolContext['baseComponents'],
  };
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

  it('answers a missing IFC model query locally without starting a run or using the proxy', async () => {
    const tracker = buildTracker();
    const session = new AgentSession(emptyToolContext());
    session.setExecutionTracker(tracker);

    const result = await session.send('Base 模型里面有多少 IfcWall？', vi.fn());

    expect(result).toContain('没有可查询的 Base IFC');
    expect(tracker.startRun).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(executeAgentTool).not.toHaveBeenCalled();
  });

  it('answers a missing comparison input locally without starting a run or using the proxy', async () => {
    const tracker = buildTracker();
    const session = new AgentSession(emptyToolContext());
    session.setExecutionTracker(tracker);

    const result = await session.send('直接比较 Base 和 Revision，并告诉我总变更数量。', vi.fn());

    expect(result).toContain('还没有加载 Base IFC 与 Revision IFC');
    expect(tracker.startRun).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(executeAgentTool).not.toHaveBeenCalled();
  });

  it('answers an OCR request locally when no document is available', async () => {
    const tracker = buildTracker();
    const session = new AgentSession(emptyToolContext());
    session.setExecutionTracker(tracker);

    const result = await session.send('请 OCR 识别这张扫描图片里的文字。', vi.fn());

    expect(result).toContain('没有可供 OCR 分析的文件');
    expect(tracker.startRun).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(executeAgentTool).not.toHaveBeenCalled();
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
    const session = new AgentSession(baseLoadedToolContext());

    const result = await session.send('Count base walls', vi.fn());

    expect(executeAgentTool).toHaveBeenCalledWith(
      'query_ifc',
      { model: 'base', typeFilter: 'IfcWall' },
      expect.any(Object),
    );
    expect(result).toBe('No walls found.');
  });

  it('blocks a fabricated IFC absence conclusion when no model evidence is available', async () => {
    vi.mocked(executeAgentTool).mockResolvedValueOnce({
      error: 'PREREQUISITE_NOT_MET: There are no queryable components available in the "base" IFC slot.',
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(proxyResponse({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-missing-model',
          type: 'function',
          function: { name: 'query_ifc', arguments: '{"model":"base","typeFilter":"IfcWall"}' },
        }],
      }))
      .mockResolvedValueOnce(streamedTurn(
        'event: meta\ndata: {"credits_balance":3,"turn_id":"turn-ifc"}',
        'data: {"choices":[{"delta":{"role":"assistant","content":"Base 模型中确认没有墙体。"}}]}',
        'data: [DONE]',
      )));
    const session = new AgentSession(baseLoadedToolContext());
    const onEvent = vi.fn();

    const result = await session.send('Base 模型有多少墙？', onEvent);

    expect(result).toContain('没有可查询的 IFC 模型内容');
    expect(result).not.toContain('确认没有墙体');
    expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'assistant_delta' }));
  });

  it('does not execute later tool calls after a prerequisite failure in the same model step', async () => {
    vi.mocked(executeAgentTool).mockResolvedValueOnce({
      error: 'PREREQUISITE_NOT_MET: There are no queryable components available in the "base" IFC slot.',
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(proxyResponse({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-first',
            type: 'function',
            function: { name: 'query_ifc', arguments: '{"model":"base"}' },
          },
          {
            id: 'call-second',
            type: 'function',
            function: { name: 'compare_ifc', arguments: '{}' },
          },
        ],
      }))
      .mockResolvedValueOnce(proxyResponse({ role: 'assistant', content: 'There are no model changes.' })));
    const session = new AgentSession(baseLoadedToolContext());

    const result = await session.send('Check model contents.', vi.fn());

    expect(executeAgentTool).toHaveBeenCalledTimes(1);
    expect(result).toContain('no queryable IFC model content');
  });

  it('blocks an unsupported knowledge answer while a required lookup has no evidence', async () => {
    vi.mocked(executeAgentTool).mockResolvedValueOnce({
      source: 'ubbl',
      query: 'minimum height',
      count: 0,
      matches: [],
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(proxyResponse({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-regulation',
          type: 'function',
          function: { name: 'lookup_regulation', arguments: '{"query":"minimum height","source":"ubbl"}' },
        }],
      }))
      .mockResolvedValueOnce(streamedTurn(
        'event: meta\ndata: {"credits_balance":3,"turn_id":"turn-regulation"}',
        'data: {"choices":[{"delta":{"role":"assistant","content":"UBBL Part V, By-Law 23 states 2.75 m."}}]}',
        'data: [DONE]',
      )));
    const session = new AgentSession(emptyToolContext());
    const onEvent = vi.fn();

    const result = await session.send('住宅房间最低净高是多少？请给具体条文。', onEvent);

    expect(result).toContain('没有找到能够支撑结论的匹配记录');
    expect(result).not.toContain('By-Law 23');
    expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'assistant_delta' }));
  });

  it('allows a grounded answer after a later lookup resolves an empty search', async () => {
    vi.mocked(executeAgentTool)
      .mockResolvedValueOnce({ source: 'ubbl', query: 'room height', count: 0, matches: [] })
      .mockResolvedValueOnce({
        source: 'ubbl',
        query: 'habitable room',
        count: 1,
        matches: [{ citation: 'Verified returned citation', title: 'Habitable rooms' }],
      });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(proxyResponse({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-empty',
          type: 'function',
          function: { name: 'lookup_regulation', arguments: '{"query":"room height","source":"ubbl"}' },
        }],
      }))
      .mockResolvedValueOnce(proxyResponse({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-resolved',
          type: 'function',
          function: { name: 'lookup_regulation', arguments: '{"query":"habitable room","source":"ubbl"}' },
        }],
      }))
      .mockResolvedValueOnce(streamedTurn(
        'event: meta\ndata: {"credits_balance":3,"turn_id":"turn-resolved"}',
        'data: {"choices":[{"delta":{"role":"assistant","content":"Verified returned citation"}}]}',
        'data: [DONE]',
      )));
    const session = new AgentSession(emptyToolContext());

    const result = await session.send('Find the verified room-height rule.', vi.fn());

    expect(result).toBe('Verified returned citation');
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
