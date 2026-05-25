// Proactive Discovery Engine
// Analyzes workspace state and suggests next actions the user might want to take.
// Runs after key events (file upload, comparison complete, etc.) and surfaces
// suggestions in the Copilot panel.

import type { ToolContext } from './tools';

export interface ProactiveSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action?: string; // Agent command to auto-send if user accepts
  category: 'workflow' | 'quality' | 'compliance' | 'export';
}

export function analyzeWorkspace(ctx: ToolContext): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];

  // ── Pre-comparison suggestions ────────────────────────────────────────────
  if (ctx.baseComponents.length > 0 && ctx.revisionComponents.length > 0 && !ctx.voResults) {
    suggestions.push({
      id: 'run-comparison',
      priority: 'high',
      title: 'Run VO Comparison',
      description: 'Both IFC models are loaded. Run a comparison to identify variations.',
      action: 'Compare the base and revision IFC models and summarize the results.',
      category: 'workflow',
    });
  }

  // ── Post-comparison suggestions ───────────────────────────────────────────
  if (ctx.voResults) {
    const r = ctx.voResults;
    const qs = r.qsSummary;

    if (r.added.length + r.deleted.length + r.modified.length > 0) {
      suggestions.push({
        id: 'commercial-impact',
        priority: 'high',
        title: 'Review Commercial Impact',
        description: `${r.added.length} additions, ${r.deleted.length} omissions, ${r.modified.length} modifications detected.`,
        action: 'Summarize the commercial impact of this VO comparison.',
        category: 'workflow',
      });
    }

    if (qs.starRateCandidates > 0) {
      suggestions.push({
        id: 'star-rate-review',
        priority: 'high',
        title: `Star Rate Items (${qs.starRateCandidates})`,
        description: 'New items not in BQ detected — may need star rate valuation.',
        action: 'Show me the star rate candidates from the comparison and suggest how to price them.',
        category: 'compliance',
      });
    }

    if (qs.eotFlags > 0) {
      suggestions.push({
        id: 'eot-review',
        priority: 'medium',
        title: `EOT Flags (${qs.eotFlags})`,
        description: 'Changes that may justify Extension of Time claims.',
        action: 'Analyze the EOT flag items and assess if they support a time extension claim under the contract.',
        category: 'compliance',
      });
    }

    if (qs.formworkAlerts > 0) {
      suggestions.push({
        id: 'formwork-alert',
        priority: 'medium',
        title: `Formwork Alerts (${qs.formworkAlerts})`,
        description: 'Structural changes affecting formwork quantities.',
        action: 'Detail the formwork alerts and their cost implications.',
        category: 'quality',
      });
    }

    if (r.added.length + r.deleted.length > 5) {
      suggestions.push({
        id: 'generate-report',
        priority: 'medium',
        title: 'Generate PDF Report',
        description: 'Significant changes detected — generate a formal VO substantiation report.',
        action: 'Generate a PDF VO substantiation report for this comparison.',
        category: 'export',
      });
    }

    if (ctx.bqItems.length === 0) {
      suggestions.push({
        id: 'upload-bq',
        priority: 'medium',
        title: 'Upload BQ Schedule',
        description: 'No BQ loaded — upload one for better rate matching and commercial valuation.',
        category: 'workflow',
      });
    }
  }

  // ── Single model suggestions ──────────────────────────────────────────────
  if (ctx.baseComponents.length > 0 && ctx.revisionComponents.length === 0) {
    suggestions.push({
      id: 'upload-revision',
      priority: 'medium',
      title: 'Upload Revision Model',
      description: 'Base model loaded. Upload the revision IFC to enable VO comparison.',
      category: 'workflow',
    });

    if (ctx.getActiveIfcHandle?.()) {
      suggestions.push({
        id: 'run-audit',
        priority: 'low',
        title: 'Run Quantity Audit',
        description: 'Run SMM2/JKR audit on the loaded model for quantity takeoff.',
        action: 'Audit the base IFC model and show the top BQ rows.',
        category: 'workflow',
      });
    }
  }

  return suggestions.sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 };
    return p[a.priority] - p[b.priority];
  });
}
