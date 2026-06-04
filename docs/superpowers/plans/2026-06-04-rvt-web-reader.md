# RVT Web Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RVT file support to IdeaNest V1 — APS Viewer for 3D preview, APS Model Derivative for paid RVT→IFC conversion, credit-based billing via Supabase Edge Functions.

**Architecture:** Users upload .rvt files which load in APS Viewer for free preview. On-demand "Run Audit" triggers a Supabase Edge Function pipeline: upload to APS OSS via signed URL → Model Derivative converts RVT→IFC → download IFC → feed into existing web-ifc audit engine. Credits are deducted before conversion and refunded on failure.

**Tech Stack:** React 19, TypeScript, Vite, Supabase Edge Functions (Deno), Autodesk Platform Services (APS) API, Autodesk Viewer v7 SDK, existing web-ifc audit engine.

**Spec:** `docs/superpowers/specs/2026-06-04-rvt-web-reader-design.md`

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `supabase/functions/rvt-token/index.ts` | Edge Function: APS 2-legged OAuth token for Viewer |
| `supabase/functions/rvt-convert/index.ts` | Edge Function: RVT upload + Model Derivative conversion |
| `supabase/functions/rvt-status/index.ts` | Edge Function: Poll conversion progress |
| `supabase/functions/rvt-download/index.ts` | Edge Function: Download converted IFC |
| `supabase/seed/10_create_rvt_jobs.sql` | `rvt_jobs` table + RLS |
| `src/rvt/aps-client.ts` | Client-side APS orchestration (upload, poll, download) |
| `src/rvt/types.ts` | RVT flow types (RvtJobStatus, RvtConvertState, etc.) |
| `src/components/RvtViewer.tsx` | APS Viewer embed component |
| `src/components/RvtAuditPanel.tsx` | RVT audit flow UI (progress, status, errors) |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/format.ts:12` | Add `'rvt'` to `ActiveTab` union |
| `src/App.tsx` | Add RVT state, file input, upload handler, tab routing |
| `src/components/AppSidebar.tsx` | Add RVT upload button + tab |
| `src/i18n/en.ts` | Add RVT-related i18n strings |
| `src/i18n/zh.ts` | Add RVT-related i18n strings (Chinese) |
| `index.html` | Add APS Viewer SDK script tag |

---

## Task 1: Database — `rvt_jobs` table + RLS

**Files:**
- Create: `supabase/seed/10_create_rvt_jobs.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/seed/10_create_rvt_jobs.sql
-- RVT→IFC conversion job tracking table

BEGIN;

CREATE TABLE IF NOT EXISTS rvt_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  urn             TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','success','failed','downloaded')),
  credits_charged INTEGER NOT NULL DEFAULT 0,
  file_name       TEXT NOT NULL,
  file_size       BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_rvt_jobs_user ON rvt_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_rvt_jobs_status ON rvt_jobs (status);

ALTER TABLE rvt_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_jobs" ON rvt_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_jobs" ON rvt_jobs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_all" ON rvt_jobs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run: `npx supabase db push` or apply via Supabase Dashboard SQL editor.
Expected: Table `rvt_jobs` created with RLS enabled.

- [ ] **Step 3: Create `consume_credits` RPC variant for N credits**

We need an RPC that can deduct N credits (not just 1). Run this in the Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION consume_credits(amount INTEGER DEFAULT 1)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
BEGIN
  SELECT credits_balance INTO current_balance
  FROM user_credits
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF current_balance IS NULL OR current_balance < amount THEN
    RAISE EXCEPTION 'NO_CREDITS';
  END IF;

  new_balance := current_balance - amount;

  UPDATE user_credits
  SET credits_balance = new_balance
  WHERE user_id = auth.uid();

  RETURN json_build_object('credits_balance', new_balance);
