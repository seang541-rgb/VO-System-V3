import type {
  BimComponent,
  BqLineItem,
  BqMappingContext,
  ModifiedBimComponent,
  VoCommercialAction,
  VoComparisonResults,
} from '../BimEngine';
import { buildCommercialBreakdown } from '../BimEngine';
import { exportVoSubstantiationWorkbook } from '../vo-report';
import { generateVoPdfReport } from '../report/pdf-generator';
import type { OcrLanguage } from '../ocr/ocr-engine';
import {
  fetchClause,
  fetchVoTemplate,
  lookupMeasurementCode,
  searchAllRegulations,
  searchBimRegulations,
  searchMsStandards,
  searchUbbl,
  searchUnitRates,
  type BimRegulationRow,
  type MeasurementCodeRow,
  type MsStandardRow,
  type UbblRow,
  type UnitRateRow,
} from './kb-lookups';

// ── LLM-friendly row formatters ─────────────────────────────────────────────
// Each formatter produces a compact object with:
//  - `citation`  : the canonical identifier to quote (the LLM MUST surface this)
//  - `title`     : human title to disambiguate similar rows
//  - `appliesTo` : the specific scenario this row covers (derived from title)
//  - `value`     : the headline numeric answer when applicable
// plus the full bilingual content so the LLM can quote it if asked.

function formatUbblForLLM(r: UbblRow) {
  const title = r.title || r.title_cn || '';
  return {
    citation: `UBBL Part ${r.part}, By-Law ${r.by_law_number}`,
    title,
    title_cn: r.title_cn,
    appliesTo: extractAppliesTo(title),
    value: r.numeric_value != null ? `${r.numeric_value} ${r.unit ?? ''}`.trim() : null,
    category: r.category,
    content_en: r.content,
    content_cn: r.content_cn,
  };
}

function formatMsForLLM(r: MsStandardRow) {
  return {
    citation: r.year ? `${r.standard_number}:${r.year}` : r.standard_number,
    title: r.title,
    title_cn: r.title_cn,
    category: r.category,
    scope: r.scope,
    verified: r.verified,
  };
}

function formatBimForLLM(r: BimRegulationRow) {
  return {
    citation: r.document_number || r.title,
    title: r.title,
    title_cn: r.title_cn,
    issuingBody: r.issuing_body,
    effectiveDate: r.effective_date,
    threshold:
      r.value_threshold != null
        ? `${r.currency ?? 'MYR'} ${r.value_threshold.toLocaleString()}`
        : null,
    scope_en: r.scope,
    scope_cn: r.scope_cn,
  };
}

function formatMeasurementForLLM(r: MeasurementCodeRow) {
  return {
    citation: `${r.system} Section ${r.section_code}`,
    title: r.title,
    title_cn: r.title_cn,
    description: r.description,
    description_cn: r.description_cn,
  };
}

// Heuristic — derive a concise "applies to" hint from the title.
// Example: "Minimum Ceiling Height — Habitable Rooms" → "Habitable rooms"
function extractAppliesTo(title: string): string {
  // Take the segment after an em-dash, en-dash, hyphen, or colon
  const m = title.match(/[—–\-:]\s*(.+)$/);
  if (m) return m[1].trim();
  return title;
}

export type WhichModel = 'base' | 'revision';

export interface ToolContext {
  baseComponents: BimComponent[];
  revisionComponents: BimComponent[];
  voResults: VoComparisonResults | null;
  bqItems: BqLineItem[];
  bqContext?: BqMappingContext;
  baseFileName: string | null;
  revisionFileName: string | null;
  runCompare: () => Promise<VoComparisonResults | null>;
  getActiveIfcHandle?: () => { api: any; modelID: number } | null;
  activeIfcSlot?: 'base' | 'revision' | null;
  ocrFile?: File | null;
}

