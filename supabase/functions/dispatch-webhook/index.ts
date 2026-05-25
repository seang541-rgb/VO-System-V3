// @ts-nocheck
// Supabase Edge Function: delivers authenticated project events to user webhooks.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EVENT_TYPES = new Set([
  'comparison.completed',
  'report.generated',
  'audit.completed',
  'file.uploaded',
  'threshold.exceeded',
]);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return host === '0.0.0.0' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
}

function validatedTarget(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || isBlockedHost(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { error: 'Unauthorized.' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return jsonResponse(401, { error: 'Unauthorized.' });

    const body = await req.json().catch(() => null);
    const eventType = typeof body?.eventType === 'string' ? body.eventType : '';
    const payload = body?.payload;
    if (!EVENT_TYPES.has(eventType) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonResponse(400, { error: 'Invalid eventType or payload.' });
    }
    if (JSON.stringify(payload).length > 100_000) {
      return jsonResponse(413, { error: 'Payload is too large.' });
    }

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: configuredHooks, error } = await admin
      .from('webhooks')
      .select('id, project_id, url, secret')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .contains('events', [eventType]);
    if (error) return jsonResponse(500, { error: error.message });

    const projectId = typeof payload.projectId === 'string' ? payload.projectId : null;
    const webhooks = (configuredHooks ?? []).filter(
      (hook) => hook.project_id === null || hook.project_id === projectId,
    );
    let delivered = 0;

    for (const hook of webhooks) {
      const target = validatedTarget(hook.url);
      if (!target) {
        await admin.from('webhook_deliveries').insert({
          webhook_id: hook.id,
          event_type: eventType,
          payload,
          status_code: 0,
          response_body: 'Blocked webhook URL. HTTPS public destinations are required.',
        });
        continue;
      }

      const eventPayload = JSON.stringify({
        event: eventType,
        timestamp: new Date().toISOString(),
        data: payload,
      });
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-VO-Event': eventType,
      };
      if (hook.secret) headers['X-VO-Signature'] = await signPayload(eventPayload, hook.secret);

      try {
        const response = await fetch(target, {
          method: 'POST',
          headers,
          body: eventPayload,
          signal: AbortSignal.timeout(10000),
        });
        await admin.from('webhook_deliveries').insert({
          webhook_id: hook.id,
          event_type: eventType,
          payload,
          status_code: response.status,
          response_body: (await response.text()).slice(0, 500),
        });
        delivered += 1;
      } catch (err) {
        await admin.from('webhook_deliveries').insert({
          webhook_id: hook.id,
          event_type: eventType,
          payload,
          status_code: 0,
          response_body: err instanceof Error ? err.message : 'Delivery failed.',
        });
      }
    }

    return jsonResponse(200, { delivered });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