END;
$$;
```

- [ ] **Step 4: Create `refund_credits` RPC for failed conversions**

```sql
CREATE OR REPLACE FUNCTION refund_credits(target_user_id UUID, amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_credits
  SET credits_balance = credits_balance + amount
  WHERE user_id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION refund_credits FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refund_credits TO service_role;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/seed/10_create_rvt_jobs.sql
git commit -m "feat(rvt): add rvt_jobs table, consume_credits and refund_credits RPCs"
```

---

## Task 2: Edge Function — `rvt-token`

**Files:**
- Create: `supabase/functions/rvt-token/index.ts`

- [ ] **Step 1: Create the Edge Function**

```typescript
// supabase/functions/rvt-token/index.ts
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
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

    // Verify user session
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse(401, { error: 'Missing bearer token.' });

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    });
    if (!authRes.ok) return jsonResponse(401, { error: 'Invalid or expired session.' });

    // 2-legged OAuth for Viewer (viewables:read only)
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
```

- [ ] **Step 2: Set APS secrets in Supabase**

```bash
npx supabase secrets set APS_CLIENT_ID=your_client_id APS_CLIENT_SECRET=your_client_secret
```

- [ ] **Step 3: Deploy and test**

```bash
npx supabase functions deploy rvt-token
```

Test with curl:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/rvt-token \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
  -H "apikey: YOUR_ANON_KEY"
```
Expected: `{ "access_token": "...", "expires_in": 3600 }`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/rvt-token/index.ts
git commit -m "feat(rvt): add rvt-token Edge Function for APS Viewer auth"
```

---

## Task 3: Edge Function — `rvt-convert`

**Files:**
- Create: `supabase/functions/rvt-convert/index.ts`

This is the most complex Edge Function — two-phase: `/init` returns a signed upload URL, `/start` triggers the conversion.

- [ ] **Step 1: Create the Edge Function**

```typescript
// supabase/functions/rvt-convert/index.ts
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const APS_BASE = 'https://developer.api.autodesk.com';
const RVT_CREDIT_COST = parseInt(Deno.env.get('RVT_CREDIT_COST') || '3', 10);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getApsToken(): Promise<string> {
  const res = await fetch(`${APS_BASE}/authentication/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('APS_CLIENT_ID')!,
      client_secret: Deno.env.get('APS_CLIENT_SECRET')!,
      grant_type: 'client_credentials',
      scope: 'data:read data:write data:create bucket:create bucket:read',
    }),
  });
  if (!res.ok) throw new Error(`APS auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function verifyUser(request: Request): Promise<{ userId: string; token: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('UNAUTHORIZED');

  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
  });
  if (!authRes.ok) throw new Error('UNAUTHORIZED');
  const user = await authRes.json();
  if (!user?.id) throw new Error('UNAUTHORIZED');
  return { userId: user.id, token };
}

