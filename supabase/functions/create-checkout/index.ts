// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const FALLBACK_PRICE_ID = 'price_1TAWavBIBf5ufJy37B734Gm9';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed. Use POST.' });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const priceId = Deno.env.get('STRIPE_PRICE_ID') || FALLBACK_PRICE_ID;
    const configuredSiteUrl = Deno.env.get('SITE_URL');

    if (!stripeSecretKey) {
      return jsonResponse(500, { error: 'Missing STRIPE_SECRET_KEY secret.' });
    }

    const payload = await request.json().catch(() => null) as { user_id?: string } | null;
    const userId = payload?.user_id?.trim();

    if (!userId) {
      return jsonResponse(400, { error: 'Missing user_id in request body.' });
    }

    const requestOrigin = request.headers.get('origin') || undefined;
    const siteUrl = configuredSiteUrl || requestOrigin || 'http://localhost:3000';
    const successUrl = `${siteUrl}/?checkout=success`;
    const cancelUrl = `${siteUrl}/?checkout=cancelled`;

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', successUrl);
    form.set('cancel_url', cancelUrl);
    form.set('client_reference_id', userId);
    form.set('line_items[0][price]', priceId);
    form.set('line_items[0][quantity]', '1');
    form.set('metadata[user_id]', userId);

    const stripeResponse = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const stripeJson = await stripeResponse.json().catch(() => null) as Record<string, unknown> | null;

    if (!stripeResponse.ok) {
      const stripeMessage =
        typeof stripeJson?.error === 'object' && stripeJson?.error && typeof (stripeJson.error as Record<string, unknown>).message === 'string'
          ? String((stripeJson.error as Record<string, unknown>).message)
          : 'Stripe Checkout session creation failed.';

      return jsonResponse(stripeResponse.status, { error: stripeMessage });
    }

    const url = typeof stripeJson?.url === 'string' ? stripeJson.url : '';
    const sessionId = typeof stripeJson?.id === 'string' ? stripeJson.id : null;

    if (!url) {
      return jsonResponse(502, { error: 'Stripe returned no checkout URL.' });
    }

    return jsonResponse(200, {
      url,
      session_id: sessionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    return jsonResponse(500, { error: message });
  }
});

