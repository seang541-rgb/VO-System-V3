# Deployment

This repository contains the schema and Edge Functions required by the current
workspace, Agent, billing, webhook, and API-key features.

## Frontend Environment

For local development, copy `.env.example` to `.env.local` and fill in:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Without these values the application runs in local workspace mode: IFC
comparison and Excel export remain available, while cloud-backed features are
disabled.
When cloud mode is configured, `/local` remains available for local-only IFC
comparison and export.

## Database Order

Apply the SQL scripts in Supabase SQL Editor in this order:

1. `supabase/seed/00_run_all.sql` for the knowledge-base tables and seed data.
2. `supabase/sql/stripe-webhook-prereqs.sql` for credit balances, secure credit
   RPCs, Agent turn billing, new-user credits, and Stripe webhook idempotency.
3. `supabase/sql/v2-schema.sql` for projects, files, comparisons, exports, and
   read-only subscription access.
4. `supabase/sql/v2-agent-all-migrations.sql` for conversations, memory, unit
   rates, webhooks, API keys, and the remaining Agent tables.
5. `supabase/migrations/20260525164241_agent_run_ledger.sql` for persisted
   Agent runs, tool evidence, and approval records for formal output actions.
6. `supabase/migrations/20260525182830_agent_ledger_authority.sql` to make
   Agent ledger rows append-only from the browser and support resumable approval claims.

The billing prerequisites script creates `user_credits`, grants five credits
to existing and newly registered users, and creates both `consume_credit()` and
`consume_agent_turn_credit(...)`. Subscription rows are readable by users but
must only be written by trusted billing code using the service role.

The Agent run ledger records each cloud Copilot request and its tool steps.
`export_vo_excel` and `generate_report` require a recorded human approval
before the Agent is allowed to create a formal downloadable output. Ledger
writes and approval transitions are handled by the authenticated
`agent-ledger` Edge Function; the browser has read-only access to these rows.

## Edge Functions

Deploy these functions:

- `agent-proxy`: authenticated Copilot proxy. One credit is consumed per user
  turn; tool continuation hops reuse the recorded turn, with a ten-hop cap.
- `agent-ledger`: authenticated append-only run/evidence ledger and resumable
  approval state machine for formal outputs.
- `create-checkout`: Stripe checkout for credit top-ups.
- `stripe-webhook`: verified Stripe webhook which adds purchased credits.
- `dispatch-webhook`: authenticated project event delivery for user webhooks.
- `public-api`: API-key-authenticated, read-only REST endpoints.
- `embed-bq`: embedding support for BQ matching.

`public-api` and `stripe-webhook` have `verify_jwt = false` in
`supabase/config.toml` because they authenticate through API keys and Stripe
signatures respectively. Other functions retain JWT verification.

## Secrets

Set these Supabase Edge Function secrets before deployment:

- `NVIDIA_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_EXPECTED_CURRENCY`
- `STRIPE_EXPECTED_AMOUNT_TOTAL`
- `SITE_URL`

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`.
