// @ts-nocheck
import Stripe from 'npm:stripe@14.25.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CREDIT_TOP_UP_AMOUNT = 50;
const EXPECTED_PRICE_ID = Deno.env.get('STRIPE_PRICE_ID') || 'price_1TAWavBIBf5ufJy37B734Gm9';
const EXPECTED_CURRENCY = (Deno.env.get('STRIPE_EXPECTED_CURRENCY') || 'myr').toLowerCase();
const EXPECTED_AMOUNT_TOTAL = Number(Deno.env.get('STRIPE_EXPECTED_AMOUNT_TOTAL') || '49900');
const PROCESSING_STATUS = 'processing';
const COMPLETED_STATUS = 'completed';
const FAILED_STATUS = 'failed';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed. Use POST.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' });
  }

  if (!stripeSecretKey || !stripeWebhookSecret) {
    return jsonResponse(500, { error: 'Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET.' });
  }

  const stripeSignature = request.headers.get('stripe-signature');
  if (!stripeSignature) {
    return jsonResponse(400, { error: 'Missing Stripe-Signature header.' });
  }

  const rawBody = await request.text();
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, stripeSignature, stripeWebhookSecret, undefined, cryptoProvider);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Stripe webhook signature.';
    return jsonResponse(400, { error: message });
  }

  if (event.type !== 'checkout.session.completed') {
    return jsonResponse(200, {
      received: true,
      ignored: true,
      event_type: event.type,
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.client_reference_id?.trim();
  const sessionId = session.id;

  if (!userId) {
    return jsonResponse(400, { error: 'Missing client_reference_id on checkout session.' });
  }

  if (!sessionId) {
    return jsonResponse(400, { error: 'Missing checkout session id.' });
  }

  if (session.mode !== 'payment') {
    return jsonResponse(400, { error: `Unexpected checkout mode: ${session.mode}` });
  }

  if (session.payment_status !== 'paid') {
    return jsonResponse(400, { error: `Checkout session is not paid. Current payment_status: ${session.payment_status}` });
  }

  if ((session.currency || '').toLowerCase() !== EXPECTED_CURRENCY) {
    return jsonResponse(400, { error: `Unexpected currency: ${session.currency}. Expected ${EXPECTED_CURRENCY}.` });
  }

  if (typeof session.amount_total !== 'number' || session.amount_total !== EXPECTED_AMOUNT_TOTAL) {
    return jsonResponse(400, { error: `Unexpected amount_total: ${session.amount_total}. Expected ${EXPECTED_AMOUNT_TOTAL}.` });
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 100,
    expand: ['data.price'],
  });

  const matchedLineItem = lineItems.data.find((item) => {
    const priceId = typeof item.price === 'string' ? item.price : item.price?.id;
    return priceId === EXPECTED_PRICE_ID;
  });

  if (!matchedLineItem) {
    return jsonResponse(400, { error: `Expected Stripe price ${EXPECTED_PRICE_ID} was not found in the checkout line items.` });
  }

  if (matchedLineItem.quantity !== 1) {
    return jsonResponse(400, { error: `Unexpected quantity for ${EXPECTED_PRICE_ID}: ${matchedLineItem.quantity}. Expected 1.` });
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const reserveProcessingRecord = async () => {
    const { error } = await admin.from('stripe_webhook_events').insert({
      stripe_event_id: event.id,
      stripe_session_id: sessionId,
      user_id: userId,
      event_type: event.type,
      credits_added: CREDIT_TOP_UP_AMOUNT,
      status: PROCESSING_STATUS,
      last_error: null,
    });

    if (!error) {
      return { proceed: true as const };
    }

    if (error.code !== '23505') {
      throw error;
    }

    const { data: existingRecord, error: existingError } = await admin
      .from('stripe_webhook_events')
      .select('status')
      .eq('stripe_event_id', event.id)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingRecord?.status === COMPLETED_STATUS) {
      return { proceed: false as const, reason: 'already_completed' as const };
    }

    if (existingRecord?.status === PROCESSING_STATUS) {
      return { proceed: false as const, reason: 'already_processing' as const };
    }

    const { error: resetError } = await admin
      .from('stripe_webhook_events')
      .update({
        status: PROCESSING_STATUS,
        last_error: null,
        stripe_session_id: sessionId,
        user_id: userId,
        credits_added: CREDIT_TOP_UP_AMOUNT,
      })
      .eq('stripe_event_id', event.id);

    if (resetError) {
      throw resetError;
    }

    return { proceed: true as const };
  };

  try {
    const reservation = await reserveProcessingRecord();

    if (!reservation.proceed) {
      return jsonResponse(200, {
        received: true,
        duplicate: true,
        status: reservation.reason,
        event_id: event.id,
      });
    }

    const { data: updatedCredits, error: incrementError } = await admin.rpc('increment_user_credits', {
      p_user_id: userId,
      p_delta: CREDIT_TOP_UP_AMOUNT,
    });

    if (incrementError) {
      throw incrementError;
    }

    const { error: markCompleteError } = await admin
      .from('stripe_webhook_events')
      .update({
        status: COMPLETED_STATUS,
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('stripe_event_id', event.id);

    if (markCompleteError) {
      throw markCompleteError;
    }

    return jsonResponse(200, {
      received: true,
      processed: true,
      event_id: event.id,
      session_id: sessionId,
      user_id: userId,
      credits_added: CREDIT_TOP_UP_AMOUNT,
      new_balance: updatedCredits?.credits_balance ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.';

    await admin
      .from('stripe_webhook_events')
      .update({
        status: FAILED_STATUS,
        last_error: message,
      })
      .eq('stripe_event_id', event.id);

    return jsonResponse(500, {
      error: message,
      event_id: event.id,
    });
  }
});