export interface AnthropicToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const AGENT_TOOL_SCHEMAS: AnthropicToolSchema[] = [
  {
    name: 'query_ifc',
    description:
      'Query components from the loaded base or revision IFC model. Returns a filtered list with key identifying fields and quantities. Use this when the user asks about what is in a model or wants to locate specific elements.',
    input_schema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          enum: ['base', 'revision'],
          description: 'Which model to query.',
        },
        typeFilter: {
          type: 'string',
          description: 'Optional IFC type filter (e.g. IfcWall, IfcSlab). Case-insensitive substring match.',
        },
        labelFilter: {
          type: 'string',
          description: 'Optional case-insensitive substring match against the QS label.',
        },
        sectionCode: {
          type: 'string',
          description: 'Optional SMM2 section code filter (e.g. F, G, M, Q, U).',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of components to return (default 25, max 100).',
        },
      },
      required: ['model'],
    },
  },
  {
    name: 'compare_ifc',
    description:
      'Run or re-run the VO comparison between base and revision models. Returns summary counts, top modified elements, and high-level QS indicators. If a comparison has already run, the cached result is returned unless force=true.',
    input_schema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: 'If true, re-run the comparison even if a cached result exists.',
        },
      },
    },
  },
  {
    name: 'summarize_commercial_impact',
    description:
      'Summarize the commercial breakdown of the current VO comparison: omissions, additions, net value, and the top actions by absolute amount. Call after compare_ifc.',
    input_schema: {
      type: 'object',
      properties: {
        topN: {
          type: 'integer',
          description: 'How many top-value commercial actions to include (default 10, max 50).',
        },
      },
    },
  },
  {
    name: 'export_vo_excel',
    description:
      'Export the VO Substantiation Excel workbook (cover sheet, summary, star-rate register, build-up, BQ mapping, substantiation) to the user\'s browser downloads. Requires a completed comparison.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'analyze_contract_clause',
    description:
      'Assess whether the current VO comparison gives grounds for a claim under a specific contract clause. Two input modes: (a) user pastes the actual clause text via clauseText, or (b) reference a stored clause by contractType + clauseNumber (e.g. JKR_203 + 31.3, PAM_2006 + 11.4) — the tool will fetch it from the contract_clauses knowledge base. After this tool runs, you MUST reply with a structured assessment: 1) eligible (yes/no/uncertain), 2) clauseExcerpt (the most load-bearing sentence), 3) reasoning (3-5 sentences mapping VO facts to clause language), 4) recommendedAction (concrete next step for the QS). Requires a completed comparison via compare_ifc.',
    input_schema: {
      type: 'object',
      properties: {
        clauseText: {
          type: 'string',
          description: 'Mode (a): the full clause text pasted by the user. Mutually exclusive with contractType/clauseNumber.',
        },
        contractType: {
          type: 'string',
          enum: ['JKR_203', 'PAM_2006', 'PAM_2018', 'FIDIC_RED'],
          description: 'Mode (b) part 1: which standard contract. Combine with clauseNumber to fetch from the knowledge base.',
        },
        clauseNumber: {
          type: 'string',
          description: 'Mode (b) part 2: the clause/sub-clause number, e.g. "31.3", "11.4", "32.1".',
        },
        claimType: {
          type: 'string',
          enum: ['variation', 'extension_of_time', 'loss_and_expense', 'star_rate', 'other'],
          description: 'Optional: which type of claim is being assessed.',
        },
      },
    },
  },
  {
    name: 'lookup_regulation',
    description:
      'Search Malaysian construction regulations across three sources: UBBL 1984 by-laws (ceiling height, fire, parking, accessibility), Malaysian Standards (MS 522 cement, MS 1064 concrete, MS 146 rebar, etc.), and BIM / government mandates (CITP, JKR BIM thresholds, IBS Score). Returns bilingual content (English + 中文) when available. Use this when the user asks compliance questions like "What is the minimum ceiling height for a residential room?", "What standard governs Grade 500 rebar?", or "When did the JKR BIM mandate apply?".',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text search term. Examples: "ceiling height", "fire escape", "MS 1064", "BIM threshold", "parking ratio".',
        },
        source: {
          type: 'string',
          enum: ['ubbl', 'ms_standards', 'bim_regulations', 'any'],
          description: 'Narrow the search to one source. Default "any" searches all three.',
        },
        part: {
          type: 'string',
          enum: ['V', 'VI', 'VII', 'VIII', 'XII', 'XIII'],
          description: '(UBBL only) Filter by Part. V=dimensions, VI=stairs, VII=corridors, VIII=fire, XII=parking, XIII=accessibility.',
        },
        limit: {
          type: 'integer',
          description: 'Max results per source (default 5, max 20).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_measurement_code',
    description:
      'Look up SMM2 sections (A-X, e.g. F = Reinforcement/Formwork, M = Plasterwork) or NRM elements (1-9, e.g. 2 = Superstructure). Use when classifying a BQ item, explaining measurement conventions, or telling the user where a quantity belongs.',
    input_schema: {
      type: 'object',
      properties: {
        system: {
          type: 'string',
          enum: ['SMM2', 'NRM', 'any'],
          description: 'Which measurement system to search. Default "any".',
        },
        code: {
          type: 'string',
          description: 'Exact code, e.g. "F" (SMM2 Reinforcement) or "2" (NRM Superstructure). Case-insensitive.',
        },
        query: {
          type: 'string',
          description: 'Free-text search when code is unknown, e.g. "concrete", "fire", "external works".',
        },
        limit: {
          type: 'integer',
          description: 'Max results (default 10, max 20).',
        },
      },
    },
  },
  {
    name: 'get_vo_template',
    description:
      'Fetch a Variation Order template (request letter / cost breakdown / approval form) with bilingual content and field definitions. Returns markdown with {{placeholders}} and a JSON `fields` array describing what to fill in. Use when the user asks for a VO letter draft or wants to know what fields a VO approval requires.',
    input_schema: {
      type: 'object',
      properties: {
        templateType: {
          type: 'string',
          enum: ['request_letter', 'cost_breakdown', 'approval_form'],
          description: 'Which template to fetch.',
        },
        contractType: {
          type: 'string',
          enum: ['JKR_203', 'PAM_2006', 'PAM_2018'],
          description: 'Optional: filter by contract type. Default returns the first match.',
        },
      },
      required: ['templateType'],
    },
  },
  {
    name: 'audit_ifc',
    description:
      'Run the SMM2 / JKR compliance audit (IdeaNest engine, ported to TypeScript) on a loaded IFC model. Returns one record per audited element (walls, slabs, beams, columns, coverings), grouped into BQ rows by JKR code, plus a summary of quantity sources and classifications. The audit operates on whichever model is currently in the 3D viewer — if the user asks to audit a slot that is not active, ask them to switch to that view first.',
    input_schema: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          enum: ['base', 'revision'],
          description: 'Which loaded IFC to audit. Must match the currently active 3D view.',
        },
        topN: {
          type: 'integer',
          description: 'How many BQ rows to include in the response (default 10, max 50).',
        },
      },
      required: ['model'],
    },
  },
  {
    name: 'estimate_cost',
    description:
      'Look up Malaysian construction unit rates and estimate costs. Search the unit rate database by category (concrete, reinforcement, formwork, brickwork, etc.), free-text query, or region. Returns rates in MYR with min/max ranges. Use after audit_ifc or compare_ifc to price VO items.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['concrete', 'reinforcement', 'formwork', 'brickwork', 'plasterwork', 'painting', 'roofing', 'drainage', 'earthwork', 'other'],
          description: 'Filter by material/trade category.',
        },
        query: {
          type: 'string',
          description: 'Free-text search for specific items (e.g. "Grade 30 slab", "T16 rebar", "half brick wall").',
        },
        region: {
          type: 'string',
          enum: ['national', 'klang_valley', 'johor', 'penang', 'sabah', 'sarawak', 'any'],
          description: 'Filter by region. Default "national".',
        },
        limit: {
          type: 'integer',
          description: 'Max results (default 10, max 30).',
        },
      },
    },
  },
  {
    name: 'generate_report',
    description:
      'Generate and download a PDF Variation Order Substantiation Report. Includes cover page, executive summary, commercial impact table, and element lists. Requires a completed comparison via compare_ifc.',
    input_schema: {
      type: 'object',
      properties: {
        projectName: {
          type: 'string',
          description: 'Project name for the cover page.',
        },
        preparedBy: {
          type: 'string',
          description: 'Name of the person who prepared the report.',
        },
      },
    },
  },
  {
    name: 'ocr_document',
    description:
      'Run OCR on an uploaded image (scan of BQ schedule, contract page, drawing markup, etc.) to extract text. Supports English and Chinese. Returns extracted text, line-by-line breakdown with confidence scores, and auto-detected BQ line items if present. The user must first upload the image — use the file from the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['eng', 'chi_sim', 'chi_tra', 'eng+chi_sim'],
          description: 'OCR language. Default "eng+chi_sim" (English + Simplified Chinese).',
        },
        extractBq: {
          type: 'boolean',
          description: 'If true, attempt to parse BQ line items from the extracted text. Default true.',
        },
      },
    },
  },
];

