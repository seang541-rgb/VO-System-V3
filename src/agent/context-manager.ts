// ── Context Manager ─────────────────────────────────────────────────────────
// Tracks tool execution results across the session so the Agent can reference
// key data from earlier steps without re-calling tools.

const MAX_ENTRIES = 15;
const MAX_CONTEXT_CHARS = 3000;

interface ContextEntry {
  tool: string;
  timestamp: number;
  summary: string;
}

function summarizeToolResult(tool: string, result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  if ('error' in r) return null;

  switch (tool) {
    case 'compare_ifc': {
      const s = r.summary as Record<string, number> | undefined;
      if (!s) return null;
      return `VO Comparison: ${s.added} added, ${s.deleted} deleted, ${s.modified} modified, ${s.eotFlags ?? 0} EOT flags, ${s.starRateCandidates ?? 0} star-rate candidates`;
    }
    case 'summarize_commercial_impact': {
      const s = r.summary as Record<string, unknown> | undefined;
      const qs = r.qsSummary as Record<string, unknown> | undefined;
      if (!s) return null;
      const parts = [];
      if ('netValue' in s) parts.push(`net=${fmt(s.netValue)}`);
      if ('omissionsValue' in s) parts.push(`omissions=${fmt(s.omissionsValue)}`);
      if ('additionsValue' in s) parts.push(`additions=${fmt(s.additionsValue)}`);
      if (qs && 'formworkAlerts' in qs) parts.push(`formwork=${qs.formworkAlerts}`);
      return `Commercial Impact: ${parts.join(', ')}`;
    }
    case 'query_ifc': {
      const model = r.model ?? '?';
      const total = r.total ?? 0;
      const matched = r.matched ?? 0;
      return `Query ${model}: ${matched}/${total} matched`;
    }
    case 'audit_ifc': {
      const model = r.auditedModel ?? '?';
      const count = r.elementsAudited ?? 0;
      const mode = r.quantityModeUsed ?? 'unknown';
      return `Audit ${model}: ${count} elements, mode=${mode}`;
    }
    case 'export_vo_excel': {
      if (r.ok) return 'Excel workbook exported';
      return null;
    }
    case 'generate_report': {
      if (r.ok) return 'PDF report generated';
      return null;
    }
    case 'ocr_document': {
      const lines = typeof r.lineCount === 'number' ? r.lineCount : 0;
      const bq = typeof r.bqItemCount === 'number' ? r.bqItemCount : 0;
      const conf = typeof r.confidence === 'number' ? `${r.confidence.toFixed(0)}%` : '?';
      return `OCR: ${lines} lines extracted (${conf} confidence)${bq > 0 ? `, ${bq} BQ items detected` : ''}`;
    }
    case 'analyze_contract_clause': {
      const meta = r.clauseMeta as Record<string, string> | undefined;
      const src = r.clauseSource ?? 'unknown';
      if (meta) return `Clause analysis: ${meta.contractType} ${meta.clauseNumber} (${src})`;
      return `Clause analysis completed (${src})`;
    }
    case 'lookup_regulation': {
      const source = r.source ?? 'any';
      const count = r.count ?? (r.counts ? Object.values(r.counts as Record<string, number>).reduce((a, b) => a + b, 0) : 0);
      return `Regulation lookup (${source}): ${count} matches`;
    }
    case 'lookup_measurement_code': {
      const count = r.count ?? 0;
      const sys = r.system ?? 'any';
      return `Measurement code (${sys}): ${count} matches`;
    }
    case 'get_vo_template': {
      const tmpl = r.template as Record<string, string> | undefined;
      if (tmpl) return `Template: ${tmpl.title ?? tmpl.templateType}`;
      return null;
    }
    case 'estimate_cost': {
      const count = r.count ?? 0;
      const cat = r.category ?? 'any';
      return `Cost estimate (${cat}): ${count} rates found`;
    }
    default:
      return null;
  }
}

function fmt(v: unknown): string {
  if (typeof v === 'number') return v.toLocaleString('en', { maximumFractionDigits: 0 });
  return String(v ?? '?');
}

export class ContextManager {
  private entries: ContextEntry[] = [];

  recordToolResult(tool: string, result: unknown): void {
    const summary = summarizeToolResult(tool, result);
    if (!summary) return;

    // Replace if same tool already recorded (keep latest)
    const idx = this.entries.findIndex((e) => e.tool === tool);
    const entry: ContextEntry = { tool, timestamp: Date.now(), summary };
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }

    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
  }

  buildContextSummary(): string {
    if (this.entries.length === 0) return '';

    const lines = this.entries.map((e) => `• ${e.summary}`);
    let text = lines.join('\n');

    if (text.length > MAX_CONTEXT_CHARS) {
      const kept = [];
      let total = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (total + lines[i].length + 1 > MAX_CONTEXT_CHARS) break;
        kept.unshift(lines[i]);
        total += lines[i].length + 1;
      }
      text = kept.join('\n');
    }

    return `\n--- SESSION CONTEXT (previous tool results) ---\n${text}`;
  }

  getCompletedTools(): string[] {
    return this.entries.map((e) => e.tool);
  }

  reset(): void {
    this.entries = [];
  }
}
