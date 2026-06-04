// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const APS_BASE = 'https://developer.api.autodesk.com';
const RVT_CREDIT_COST = parseInt(Deno.env.get('RVT_CREDIT_COST') || '3', 10);

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

async function getApsToken() {
  const res = await fetch(`${APS_BASE}/authentication/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('APS_CLIENT_ID'),
      client_secret: Deno.env.get('APS_CLIENT_SECRET'),
      grant_type: 'client_credentials',
      scope: 'data:read data:write data:create bucket:create bucket:read',
    }),
  });
  if (!res.ok) throw new Error(`APS auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function verifyUser(request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('UNAUTHORIZED');

  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
  });
  if (!authRes.ok) throw new Error('UNAUTHORIZED');
  const user = await authRes.json();
  if (!user?.id) throw new Error('UNAUTHORIZED');
  return { userId: user.id, token };
}

async function ensureBucket(apsToken) {
  const clientId = Deno.env.get('APS_CLIENT_ID');
  const bucket = (clientId.toLowerCase().slice(0, 8) + 'rvt2ifc').replace(/_/g, '').slice(0, 24);
  const h = { 'Authorization': `Bearer ${apsToken}`, 'Content-Type': 'application/json' };

  const res = await fetch(`${APS_BASE}/oss/v2/buckets`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ bucketKey: bucket, policyKey: 'transient' }),
  });
  if (res.status !== 200 && res.status !== 409) {
    throw new Error(`Bucket creation failed: ${res.status} ${await res.text()}`);
  }
  return bucket;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  try {
    const url = new URL(request.url);
    const phase = url.pathname.split('/').pop();

    const { userId, token: userToken } = await verifyUser(request);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (phase === 'init') {
      const payload = await request.json();
      const { file_name, file_size } = payload;

      if (!file_name || typeof file_size !== 'number') {
        return jsonResponse(400, { error: 'file_name and file_size required.' });
      }
      if (file_size > 100 * 1024 * 1024) {
        return jsonResponse(413, { error: 'File exceeds 100MB limit.' });
      }

      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_credits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: RVT_CREDIT_COST }),
      });
      const rpcJson = await rpcRes.json().catch(() => null);
      if (!rpcRes.ok) {
        const msg = rpcJson?.message || '';
        if (msg.includes('NO_CREDITS')) {
          return jsonResponse(402, { error: 'Insufficient credits.', required: RVT_CREDIT_COST });
        }
        return jsonResponse(500, { error: `Credit check failed: ${msg}` });
      }

      const apsToken = await getApsToken();
      const bucket = await ensureBucket(apsToken);

      const objKey = encodeURIComponent(file_name);
      const signRes = await fetch(
        `${APS_BASE}/oss/v2/buckets/${bucket}/objects/${objKey}/signeds3upload`,
        { headers: { 'Authorization': `Bearer ${apsToken}` } }
      );
      if (!signRes.ok) throw new Error(`Signed URL failed: ${await signRes.text()}`);
      const signData = await signRes.json();

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/rvt_jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          user_id: userId,
          status: 'pending',
          credits_charged: RVT_CREDIT_COST,
          file_name,
          file_size,
        }),
      });
      const [job] = await insertRes.json();

      return jsonResponse(200, {
        job_id: job.id,
        upload_url: signData.urls[0],
        upload_key: signData.uploadKey,
        bucket,
        object_key: file_name,
        credits_balance: rpcJson?.credits_balance ?? null,
      });

    } else if (phase === 'start') {
      const payload = await request.json();
      const { job_id, upload_key, bucket, object_key } = payload;

      if (!job_id || !upload_key || !bucket || !object_key) {
        return jsonResponse(400, { error: 'job_id, upload_key, bucket, object_key required.' });
      }

      const apsToken = await getApsToken();
      const objKey = encodeURIComponent(object_key);

      const finRes = await fetch(
        `${APS_BASE}/oss/v2/buckets/${bucket}/objects/${objKey}/signeds3upload`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apsToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadKey: upload_key }),
        }
      );
      if (!finRes.ok) throw new Error(`Upload finalize failed: ${await finRes.text()}`);
      const finData = await finRes.json();

      const objectId = finData.objectId;
      const urn = btoa(objectId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const jobRes = await fetch(`${APS_BASE}/modelderivative/v2/designdata/job`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apsToken}`,
          'Content-Type': 'application/json',
          'x-ads-force': 'true',
        },
        body: JSON.stringify({
          input: { urn },
          output: { formats: [{ type: 'ifc' }] },
        }),
      });
      if (!jobRes.ok) throw new Error(`Translation job failed: ${await jobRes.text()}`);

      await fetch(`${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urn, status: 'processing' }),
      });

      return jsonResponse(200, { job_id, urn });

    } else {
      return jsonResponse(400, { error: 'Use /init or /start path.' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return jsonResponse(401, { error: 'Invalid session.' });
    return jsonResponse(500, { error: msg });
  }
});
