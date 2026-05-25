// Knowledge-base lookups against the Supabase seed tables.
// All queries run client-side via the user's authenticated session — RLS
// restricts to SELECT for `authenticated` role.

import { supabase } from '../lib/supabase';

// ── Types matching the seed schemas (subset of columns we actually return) ──

export interface ContractClauseRow {
  id: number;
  contract_type: string;
  clause_number: string;
  title_en: string | null;
  title_cn: string | null;
  content_en: string | null;
  content_cn: string | null;
  category: string | null;
  keywords: string[] | null;
  verified: boolean;
}

export interface UbblRow {
  id: number;
  part: string;
  by_law_number: string;
  title: string | null;
  title_cn: string | null;
  content: string | null;
  content_cn: string | null;
  category: string | null;
  numeric_value: number | null;
  unit: string | null;
}

export interface MsStandardRow {
  id: number;
  standard_number: string;
  title: string | null;
  title_cn: string | null;
  category: string | null;
  scope: string | null;
  year: number | null;
  verified: boolean;
}

export interface BimRegulationRow {
  id: number;
  regulation_type: string;
  title: string;
  title_cn: string | null;
  issuing_body: string | null;
  document_number: string | null;
  effective_date: string | null;
  value_threshold: number | null;
  currency: string | null;
  scope: string | null;
  scope_cn: string | null;
}

export interface MeasurementCodeRow {
  id: number;
  system: string;
  section_code: string;
  title: string | null;
  title_cn: string | null;
  description: string | null;
  description_cn: string | null;
}

export interface VoTemplateRow {
  id: number;
  template_type: string;
  contract_type: string | null;
  title: string | null;
  title_cn: string | null;
  content: string | null;
  content_cn: string | null;
  fields: unknown;
}

// ── Contract clause lookup ──────────────────────────────────────────────────

/**
 * Fetch a single clause by contract_type + clause_number (exact match).
 * Used by analyze_contract_clause when the user references a specific clause
 * instead of pasting the text.
 */
export async function fetchClause(contractType: string, clauseNumber: string): Promise<ContractClauseRow | null> {
  const { data, error } = await supabase
    .from('contract_clauses')
    .select('*')
    .eq('contract_type', contractType)
    .eq('clause_number', clauseNumber)
    .maybeSingle();
  if (error) throw new Error(`contract_clauses query failed: ${error.message}`);
  return (data as ContractClauseRow) ?? null;
}

/**
 * Free-text search across title + content + keywords.
 */
export async function searchClauses(query: string, limit = 5): Promise<ContractClauseRow[]> {
  const q = `%${query}%`;
  const { data, error } = await supabase
    .from('contract_clauses')
    .select('*')
    .or(`title_en.ilike.${q},title_cn.ilike.${q},content_en.ilike.${q},content_cn.ilike.${q}`)
    .limit(Math.max(1, Math.min(20, limit)));
  if (error) throw new Error(`contract_clauses search failed: ${error.message}`);
  return (data ?? []) as ContractClauseRow[];
}

// ── Regulation lookup (UBBL / MS / BIM) ─────────────────────────────────────

export interface RegulationSearchResult {
  ubbl: UbblRow[];
  ms_standards: MsStandardRow[];
  bim_regulations: BimRegulationRow[];
}

export async function searchUbbl(query: string, part?: string, limit = 5): Promise<UbblRow[]> {
  const q = `%${query}%`;
  let builder = supabase
    .from('ubbl_provisions')
    .select('*')
    .or(`title.ilike.${q},title_cn.ilike.${q},content.ilike.${q},content_cn.ilike.${q},category.ilike.${q}`);
  if (part) builder = builder.eq('part', part);
  const { data, error } = await builder.limit(Math.max(1, Math.min(20, limit)));
  if (error) throw new Error(`ubbl_provisions search failed: ${error.message}`);
  return (data ?? []) as UbblRow[];
}

export async function searchMsStandards(query: string, limit = 5): Promise<MsStandardRow[]> {
  const q = `%${query}%`;
  const { data, error } = await supabase
    .from('ms_standards')
    .select('*')
    .or(`standard_number.ilike.${q},title.ilike.${q},title_cn.ilike.${q},category.ilike.${q},scope.ilike.${q}`)
    .limit(Math.max(1, Math.min(20, limit)));
  if (error) throw new Error(`ms_standards search failed: ${error.message}`);
  return (data ?? []) as MsStandardRow[];
}

