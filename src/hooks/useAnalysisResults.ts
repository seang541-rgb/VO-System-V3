import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type AnalysisType = 'audit' | 'commercial' | 'contract_clause';

export interface AnalysisResult {
  id: string;
  project_id: string;
  analysis_type: AnalysisType;
  source_file_id: string | null;
  comparison_id: string | null;
  result_json: unknown;
  summary_text: string | null;
  created_at: string;
}

export function useAnalysisResults(projectId?: string) {
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);

    setResults((data as AnalysisResult[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (
      analysisType: AnalysisType,
      resultJson: unknown,
      options?: { sourceFileId?: string; comparisonId?: string; summaryText?: string },
    ): Promise<AnalysisResult | null> => {
      if (!projectId) return null;
      const { data, error } = await supabase
        .from('analysis_results')
        .insert({
          project_id: projectId,
          analysis_type: analysisType,
          source_file_id: options?.sourceFileId ?? null,
          comparison_id: options?.comparisonId ?? null,
          result_json: resultJson,
          summary_text: options?.summaryText ?? null,
        })
        .select()
        .single();

      if (error || !data) return null;
      const result = data as AnalysisResult;
      setResults((prev) => [result, ...prev]);
      return result;
    },
    [projectId],
  );

  const remove = useCallback(async (id: string) => {
    await supabase.from('analysis_results').delete().eq('id', id);
    setResults((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const byType = useCallback(
    (type: AnalysisType) => results.filter((r) => r.analysis_type === type),
    [results],
  );

  return { results, loading, refresh, save, remove, byType };
}
