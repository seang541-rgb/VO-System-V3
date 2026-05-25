// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!stripeSecretKey) {
      return jsonResponse(500, { error: 'Missing STRIPE_SECRET_KEY secret.' });
    }
    if (!supabaseUrl || !anonKey) {
      return jsonResponse(500, { error: 'Missing Supabase environment variables.' });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { error: 'Unauthorized.' });
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return jsonResponse(401, { error: 'Unauthorized.' });

    const payload = await request.json().catch(() => null) as { return_path?: string } | null;
    const requestedPath = payload?.return_path?.trim() ?? '/';
    const returnPath =
      requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.includes('\\')
        ? requestedPath
        : '/';

    const requestOrigin = request.headers.get('origin') || undefined;
    const siteUrl = configuredSiteUrl || requestOrigin || 'http://localhost:3000';
    const successUrl = new URL(returnPath, siteUrl);
    const cancelUrl = new URL(returnPath, siteUrl);
    successUrl.searchParams.set('checkout', 'success');
    cancelUrl.searchParams.set('checkout', 'cancelled');

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', successUrl.toString());
    form.set('cancel_url', cancelUrl.toString());
    form.set('client_reference_id', user.id);
    form.set('line_items[0][price]', priceId);
    form.set('line_items[0][quantity]', '1');
    form.set('metadata[user_id]', user.id);

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

