// Supabase Edge Function: dispatch-webhook
// Fires webhooks for project events (comparison completed, report generated, etc.)
// Sends HMAC-signed payloads to user-configured endpoints.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { error: 'Unauthorized' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify user
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return jsonResponse(401, { error: 'Unauthorized' });

    const body = await req.json();
    const { eventType, payload } = body;

    // Find matching webhooks
    const { data: webhooks } = await supabase
      .from('webhooks')
      .select('*')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .contains('events', [eventType]);

    if (!webhooks?.length) return jsonResponse(200, { delivered: 0 });

    let delivered = 0;
    for (const wh of webhooks) {
      const eventPayload = JSON.stringify({
        event: eventType,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-VO-Event': eventType,
      };

      if (wh.secret) {
        headers['X-VO-Signature'] = await signPayload(eventPayload, wh.secret);
      }

      try {
        const res = await fetch(wh.url, {
          method: 'POST',
          headers,
          body: eventPayload,
          signal: AbortSignal.timeout(10000),
        });

        await supabase.from('webhook_deliveries').insert({
          webhook_id: wh.id,
          event_type: eventType,
          payload,
          status_code: res.status,
          response_body: (await res.text()).slice(0, 500),
        });
        delivered++;
      } catch (err) {
        await supabase.from('webhook_deliveries').insert({
          webhook_id: wh.id,
          event_type: eventType,
          payload,
          status_code: 0,
          response_body: err instanceof Error ? err.message : 'Delivery failed',
        });
      }
    }

    return jsonResponse(200, { delivered });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
