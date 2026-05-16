import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface VOComparison {
  id: string;
  project_id: string;
  base_file_id: string;
  revision_file_id: string;
  summary_json: {
    added: number;
    deleted: number;
    modified: number;
    totalChanges: number;
    netValue?: number;
  };
  results_json: unknown;
  created_at: string;
}

export function useVOHistory(projectId?: string) {
  const [comparisons, setComparisons] = useState<VOComparison[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!projectId) {
      setComparisons([]);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('vo_comparisons')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return null;
    }

    setComparisons((data as VOComparison[]) ?? []);
    setLoading(false);
    return (data as VOComparison[]) ?? [];
  }, [projectId]);

  const saveComparison = useCallback(
    async (
      baseFileId: string,
      revisionFileId: string,
      summaryJson: VOComparison['summary_json'],
      resultsJson: unknown,
    ): Promise<VOComparison | null> => {
      if (!projectId) return null;

      const { data, error: insertError } = await supabase
        .from('vo_comparisons')
        .insert({
          project_id: projectId,
          base_file_id: baseFileId,
          revision_file_id: revisionFileId,
          summary_json: summaryJson,
          results_json: resultsJson,
        })
        .select()
        .single();

      if (insertError || !data) {
        setError(insertError?.message ?? 'Failed to save comparison');
        return null;
      }

      const comparison = data as VOComparison;
      setComparisons((prev) => [comparison, ...prev]);
      return comparison;
    },
    [projectId],
  );

  const deleteComparison = useCallback(async (comparisonId: string): Promise<void> => {
    const { error: deleteError } = await supabase
      .from('vo_comparisons')
      .delete()
      .eq('id', comparisonId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setComparisons((prev) => prev.filter((c) => c.id !== comparisonId));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    comparisons,
    loading,
    error,
    refresh,
    saveComparison,
    deleteComparison,
  };
}
