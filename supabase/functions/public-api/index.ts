// Supabase Edge Function: public-api
// REST API endpoint for programmatic access to VO System.
// Authenticated via API keys (X-API-Key header).
//
// Endpoints:
//   GET  /projects          — list user's projects
//   GET  /projects/:id      — get project details
//   GET  /comparisons/:id   — get comparison results
//   POST /compare           — trigger VO comparison (async)
//   GET  /rates             — search unit rates

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-api-key, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

async function hashKey(key: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Authenticate via API key
  const apiKey = req.headers.get('X-API-Key');
  if (!apiKey?.startsWith('vo_sk_')) {
    return jsonResponse(401, { error: 'Missing or invalid X-API-Key header.' });
  }

  const keyHash = await hashKey(apiKey);
  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, user_id, scopes, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (!keyRow) return jsonResponse(401, { error: 'Invalid API key.' });
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return jsonResponse(401, { error: 'API key expired.' });
  }

  const userId = keyRow.user_id as string;
  const scopes = (keyRow.scopes ?? []) as string[];
  const startTime = Date.now();

  // Update last_used_at
  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id);

  // Parse path
  const url = new URL(req.url);
  const pathParts = url.pathname.replace(/^\/public-api\/?/, '').split('/').filter(Boolean);
  const resource = pathParts[0] ?? '';
  const resourceId = pathParts[1];

  let status = 200;
  let responseBody: unknown;

  try {
    switch (resource) {
      case 'projects': {
        if (!scopes.includes('read')) return jsonResponse(403, { error: 'Scope "read" required.' });
        if (resourceId) {
          const { data } = await supabase.from('projects').select('*').eq('id', resourceId).eq('user_id', userId).maybeSingle();
          responseBody = data ?? { error: 'Not found' };
          status = data ? 200 : 404;
        } else {
          const { data } = await supabase.from('projects').select('id, name, created_at, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(50);
          responseBody = { projects: data ?? [] };
        }
        break;
      }

      case 'comparisons': {
        if (!scopes.includes('read')) return jsonResponse(403, { error: 'Scope "read" required.' });
        if (!resourceId) return jsonResponse(400, { error: 'Comparison ID required.' });
        const { data } = await supabase.from('vo_comparisons').select('*').eq('id', resourceId).maybeSingle();
        responseBody = data ?? { error: 'Not found' };
        status = data ? 200 : 404;
        break;
      }

      case 'rates': {
        if (!scopes.includes('read')) return jsonResponse(403, { error: 'Scope "read" required.' });
        const category = url.searchParams.get('category');
        const query = url.searchParams.get('q');
        const limit = Math.min(30, parseInt(url.searchParams.get('limit') ?? '10', 10));

        let builder = supabase.from('unit_rates').select('*');
        if (category) builder = builder.eq('category', category);
        if (query) {
          const q = `%${query}%`;
          builder = builder.or(`description.ilike.${q},item_code.ilike.${q}`);
        }
        const { data } = await builder.limit(limit);
        responseBody = { rates: data ?? [] };
        break;
      }

      default:
        responseBody = {
          error: 'Unknown endpoint',
          available: ['GET /projects', 'GET /projects/:id', 'GET /comparisons/:id', 'GET /rates'],
        };
        status = 404;
    }
  } catch (err) {
    responseBody = { error: err instanceof Error ? err.message : String(err) };
    status = 500;
  }

  // Log usage
  await supabase.from('api_usage_log').insert({
    api_key_id: keyRow.id,
    endpoint: `/${resource}${resourceId ? '/' + resourceId : ''}`,
    method: req.method,
    status_code: status,
    response_time_ms: Date.now() - startTime,
  });

  return jsonResponse(status, responseBody);
});