// ── Tool dependency metadata for the Router ─────────────────────────────────

export interface ToolMeta {
  name: string;
  requires: ('base_loaded' | 'revision_loaded' | 'both_loaded' | 'comparison_done' | 'ifc_handle')[];
  produces: ('comparison_done' | 'commercial_data' | 'audit_data' | 'excel_export')[];
}

export const TOOL_GRAPH: ToolMeta[] = [
  { name: 'query_ifc',                  requires: [],                produces: [] },
  { name: 'compare_ifc',                requires: ['both_loaded'],   produces: ['comparison_done'] },
  { name: 'summarize_commercial_impact', requires: ['comparison_done'], produces: ['commercial_data'] },
  { name: 'export_vo_excel',            requires: ['comparison_done'], produces: ['excel_export'] },
  { name: 'analyze_contract_clause',    requires: ['comparison_done'], produces: [] },
  { name: 'lookup_regulation',          requires: [],                produces: [] },
  { name: 'lookup_measurement_code',    requires: [],                produces: [] },
  { name: 'get_vo_template',            requires: [],                produces: [] },
  { name: 'audit_ifc',                  requires: ['ifc_handle'],    produces: ['audit_data'] },
  { name: 'estimate_cost',              requires: [],                produces: [] },
  { name: 'generate_report',           requires: ['comparison_done'], produces: [] },
  { name: 'ocr_document',             requires: [],                produces: [] },
];

