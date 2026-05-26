import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useCopilotConversations(projectId?: string) {
  const [activeId, setActiveId] = useState<string | null>(null);

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
      return newId;
    },
    [projectId],
  );

  return { activeId, create };
}
