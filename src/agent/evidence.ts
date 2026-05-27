export type EvidenceKind =
  | 'ifc_component'
  | 'ifc_comparison'
  | 'document_page'
  | 'bq_item'
  | 'audit_result';

export interface EvidenceReference {
  id: string;
  kind: EvidenceKind;
  label: string;
  sourceFileName: string | null;
  sourceSlot?: 'base' | 'revision';
  pageNumber?: number;
  excerpt?: string;
  locator?: {
    expressID?: number;
    ifcId?: string;
    itemReference?: string;
  };
  facts: Record<string, string | number | boolean | null>;
  confidence?: number | null;
  limitation?: string | null;
}

export interface AnswerEvidence {
  cited: EvidenceReference[];
  available: EvidenceReference[];
  invalidIds: string[];
  missingCitation: boolean;
}

const CITATION_PATTERN = /\[(?:IFC-[BR]-[A-Z0-9-]+|CMP-\d+|PDF-\d+:p\d+|BQ-[A-Z0-9-]+|AUD-\d+)\]/g;

export function mergeEvidenceReferences(
  existing: EvidenceReference[],
  incoming: EvidenceReference[],
): EvidenceReference[] {
  return [...new Map([...existing, ...incoming].map((reference) => [reference.id, reference])).values()];
}

export function extractEvidenceReferences(result: unknown): EvidenceReference[] {
  if (!result || typeof result !== 'object') return [];
  const refs = (result as { evidenceRefs?: unknown }).evidenceRefs;
  if (!Array.isArray(refs)) return [];
  return refs.filter((reference): reference is EvidenceReference => (
    !!reference
    && typeof reference === 'object'
    && typeof (reference as EvidenceReference).id === 'string'
    && typeof (reference as EvidenceReference).kind === 'string'
  ));
}

export function collectValidCitations(text: string, references: EvidenceReference[]): AnswerEvidence {
  const ids = [...text.matchAll(CITATION_PATTERN)].map((match) => match[0]);
  const known = new Map(references.map((reference) => [reference.id, reference]));
  const cited = ids
    .map((id) => known.get(id))
    .filter((reference): reference is EvidenceReference => !!reference);

  return {
    cited: mergeEvidenceReferences([], cited),
    available: references,
    invalidIds: [...new Set(ids.filter((id) => !known.has(id)))],
    missingCitation: references.length > 0 && cited.length === 0,
  };
}

export function summarizeEvidenceCounts(references: EvidenceReference[]): Record<string, number> {
  const counts: Record<string, number> = {};
  references.forEach((reference) => {
    const category = reference.kind === 'document_page'
      ? 'PDF'
      : reference.kind === 'bq_item'
        ? 'BQ'
        : reference.kind === 'audit_result'
          ? 'Audit'
          : 'IFC';
    counts[category] = (counts[category] ?? 0) + 1;
  });
  return counts;
}