function resolveAvailableCapabilities(ctx: ToolContext): Set<string> {
  const caps = new Set<string>();
  if (ctx.baseComponents.length > 0) caps.add('base_loaded');
  if (ctx.revisionComponents.length > 0) caps.add('revision_loaded');
  if (ctx.baseComponents.length > 0 && ctx.revisionComponents.length > 0) caps.add('both_loaded');
  if (ctx.voResults) caps.add('comparison_done');
  if (ctx.getActiveIfcHandle?.()) caps.add('ifc_handle');
  return caps;
}

export function getAvailableTools(ctx: ToolContext): typeof OPENAI_TOOL_DEFINITIONS {
  const caps = resolveAvailableCapabilities(ctx);
  const available = new Set<string>();

  for (const meta of TOOL_GRAPH) {
    const satisfied = meta.requires.every((r) => caps.has(r));
    if (satisfied) available.add(meta.name);
  }

  // Always include compare_ifc so the agent can trigger it (the tool itself returns a clear PREREQUISITE_NOT_MET)
  available.add('compare_ifc');

  return OPENAI_TOOL_DEFINITIONS.filter((t) => available.has(t.function.name));
}

export function buildToolRoutingHint(ctx: ToolContext): string {
  const caps = resolveAvailableCapabilities(ctx);
  const blocked: string[] = [];
  for (const meta of TOOL_GRAPH) {
    const missing = meta.requires.filter((r) => !caps.has(r));
    if (missing.length > 0) {
      blocked.push(`${meta.name} (needs: ${missing.join(', ')})`);
    }
  }
  if (blocked.length === 0) return '\n\nAll tools are available.';
  return `\n\n--- TOOL AVAILABILITY ---\nBlocked tools (prerequisites not met): ${blocked.join('; ')}.\nDo NOT call blocked tools — tell the user what action is needed instead.`;
}

// OpenAI-compatible tool definitions (used by NVIDIA NIM, OpenAI, and most OSS models)
export const OPENAI_TOOL_DEFINITIONS = AGENT_TOOL_SCHEMAS.map((tool) => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  },
}));

function pickModel(ctx: ToolContext, which: WhichModel): BimComponent[] {
  return which === 'base' ? ctx.baseComponents : ctx.revisionComponents;
}

function summarizeComponent(c: BimComponent) {
  return {
    expressID: c.expressID,
    ifcId: c.ifcId,
    type: c.type,
    name: c.name,
    qsLabel: c.qsLabel,
    section: c.smm2SectionCode || null,
    sectionTitle: c.smm2SectionTitle || null,
    level: c.levelName || null,
    block: c.blockName || null,
    zone: c.zoneName || null,
    gridRoom: c.gridRoomName || null,
    quantities: Object.fromEntries(
      Object.entries(c.quantities || {}).map(([k, v]) => [k, { value: v.value, unit: v.unit, source: v.source }]),
    ),
  };
}

function summarizeModified(m: ModifiedBimComponent) {
  return {
    qsLabel: m.rev.qsLabel || m.base.qsLabel,
    type: m.rev.type || m.base.type,
    section: m.rev.smm2SectionCode || m.base.smm2SectionCode || null,
    level: m.rev.levelName || m.base.levelName || null,
    changeCount: Array.isArray(m.changes) ? m.changes.length : 0,
    topChangeFields: (m.changes || []).slice(0, 5).map((ch) => ch.field),
  };
}