async function ensureBucket(apsToken: string): Promise<string> {
  const clientId = Deno.env.get('APS_CLIENT_ID')!;
  const bucket = (clientId.toLowerCase().slice(0, 8) + 'rvt2ifc').replace(/_/g, '').slice(0, 24);
  const h = { 'Authorization': `Bearer ${apsToken}`, 'Content-Type': 'application/json' };

  const res = await fetch(`${APS_BASE}/oss/v2/buckets`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ bucketKey: bucket, policyKey: 'transient' }),
  });
  if (res.status !== 200 && res.status !== 409) {
    throw new Error(`Bucket creation failed: ${res.status} ${await res.text()}`);
  }
  return bucket;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  try {
    const url = new URL(request.url);
    const phase = url.pathname.split('/').pop(); // 'init' or 'start'

    const { userId, token: userToken } = await verifyUser(request);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (phase === 'init') {
      const payload = await request.json();
      const { file_name, file_size } = payload;

      if (!file_name || typeof file_size !== 'number') {
        return jsonResponse(400, { error: 'file_name and file_size required.' });
      }
      if (file_size > 100 * 1024 * 1024) {
        return jsonResponse(413, { error: 'File exceeds 100MB limit.' });
      }

      // Deduct credits
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_credits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: RVT_CREDIT_COST }),
      });
      const rpcJson = await rpcRes.json().catch(() => null);
      if (!rpcRes.ok) {
        const msg = rpcJson?.message || '';
        if (msg.includes('NO_CREDITS')) {
          return jsonResponse(402, { error: 'Insufficient credits.', required: RVT_CREDIT_COST });
        }
        return jsonResponse(500, { error: `Credit check failed: ${msg}` });
      }

      // Get APS token + ensure bucket
      const apsToken = await getApsToken();
      const bucket = await ensureBucket(apsToken);

      // Get signed upload URL
      const objKey = encodeURIComponent(file_name);
      const signRes = await fetch(
        `${APS_BASE}/oss/v2/buckets/${bucket}/objects/${objKey}/signeds3upload`,
        { headers: { 'Authorization': `Bearer ${apsToken}` } }
      );
      if (!signRes.ok) throw new Error(`Signed URL failed: ${await signRes.text()}`);
      const signData = await signRes.json();

      // Create job record
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/rvt_jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          user_id: userId,
          status: 'pending',
          credits_charged: RVT_CREDIT_COST,
          file_name,
          file_size,
        }),
      });
      const [job] = await insertRes.json();

      return jsonResponse(200, {
        job_id: job.id,
        upload_url: signData.urls[0],
        upload_key: signData.uploadKey,
        bucket,
        object_key: file_name,
        credits_balance: rpcJson?.credits_balance ?? null,
      });

    } else if (phase === 'start') {
      const payload = await request.json();
      const { job_id, upload_key, bucket, object_key } = payload;

      if (!job_id || !upload_key || !bucket || !object_key) {
        return jsonResponse(400, { error: 'job_id, upload_key, bucket, object_key required.' });
      }

      const apsToken = await getApsToken();
      const objKey = encodeURIComponent(object_key);

      // Finalize S3 upload
      const finRes = await fetch(
        `${APS_BASE}/oss/v2/buckets/${bucket}/objects/${objKey}/signeds3upload`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apsToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadKey: upload_key }),
        }
      );
      if (!finRes.ok) throw new Error(`Upload finalize failed: ${await finRes.text()}`);
      const finData = await finRes.json();

      const objectId = finData.objectId;
      const urn = btoa(objectId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      // Start Model Derivative translation
      const jobRes = await fetch(`${APS_BASE}/modelderivative/v2/designdata/job`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apsToken}`,
          'Content-Type': 'application/json',
          'x-ads-force': 'true',
        },
        body: JSON.stringify({
          input: { urn },
          output: { formats: [{ type: 'ifc' }] },
        }),
      });
      if (!jobRes.ok) throw new Error(`Translation job failed: ${await jobRes.text()}`);

      // Update job record
      await fetch(`${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urn, status: 'processing' }),
      });

      return jsonResponse(200, { job_id, urn });

    } else {
      return jsonResponse(400, { error: 'Use /init or /start path.' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return jsonResponse(401, { error: 'Invalid session.' });
    return jsonResponse(500, { error: msg });
  }
});
```

- [ ] **Step 2: Deploy and test init phase**

```bash
npx supabase functions deploy rvt-convert
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/rvt-convert/index.ts
git commit -m "feat(rvt): add rvt-convert Edge Function (init + start phases)"
```

---

## Task 4: Edge Function — `rvt-status`

**Files:**
- Create: `supabase/functions/rvt-status/index.ts`

- [ ] **Step 1: Create the Edge Function**

```typescript
// supabase/functions/rvt-status/index.ts
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const APS_BASE = 'https://developer.api.autodesk.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse(401, { error: 'Missing bearer token.' });

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    });
    if (!authRes.ok) return jsonResponse(401, { error: 'Invalid session.' });
    const user = await authRes.json();

    const payload = await request.json();
    const { job_id } = payload;
    if (!job_id) return jsonResponse(400, { error: 'job_id required.' });

    // Fetch job (verify ownership)
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}&user_id=eq.${user.id}&select=*`,
      { headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': anonKey } }
    );
    const jobs = await jobRes.json();
    if (!jobs?.length) return jsonResponse(404, { error: 'Job not found.' });
    const job = jobs[0];

    if (!job.urn) {
      return jsonResponse(200, { status: job.status, progress: '' });
    }

    // Get APS token and check manifest
    const apsAuth = await fetch(`${APS_BASE}/authentication/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('APS_CLIENT_ID')!,
        client_secret: Deno.env.get('APS_CLIENT_SECRET')!,
        grant_type: 'client_credentials',
        scope: 'data:read',
      }),
    });
    const { access_token: apsToken } = await apsAuth.json();

    const manifest = await fetch(
      `${APS_BASE}/modelderivative/v2/designdata/${job.urn}/manifest`,
      { headers: { 'Authorization': `Bearer ${apsToken}` } }
    );
    const m = await manifest.json();

    const apsStatus = m.status || 'pending';
    const progress = m.progress || '';

    // Update job if completed or failed
    if ((apsStatus === 'success' || apsStatus === 'complete') && job.status === 'processing') {
      await fetch(`${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'success', completed_at: new Date().toISOString() }),
      });
      return jsonResponse(200, { status: 'success', progress: '100%' });
    }

    if (apsStatus === 'failed' && job.status === 'processing') {
      // Refund credits on failure
      await fetch(`${supabaseUrl}/rest/v1/rpc/refund_credits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_user_id: user.id, amount: job.credits_charged }),
      });

      const errMsg = JSON.stringify(m.derivatives?.[0]?.messages || []).slice(0, 500);
      await fetch(`${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'failed', error_message: errMsg, completed_at: new Date().toISOString() }),
      });
      return jsonResponse(200, { status: 'failed', progress, error: errMsg });
    }

    return jsonResponse(200, { status: apsStatus === 'inprogress' ? 'processing' : job.status, progress });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unknown error.' });
  }
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy rvt-status
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/rvt-status/index.ts
git commit -m "feat(rvt): add rvt-status Edge Function for conversion polling"
```

---

## Task 5: Edge Function — `rvt-download`

**Files:**
- Create: `supabase/functions/rvt-download/index.ts`

- [ ] **Step 1: Create the Edge Function**

```typescript
// supabase/functions/rvt-download/index.ts
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const APS_BASE = 'https://developer.api.autodesk.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse(401, { error: 'Missing bearer token.' });

    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    });
    if (!authRes.ok) return jsonResponse(401, { error: 'Invalid session.' });
    const user = await authRes.json();

    const payload = await request.json();
    const { job_id } = payload;
    if (!job_id) return jsonResponse(400, { error: 'job_id required.' });

    // Fetch job
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}&user_id=eq.${user.id}&select=*`,
      { headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': anonKey } }
    );
    const jobs = await jobRes.json();
    if (!jobs?.length) return jsonResponse(404, { error: 'Job not found.' });
    const job = jobs[0];

    if (job.status !== 'success' && job.status !== 'downloaded') {
      return jsonResponse(400, { error: `Job status is ${job.status}, not ready for download.` });
    }

    // Get APS token
    const apsAuth = await fetch(`${APS_BASE}/authentication/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('APS_CLIENT_ID')!,
        client_secret: Deno.env.get('APS_CLIENT_SECRET')!,
        grant_type: 'client_credentials',
        scope: 'data:read',
      }),
    });
    const { access_token: apsToken } = await apsAuth.json();

    // Find IFC derivative URN from manifest
    const manifestRes = await fetch(
      `${APS_BASE}/modelderivative/v2/designdata/${job.urn}/manifest`,
      { headers: { 'Authorization': `Bearer ${apsToken}` } }
    );
    const manifest = await manifestRes.json();

    let derivUrn: string | null = null;
    for (const d of manifest.derivatives || []) {
      if (d.outputType === 'ifc') {
        for (const c of d.children || []) {
          if (c.urn?.toLowerCase().endsWith('.ifc') || c.role === 'ifc') {
            derivUrn = c.urn;
            break;
          }
        }
        if (!derivUrn && d.children?.length) {
          derivUrn = d.children[0].urn;
        }
      }
    }
    if (!derivUrn) return jsonResponse(404, { error: 'IFC derivative not found in manifest.' });

    // Download IFC
    const dlRes = await fetch(
      `${APS_BASE}/modelderivative/v2/designdata/${job.urn}/manifest/${encodeURIComponent(derivUrn)}`,
      { headers: { 'Authorization': `Bearer ${apsToken}` } }
    );
    if (!dlRes.ok) return jsonResponse(502, { error: `Download failed: ${dlRes.status}` });

    // Mark as downloaded
    await fetch(`${supabaseUrl}/rest/v1/rvt_jobs?id=eq.${job_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'downloaded' }),
    });

    const ifcData = await dlRes.arrayBuffer();
    return new Response(ifcData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${job.file_name.replace(/\.rvt$/i, '.ifc')}"`,
      },
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Unknown error.' });
  }
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy rvt-download
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/rvt-download/index.ts
git commit -m "feat(rvt): add rvt-download Edge Function for IFC retrieval"
```

---

## Task 6: Client-side RVT types + APS orchestration

**Files:**
- Create: `src/rvt/types.ts`
- Create: `src/rvt/aps-client.ts`

- [ ] **Step 1: Create RVT types**

```typescript
// src/rvt/types.ts

