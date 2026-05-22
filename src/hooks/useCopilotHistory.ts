import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { OpenAIMessage } from '../agent/agent-client';

/** Row shape in copilot_messages table */
interface CopilotMessageRow {
  id: string;
  project_id: string;
  role: string;
  content: string | null;
  tool_calls: unknown | null;
  tool_call_id: string | null;
  created_at: string;
}

/** Max messages to restore (most recent N). Keeps context window manageable. */
const MAX_RESTORE = 40;

export function useCopilotHistory(projectId?: string) {
  const [restoredMessages, setRestoredMessages] = useState<OpenAIMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Load chat history from Supabase on mount / project change
  const loadHistory = useCallback(async () => {
    if (!projectId) {
      setRestoredMessages([]);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('copilot_messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(MAX_RESTORE);

    if (error || !data) {
      setLoading(false);
      return;
    }

    const messages: OpenAIMessage[] = (data as CopilotMessageRow[]).map((row) => {
      const msg: OpenAIMessage = {
        role: row.role as OpenAIMessage['role'],
        content: row.content ?? undefined,
      };
      if (row.tool_calls) msg.tool_calls = row.tool_calls as OpenAIMessage['tool_calls'];
      if (row.tool_call_id) msg.tool_call_id = row.tool_call_id;
      return msg;
    });

    setRestoredMessages(messages);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Persist a single message to Supabase
  const persistMessage = useCallback(
    async (msg: OpenAIMessage) => {
      if (!projectId) return;
      await supabase.from('copilot_messages').insert({
        project_id: projectId,
        role: msg.role,
        content: msg.content ?? null,
        tool_calls: msg.tool_calls ?? null,
        tool_call_id: msg.tool_call_id ?? null,
      });
    },
    [projectId],
  );

  // Clear all messages for this project
  const clearHistory = useCallback(async () => {
    if (!projectId) return;
    await supabase.from('copilot_messages').delete().eq('project_id', projectId);
    setRestoredMessages([]);
  }, [projectId]);

  return { restoredMessages, loading, persistMessage, clearHistory, reload: loadHistory };
}
