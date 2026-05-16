import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  file_count?: number;
  last_comparison_at?: string | null;
}

export function useProjects(userId?: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setProjects([]);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return null;
    }

    setProjects((data as Project[]) ?? []);
    setLoading(false);
    return (data as Project[]) ?? [];
  }, [userId]);

  const createProject = useCallback(
    async (name: string, description?: string): Promise<Project | null> => {
      if (!userId) return null;

      const { data, error: insertError } = await supabase
        .from('projects')
        .insert({ user_id: userId, name, description: description ?? null, status: 'active' })
        .select()
        .single();

      if (insertError || !data) {
        setError(insertError?.message ?? 'Failed to create project');
        return null;
      }

      const project = data as Project;
      setProjects((prev) => [project, ...prev]);
      return project;
    },
    [userId],
  );

  const archiveProject = useCallback(async (projectId: string): Promise<void> => {
    const { error: updateError } = await supabase
      .from('projects')
      .update({ status: 'archived' })
      .eq('id', projectId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, status: 'archived' as const } : p)),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeProjects = projects.filter((p) => p.status === 'active');
  const archivedProjects = projects.filter((p) => p.status === 'archived');

  return {
    projects,
    activeProjects,
    archivedProjects,
    loading,
    error,
    refresh,
    createProject,
    archiveProject,
  };
}
