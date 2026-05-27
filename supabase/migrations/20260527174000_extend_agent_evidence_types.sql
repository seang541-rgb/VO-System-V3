-- Extend the existing Copilot evidence trail for source-linked IFC, document and BQ references.

alter table public.agent_evidence
  drop constraint if exists agent_evidence_evidence_type_check;

alter table public.agent_evidence
  add constraint agent_evidence_evidence_type_check
  check (evidence_type in (
    'ifc_query',
    'document_extract',
    'bq_reference',
    'comparison',
    'commercial_summary',
    'contract_assessment',
    'audit',
    'report',
    'knowledge_lookup'
  ));
