// @ts-nocheck
// Supabase Edge Function: authoritative task ledger and formal-output approvals.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FORMAL_OUTPUT_ACTIONS = new Set(['export_vo_excel', 'generate_report']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const EVIDENCE_TYPES = new Set([
  'comparison',
  'commercial_summary',
  'contract_assessment',
  'audit',
  'report',
  'knowledge_lookup',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function text(value: unknown, max = 20000): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function objectPayload(value: unknown, max = 50000): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return JSON.stringify(value).length <= max ? value as Record<string, unknown> : null;
}

async function findRun(admin: ReturnType<typeof createClient>, userId: string, runId: string) {
  const { data } = await admin
    .from('agent_runs')
    .select('id, project_id, user_id, status')
    .eq('id', runId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { error: 'Unauthorized.' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonResponse(500, { error: 'Missing Supabase configuration.' });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return jsonResponse(401, { error: 'Unauthorized.' });

    const body = await request.json().catch(() => null);
    const operation = text(body?.operation, 40);
    if (!operation) return jsonResponse(400, { error: 'Missing operation.' });

    const admin = createClient(supabaseUrl, serviceKey);

    if (operation === 'start_run') {
      const projectId = text(body.projectId, 80);
      const requestText = text(body.request, 20000);
      const conversationId = body.conversationId === null ? null : text(body.conversationId, 80);
      const roleId = body.roleId === null ? null : text(body.roleId, 80);
      if (!projectId || !requestText || (body.conversationId !== null && !conversationId)) {
        return jsonResponse(400, { error: 'Invalid run input.' });
      }
      const { data: project } = await admin
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!project) return jsonResponse(403, { error: 'Project access denied.' });
      if (conversationId) {
        const { data: conversation } = await admin
          .from('copilot_conversations')
          .select('id')
          .eq('id', conversationId)
          .eq('project_id', projectId)
          .maybeSingle();
        if (!conversation) return jsonResponse(400, { error: 'Conversation does not belong to project.' });
      }
      const { data, error } = await admin
        .from('agent_runs')
        .insert({
          project_id: projectId,
          conversation_id: conversationId,
          user_id: user.id,
          user_request: requestText,
          role_id: roleId,
          status: 'running',
        })
        .select('id')
        .single();
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { runId: data.id });
    }

    const runId = text(body.runId, 80);
    if (!runId && operation !== 'decide_approval' && operation !== 'claim_approval') {
      return jsonResponse(400, { error: 'Missing runId.' });
    }
    const run = runId ? await findRun(admin, user.id, runId) : null;
    if (runId && !run) return jsonResponse(404, { error: 'Agent run not found.' });

    if (operation === 'complete_run') {
      const status = text(body.status, 20);
      const output = typeof body.output === 'string' ? body.output.slice(0, 50000) : '';
      if (!status || !TERMINAL_STATUSES.has(status)) {
        return jsonResponse(400, { error: 'Invalid terminal status.' });
      }
      const { data: completed, error } = await admin
        .from('agent_runs')
        .update({
          status,
          final_response: status === 'completed' ? output : null,
          error_message: status === 'failed' || status === 'cancelled' ? output : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId)
        .eq('user_id', user.id)
        .in('status', ['running', 'waiting_approval'])
        .select('id')
        .maybeSingle();
      if (error) return jsonResponse(500, { error: error.message });
      if (!completed) return jsonResponse(409, { error: 'Run has already reached a terminal state.' });
      return jsonResponse(200, { ok: true });
    }

    if (operation === 'record_step') {
      if (run.status !== 'running') return jsonResponse(409, { error: 'Run is not active.' });
      const stepType = text(body.stepType, 20);
      const toolName = body.toolName === null ? null : text(body.toolName, 120);
      const status = text(body.status, 20);
      const input = body.input ?? null;
      const output = body.output ?? null;
      const durationMs = Number.isInteger(body.durationMs) && body.durationMs >= 0 ? body.durationMs : null;
      if (!['tool', 'assistant', 'system'].includes(stepType ?? '')
        || !['completed', 'failed', 'rejected'].includes(status ?? '')
        || JSON.stringify(input).length > 50000
        || JSON.stringify(output).length > 50000) {
        return jsonResponse(400, { error: 'Invalid step input.' });
      }
      const { data: last } = await admin
        .from('agent_steps')
        .select('sequence_no')
        .eq('run_id', runId)
        .order('sequence_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await admin
        .from('agent_steps')
        .insert({
          run_id: runId,
          sequence_no: (last?.sequence_no ?? 0) + 1,
          step_type: stepType,
          tool_name: toolName,
          status,
          input_json: input,
          output_json: output,
          duration_ms: durationMs,
        })
        .select('id')
        .single();
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { stepId: data.id });
    }

    if (operation === 'record_evidence') {
      if (run.status !== 'running') return jsonResponse(409, { error: 'Run is not active.' });
      const stepId = body.stepId === null ? null : text(body.stepId, 80);
      const evidenceType = text(body.evidenceType, 40);
      const title = text(body.title, 200);
      const payload = body.payload ?? null;
      if (!evidenceType || !EVIDENCE_TYPES.has(evidenceType) || !title || JSON.stringify(payload).length > 50000) {
        return jsonResponse(400, { error: 'Invalid evidence input.' });
      }
      if (stepId) {
        const { data: step } = await admin
          .from('agent_steps')
          .select('id')
          .eq('id', stepId)
          .eq('run_id', runId)
          .maybeSingle();
        if (!step) return jsonResponse(400, { error: 'Step does not belong to run.' });
      }
      const { error } = await admin.from('agent_evidence').insert({
        run_id: runId,
        step_id: stepId,
        project_id: run.project_id,
        evidence_type: evidenceType,
        title,
        payload_json: payload,
      });
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { ok: true });
    }

    if (operation === 'request_approval') {
      if (run.status !== 'running') return jsonResponse(409, { error: 'Run is not active.' });
      const actionType = text(body.actionType, 80);
      const payload = objectPayload(body.payload);
      if (!actionType || !FORMAL_OUTPUT_ACTIONS.has(actionType) || !payload) {
        return jsonResponse(400, { error: 'Invalid formal-output request.' });
      }
      const { data, error } = await admin
        .from('agent_approvals')
        .insert({
          run_id: runId,
          project_id: run.project_id,
          user_id: user.id,
          action_type: actionType,
          action_payload: payload,
          status: 'pending',
        })
        .select('id')
        .single();
      if (error) return jsonResponse(409, { error: 'This run already has an approval waiting for a decision.' });
      await admin.from('agent_runs').update({ status: 'waiting_approval' }).eq('id', runId);
      return jsonResponse(200, { approvalId: data.id });
    }

    if (operation === 'decide_approval') {
      const approvalId = text(body.approvalId, 80);
      const approved = typeof body.approved === 'boolean' ? body.approved : null;
      if (!approvalId || approved === null) return jsonResponse(400, { error: 'Invalid approval decision.' });
      const { data: approval } = await admin
        .from('agent_approvals')
        .select('id, run_id, action_type, action_payload, status')
        .eq('id', approvalId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!approval || approval.status !== 'pending') {
        return jsonResponse(409, { error: 'Approval has already been decided.' });
      }
      const decisionNote = typeof body.decisionNote === 'string'
        ? body.decisionNote.slice(0, 500)
        : null;
      const status = approved ? 'approved' : 'rejected';
      const { data: decision, error } = await admin
        .from('agent_approvals')
        .update({ status, decided_at: new Date().toISOString(), decision_note: decisionNote })
        .eq('id', approvalId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (error) return jsonResponse(500, { error: error.message });
      if (!decision) return jsonResponse(409, { error: 'Approval has already been decided.' });
      await admin
        .from('agent_runs')
        .update({ status: 'running' })
        .eq('id', approval.run_id)
        .eq('user_id', user.id)
        .eq('status', 'waiting_approval');
      return jsonResponse(200, {
        approvalId,
        runId: approval.run_id,
        actionType: approval.action_type,
        payload: approval.action_payload,
        approved,
      });
    }

    if (operation === 'claim_approval') {
      const approvalRunId = text(body.runId, 80);
      const actionType = text(body.actionType, 80);
      if (!approvalRunId || !actionType || !FORMAL_OUTPUT_ACTIONS.has(actionType)) {
        return jsonResponse(400, { error: 'Invalid approval claim.' });
      }
      const { data, error } = await admin
        .from('agent_approvals')
        .update({ claimed_at: new Date().toISOString() })
        .eq('run_id', approvalRunId)
        .eq('action_type', actionType)
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .is('claimed_at', null)
        .select('run_id, action_type, action_payload')
        .maybeSingle();
      if (error) return jsonResponse(500, { error: error.message });
      if (!data) return jsonResponse(409, { error: 'Approval is unavailable or was already used.' });
      return jsonResponse(200, {
        runId: data.run_id,
        actionType: data.action_type,
        payload: data.action_payload,
      });
    }

    return jsonResponse(400, { error: 'Unknown operation.' });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : String(error) });
  }
});
