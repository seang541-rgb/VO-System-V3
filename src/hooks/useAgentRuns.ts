import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AgentExecutionTracker, AgentEvidenceType } from '../agent/agent-client';

export interface AgentRunSummary {
  id: string;
  user_request: string;
  status: 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
}

export interface PendingAgentApproval {
  id: string;
  runId: string;
  actionType: string;
  payload: Record<string, unknown>;
}

type ApprovalResolver = {
  id: string;
  runId: string;
  resolve: (approved: boolean) => void;
};

function compactPayload(value: unknown): unknown {
  const serialized = JSON.stringify(value ?? null);
  if (serialized.length <= 20000) return value ?? null;
  return { truncated: true, preview: serialized.slice(0, 20000) };
}

export function useAgentRuns(projectId?: string, userId?: string, conversationId?: string | null) {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingAgentApproval | null>(null);
  const resolverRef = useRef<ApprovalResolver | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId || !userId) {
      setRuns([]);
      return;
    }
    const { data } = await supabase
      .from('agent_runs')
      .select('id, user_request, status, started_at, completed_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(6);
    setRuns((data as AgentRunSummary[] | null) ?? []);
  }, [projectId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tracker: AgentExecutionTracker | null = projectId && userId ? {
    startRun: async ({ request, roleId }) => {
      const { data } = await supabase
        .from('agent_runs')
        .insert({
          project_id: projectId,
          conversation_id: conversationId ?? null,
          user_id: userId,
          user_request: request,
          role_id: roleId,
          status: 'running',
        })
        .select('id')
        .single();
      void refresh();
      return (data as { id?: string } | null)?.id ?? null;
    },
    completeRun: async (runId, status, output) => {
      await supabase
        .from('agent_runs')
        .update({
          status,
          final_response: status === 'completed' ? output : null,
          error_message: status === 'failed' ? output : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
      void refresh();
    },
    recordStep: async (runId, step) => {
      const { data } = await supabase
        .from('agent_steps')
        .insert({
          run_id: runId,
          sequence_no: step.sequenceNo,
          step_type: step.stepType,
          tool_name: step.toolName ?? null,
          status: step.status,
          input_json: compactPayload(step.input),
          output_json: compactPayload(step.output),
          duration_ms: step.durationMs ?? null,
        })
        .select('id')
        .single();
      return (data as { id?: string } | null)?.id ?? null;
    },
    recordEvidence: async (runId, stepId, evidence) => {
      await supabase.from('agent_evidence').insert({
        run_id: runId,
        step_id: stepId,
        project_id: projectId,
        evidence_type: evidence.type satisfies AgentEvidenceType,
        title: evidence.title,
        payload_json: compactPayload(evidence.payload),
      });
    },
    requestApproval: async (runId, actionType, payload) => {
      const { data } = await supabase
        .from('agent_approvals')
        .insert({
          run_id: runId,
          project_id: projectId,
          user_id: userId,
          action_type: actionType,
          action_payload: compactPayload(payload),
        })
        .select('id')
        .single();
      const approvalId = (data as { id?: string } | null)?.id;
      if (!approvalId) return false;
      await supabase.from('agent_runs').update({ status: 'waiting_approval' }).eq('id', runId);
      setPendingApproval({ id: approvalId, runId, actionType, payload });
      void refresh();
      return await new Promise<boolean>((resolve) => {
        resolverRef.current = { id: approvalId, runId, resolve };
      });
    },
  } : null;

  const decideApproval = useCallback(async (approved: boolean) => {
    const resolver = resolverRef.current;
    if (!resolver) return;
    await supabase
      .from('agent_approvals')
      .update({
        status: approved ? 'approved' : 'rejected',
        decided_at: new Date().toISOString(),
      })
      .eq('id', resolver.id);
    await supabase.from('agent_runs').update({ status: 'running' }).eq('id', resolver.runId);
    resolverRef.current = null;
    setPendingApproval(null);
    resolver.resolve(approved);
    void refresh();
  }, [refresh]);

  return { runs, pendingApproval, tracker, decideApproval };
}