function summarizeAction(a: VoCommercialAction) {
  return {
    action: a.action,
    qsLabel: a.component?.qsLabel ?? '',
    type: a.component?.type ?? '',
    section: a.component?.smm2SectionCode ?? null,
    quantity: a.quantity,
    unit: a.unit,
    rate: typeof a.rate === 'number' ? a.rate : null,
    amount: typeof a.amount === 'number' ? a.amount : null,
    rateStatus: a.rateStatus,
    pricingSource: a.pricingSource,
  };
}

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case 'query_ifc': {
      const which = (input.model as WhichModel) ?? 'base';
      const typeFilter = typeof input.typeFilter === 'string' ? input.typeFilter.toLowerCase() : '';
      const labelFilter = typeof input.labelFilter === 'string' ? input.labelFilter.toLowerCase() : '';
      const sectionCode = typeof input.sectionCode === 'string' ? input.sectionCode.toUpperCase() : '';
      const rawLimit = typeof input.limit === 'number' ? input.limit : 25;
      const limit = Math.max(1, Math.min(100, Math.floor(rawLimit)));

      const pool = pickModel(ctx, which);
      const filtered = pool.filter((c) => {
        if (typeFilter && !(c.type ?? '').toLowerCase().includes(typeFilter)) return false;
        if (labelFilter && !(c.qsLabel ?? '').toLowerCase().includes(labelFilter)) return false;
        if (sectionCode && (c.smm2SectionCode ?? '').toUpperCase() !== sectionCode) return false;
        return true;
      });

      return {
        model: which,
        total: pool.length,
        matched: filtered.length,
        truncated: filtered.length > limit,
        components: filtered.slice(0, limit).map(summarizeComponent),
      };
    }

    case 'compare_ifc': {
      const force = input.force === true;
      if (ctx.baseComponents.length === 0 || ctx.revisionComponents.length === 0) {
        return {
          error:
            'PREREQUISITE_NOT_MET: The user has not loaded both IFC files. STOP calling tools. In your reply, instruct the user to use the CHOOSE FILE buttons at the top to upload base.ifc and revision.ifc, then re-ask. Do NOT call query_ifc, audit_ifc, or any other tool to "explore" — they will all fail for the same reason.',
        };
      }
      const results = !force && ctx.voResults ? ctx.voResults : await ctx.runCompare();
      if (!results) return { error: 'Comparison did not produce a result.' };
      return {
        cached: !force && !!ctx.voResults,
        summary: {
          added: results.added.length,
          deleted: results.deleted.length,
          modified: results.modified.length,
          formworkAlerts: results.qsSummary?.formworkAlerts ?? 0,
          eotFlags: results.qsSummary?.eotFlags ?? 0,
          starRateCandidates: results.qsSummary?.starRateCandidates ?? 0,
          protectedValue: results.qsSummary?.protectedValue ?? 0,
        },
        topModified: results.modified.slice(0, 10).map(summarizeModified),
        sampleAdded: results.added.slice(0, 5).map((c) => ({
          qsLabel: c.qsLabel,
          type: c.type,
          section: c.smm2SectionCode || null,
        })),
        sampleDeleted: results.deleted.slice(0, 5).map((c) => ({
          qsLabel: c.qsLabel,
          type: c.type,
          section: c.smm2SectionCode || null,
        })),
      };
    }

    case 'summarize_commercial_impact': {
      if (!ctx.voResults) {
        return { error: 'No comparison results available. Run compare_ifc first.' };
      }
      const rawTop = typeof input.topN === 'number' ? input.topN : 10;
      const topN = Math.max(1, Math.min(50, Math.floor(rawTop)));
      const breakdown = buildCommercialBreakdown(ctx.voResults, ctx.bqContext);
      const actions = breakdown.actions ?? [];
      const top = [...actions]
        .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0))
        .slice(0, topN)
        .map(summarizeAction);
      return {
        summary: breakdown.summary,
        qsSummary: ctx.voResults.qsSummary,
        topActions: top,
      };
    }

    case 'export_vo_excel': {
      if (!ctx.voResults) {
        return { error: 'No comparison results available. Run compare_ifc first.' };
      }
      try {
        exportVoSubstantiationWorkbook(ctx.voResults, {
          baseModelName: ctx.baseFileName ?? undefined,
          revisionModelName: ctx.revisionFileName ?? undefined,
          pricingContext: ctx.bqContext,
        });
        return { ok: true, note: 'Workbook generated and downloaded in the browser.' };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'analyze_contract_clause': {
      if (ctx.baseComponents.length === 0 || ctx.revisionComponents.length === 0) {
        return {
          error:
            'PREREQUISITE_NOT_MET: The user has not loaded IFC files yet. STOP calling tools. In your reply, instruct the user to: (1) upload base IFC and revision IFC using the CHOOSE FILE buttons at the top of the page, (2) click Run VO Comparison, (3) then re-ask the contract-clause question. Do NOT retry compare_ifc or any other tool — the user must take this action manually.',
        };
      }
      if (!ctx.voResults) {
        return {
          error:
            'PREREQUISITE_NOT_MET: IFC files are loaded but no VO comparison has been run yet. STOP calling tools. In your reply, instruct the user to click the Run VO Comparison button (or you may call compare_ifc ONCE to run it on their behalf). Do NOT loop on tool calls.',
        };
      }
      // Resolve clause text from either user paste (mode a) or KB lookup (mode b).
      let clauseText = typeof input.clauseText === 'string' ? input.clauseText.trim() : '';
      let clauseSource: 'user_pasted' | 'knowledge_base' = 'user_pasted';
      let kbClauseMeta: { contractType: string; clauseNumber: string; titleEn: string | null; titleCn: string | null } | null = null;

      if (!clauseText && typeof input.contractType === 'string' && typeof input.clauseNumber === 'string') {
        try {
          const row = await fetchClause(input.contractType, input.clauseNumber);
          if (row) {
            clauseText = (row.content_en || row.content_cn || '').trim();
            clauseSource = 'knowledge_base';
            kbClauseMeta = {
              contractType: row.contract_type,
              clauseNumber: row.clause_number,
              titleEn: row.title_en,
              titleCn: row.title_cn,
            };
          } else {
            return {
              error: `KB lookup miss: no clause stored for contractType="${input.contractType}" clauseNumber="${input.clauseNumber}". STOP calling tools. Ask the user to paste the clause text directly via clauseText, or pick a different contractType/clauseNumber.`,
            };
          }
        } catch (err) {
          return {
            error: `KB lookup error: ${err instanceof Error ? err.message : String(err)}. STOP calling tools and tell the user the knowledge base is currently unreachable.`,
          };
        }
      }

      if (!clauseText) {
        return {
          error:
            'Either clauseText OR (contractType + clauseNumber) is required. STOP calling tools. Ask the user to paste the actual contract clause language, or reference a standard clause by code.',
        };
      }
      const claimType = typeof input.claimType === 'string' ? input.claimType : 'unspecified';
      const breakdown = buildCommercialBreakdown(ctx.voResults, ctx.bqContext);
      const summary = breakdown.summary ?? {};
      const qs = (ctx.voResults.qsSummary ?? {}) as Record<string, number>;

      // Top 5 actions by absolute amount — gives the LLM concrete commercial anchors
      const topActions = [...(breakdown.actions ?? [])]
        .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0))
        .slice(0, 5)
        .map(summarizeAction);

      return {
        instructions:
          'Reason about claim eligibility now. Reply with a structured assessment containing four fields: eligible (yes/no/uncertain), clauseExcerpt (the single most relevant sentence quoted from the clause), reasoning (3-5 sentences mapping concrete VO facts above to clause language), and recommendedAction (a concrete next step for the QS). Cite specific numbers from voSnapshot (e.g. omission value, EOT flag count). Do NOT call this tool again — produce the assessment in plain text/markdown.',
        claimType,
        clauseSource,
        clauseMeta: kbClauseMeta,
        clauseText,
        voSnapshot: {
          added: ctx.voResults.added.length,
          deleted: ctx.voResults.deleted.length,
          modified: ctx.voResults.modified.length,
          formworkAlerts: qs.formworkAlerts ?? 0,
          eotFlags: qs.eotFlags ?? 0,
          starRateCandidates: qs.starRateCandidates ?? 0,
          protectedValue: qs.protectedValue ?? 0,
          omissionsValue: (summary as Record<string, number>).omissionsValue ?? 0,
          additionsValue: (summary as Record<string, number>).additionsValue ?? 0,
          netValue: (summary as Record<string, number>).netValue ?? 0,
        },
        topCommercialActions: topActions,
      };
    }

    case 'lookup_regulation': {
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (!query) {
        return {
          error: 'query is required (free-text search term). STOP calling tools and ask the user what regulation topic to look up.',
        };
      }
      const source = typeof input.source === 'string' ? input.source : 'any';
      const part = typeof input.part === 'string' ? input.part : undefined;
      const limit = typeof input.limit === 'number' ? Math.max(1, Math.min(20, Math.floor(input.limit))) : 5;

      const INSTRUCTIONS = 'CRITICAL: Each match has a `citation`, a `title`, and the user-facing scenario it applies to. READ THE TITLE before picking — multiple by-laws / standards often share keywords (e.g. ceiling height has separate by-laws for habitable rooms, shops, kitchens, bathrooms; rebar standards differ by grade). NEVER cite a row unless its title specifically matches the user\'s scenario. In your reply, quote the `citation` verbatim (e.g. "UBBL Part V, By-Law 23"). If two or more matches could fit, list each with its citation and value, then ask the user which scenario they mean.';

      try {
        if (source === 'ubbl') {
          const rows = await searchUbbl(query, part, limit);
          return {
            source: 'ubbl', query, count: rows.length,
            instructions: INSTRUCTIONS,
            matches: rows.map(formatUbblForLLM),
          };
        }
        if (source === 'ms_standards') {
          const rows = await searchMsStandards(query, limit);
          return {
            source: 'ms_standards', query, count: rows.length,
            instructions: INSTRUCTIONS,
            matches: rows.map(formatMsForLLM),
          };
        }
        if (source === 'bim_regulations') {
          const rows = await searchBimRegulations(query, limit);
          return {
            source: 'bim_regulations', query, count: rows.length,
            instructions: INSTRUCTIONS,
            matches: rows.map(formatBimForLLM),
          };
        }
        // Default: search all three concurrently
        const all = await searchAllRegulations(query, limit);
        return {
          source: 'any', query,
          counts: { ubbl: all.ubbl.length, ms_standards: all.ms_standards.length, bim_regulations: all.bim_regulations.length },
          instructions: INSTRUCTIONS,
          matches: {
            ubbl: all.ubbl.map(formatUbblForLLM),
            ms_standards: all.ms_standards.map(formatMsForLLM),
            bim_regulations: all.bim_regulations.map(formatBimForLLM),
          },
        };
      } catch (err) {
        return { error: `Knowledge base unreachable: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'lookup_measurement_code': {
      const system = typeof input.system === 'string' && input.system !== 'any' ? (input.system as 'SMM2' | 'NRM') : undefined;
      const code = typeof input.code === 'string' ? input.code.trim() : undefined;
      const query = typeof input.query === 'string' ? input.query.trim() : undefined;
      const limit = typeof input.limit === 'number' ? Math.max(1, Math.min(20, Math.floor(input.limit))) : 10;

      if (!code && !query) {
        return {
          error: 'Either `code` or `query` is required for lookup_measurement_code. STOP calling tools and ask the user what measurement code to look up.',
        };
      }

      try {
        const rows = await lookupMeasurementCode({ system, code, query, limit });
        return {
          system: system ?? 'any',
          code: code ?? null,
          query: query ?? null,
          count: rows.length,
          instructions:
            'CRITICAL: Quote the `citation` field (e.g. "SMM2 Section F" or "NRM Section 2") in your reply. SMM2 letters and NRM numbers are not interchangeable — never mix them up.',
          matches: rows.map(formatMeasurementForLLM),
        };
      } catch (err) {
        return { error: `Knowledge base unreachable: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'get_vo_template': {
      const templateType = typeof input.templateType === 'string' ? input.templateType : '';
      if (!['request_letter', 'cost_breakdown', 'approval_form'].includes(templateType)) {
        return {
          error: 'templateType must be one of: request_letter, cost_breakdown, approval_form.',
        };
      }
      const contractType = typeof input.contractType === 'string' ? input.contractType : undefined;

      try {
        const row = await fetchVoTemplate(templateType as 'request_letter' | 'cost_breakdown' | 'approval_form', contractType);
        if (!row) {
          return {
            error: `No template found for templateType="${templateType}"${contractType ? ` contractType="${contractType}"` : ''}. STOP calling tools — explain to the user that this template combo is not in the library and suggest available alternatives.`,
          };
        }
        return {
          template: {
            id: row.id,
            templateType: row.template_type,
            contractType: row.contract_type,
            title: row.title,
            titleCn: row.title_cn,
            contentEn: row.content,
            contentCn: row.content_cn,
            fields: row.fields,
          },
          instructions:
            'Present the template structure to the user. Mention the title, list the required fields (from the fields array), and offer to help them fill it in. Do not dump the full content unless explicitly requested.',
        };
      } catch (err) {
        return { error: `Knowledge base unreachable: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'audit_ifc': {
      const which = (input.model as WhichModel) ?? 'base';
      const rawTopN = typeof input.topN === 'number' ? input.topN : 10;
      const topN = Math.max(1, Math.min(50, Math.floor(rawTopN)));

      if (!ctx.getActiveIfcHandle) {
        return {
          error:
            'PREREQUISITE_NOT_MET: Audit engine has no access to the IFC handle. STOP calling tools and tell the user to reload the page (this is a wiring issue, not user-fixable from chat).',
        };
      }

      const handle = ctx.getActiveIfcHandle();
      if (!handle) {
        return {
          error:
            'PREREQUISITE_NOT_MET: No IFC model is currently loaded. STOP calling tools. Instruct the user to upload an IFC file via the Workspace sidebar.',
        };
      }

      if (ctx.activeIfcSlot && ctx.activeIfcSlot !== which) {
        return {
          error: `PREREQUISITE_NOT_MET: The user requested audit of "${which}" but the currently loaded model is "${ctx.activeIfcSlot}". STOP calling tools. Tell the user to switch the 3D View to the "${which}" model by re-uploading or selecting it.`,
        };
      }

      // Lazy-load the audit module so the main bundle stays light.
      const { runAudit } = await import('../audit/extractor');
      const result = runAudit({ api: handle.api, modelID: handle.modelID });

      return {
        auditedModel: which,
        elementsAudited: result.records.length,
        quantityModeUsed: result.quantityModeUsed,
        summary: {
          recordCount: result.summary.recordCount,
          jkrCodeCount: result.summary.jkrCodeCount,
          topQuantitySources: result.summary.quantitySources.slice(0, 5),
          topClassifications: result.summary.classifications.slice(0, 8),
        },
        topBqRows: result.bqRows.slice(0, topN),
        sampleRecords: result.records.slice(0, 5).map((r) => ({
          guid: r.guid,
          ifcClass: r.ifcClass,
          name: r.name,
          jkrCode: r.jkrCode,
          classification: r.classification,
          storey: r.storeyName,
          netVolumeM3: r.netVolumeM3,
          quantitySource: r.quantitySource,
        })),
      };
    }

    case 'estimate_cost': {
      const category = typeof input.category === 'string' ? input.category : undefined;
      const query = typeof input.query === 'string' ? input.query.trim() : undefined;
      const region = typeof input.region === 'string' ? input.region : undefined;
      const limit = typeof input.limit === 'number' ? Math.max(1, Math.min(30, Math.floor(input.limit))) : 10;

      if (!category && !query) {
        return {
          error: 'Either `category` or `query` is required. STOP calling tools and ask the user what material or trade they want to price.',
        };
      }

      try {
        const rows = await searchUnitRates({ category, query, region, limit });
        return {
          category: category ?? 'any',
          query: query ?? null,
          region: region ?? 'national',
          count: rows.length,
          instructions: 'Present rates in a table. Always show the rate range (min–max) alongside the base rate. Quote the source and year. Rates are in MYR.',
          rates: rows.map((r: UnitRateRow) => ({
            description: r.description,
            description_cn: r.description_cn,
            itemCode: r.item_code,
            unit: r.unit,
            rate: r.rate_myr,
            minRate: r.min_rate,
            maxRate: r.max_rate,
            region: r.region,
            year: r.rate_year,
            source: r.source,
          })),
        };
      } catch (err) {
        return { error: `Unit rate lookup failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    case 'ocr_document': {
      if (!ctx.ocrFile) {
        return {
          error: 'PREREQUISITE_NOT_MET: No image file available for OCR. STOP calling tools. Ask the user to upload an image (JPG, PNG, or PDF scan) via the workspace file panel.',
        };
      }
      try {
        const lang = (typeof input.language === 'string' ? input.language : 'eng+chi_sim') as OcrLanguage;
        const extractBq = input.extractBq !== false;
        const { runOcr, extractBqFromOcrText } = await import('../ocr/ocr-engine');
        const result = await runOcr(ctx.ocrFile, lang);
        const response: Record<string, unknown> = {
          text: result.text.slice(0, 3000),
          confidence: result.confidence,
          lineCount: result.lines.length,
          topLines: result.lines.slice(0, 20).map((l) => ({ text: l.text, confidence: l.confidence })),
          elapsed: `${(result.elapsed / 1000).toFixed(1)}s`,
        };
        if (extractBq) {
          const bqItems = extractBqFromOcrText(result.text);
          response.detectedBqItems = bqItems.slice(0, 20);
          response.bqItemCount = bqItems.length;
        }
        return response;
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'generate_report': {
      if (!ctx.voResults) {
        return { error: 'No comparison results available. Run compare_ifc first.' };
      }
      try {
        const projectName = typeof input.projectName === 'string' ? input.projectName : undefined;
        const preparedBy = typeof input.preparedBy === 'string' ? input.preparedBy : undefined;
        generateVoPdfReport(ctx.voResults, {
          projectName,
          baseModelName: ctx.baseFileName ?? undefined,
          revisionModelName: ctx.revisionFileName ?? undefined,
          pricingContext: ctx.bqContext,
          preparedBy,
        });
        return { ok: true, note: 'PDF report generated and downloaded in the browser.' };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
