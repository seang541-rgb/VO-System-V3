import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AgentExecutionTracker } from '../agent/agent-client';

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
  status: 'pending' | 'approved';
  recovered: boolean;
}

export interface ResumableApprovedAction {
  runId: string;
  actionType: string;
  payload: Record<string, unknown>;
}

type ApprovalResolver = {
  id: string;
  resolve: (approved: boolean) => void;
};

function compactPayload(value: unknown): unknown {
  const serialized = JSON.stringify(value ?? null);
  if (serialized.length <= 20000) return value ?? null;
  return { truncated: true, preview: serialized.slice(0, 20000) };
}

async function invokeLedger<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agent-ledger', { body });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('Agent ledger returned an invalid response.');
  if ('error' in data && typeof data.error === 'string') throw new Error(data.error);
  return data as T;
}

export function useAgentRuns(projectId?: string, userId?: string, conversationId?: string | null) {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingAgentApproval | null>(null);
  const resolverRef = useRef<ApprovalResolver | null>(null);
  const conversationIdRef = useRef<string | null>(conversationId ?? null);

  useEffect(() => {
    conversationIdRef.current = conversationId ?? null;
  }, [conversationId]);

  const bindConversation = useCallback((nextConversationId: string | null) => {
    conversationIdRef.current = nextConversationId;
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId || !userId) {
      setRuns([]);
      setPendingApproval(null);
      return;
    }

    const [runsResult, approvalResult] = await Promise.all([
      supabase
        .from('agent_runs')
        .select('id, user_request, status, started_at, completed_at')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(6),
      supabase
        .from('agent_approvals')
        .select('id, run_id, action_type, action_payload, status, agent_runs!inner(status)')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .in('status', ['pending', 'approved'])
        .in('agent_runs.status', ['running', 'waiting_approval'])
        .is('claimed_at', null)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setRuns((runsResult.data as AgentRunSummary[] | null) ?? []);
    if (!resolverRef.current) {
      const approval = approvalResult.data as {
        id: string;
        run_id: string;
        action_type: string;
        action_payload: Record<string, unknown>;
        status: 'pending' | 'approved';
      } | null;
      setPendingApproval(approval ? {
        id: approval.id,
        runId: approval.run_id,
        actionType: approval.action_type,
        payload: approval.action_payload,
        status: approval.status,
        recovered: true,
      } : null);
    }
  }, [projectId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tracker = useMemo<AgentExecutionTracker | null>(() => projectId && userId ? {
    startRun: async ({ request, roleId }) => {
      const data = await invokeLedger<{ runId: string }>({
        operation: 'start_run',
        projectId,
        conversationId: conversationIdRef.current,
        request,
        roleId,
      });
      void refresh();
      return data.runId;
    },
    completeRun: async (runId, status, output) => {
      await invokeLedger({
        operation: 'complete_run',
        runId,
        status,
        output,
      });
      void refresh();
    },
    recordStep: async (runId, step) => {
      const data = await invokeLedger<{ stepId: string }>({
        operation: 'record_step',
        runId,
        stepType: step.stepType,
        toolName: step.toolName ?? null,
        status: step.status,
        input: compactPayload(step.input),
        output: compactPayload(step.output),
        durationMs: step.durationMs ?? null,
      });
      return data.stepId;
    },
    recordEvidence: async (runId, stepId, evidence) => {
      await invokeLedger({
        operation: 'record_evidence',
        runId,
        stepId,
        evidenceType: evidence.type,
        title: evidence.title,
        payload: compactPayload(evidence.payload),
      });
    },
    requestApproval: async (runId, actionType, payload) => {
      const data = await invokeLedger<{ approvalId: string }>({
        operation: 'request_approval',
        runId,
        actionType,
        payload: compactPayload(payload),
      });
      setPendingApproval({
        id: data.approvalId,
        runId,
        actionType,
        payload,
        status: 'pending',
        recovered: false,
      });
      void refresh();
      return await new Promise<boolean>((resolve) => {
        resolverRef.current = { id: data.approvalId, resolve };
      });
    },
    consumeApproval: async (runId, actionType) => {
      await invokeLedger({
        operation: 'claim_approval',
        runId,
        actionType,
      });
      void refresh();
    },
  } : null, [projectId, refresh, userId]);

  const decideApproval = useCallback(async (approved: boolean): Promise<ResumableApprovedAction | null> => {
    const approval = pendingApproval;
    if (!approval) return null;
    const liveResolver = resolverRef.current?.id === approval.id ? resolverRef.current : null;

    if (approval.status === 'pending') {
      await invokeLedger({
        operation: 'decide_approval',
        approvalId: approval.id,
        approved,
      });
    } else if (!approved) {
      throw new Error('This formal output has already been approved and is ready to resume.');
    }

    setPendingApproval(null);
    if (!approved) {
      if (liveResolver) {
        resolverRef.current = null;
        liveResolver.resolve(false);
      } else if (tracker) {
        await tracker.completeRun(
          approval.runId,
          'cancelled',
          'Formal output approval was rejected after the task session was interrupted.',
        );
      }
      void refresh();
      return null;
    }

    if (liveResolver) {
      resolverRef.current = null;
      liveResolver.resolve(true);
      void refresh();
      return null;
    }

    void refresh();
    return {
      runId: approval.runId,
      actionType: approval.actionType,
      payload: approval.payload,
    };
  }, [pendingApproval, refresh, tracker]);

  return { runs, pendingApproval, tracker, decideApproval, refresh, bindConversation };
}
