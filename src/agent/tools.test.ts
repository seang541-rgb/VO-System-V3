import { describe, expect, it, vi } from 'vitest';
import type { BimComponent, VoComparisonResults } from '../BimEngine';
import { generateVoPdfReport } from '../report/pdf-generator';
import { exportVoSubstantiationWorkbook } from '../vo-report';
import { buildToolRoutingHint, executeAgentTool, getAvailableTools, type ToolContext } from './tools';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../ocr/ocr-engine', () => ({
  runOcr: vi.fn(),
  extractBqFromOcrText: vi.fn(() => []),
}));

vi.mock('../report/pdf-generator', () => ({
  generateVoPdfReport: vi.fn(),
}));

vi.mock('../vo-report', () => ({
  exportVoSubstantiationWorkbook: vi.fn(),
}));

vi.mock('../audit/extractor', () => ({
  runAudit: vi.fn(() => ({
    records: [{ guid: 'wall-guid', ifcClass: 'IfcWall', name: 'Wall', jkrCode: 'G', classification: 'Wall', storeyName: 'L1', netVolumeM3: 1, quantitySource: 'qto' }],
    quantityModeUsed: 'qto',
    summary: { recordCount: 1, jkrCodeCount: 1, quantitySources: [], classifications: [] },
    bqRows: [],
  })),
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

function wallComponent(id = 'wall-41', expressID = 41): BimComponent {
  return {
    expressID,
    ifcId: id,
    type: 'IfcWall',
    qsLabel: 'Brick wall',
    quantities: {
      NetArea: { value: 2, unit: 'm2', source: 'qto' },
    },
  } as unknown as BimComponent;
}

function toolContext(runCompare: ToolContext['runCompare']): ToolContext {
  return {
    baseComponents: [wallComponent()],
    revisionComponents: [{}] as ToolContext['revisionComponents'],
    voResults: null,
    bqItems: [],
    bqFileName: null,
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
      pages: [{ pageNumber: 1, text: 'x'.repeat(12001), lines: [], confidence: 100, sourceType: 'pdf-text' }],
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

  it('returns source-linked evidence references for loaded IFC query results', async () => {
    const result = await executeAgentTool('query_ifc', { model: 'base', typeFilter: 'IfcWall' }, toolContext(vi.fn()));

    expect(result).toEqual(expect.objectContaining({
      evidenceRefs: [
        expect.objectContaining({
          id: '[IFC-B-041]',
          sourceFileName: 'base.ifc',
          sourceSlot: 'base',
          locator: expect.objectContaining({ expressID: 41, ifcId: 'wall-41' }),
        }),
      ],
    }));
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

  it('returns BQ evidence only for an amount rated from uploaded mapped BQ data', async () => {
    const results = {
      ...comparisonResult(),
      added: [wallComponent()],
    } as VoComparisonResults;
    const ctx = {
      ...toolContext(vi.fn()),
      voResults: results,
      bqFileName: 'awarded-bq.xlsx',
      bqItems: [{ itemReference: 'BQ/G/USER', description: 'Verified brickwork', unit: 'm2', contractRate: 45 }],
      bqContext: {
        itemsByReference: {
          'BQ/G/USER': { itemReference: 'BQ/G/USER', description: 'Verified brickwork', unit: 'm2', contractRate: 45 },
        },
        labelMappings: { 'Brick wall': 'BQ/G/USER' },
      },
    };

    const result = await executeAgentTool('summarize_commercial_impact', {}, ctx);

    expect(result).toEqual(expect.objectContaining({
      evidenceRefs: [
        expect.objectContaining({
          id: '[BQ-BQ-G-USER]',
          sourceFileName: 'awarded-bq.xlsx',
          locator: { itemReference: 'BQ/G/USER' },
          facts: expect.objectContaining({ rate: 45, amount: 90 }),
        }),
      ],
    }));
  });

  it('aggregates repeated actions that rely on the same verified BQ item', async () => {
    const ctx = {
      ...toolContext(vi.fn()),
      voResults: { ...comparisonResult(), added: [wallComponent(), wallComponent('wall-42', 42)] } as VoComparisonResults,
      bqFileName: 'awarded-bq.xlsx',
      bqItems: [{ itemReference: 'BQ/G/USER', description: 'Verified brickwork', unit: 'm2', contractRate: 45 }],
      bqContext: {
        itemsByReference: {
          'BQ/G/USER': { itemReference: 'BQ/G/USER', description: 'Verified brickwork', unit: 'm2', contractRate: 45 },
        },
        labelMappings: { 'Brick wall': 'BQ/G/USER' },
      },
    };

    const result = await executeAgentTool('summarize_commercial_impact', {}, ctx) as { evidenceRefs: Array<{ facts: Record<string, unknown> }> };

    expect(result.evidenceRefs).toHaveLength(1);
    expect(result.evidenceRefs[0].facts).toEqual(expect.objectContaining({ quantity: 4, amount: 180, actionCount: 2 }));
  });

  it('keeps distinct non-Latin BQ references as distinct evidence ids', async () => {
    const firstWall = wallComponent();
    const secondWall = { ...wallComponent('wall-42', 42), qsLabel: 'Concrete wall' } as BimComponent;
    const ctx = {
      ...toolContext(vi.fn()),
      voResults: { ...comparisonResult(), added: [firstWall, secondWall] } as VoComparisonResults,
      bqFileName: 'awarded-bq.xlsx',
      bqItems: [
        { itemReference: '墙体/一', description: 'Brick wall', unit: 'm2', contractRate: 45 },
        { itemReference: '墙体/二', description: 'Concrete wall', unit: 'm2', contractRate: 55 },
      ],
      bqContext: {
        itemsByReference: {
          '墙体/一': { itemReference: '墙体/一', description: 'Brick wall', unit: 'm2', contractRate: 45 },
          '墙体/二': { itemReference: '墙体/二', description: 'Concrete wall', unit: 'm2', contractRate: 55 },
        },
        labelMappings: { 'Brick wall': '墙体/一', 'Concrete wall': '墙体/二' },
      },
    };

    const result = await executeAgentTool('summarize_commercial_impact', {}, ctx) as { evidenceRefs: Array<{ id: string }> };

    expect(result.evidenceRefs).toHaveLength(2);
    expect(new Set(result.evidenceRefs.map((reference) => reference.id)).size).toBe(2);
    expect(result.evidenceRefs.every((reference) => /^\[BQ-[A-Z0-9-]+\]$/.test(reference.id))).toBe(true);
  });

  it('passes collected evidence references into approved report exports', async () => {
    const evidenceRefs = [{
      id: '[PDF-001:p1]',
      kind: 'document_page' as const,
      label: 'Supporting page',
      sourceFileName: 'backup.pdf',
      pageNumber: 1,
      facts: { extraction: 'pdf-text' },
    }];
    const ctx = {
      ...toolContext(vi.fn()),
      voResults: comparisonResult(),
      evidenceRefs,
    };

    await executeAgentTool('generate_report', {}, ctx);
    await executeAgentTool('export_vo_excel', {}, ctx);

    expect(generateVoPdfReport).toHaveBeenCalledWith(
      ctx.voResults,
      expect.objectContaining({ evidenceRefs: expect.arrayContaining(evidenceRefs) }),
    );
    expect(exportVoSubstantiationWorkbook).toHaveBeenCalledWith(
      ctx.voResults,
      expect.objectContaining({ evidenceRefs: expect.arrayContaining(evidenceRefs) }),
    );
  });

  it('derives comparison evidence when an existing comparison is exported directly', async () => {
    const ctx = {
      ...toolContext(vi.fn()),
      voResults: comparisonResult(),
      evidenceRefs: [],
    };

    const result = await executeAgentTool('generate_report', {}, ctx) as { evidenceRefs?: unknown[] };

    expect(generateVoPdfReport).toHaveBeenLastCalledWith(
      ctx.voResults,
      expect.objectContaining({
        evidenceRefs: [expect.objectContaining({ id: '[CMP-001]', kind: 'ifc_comparison' })],
      }),
    );
    expect(result.evidenceRefs).toEqual([
      expect.objectContaining({ id: '[CMP-001]', kind: 'ifc_comparison' }),
    ]);
  });

  it('returns an auditable evidence reference for enabled IFC audits', async () => {
    const ctx = {
      ...toolContext(vi.fn()),
      activeIfcSlot: 'base' as const,
      getActiveIfcHandle: () => ({ api: {}, modelID: 1 }),
    };

    const result = await executeAgentTool('audit_ifc', { model: 'base' }, ctx);

    expect(result).toEqual(expect.objectContaining({
      evidenceRefs: [
        expect.objectContaining({
          id: '[AUD-001]',
          kind: 'audit_result',
          sourceFileName: 'base.ifc',
        }),
      ],
    }));
  });
});
