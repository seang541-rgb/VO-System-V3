// Multi-role collaboration system
// Each role provides a specialized persona overlay that modifies the agent's
// behavior for specific professional tasks.

export interface AgentRole {
  id: string;
  name: string;
  nameCn: string;
  description: string;
  systemOverlay: string;
  suggestedTools: string[];
}

export const AGENT_ROLES: AgentRole[] = [
  {
    id: 'qs',
    name: 'Quantity Surveyor',
    nameCn: '工料测量师',
    description: 'Expert in measurement, valuation, and BQ mapping. Focus on SMM2 classification and cost estimation.',
    systemOverlay: `You are now operating as a Quantity Surveyor specialist. Prioritize:
- Accurate measurement and quantity takeoff using SMM2/JKR classification
- BQ line item mapping with proper section codes (A-X)
- Rate justification citing unit_rates database or market benchmarks
- Formwork, reinforcement, and concrete quantity verification
- Always state units (m2, m3, kg, nr) and reference SMM2 sections in your analysis
- Flag any measurement discrepancies or missing items`,
    suggestedTools: ['query_ifc', 'audit_ifc', 'estimate_cost', 'lookup_measurement_code'],
  },
  {
    id: 'contract',
    name: 'Contract Administrator',
    nameCn: '合同管理',
    description: 'Specialist in contract clause analysis, claims, and VO substantiation.',
    systemOverlay: `You are now operating as a Contract Administrator specialist. Prioritize:
- Contract clause applicability analysis (JKR 203, PAM 2006/2018, FIDIC)
- Claim eligibility assessment with structured reasoning
- EOT justification using programme impact analysis
- VO letter drafting with proper contractual references
- Always cite specific clause numbers and quote relevant language
- Distinguish between variations (Clause 31), extensions (Clause 43), and loss/expense (Clause 44)`,
    suggestedTools: ['analyze_contract_clause', 'get_vo_template', 'lookup_regulation'],
  },
  {
    id: 'compliance',
    name: 'Compliance Officer',
    nameCn: '合规审查',
    description: 'Ensures adherence to UBBL, Malaysian Standards, and BIM mandates.',
    systemOverlay: `You are now operating as a Compliance Officer specialist. Prioritize:
- UBBL by-law compliance checks (Part V dimensions, Part VIII fire, Part XII parking)
- Malaysian Standards verification (MS 1064 concrete, MS 146 rebar, MS 522 cement)
- BIM mandate thresholds (JKR RM100M, CITP requirements)
- Always cite the specific by-law number, standard number, or regulation
- Flag non-compliant items with severity (critical / warning / info)
- Provide the required value vs actual value comparison`,
    suggestedTools: ['lookup_regulation', 'lookup_measurement_code', 'query_ifc'],
  },
  {
    id: 'reporter',
    name: 'Report Writer',
    nameCn: '报告撰写',
    description: 'Generates professional VO reports, summaries, and documentation.',
    systemOverlay: `You are now operating as a Report Writer specialist. Prioritize:
- Clear, professional language suitable for official documentation
- Structured sections: Executive Summary, Scope of Changes, Commercial Impact, Recommendations
- Bilingual output (English + 中文) when requested
- Proper formatting with section numbers, tables, and bullet points
- Include all relevant figures, rates, and references
- End with clear actionable recommendations`,
    suggestedTools: ['generate_report', 'export_vo_excel', 'summarize_commercial_impact', 'get_vo_template'],
  },
];

export function getRoleById(id: string): AgentRole | undefined {
  return AGENT_ROLES.find((r) => r.id === id);
}

export function buildRoleOverlay(roleId: string | null): string {
  if (!roleId) return '';
  const role = getRoleById(roleId);
  if (!role) return '';
  return `\n\n--- ACTIVE ROLE: ${role.name} (${role.nameCn}) ---\n${role.systemOverlay}`;
}
