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

    if (job.status !== 'success' && job.status !== 'downloaded') {
      return jsonResponse(400, { error: `Job status is ${job.status}, not ready for download.` });
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

    const manifestRes = await fetch(
      `${APS_BASE}/modelderivative/v2/designdata/${job.urn}/manifest`,
      { headers: { 'Authorization': `Bearer ${apsToken}` } }
    );
    const manifest = await manifestRes.json();

    let derivUrn = null;
    for (const d of manifest.derivatives || []) {
      if (d.outputType === 'ifc') {
        for (const c of d.children || []) {
          if (c.urn?.toLowerCase().endsWith('.ifc') || c.role === 'ifc') {
            derivUrn = c.urn;
            break;
          }
        }
        if (!derivUrn && d.children?.length) {
          derivUrn = d.children[0].urn;
        }
      }
    }
    if (!derivUrn) return jsonResponse(404, { error: 'IFC derivative not found in manifest.' });

    const dlRes = await fetch(
      `${APS_BASE}/modelderivative/v2/designdata/${job.urn}/manifest/${encodeURIComponent(derivUrn)}`,
      { headers: { 'Authorization': `Bearer ${apsToken}` } }
    );
    if (!dlRes.ok) return jsonResponse(502, { error: `Download failed: ${dlRes.status}` });

    await fetch(`${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'downloaded' }),
    });

    const ifcData = await dlRes.arrayBuffer();
    return new Response(ifcData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${job.file_name.replace(/\.rvt$/i, '.ifc')}"`,
      },
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unknown error.' });
  }
});
