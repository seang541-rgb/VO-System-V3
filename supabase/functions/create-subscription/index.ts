// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const configuredSiteUrl = Deno.env.get('SITE_URL');
    if (!stripeSecretKey) return jsonResponse(500, { error: 'Missing STRIPE_SECRET_KEY.' });

    const payload = await request.json().catch(() => null) as { user_id?: string; price_id?: string; plan?: string } | null;
    const userId = payload?.user_id?.trim();
    const priceId = payload?.price_id?.trim();
    if (!userId) return jsonResponse(400, { error: 'Missing user_id.' });
    if (!priceId) return jsonResponse(400, { error: 'Missing price_id.' });

    const siteUrl = configuredSiteUrl || request.headers.get('origin') || 'http://localhost:3000';
    const form = new URLSearchParams();
    form.set('mode', 'subscription');
    form.set('success_url', `${siteUrl}/settings?subscription=success`);
    form.set('cancel_url', `${siteUrl}/settings?subscription=cancelled`);
    form.set('client_reference_id', userId);
    form.set('line_items[0][price]', priceId);
    form.set('line_items[0][quantity]', '1');
    form.set('metadata[user_id]', userId);
    form.set('metadata[plan]', payload?.plan || 'pro');

    const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok) {
      const msg = typeof json?.error === 'object' && json?.error && typeof (json.error as Record<string, unknown>).message === 'string'
        ? String((json.error as Record<string, unknown>).message) : 'Stripe session creation failed.';
      return jsonResponse(res.status, { error: msg });
    }

    const url = typeof json?.url === 'string' ? json.url : '';
    if (!url) return jsonResponse(502, { error: 'Stripe returned no checkout URL.' });
    return jsonResponse(200, { url, session_id: typeof json?.id === 'string' ? json.id : null });
  } catch (error) {
    return jsonResponse(500, { error: error instanceof Error ? error.message : 'Unknown error.' });
  }
});
