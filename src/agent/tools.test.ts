import { describe, expect, it, vi } from 'vitest';
import type { VoComparisonResults } from '../BimEngine';
import { executeAgentTool, getAvailableTools, type ToolContext } from './tools';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

function comparisonResult(): VoComparisonResults {
  return {
    added: [],
    deleted: [],
    modified: [],
    qsSummary: {
      formworkAlerts: 0,
      eotFlags: 0,
      starRateCandidates: 0,
      protectedValue: 0,
    },
  } as unknown as VoComparisonResults;
}

function toolContext(runCompare: ToolContext['runCompare']): ToolContext {
  return {
    baseComponents: [{}] as ToolContext['baseComponents'],
    revisionComponents: [{}] as ToolContext['revisionComponents'],
    voResults: null,
    bqItems: [],
    baseFileName: 'base.ifc',
    revisionFileName: 'revision.ifc',
    runCompare,
  };
}

describe('Agent comparison tool routing', () => {
  it('makes dependent tools available immediately after a comparison', async () => {
    const results = comparisonResult();
    const ctx = toolContext(vi.fn().mockResolvedValue(results));

    expect(getAvailableTools(ctx).some((tool) => tool.function.name === 'generate_report')).toBe(false);

    await executeAgentTool('compare_ifc', {}, ctx);

    expect(ctx.voResults).toBe(results);
    expect(getAvailableTools(ctx).some((tool) => tool.function.name === 'generate_report')).toBe(true);
  });

  it('emits a completion event only when it runs a new comparison', async () => {
    const results = comparisonResult();
    const dispatchEvent = vi.fn();
    const ctx = { ...toolContext(vi.fn().mockResolvedValue(results)), dispatchEvent };

    await executeAgentTool('compare_ifc', {}, ctx);
    await executeAgentTool('compare_ifc', {}, ctx);

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent).toHaveBeenCalledWith(
      'comparison.completed',
      expect.objectContaining({ source: 'agent' }),
    );
  });
});
