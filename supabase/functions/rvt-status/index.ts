// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const APS_BASE = 'https://developer.api.autodesk.com';

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse(401, { error: 'Missing bearer token.' });

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    });
    if (!authRes.ok) return jsonResponse(401, { error: 'Invalid session.' });
    const user = await authRes.json();

    const payload = await request.json();
    const { job_id } = payload;
    if (!job_id) return jsonResponse(400, { error: 'job_id required.' });

    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}&user_id=eq.${user.id}&select=*`,
      { headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': anonKey } }
    );
    const jobs = await jobRes.json();
    if (!jobs?.length) return jsonResponse(404, { error: 'Job not found.' });
    const job = jobs[0];

    if (!job.urn) {
      return jsonResponse(200, { status: job.status, progress: '' });
    }

    const apsAuth = await fetch(`${APS_BASE}/authentication/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('APS_CLIENT_ID'),
        client_secret: Deno.env.get('APS_CLIENT_SECRET'),
        grant_type: 'client_credentials',
        scope: 'data:read',
      }),
    });
    const { access_token: apsToken } = await apsAuth.json();

    const manifest = await fetch(
      `${APS_BASE}/modelderivative/v2/designdata/${job.urn}/manifest`,
      { headers: { 'Authorization': `Bearer ${apsToken}` } }
    );
    const m = await manifest.json();

    const apsStatus = m.status || 'pending';
    const progress = m.progress || '';

    if ((apsStatus === 'success' || apsStatus === 'complete') && job.status === 'processing') {
      await fetch(`${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'success', completed_at: new Date().toISOString() }),
      });
      return jsonResponse(200, { status: 'success', progress: '100%' });
    }

    if (apsStatus === 'failed' && job.status === 'processing') {
      await fetch(`${supabaseUrl}/rest/v1/rpc/refund_credits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_user_id: user.id, amount: job.credits_charged }),
      });

      const errMsg = JSON.stringify(m.derivatives?.[0]?.messages || []).slice(0, 500);
      await fetch(`${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'failed', error_message: errMsg, completed_at: new Date().toISOString() }),
      });
      return jsonResponse(200, { status: 'failed', progress, error: errMsg });
    }

    return jsonResponse(200, { status: apsStatus === 'inprogress' ? 'processing' : job.status, progress });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unknown error.' });
  }
});
