// @ts-nocheck
// Supabase Edge Function: read-only REST API authenticated with X-API-Key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-api-key, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'GET') return jsonResponse(405, { error: 'Only GET endpoints are available.' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const apiKey = req.headers.get('X-API-Key');
  if (!apiKey?.startsWith('vo_sk_')) {
    return jsonResponse(401, { error: 'Missing or invalid X-API-Key header.' });
  }

  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, user_id, scopes, expires_at')
    .eq('key_hash', await hashKey(apiKey))
    .maybeSingle();

  if (!keyRow) return jsonResponse(401, { error: 'Invalid API key.' });
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return jsonResponse(401, { error: 'API key expired.' });
  }
  if (!((keyRow.scopes ?? []) as string[]).includes('read')) {
    return jsonResponse(403, { error: 'Scope "read" required.' });
  }

  const userId = keyRow.user_id as string;
  const startTime = Date.now();
  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id);

  const url = new URL(req.url);
  const apiPath = url.pathname.split('/public-api')[1] ?? '';
  const [resource = '', resourceId] = apiPath.split('/').filter(Boolean);
  let status = 200;
  let responseBody: unknown;

  try {
    switch (resource) {
      case 'projects': {
        if (resourceId) {
          const { data } = await supabase
            .from('projects')
            .select('id, name, description, status, created_at, updated_at')
            .eq('id', resourceId)
            .eq('user_id', userId)
            .maybeSingle();
          responseBody = data ?? { error: 'Not found' };
          status = data ? 200 : 404;
        } else {
          const { data } = await supabase
            .from('projects')
            .select('id, name, status, created_at, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(50);
          responseBody = { projects: data ?? [] };
        }
        break;
      }

      case 'comparisons': {
        if (!resourceId) {
          responseBody = { error: 'Comparison ID required.' };
          status = 400;
          break;
        }
        const { data } = await supabase
          .from('vo_comparisons')
          .select('id, project_id, base_file_id, revision_file_id, summary_json, results_json, created_at, projects!inner(user_id)')
          .eq('id', resourceId)
          .eq('projects.user_id', userId)
          .maybeSingle();
        if (!data) {
          responseBody = { error: 'Not found' };
          status = 404;
        } else {
          const { projects: _ownership, ...comparison } = data;
          responseBody = comparison;
        }
        break;
      }

      case 'rates': {
        const category = url.searchParams.get('category');
        const query = url.searchParams.get('q');
        const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
        const limit = Number.isFinite(parsedLimit) ? Math.min(30, Math.max(1, parsedLimit)) : 10;
        let builder = supabase.from('unit_rates').select('*');
        if (category) builder = builder.eq('category', category);
        if (query) {
          const safeQuery = query.replace(/[%_,()]/g, '');
          builder = builder.or(`description.ilike.%${safeQuery}%,item_code.ilike.%${safeQuery}%`);
        }
        const { data } = await builder.limit(limit);
        responseBody = { rates: data ?? [] };
        break;
      }

      default:
        responseBody = {
          error: 'Unknown endpoint.',
          available: ['GET /projects', 'GET /projects/:id', 'GET /comparisons/:id', 'GET /rates'],
        };
        status = 404;
    }
  } catch (err) {
    responseBody = { error: err instanceof Error ? err.message : String(err) };
    status = 500;
  }

  await supabase.from('api_usage_log').insert({
    api_key_id: keyRow.id,
    endpoint: `/${resource}${resourceId ? `/${resourceId}` : ''}`,
    method: req.method,
    status_code: status,
    response_time_ms: Date.now() - startTime,
  });

  return jsonResponse(status, responseBody);
});
