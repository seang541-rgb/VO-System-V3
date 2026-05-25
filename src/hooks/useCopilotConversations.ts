import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Conversation {
  id: string;
  project_id: string;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export function useCopilotConversations(projectId?: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      setConversations([]);
      setActiveId(null);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('copilot_conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(50);

    const list = (data ?? []) as Conversation[];
    setConversations(list);

    if (list.length > 0 && !activeId) {
      setActiveId(list[0].id);
    }
    setLoading(false);
  }, [projectId, activeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (title?: string): Promise<string | null> => {
      if (!projectId) return null;
      const { data, error } = await supabase
        .from('copilot_conversations')
        .insert({ project_id: projectId, title: title || 'New Conversation' })
        .select('id')
        .single();

      if (error || !data) return null;
      const newId = (data as { id: string }).id;
      setActiveId(newId);
      void load();
      return newId;
    },
    [projectId, load],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      await supabase.from('copilot_conversations').update({ title }).eq('id', id);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    },
    [],
  );

  const remove = useCallback(
    async (id: string) => {
      await supabase.from('copilot_conversations').delete().eq('id', id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
      }
    },
    [activeId],
  );

  const switchTo = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  return { conversations, activeId, loading, create, rename, remove, switchTo, reload: load };
}
