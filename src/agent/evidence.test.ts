import { describe, expect, it } from 'vitest';
import { collectValidCitations, summarizeEvidenceCounts, type EvidenceReference } from './evidence';

const references: EvidenceReference[] = [
  {
    id: '[PDF-001:p3]',
    kind: 'document_page',
    label: 'Claim backup page 3',
    sourceFileName: 'claim-backup.pdf',
    pageNumber: 3,
    facts: { extraction: 'pdf-text' },
  },
  {
    id: '[IFC-B-001]',
    kind: 'ifc_component',
    label: 'Base wall',
    sourceFileName: 'base.ifc',
    sourceSlot: 'base',
    facts: { type: 'IfcWall' },
  },
];

describe('evidence citation validation', () => {
  it('resolves only citations registered for the current run', () => {
    expect(collectValidCitations(
      'The wall is shown in the model [IFC-B-001] and document [PDF-999:p1].',
      references,
    )).toEqual({
      cited: [references[1]],
      available: references,
      invalidIds: ['[PDF-999:p1]'],
      missingCitation: false,
    });
  });

  it('marks an evidence-backed answer that omits citations', () => {
    expect(collectValidCitations('The wall changed.', references).missingCitation).toBe(true);
  });

  it('summarizes visible source categories for the evidence panel', () => {
    expect(summarizeEvidenceCounts(references)).toEqual({ IFC: 1, PDF: 1 });
  });
});