export type RvtConvertStatus = 'idle' | 'credit_check' | 'uploading' | 'converting' | 'downloading' | 'done' | 'error';

export interface RvtJob {
  job_id: string;
  urn: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'downloaded';
  progress: string;
}

export interface RvtInitResponse {
  job_id: string;
  upload_url: string;
  upload_key: string;
  bucket: string;
  object_key: string;
  credits_balance: number | null;
}

export interface RvtStartResponse {
  job_id: string;
  urn: string;
}

export interface RvtStatusResponse {
  status: string;
  progress: string;
  error?: string;
}
```

- [ ] **Step 2: Create APS client module**

```typescript
// src/rvt/aps-client.ts

import { supabase } from '../lib/supabase';
import type { RvtInitResponse, RvtStartResponse, RvtStatusResponse } from './types';

const POLL_INTERVAL_MS = 8_000;
const MAX_POLL_DURATION_MS = 15 * 60 * 1000;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated.');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
}

function fnUrl(name: string, path = ''): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/functions/v1/${name}${path}`;
}

export async function rvtConvertInit(fileName: string, fileSize: number): Promise<RvtInitResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(fnUrl('rvt-convert', '/init'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ file_name: fileName, file_size: fileSize }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Init failed (${res.status})`);
  return data as RvtInitResponse;
}

export async function rvtUploadToAps(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
  });
  if (!res.ok) throw new Error(`Upload to APS failed (${res.status})`);
}

