import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { OpenAIMessage } from '../agent/agent-client';

/** Row shape in copilot_messages table */
interface CopilotMessageRow {
  id: string;
  project_id: string;
  conversation_id: string | null;
  role: string;
  content: string | null;
  tool_calls: unknown | null;
  tool_call_id: string | null;
  created_at: string;
}

/** Max messages to restore (most recent N). Keeps context window manageable. */
const MAX_RESTORE = 60;

export function useCopilotHistory(projectId?: string, conversationId?: string | null) {
  const [restoredMessages, setRestoredMessages] = useState<OpenAIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const prevKeyRef = useRef('');

  const loadHistory = useCallback(async () => {
    if (!projectId) {
      setRestoredMessages([]);
      return;
    }
    setLoading(true);

    let query = supabase
      .from('copilot_messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(MAX_RESTORE);

    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    } else {
      query = query.is('conversation_id', null);
    }

    const { data, error } = await query;

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
  }, [projectId, conversationId]);

  useEffect(() => {
    const key = `${projectId ?? ''}::${conversationId ?? ''}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    void loadHistory();
  }, [loadHistory, projectId, conversationId]);

  const persistMessage = useCallback(
    async (msg: OpenAIMessage) => {
      if (!projectId) return;
      await supabase.from('copilot_messages').insert({
        project_id: projectId,
        conversation_id: conversationId ?? null,
        role: msg.role,
        content: msg.content ?? null,
        tool_calls: msg.tool_calls ?? null,
        tool_call_id: msg.tool_call_id ?? null,
      });
    },
    [projectId, conversationId],
  );

  const clearHistory = useCallback(async () => {
    if (!projectId) return;
    let query = supabase.from('copilot_messages').delete().eq('project_id', projectId);
    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    } else {
      query = query.is('conversation_id', null);
    }
    await query;
    setRestoredMessages([]);
  }, [projectId, conversationId]);

  return { restoredMessages, loading, persistMessage, clearHistory, reload: loadHistory };
}
