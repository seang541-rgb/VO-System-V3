// @ts-nocheck
// Supabase Edge Function: agent-proxy (DeepSeek V4 Flash backend, OpenAI-compatible)
// Auth + credit check via direct Supabase REST calls.
// Migrated from NVIDIA NIM (Llama 3.3 70B) on 2026-06-11.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';
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

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  try {
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!deepseekKey) return jsonResponse(500, { error: 'Missing DEEPSEEK_API_KEY secret.' });
    if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: 'Missing Supabase env vars.' });

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse(401, { error: 'Missing bearer token.' });

    // 1. Verify user via Supabase Auth REST API
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    });
    if (!authRes.ok) return jsonResponse(401, { error: 'Invalid or expired session.' });
    const authUser = await authRes.json();
    if (!authUser?.id) return jsonResponse(401, { error: 'Could not identify user.' });

    // 2. Parse request body
    const payload = await request.json().catch(() => null);
    if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
      return jsonResponse(400, { error: 'messages must be a non-empty array.' });
    }

    // 3. Deduct 1 credit via RPC (runs as the user so auth.uid() works)
    let newBalance: number | null = null;
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_credit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const rpcJson = await rpcRes.json().catch(() => null);
    if (!rpcRes.ok) {
      const msg = rpcJson?.message || rpcJson?.error || '';
      if (msg.includes('NO_CREDITS')) {
        return jsonResponse(402, { error: 'Insufficient credits. Please top up.' });
      }
      return jsonResponse(500, { error: `Credit check failed: ${msg}` });
    }
    newBalance =
      rpcJson && typeof rpcJson === 'object' && typeof rpcJson.credits_balance === 'number'
        ? rpcJson.credits_balance
        : null;

    // 4. Call DeepSeek V4 Flash (OpenAI-compatible, synchronous)
    const { messages, tools, system, model } = payload;

    const dsMessages = [];
    if (typeof system === 'string' && system.trim()) {
      dsMessages.push({ role: 'system', content: system });
    }
    dsMessages.push(...messages);

    const dsBody: Record<string, unknown> = {
      model: typeof model === 'string' && model ? model : DEFAULT_MODEL,
      messages: dsMessages,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      top_p: 0.7,
      stream: false,
    };
    if (Array.isArray(tools) && tools.length > 0) {
      dsBody.tools = tools;
      dsBody.tool_choice = 'auto';
    }

    const dsRes = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(dsBody),
    });

    const dsJson = await dsRes.json().catch(() => null);
    if (!dsRes.ok) {
      const msg =
        dsJson?.error?.message ||
        dsJson?.detail ||
        dsJson?.message ||
        `DeepSeek request failed (${dsRes.status}).`;
      return jsonResponse(dsRes.status, { error: msg });
    }

    return jsonResponse(200, { response: dsJson, credits_balance: newBalance });

  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unknown server error.' });
  }
});