export async function rvtConvertStart(
  jobId: string,
  uploadKey: string,
  bucket: string,
  objectKey: string,
): Promise<RvtStartResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(fnUrl('rvt-convert', '/start'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ job_id: jobId, upload_key: uploadKey, bucket, object_key: objectKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Start failed (${res.status})`);
  return data as RvtStartResponse;
}

export async function rvtPollUntilDone(
  jobId: string,
  onProgress?: (status: string, progress: string) => void,
): Promise<RvtStatusResponse> {
  const headers = await getAuthHeaders();
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_DURATION_MS) {
    const res = await fetch(fnUrl('rvt-status'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ job_id: jobId }),
    });
    const data: RvtStatusResponse = await res.json();
    if (!res.ok) throw new Error((data as Record<string, string>).error || `Status check failed`);

    onProgress?.(data.status, data.progress);

    if (data.status === 'success') return data;
    if (data.status === 'failed') throw new Error(data.error || 'Conversion failed.');

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error('Conversion timed out (15 minutes).');
}

export async function rvtDownloadIfc(jobId: string): Promise<ArrayBuffer> {
  const headers = await getAuthHeaders();
  const res = await fetch(fnUrl('rvt-download'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ job_id: jobId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || `Download failed (${res.status})`);
  }
  return res.arrayBuffer();
}

export async function rvtGetViewerToken(): Promise<{ access_token: string; expires_in: number }> {
  const headers = await getAuthHeaders();
  const res = await fetch(fnUrl('rvt-token'), {
    method: 'POST',
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Token fetch failed');
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/rvt/types.ts src/rvt/aps-client.ts
git commit -m "feat(rvt): add client-side RVT types and APS orchestration module"
```

---

## Task 7: APS Viewer component

**Files:**
- Create: `src/components/RvtViewer.tsx`
- Modify: `index.html`

- [ ] **Step 1: Add APS Viewer SDK to index.html**

Add before the closing `</head>` tag in `index.html`:

```html
<!-- Autodesk Platform Services Viewer v7 -->
<link rel="stylesheet" href="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css" />
<script src="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js"></script>
```

- [ ] **Step 2: Add Viewer type declaration**

Add to `src/vite-env.d.ts`:

```typescript
declare namespace Autodesk {
  namespace Viewing {
    class GuiViewer3D {
      constructor(container: HTMLElement, config?: Record<string, unknown>);
      start(): number;
      finish(): void;
      loadDocumentNode(doc: Document, bubble: BubbleNode): Promise<unknown>;
      setTheme(theme: string): void;
    }
    class Document {
      static load(urn: string, onSuccess: (doc: Document) => void, onError: (code: number, msg: string) => void): void;
      getRoot(): BubbleNode;
    }
    class BubbleNode {
      getDefaultGeometry(): BubbleNode;
    }
    function Initializer(options: { env: string; getAccessToken: (cb: (token: string, expire: number) => void) => void }, callback: () => void): void;
  }
}
```

- [ ] **Step 3: Create RvtViewer component**

```tsx
// src/components/RvtViewer.tsx

import { useEffect, useRef, useState } from 'react';
import { Loader2, Eye } from 'lucide-react';
import { rvtGetViewerToken } from '../rvt/aps-client';
import { useLang } from '../i18n/LanguageContext';

interface RvtViewerProps {
  urn: string | null;
}

export default function RvtViewer({ urn }: RvtViewerProps) {
  const { t } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Autodesk.Viewing.GuiViewer3D | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!urn || !containerRef.current) return;

    let destroyed = false;
    setLoading(true);
    setError('');

    Autodesk.Viewing.Initializer(
      {
        env: 'AutodeskProduction2',
        getAccessToken: async (cb) => {
          try {
            const { access_token, expires_in } = await rvtGetViewerToken();
            cb(access_token, expires_in);
          } catch {
            setError('Failed to authenticate with APS.');
          }
        },
      },
      () => {
        if (destroyed || !containerRef.current) return;

        const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, {});
        viewer.start();
        viewer.setTheme('dark-theme');
        viewerRef.current = viewer;

        const documentId = `urn:${urn}`;
        Autodesk.Viewing.Document.load(
          documentId,
          (doc) => {
            if (destroyed) return;
            const defaultGeom = doc.getRoot().getDefaultGeometry();
            viewer.loadDocumentNode(doc, defaultGeom).then(() => setLoading(false));
          },
          (_code, msg) => {
            if (destroyed) return;
            setError(`Viewer load failed: ${msg}`);
            setLoading(false);
          },
        );
      },
    );

    return () => {
      destroyed = true;
      viewerRef.current?.finish();
      viewerRef.current = null;
    };
  }, [urn]);

  if (!urn) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Eye className="h-12 w-12 text-slate-600" />
        <div className="text-sm text-slate-500">{t('rvt.viewerWaiting')}</div>
      </div>
    );
  }

  return (
    <div className="relative h-[500px] w-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/80">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <span className="ml-3 text-sm text-slate-300">{t('rvt.viewerLoading')}</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/80">
          <div className="rounded-lg border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</div>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html src/vite-env.d.ts src/components/RvtViewer.tsx
git commit -m "feat(rvt): add APS Viewer embed component with dark theme"
```

---

## Task 8: RVT Audit Panel component

**Files:**
- Create: `src/components/RvtAuditPanel.tsx`

- [ ] **Step 1: Create the panel**

```tsx
// src/components/RvtAuditPanel.tsx

import { useState } from 'react';
import { Loader2, FileBox, AlertCircle, CheckCircle2, Upload } from 'lucide-react';
import RvtViewer from './RvtViewer';
import type { RvtConvertStatus } from '../rvt/types';
import type { AuditResult } from '../audit/types';
import { useLang } from '../i18n/LanguageContext';

interface RvtAuditPanelProps {
  rvtFile: File | null;
  rvtUrn: string | null;
  convertStatus: RvtConvertStatus;
  convertProgress: string;
  convertError: string;
  auditResult: AuditResult | null;
  auditDurationMs: number;
  creditCost: number;
  onUpload: () => void;
  onRunAudit: () => void;
  canRunAudit: boolean;
}

const STATUS_LABELS: Record<RvtConvertStatus, string> = {
  idle: '',
  credit_check: 'Checking credits...',
  uploading: 'Uploading RVT to cloud...',
  converting: 'Converting RVT → IFC...',
  downloading: 'Downloading converted IFC...',
  done: 'Conversion complete',
  error: 'Conversion failed',
};

export default function RvtAuditPanel({
  rvtFile,
  rvtUrn,
  convertStatus,
  convertProgress,
  convertError,
  auditResult,
  auditDurationMs,
  creditCost,
  onUpload,
  onRunAudit,
  canRunAudit,
}: RvtAuditPanelProps) {
  const { t } = useLang();
  const isConverting = convertStatus !== 'idle' && convertStatus !== 'done' && convertStatus !== 'error';

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Upload area */}
      {!rvtFile && (
        <div className="flex flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed border-slate-700 py-16">
          <FileBox className="h-12 w-12 text-slate-600" />
          <div className="text-center">
            <div className="text-lg font-bold text-slate-300">{t('rvt.title')}</div>
            <div className="mt-2 text-sm text-slate-500">{t('rvt.uploadHint')}</div>
          </div>
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow hover:bg-blue-500"
          >
            <Upload className="h-4 w-4" />
            {t('rvt.uploadBtn')}
          </button>
        </div>
      )}

      {/* Viewer */}
      {rvtFile && <RvtViewer urn={rvtUrn} />}

      {/* File info + audit trigger */}
      {rvtFile && convertStatus === 'idle' && !auditResult && (
        <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-200">{rvtFile.name}</div>
            <div className="text-xs text-slate-500">
              {(rvtFile.size / 1024 / 1024).toFixed(1)} MB · {t('rvt.auditCost', { cost: String(creditCost) })}
            </div>
          </div>
          <button
            type="button"
            onClick={onRunAudit}
            disabled={!canRunAudit}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-40"
          >
            {t('rvt.runAudit')}
          </button>
        </div>
      )}

      {/* Conversion progress */}
      {isConverting && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-900 bg-blue-950/40 px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <div>
            <div className="text-sm font-semibold text-blue-200">{STATUS_LABELS[convertStatus]}</div>
            {convertProgress && <div className="text-xs text-blue-400">{convertProgress}</div>}
          </div>
        </div>
      )}

      {/* Error */}
      {convertStatus === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-400" />
          <div>
            <div className="text-sm font-semibold text-red-200">{t('rvt.conversionFailed')}</div>
            <div className="mt-1 text-xs text-red-400">{convertError}</div>
          </div>
        </div>
      )}

      {/* Success — audit results rendered by AuditPanel, loaded after IFC feed */}
      {convertStatus === 'done' && auditResult && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <span className="text-sm text-emerald-200">
            {t('rvt.auditComplete', { count: String(auditResult.records.length), duration: (auditDurationMs / 1000).toFixed(1) })}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RvtAuditPanel.tsx
git commit -m "feat(rvt): add RvtAuditPanel component with upload, progress, and error states"
```

---

## Task 9: i18n strings

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`

- [ ] **Step 1: Add English strings**

Append to `src/i18n/en.ts` before the closing `};`:

```typescript
  // ── RVT ──
  'rvt.title': 'RVT Audit',
  'rvt.uploadHint': 'Upload a Revit (.rvt) file for 3D preview and cloud-powered audit',
  'rvt.uploadBtn': 'Upload RVT',
  'rvt.viewerWaiting': 'Upload a .rvt file to preview',
  'rvt.viewerLoading': 'Loading 3D model...',
  'rvt.auditCost': 'Audit costs {cost} credits',
  'rvt.runAudit': 'Run RVT Audit',
  'rvt.conversionFailed': 'RVT conversion failed',
  'rvt.auditComplete': 'Audit complete: {count} elements in {duration}s',
  'rvt.insufficientCredits': 'Not enough credits for RVT audit. Please top up.',
  'sidebar.rvtAudit': 'RVT Audit',
  'sidebar.rvtAuditSub': 'Revit cloud audit',
```

- [ ] **Step 2: Add Chinese strings**

Append to `src/i18n/zh.ts` before the closing `};`:

```typescript
  // ── RVT ──
  'rvt.title': 'RVT 审计',
  'rvt.uploadHint': '上传 Revit (.rvt) 文件进行 3D 预览和云端审计',
  'rvt.uploadBtn': '上传 RVT',
  'rvt.viewerWaiting': '上传 .rvt 文件开始预览',
  'rvt.viewerLoading': '加载 3D 模型中...',
  'rvt.auditCost': '审计消耗 {cost} 积分',
  'rvt.runAudit': '运行 RVT 审计',
  'rvt.conversionFailed': 'RVT 转换失败',
  'rvt.auditComplete': '审计完成：{count} 个构件，耗时 {duration}s',
  'rvt.insufficientCredits': 'RVT 审计积分不足，请充值。',
  'sidebar.rvtAudit': 'RVT 审计',
  'sidebar.rvtAuditSub': 'Revit 云端审计',
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(rvt): add i18n strings for RVT audit flow (en + zh)"
```

---

## Task 10: Integrate RVT into App.tsx + Sidebar

**Files:**
- Modify: `src/lib/format.ts:12`
- Modify: `src/App.tsx`
- Modify: `src/components/AppSidebar.tsx`

This is the wiring task — connects all previous work into the existing app.

- [ ] **Step 1: Add 'rvt' to ActiveTab**

In `src/lib/format.ts`, line 12, change:

```typescript
export type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit' | 'guide' | 'dwg';
```

to:

```typescript
export type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit' | 'guide' | 'dwg' | 'rvt';
```

- [ ] **Step 2: Add RVT state + imports to App.tsx**

Add imports near the top of App.tsx (after the DWG imports):

```typescript
import RvtAuditPanel from './components/RvtAuditPanel';
import type { RvtConvertStatus } from './rvt/types';
import { rvtConvertInit, rvtUploadToAps, rvtConvertStart, rvtPollUntilDone, rvtDownloadIfc } from './rvt/aps-client';
```

Add state variables after the DWG state block (after line ~116):

```typescript
  const [rvtFile, setRvtFile] = useState<File | null>(null);
  const [rvtUrn, setRvtUrn] = useState<string | null>(null);
  const [rvtConvertStatus, setRvtConvertStatus] = useState<RvtConvertStatus>('idle');
  const [rvtConvertProgress, setRvtConvertProgress] = useState('');
  const [rvtConvertError, setRvtConvertError] = useState('');
  const [rvtAuditResult, setRvtAuditResult] = useState<AuditResult | null>(null);
  const [rvtAuditDurationMs, setRvtAuditDurationMs] = useState(0);
  const rvtInputRef = useRef<HTMLInputElement>(null);
  const RVT_CREDIT_COST = 3;
