# V2 Setup Checklist

> Run these steps after deploying the V2 codebase. Requires Supabase Dashboard and Stripe Dashboard access.

---

## 1. Database: Execute V2 Schema

**Where:** Supabase Dashboard > SQL Editor

**File:** `supabase/sql/v2-schema.sql`

Copy the entire file contents and run it. This creates:
- `projects` table + RLS
- `project_files` table + RLS
- `vo_comparisons` table + RLS
- `vo_exports` table + RLS
- `user_subscriptions` table + RLS + auto-insert trigger

**Verify:** Run `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;` — should include all 5 new tables plus existing ones.

---

## 2. Storage: Create Buckets

**Where:** Supabase Dashboard > Storage

### Bucket 1: `project-files`
- Click "New Bucket"
- Name: `project-files`
- Public: **OFF** (private)
- File size limit: 100 MB
- Allowed MIME types: `application/octet-stream` (or leave empty for any)

### Bucket 2: `exports`
- Click "New Bucket"
- Name: `exports`
- Public: **OFF** (private)
- File size limit: 50 MB

### Storage RLS Policies

For **both buckets**, add these policies in Storage > Policies:

**SELECT (download):**
```sql
-- Allow users to download their own files
CREATE POLICY "Users can download own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id IN ('project-files', 'exports') AND (storage.foldername(name))[1] = auth.uid()::text);
```

**INSERT (upload):**
```sql
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('project-files', 'exports') AND (storage.foldername(name))[1] = auth.uid()::text);
```

**DELETE:**
```sql
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id IN ('project-files', 'exports') AND (storage.foldername(name))[1] = auth.uid()::text);
```

---

## 3. Stripe: Create Subscription Products

**Where:** Stripe Dashboard > Products

### Pro Plan
- Name: "Idea Nest Pro"
- Price: RM 149/month (MYR, recurring, monthly)
- Copy the **Price ID** (starts with `price_...`)

### Enterprise Plan (optional for now)
- Name: "Idea Nest Enterprise"
- Price: RM 599/month (MYR, recurring, monthly)
- Copy the Price ID

### Set Secrets

**Where:** Supabase Dashboard > Project Settings > Edge Functions > Secrets

Add/update:
| Secret | Value |
|--------|-------|
| `STRIPE_PRO_PRICE_ID` | `price_xxx` (from Pro plan above) |
| `STRIPE_ENTERPRISE_PRICE_ID` | `price_xxx` (from Enterprise plan) |

### Deploy Edge Function

```bash
cd "D:\VO system"
npx supabase functions deploy create-subscription
```

### Update Stripe Webhook

In Stripe Dashboard > Developers > Webhooks, update your existing webhook endpoint to also listen for:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

(The existing `checkout.session.completed` stays.)

---

## 4. Deploy Frontend

```bash
cd "D:\VO system"
npm run build
# Deploy dist/ to your hosting (Vercel/Netlify/Cloudflare Pages)
```

Make sure your hosting has SPA fallback configured (all routes → `index.html`), since V2 uses React Router with browser history.

---

## 5. Verify

- [ ] Visit `/dashboard` — should show empty project list
- [ ] Create a project — should appear in list
- [ ] Click project → workspace loads
- [ ] Upload IFC files — should parse + save to Storage
- [ ] Run VO comparison — results should persist (refresh page, history shows)
- [ ] Visit `/settings` — shows plan, credits, language switcher
- [ ] Switch language — UI updates immediately
- [ ] Check Supabase Storage — files appear under `project-files/{user_id}/...`

---

## 6. Existing V1 Data

V1 `user_credits` table is **unchanged** — existing users keep their credits.
The new `user_subscriptions` trigger auto-creates a `free` plan row for new signups.
For existing users who don't have a subscription row yet, run:

```sql
INSERT INTO public.user_subscriptions (user_id, plan)
SELECT id, 'free' FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_subscriptions)
ON CONFLICT (user_id) DO NOTHING;
```
