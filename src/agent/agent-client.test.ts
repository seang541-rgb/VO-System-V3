import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentSession, type AgentExecutionTracker } from './agent-client';
import { executeAgentTool, type ToolContext } from './tools';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
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
});