export async function searchBimRegulations(query: string, limit = 5): Promise<BimRegulationRow[]> {
  const q = `%${query}%`;
  const { data, error } = await supabase
    .from('bim_regulations')
    .select('*')
    .or(`title.ilike.${q},title_cn.ilike.${q},scope.ilike.${q},scope_cn.ilike.${q},issuing_body.ilike.${q}`)
    .limit(Math.max(1, Math.min(20, limit)));
  if (error) throw new Error(`bim_regulations search failed: ${error.message}`);
  return (data ?? []) as BimRegulationRow[];
}

export async function searchAllRegulations(query: string, limit = 5): Promise<RegulationSearchResult> {
  const [ubbl, ms, bim] = await Promise.all([
    searchUbbl(query, undefined, limit).catch(() => []),
    searchMsStandards(query, limit).catch(() => []),
    searchBimRegulations(query, limit).catch(() => []),
  ]);
  return { ubbl, ms_standards: ms, bim_regulations: bim };
}

// ── Measurement code lookup ─────────────────────────────────────────────────

export async function lookupMeasurementCode(
  options: { system?: 'SMM2' | 'NRM'; code?: string; query?: string; limit?: number },
): Promise<MeasurementCodeRow[]> {
  const limit = Math.max(1, Math.min(20, options.limit ?? 10));
  let builder = supabase.from('measurement_codes').select('*');
  if (options.system) builder = builder.eq('system', options.system);
  if (options.code) builder = builder.eq('section_code', options.code.toUpperCase());
  if (options.query) {
    const q = `%${options.query}%`;
    builder = builder.or(`title.ilike.${q},title_cn.ilike.${q},description.ilike.${q},description_cn.ilike.${q}`);
  }
  const { data, error } = await builder.limit(limit);
  if (error) throw new Error(`measurement_codes lookup failed: ${error.message}`);
  return (data ?? []) as MeasurementCodeRow[];
}

// ── VO template lookup ──────────────────────────────────────────────────────

export async function fetchVoTemplate(
  templateType: 'request_letter' | 'cost_breakdown' | 'approval_form',
  contractType?: string,
): Promise<VoTemplateRow | null> {
  let builder = supabase
    .from('vo_templates')
    .select('*')
    .eq('template_type', templateType);
  if (contractType) builder = builder.eq('contract_type', contractType);
  const { data, error } = await builder.limit(1).maybeSingle();
  if (error) throw new Error(`vo_templates lookup failed: ${error.message}`);
  return (data as VoTemplateRow) ?? null;
}

export async function listVoTemplates(): Promise<VoTemplateRow[]> {
  const { data, error } = await supabase.from('vo_templates').select('*');
  if (error) throw new Error(`vo_templates list failed: ${error.message}`);
  return (data ?? []) as VoTemplateRow[];
}

// ── Unit rate lookup ──────────────────────────────────────────────────────────

export interface UnitRateRow {
  id: number;
  category: string;
  item_code: string | null;
  description: string;
  description_cn: string | null;
  unit: string;
  rate_myr: number;
  region: string;
  rate_year: number;
  source: string | null;
  min_rate: number | null;
  max_rate: number | null;
  notes: string | null;
}

export async function searchUnitRates(
  options: { category?: string; query?: string; region?: string; limit?: number },
): Promise<UnitRateRow[]> {
  const limit = Math.max(1, Math.min(30, options.limit ?? 10));
  let builder = supabase.from('unit_rates').select('*');
  if (options.category) builder = builder.eq('category', options.category);
  if (options.region && options.region !== 'any') builder = builder.eq('region', options.region);
  if (options.query) {
    const q = `%${options.query}%`;
    builder = builder.or(`description.ilike.${q},description_cn.ilike.${q},item_code.ilike.${q}`);
  }
  const { data, error } = await builder.order('category').limit(limit);
  if (error) throw new Error(`unit_rates search failed: ${error.message}`);
  return (data ?? []) as UnitRateRow[];
}
