import { describe, expect, it, vi } from 'vitest';
import type { VoComparisonResults } from '../BimEngine';
import { buildToolRoutingHint, executeAgentTool, getAvailableTools, type ToolContext } from './tools';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../ocr/ocr-engine', () => ({
  runOcr: vi.fn(),
  extractBqFromOcrText: vi.fn(() => []),
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
  it('does not make unverified professional conclusion tools available to the model', () => {
    const names = getAvailableTools(toolContext(vi.fn())).map((tool) => tool.function.name);

    expect(names).not.toContain('analyze_contract_clause');
    expect(names).not.toContain('lookup_regulation');
    expect(names).not.toContain('lookup_measurement_code');
    expect(names).not.toContain('get_vo_template');
    expect(names).not.toContain('estimate_cost');
  });

  it('tells the agent to read an attached document before answering from it', () => {
    const ctx = {
      ...toolContext(vi.fn()),
      ocrFile: { name: 'claim-backup.pdf' } as File,
    };

    expect(buildToolRoutingHint(ctx)).toContain('claim-backup.pdf');
    expect(buildToolRoutingHint(ctx)).toContain('call ocr_document before answering');
  });

  it('reports when extracted document text is omitted from the model context', async () => {
    const { runOcr } = await import('../ocr/ocr-engine');
    vi.mocked(runOcr).mockResolvedValue({
      text: 'x'.repeat(12001),
      confidence: 100,
      lines: [],
      elapsed: 1,
      pageCount: 1,
      processedPages: 1,
      truncated: false,
      sourceType: 'pdf-text',
    });
    const ctx = {
      ...toolContext(vi.fn()),
      ocrFile: { name: 'large-bq.pdf' } as File,
    };

    const result = await executeAgentTool('ocr_document', {}, ctx);

    expect(result).toEqual(expect.objectContaining({
      characterCount: 12001,
      textTruncated: true,
      instructions: expect.stringContaining('Do not claim conclusions about omitted content.'),
    }));
  });

  it('does not present an unloaded model as an IFC query with zero matches', async () => {
    const ctx = {
      ...toolContext(vi.fn()),
      baseComponents: [],
    };

    const result = await executeAgentTool('query_ifc', { model: 'base', typeFilter: 'IfcWall' }, ctx);

    expect(result).toEqual(expect.objectContaining({
      error: expect.stringContaining('PREREQUISITE_NOT_MET'),
    }));
    expect(JSON.stringify(result)).not.toContain('"matched":0');
  });

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

  it('does not present valuation totals without a user-provided BQ context', async () => {
    const ctx = {
      ...toolContext(vi.fn()),
      voResults: comparisonResult(),
      bqContext: undefined,
      bqItems: [],
    };

    const result = await executeAgentTool('summarize_commercial_impact', {}, ctx);

    expect(result).toEqual(expect.objectContaining({
      pricingStatus: 'requires_user_bq',
      valuationNotice: expect.stringContaining('BQ'),
    }));
    expect((result as { summary: Record<string, unknown> }).summary).not.toHaveProperty('netValue');
  });
});