```

- [ ] **Step 3: Add RVT upload handler**

Add after the `handleDwgUpload` function:

```typescript
  const handleRvtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error('RVT file exceeds 100MB limit');
      e.target.value = '';
      return;
    }
    setRvtFile(file);
    setRvtUrn(null);
    setRvtConvertStatus('idle');
    setRvtConvertError('');
    setRvtAuditResult(null);
    setActiveTab('rvt');
    setSysLog(`RVT file loaded: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    e.target.value = '';
  };
```

- [ ] **Step 4: Add RVT audit handler**

Add after the upload handler:

```typescript
  const runRvtAudit = useCallback(async () => {
    if (!rvtFile || !user) return;

    setRvtConvertStatus('credit_check');
    setRvtConvertError('');
    setRvtAuditResult(null);
    const t0 = performance.now();

    try {
      // Phase 1: Init (deducts credits, gets upload URL)
      setRvtConvertStatus('uploading');
      setSysLog('RVT: Initializing cloud conversion...');
      const init = await rvtConvertInit(rvtFile.name, rvtFile.size);

      if (init.credits_balance !== null) setCreditsBalance(init.credits_balance);

      // Upload directly to APS
      setSysLog('RVT: Uploading to Autodesk cloud...');
      await rvtUploadToAps(init.upload_url, rvtFile);

      // Phase 2: Start conversion
      setRvtConvertStatus('converting');
      setSysLog('RVT: Starting RVT → IFC conversion...');
      const start = await rvtConvertStart(init.job_id, init.upload_key, init.bucket, init.object_key);

      setRvtUrn(start.urn);

      // Poll until done
      await rvtPollUntilDone(init.job_id, (status, progress) => {
        setRvtConvertProgress(progress);
        setSysLog(`RVT: Converting... ${progress}`);
      });

      // Download converted IFC
      setRvtConvertStatus('downloading');
      setSysLog('RVT: Downloading converted IFC...');
      const ifcBuffer = await rvtDownloadIfc(init.job_id);

      // Feed into existing audit engine
      setSysLog('RVT: Running audit on converted IFC...');
      const engine = ensureEngine();
      if (!engine) throw new Error('BIM engine not available');

      await engine.loadIfcModel(ifcBuffer, (p) => {
        setSysLog(`RVT: Loading converted IFC... ${Math.round(p * 100)}%`);
      });

      const handle = engine.getIfcHandle();
      if (!handle) throw new Error('IFC model failed to load from converted file');

      const { runAudit: doAudit } = await import('./audit/extractor');
      const result = doAudit({ api: handle.api, modelID: handle.modelID });
      const duration = performance.now() - t0;

      setRvtAuditResult(result);
      setRvtAuditDurationMs(duration);
      setRvtConvertStatus('done');
      setSysLog(`RVT audit complete: ${result.records.length} elements in ${(duration / 1000).toFixed(1)}s`);
      toast.success(`RVT 审计完成 · ${result.records.length} 个构件`);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setRvtConvertError(message);
      setRvtConvertStatus('error');
      setSysLog(`RVT audit failed: ${message}`);

      if (message.includes('Insufficient credits') || message.includes('NO_CREDITS')) {
        setShowPaywall(true);
        toast.error(t('rvt.insufficientCredits'));
      } else {
        toast.error('RVT 审计失败');
      }

      await refreshCredits();
    }
  }, [rvtFile, user, ensureEngine, t, refreshCredits, setCreditsBalance]);
```

- [ ] **Step 5: Add hidden RVT file input**

Add after the dwg input (around line 939):

```tsx
<input ref={rvtInputRef} type="file" className="hidden" accept=".rvt,.RVT" onChange={handleRvtUpload} />
```

- [ ] **Step 6: Add RVT tab routing**

In the tab rendering section, add before the copilot fallback (after the `activeTab === 'dwg'` block):

```tsx
) : activeTab === 'rvt' ? (
  <RvtAuditPanel
    rvtFile={rvtFile}
    rvtUrn={rvtUrn}
    convertStatus={rvtConvertStatus}
    convertProgress={rvtConvertProgress}
    convertError={rvtConvertError}
    auditResult={rvtAuditResult}
    auditDurationMs={rvtAuditDurationMs}
    creditCost={RVT_CREDIT_COST}
    onUpload={() => rvtInputRef.current?.click()}
    onRunAudit={runRvtAudit}
    canRunAudit={!!rvtFile && rvtConvertStatus === 'idle' && !!user}
  />
```

- [ ] **Step 7: Add RVT tab to AppSidebar**

In `src/components/AppSidebar.tsx`, add a new tab button in the tabs section (following the DWG pattern). Add to the sidebar props:

```typescript
onUploadRvt: () => void;
```

And add the RVT tab button (after the DWG tab, using `FileBox` icon from lucide-react):

```tsx
<button
  type="button"
  onClick={() => onTabChange('rvt')}
  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold ${
    activeTab === 'rvt' ? 'bg-blue-600/20 text-blue-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
  }`}
