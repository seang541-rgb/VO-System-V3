// Training Data Collector
// Captures user-validated QS decisions as training samples for future
// fine-tuning of domain-specific models.

import { supabase } from '../lib/supabase';

export type SampleType = 'bq_mapping' | 'classification' | 'measurement' | 'rate_validation' | 'clause_assessment';

export interface TrainingSample {
  id: string;
  sample_type: SampleType;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  validated: boolean;
  quality_score: number | null;
  notes: string | null;
  created_at: string;
}

export async function collectBqMappingSample(
  projectId: string,
  input: { qsLabel: string; type: string; sectionCode: string; unit: string },
  output: { selectedItemReference: string; description: string; contractRate: number },
): Promise<void> {
  await insertSample(projectId, 'bq_mapping', input, output);
}

export async function collectClassificationSample(
  projectId: string,
  input: { ifcClass: string; name: string; properties: Record<string, unknown> },
  output: { jkrCode: string; smm2Section: string; classification: string },
): Promise<void> {
  await insertSample(projectId, 'classification', input, output);
}

export async function collectRateValidationSample(
  projectId: string,
  input: { description: string; unit: string; suggestedRate: number },
  output: { acceptedRate: number; source: string; region: string },
): Promise<void> {
  await insertSample(projectId, 'rate_validation', input, output);
}

export async function collectClauseAssessmentSample(
  projectId: string,
  input: { clauseText: string; contractType: string; voSnapshot: Record<string, unknown> },
  output: { eligible: string; reasoning: string; recommendedAction: string },
): Promise<void> {
  await insertSample(projectId, 'clause_assessment', input, output);
}

async function insertSample(
  projectId: string,
  sampleType: SampleType,
  inputData: Record<string, unknown>,
  outputData: Record<string, unknown>,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('training_samples').insert({
    user_id: user.id,
    project_id: projectId,
    sample_type: sampleType,
    input_data: inputData,
    output_data: outputData,
    validated: true,
    quality_score: null,
  });
}

export async function getTrainingSamples(
  sampleType?: SampleType,
  validatedOnly = true,
  limit = 100,
): Promise<TrainingSample[]> {
  let builder = supabase.from('training_samples').select('*');
  if (sampleType) builder = builder.eq('sample_type', sampleType);
  if (validatedOnly) builder = builder.eq('validated', true);
  const { data, error } = await builder.order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []) as TrainingSample[];
}

export async function exportTrainingDataset(sampleType: SampleType): Promise<string> {
  const samples = await getTrainingSamples(sampleType, true, 5000);
  // Export as JSONL format (one JSON object per line — standard for fine-tuning)
  return samples
    .map((s) => JSON.stringify({
      input: s.input_data,
      output: s.output_data,
      type: s.sample_type,
    }))
    .join('\n');
}
