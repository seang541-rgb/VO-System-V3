// @ts-nocheck
// Supabase Edge Function: authenticated NVIDIA NIM proxy with per-turn billing.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-pro';
const MAX_TOKENS = 4096;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  try {
    const nvidiaKey = Deno.env.get('NVIDIA_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!nvidiaKey) return jsonResponse(500, { error: 'Missing NVIDIA_API_KEY secret.' });
    if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: 'Missing Supabase env vars.' });

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse(401, { error: 'Missing bearer token.' });

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    });
    if (!authRes.ok) return jsonResponse(401, { error: 'Invalid or expired session.' });

    const authUser = await authRes.json();
    if (!authUser?.id) return jsonResponse(401, { error: 'Could not identify user.' });

    const payload = await request.json().catch(() => null);
    if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
      return jsonResponse(400, { error: 'messages must be a non-empty array.' });
    }

    const requestedTurnId =
      typeof payload.turn_id === 'string' && payload.turn_id ? payload.turn_id : null;
    if (requestedTurnId && payload.messages[payload.messages.length - 1]?.role !== 'tool') {
      return jsonResponse(400, { error: 'Agent continuations must end with a tool result.' });
    }

    const userMessagesHash = await sha256(JSON.stringify(
      payload.messages
        .filter((message) => message && message.role === 'user')
        .map((message) => message.content ?? null),
    ));

    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_agent_turn_credit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_turn_id: requestedTurnId,
        p_user_messages_hash: userMessagesHash,
      }),
    });
    const rpcJson = await rpcRes.json().catch(() => null);

    if (!rpcRes.ok) {
      const msg = rpcJson?.message || rpcJson?.error || '';
      if (msg.includes('NO_CREDITS')) {
        return jsonResponse(402, { error: 'Insufficient credits. Please top up.' });
      }
      if (msg.includes('INVALID_AGENT_TURN')) {
        return jsonResponse(409, { error: 'This agent turn has expired or reached its hop limit.' });
      }
      return jsonResponse(500, { error: `Credit check failed: ${msg}` });
    }

    const newBalance =
      rpcJson && typeof rpcJson.credits_balance === 'number' ? rpcJson.credits_balance : null;
    const turnId =
      rpcJson && typeof rpcJson.turn_id === 'string' ? rpcJson.turn_id : null;

    const { messages, tools, system, model } = payload;
    const nimMessages = [];
    if (typeof system === 'string' && system.trim()) {
      nimMessages.push({ role: 'system', content: system });
    }
    nimMessages.push(...messages);

    const nimBody = {
      model: typeof model === 'string' && model ? model : DEFAULT_MODEL,
      messages: nimMessages,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      top_p: 0.7,
      stream: false,
    };
    if (Array.isArray(tools) && tools.length > 0) {
      nimBody.tools = tools;
      nimBody.tool_choice = 'auto';
    }

    const nimRes = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nvidiaKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(nimBody),
    });

    const nimJson = await nimRes.json().catch(() => null);
    if (!nimRes.ok) {
      const msg =
        nimJson?.error?.message ||
        nimJson?.detail ||
        nimJson?.message ||
        `NVIDIA NIM request failed (${nimRes.status}).`;
      return jsonResponse(nimRes.status, { error: msg });
    }

    return jsonResponse(200, {
      response: nimJson,
      credits_balance: newBalance,
      turn_id: turnId,
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unknown server error.' });
  }
});