>
  <FileBox className="h-3.5 w-3.5" />
  {t('sidebar.rvtAudit')}
</button>
```

- [ ] **Step 8: Pass onUploadRvt prop from App.tsx to AppSidebar**

In the `<AppSidebar>` usage in App.tsx, add:

```tsx
onUploadRvt={() => rvtInputRef.current?.click()}
```

- [ ] **Step 9: Verify build**

```bash
npm run lint
npm run build
```

Expected: No TypeScript errors, clean build.

- [ ] **Step 10: Commit**

```bash
git add src/lib/format.ts src/App.tsx src/components/AppSidebar.tsx
git commit -m "feat(rvt): integrate RVT upload, viewer, and audit flow into main app"
```

---

## Task 11: Manual E2E test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test RVT upload**

1. Navigate to `http://localhost:3000`
2. Log in
3. Click the "RVT Audit" tab in sidebar
4. Upload a `.rvt` file
5. Verify: file name + size shown, "Run RVT Audit" button visible

- [ ] **Step 3: Test audit flow (requires APS credentials)**

1. Click "Run RVT Audit"
2. Verify: progress states cycle through (uploading → converting → downloading)
3. Verify: audit results appear after conversion
4. Verify: credits deducted

- [ ] **Step 4: Test error cases**

1. Upload a file > 100MB → should reject immediately
2. Attempt audit with 0 credits → should show paywall
3. Verify: credits refunded if conversion fails

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(rvt): address issues found during E2E testing"
```
