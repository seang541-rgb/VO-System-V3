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
});
