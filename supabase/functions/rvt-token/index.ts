// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

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
    const apsClientId = Deno.env.get('APS_CLIENT_ID');
    const apsClientSecret = Deno.env.get('APS_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!apsClientId || !apsClientSecret) return jsonResponse(500, { error: 'Missing APS credentials.' });
    if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: 'Missing Supabase env vars.' });

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse(401, { error: 'Missing bearer token.' });

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    });
    if (!authRes.ok) return jsonResponse(401, { error: 'Invalid or expired session.' });

    const apsAuth = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: apsClientId,
        client_secret: apsClientSecret,
        grant_type: 'client_credentials',
        scope: 'viewables:read',
      }),
    });

    if (!apsAuth.ok) {
      const err = await apsAuth.text();
      return jsonResponse(502, { error: `APS auth failed: ${err}` });
    }

    const { access_token, expires_in } = await apsAuth.json();
    return jsonResponse(200, { access_token, expires_in });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unknown error.' });
  }
});
