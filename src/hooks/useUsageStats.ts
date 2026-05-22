import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface UsageStats {
  comparisonsThisMonth: number;
  storageUsedBytes: number;
}

export function useUsageStats(userId?: string) {
  const [stats, setStats] = useState<UsageStats>({ comparisonsThisMonth: 0, storageUsedBytes: 0 });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    // Start of current month (UTC)
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    // Query comparisons this month across all user projects
    const comparisonsPromise = supabase
      .from('vo_comparisons')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart);

    // Query total file storage across all user projects
    const storagePromise = supabase
      .from('project_files')
      .select('file_size');

    const [compRes, storageRes] = await Promise.all([comparisonsPromise, storagePromise]);

    const comparisonsThisMonth = compRes.count ?? 0;

    const storageUsedBytes = (storageRes.data ?? []).reduce(
      (sum, row) => sum + ((row as { file_size: number }).file_size || 0),
      0,
    );

    setStats({ comparisonsThisMonth, storageUsedBytes });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...stats, loading, refresh };
}
