import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { OpenAIMessage } from '../agent/agent-client';

export function useCopilotHistory(projectId?: string, conversationId?: string | null) {
  const persistMessage = useCallback(
    async (message: OpenAIMessage, targetConversationId: string | null = conversationId ?? null) => {
      if (!projectId) return;
      await supabase.from('copilot_messages').insert({
        project_id: projectId,
        conversation_id: targetConversationId,
        role: message.role,
        content: message.content ?? null,
        tool_calls: message.tool_calls ?? null,
        tool_call_id: message.tool_call_id ?? null,
      });
    },
    [conversationId, projectId],
  );

  return { persistMessage };
}
