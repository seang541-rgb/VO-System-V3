# RVT Web Reader — Design Spec

**Date**: 2026-06-04
**Status**: Approved
**Scope**: Add RVT file support to IdeaNest V1 — browser-based 3D preview + full audit via APS cloud conversion

---

## 1. Problem

IdeaNest V1 only supports IFC files. Malaysian construction industry users frequently work with Revit (.rvt) files and currently must manually convert to IFC before using the tool. This adds friction and excludes users who don't have Revit installed.

## 2. Solution Overview

Hybrid approach using Autodesk Platform Services (APS):

- **Preview**: APS Viewer (embedded, free) for instant 3D viewing + basic property inspection
- **Audit**: APS Model Derivative API converts RVT → IFC server-side, then feeds into existing web-ifc audit engine (zero changes to audit logic)
- **Backend**: Supabase Edge Functions handle APS authentication, file upload, conversion orchestration, and IFC delivery
- **Billing**: Credit-based — RVT audit is a paid feature, IFC audit remains free

## 3. Architecture

```
Browser (React + Vite)
├── File Drop Zone
│   ├── .ifc → existing web-ifc flow (free, unchanged)
│   └── .rvt → new RVT flow:
│       ├── [Instant] APS Viewer embed (3D preview + properties)
│       └── [On demand] "Run Audit" button
│           ├── Credit check → insufficient: show top-up prompt
│           └── Sufficient: deduct credits → call Edge Function
│
Supabase Edge Functions
├── POST /rvt-token        → 2-legged OAuth, return short-lived APS token (for Viewer)
├── POST /rvt-convert      → upload RVT to OSS, start Model Derivative job, return job ID
├── GET  /rvt-status/:id   → poll translation status
└── GET  /rvt-download/:id → download converted IFC, return as arraybuffer
│
Autodesk Platform Services
├── Authentication (2-legged OAuth)
├── OSS (transient bucket, 24h auto-delete)
├── Model Derivative (RVT → IFC translation)
└── Viewer (embedded 3D, free tier)
```

## 4. Supabase Edge Functions

### 4.1 `rvt-token`

- **Purpose**: Generate short-lived APS access token for Viewer embed
- **Auth**: Requires valid Supabase user session
- **Flow**: 2-legged OAuth with `viewables:read` scope only
- **Response**: `{ access_token, expires_in }`
- **Security**: APS_CLIENT_ID and APS_CLIENT_SECRET stored in Supabase secrets, never exposed to client

### 4.2 `rvt-convert`

- **Purpose**: Initiate RVT → IFC cloud conversion (two-phase: get upload URL, then start job)
- **Auth**: Requires valid Supabase user session + sufficient credits
- **Phase 1 — `POST /rvt-convert/init`**:
  1. Verify credit balance (deduct N credits)
  2. 2-legged OAuth with `data:read data:write data:create bucket:create bucket:read` scope
  3. Create/reuse transient bucket
  4. Generate signed S3 upload URL for the RVT file
  5. Store job metadata in `rvt_jobs` (status: pending)
  6. Return `{ job_id, upload_url, upload_key }`
- **Phase 2 — `POST /rvt-convert/start`** (called after client uploads directly to APS):
  1. Finalize upload via APS signed S3 complete endpoint
  2. Submit Model Derivative job (output: IFC)
  3. Update `rvt_jobs` status to processing
  4. Return `{ job_id, urn }`
- **Why two phases**: RVT files can be ~100MB. Client uploads directly to APS via signed URL, bypassing Edge Function body size limits.
- **Size limit**: 100MB (match existing IFC limit, validated client-side)
- **Credit cost**: 3 credits per conversion (configurable via env var)

### 4.3 `rvt-status`

- **Purpose**: Poll conversion progress
- **Auth**: Requires valid Supabase user session, must own the job
- **Flow**: GET APS manifest for the URN, return status + progress
- **Response**: `{ status: 'pending' | 'processing' | 'success' | 'failed', progress: string }`

### 4.4 `rvt-download`

- **Purpose**: Download converted IFC after successful translation
- **Auth**: Requires valid Supabase user session, must own the job
- **Flow**: Download IFC derivative from APS, stream to client
- **Response**: IFC file as `application/octet-stream`
- **Cleanup**: Mark job as downloaded in `rvt_jobs` table

## 5. Database Schema

### Table: `rvt_jobs`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| urn | text | APS URN (base64-encoded object ID) |
| status | text | pending / processing / success / failed / downloaded |
| credits_charged | integer | Credits deducted for this job |
| file_name | text | Original RVT filename |
| file_size | bigint | File size in bytes |
| created_at | timestamptz | Job creation time |
| completed_at | timestamptz | When translation finished |
| error_message | text | Error details if failed |

**RLS Policy**: Users can only read/update their own jobs.

## 6. Frontend Changes

### 6.1 File Upload (App.tsx)

- Extend file drop zone to accept `.rvt` in addition to `.ifc`
- Detect file extension → route to appropriate flow
- New state: `fileType: 'ifc' | 'rvt'`

### 6.2 RVT Viewer Component (new: `RvtViewer.tsx`)

- Embed APS Viewer via `<iframe>` or Viewer JS SDK
- Load on RVT upload, fetch token from `rvt-token` Edge Function
- Display 3D model + property panel (built into APS Viewer)
- Show banner: "RVT Preview — Run Audit for full analysis (3 credits)"

### 6.3 RVT Conversion Flow (new: `rvt-convert.ts`)

- Client-side orchestration:
  1. Call `rvt-convert` Edge Function with the RVT file
  2. Show progress bar, poll `rvt-status` every 8 seconds
  3. On success: call `rvt-download` to get IFC arraybuffer
  4. Feed IFC into existing `BimEngine` → `runAudit()` flow
- Handle errors: insufficient credits, conversion failure, timeout
- Timeout: 15 minutes max polling, then show error

### 6.4 Credit Check Integration

- Before starting conversion, check credit balance via existing `useCredits` hook
- If insufficient: show modal with top-up options (existing Stripe flow)
- On success: deduct credits, show remaining balance

### 6.5 UI States

```
RVT Upload States:
  uploading → previewing (Viewer loaded) → idle
  
RVT Audit States:
  idle → credit_check → uploading_to_cloud → converting → downloading_ifc → auditing → done
  
Error States:
  insufficient_credits | upload_failed | conversion_failed | conversion_timeout | download_failed
```

## 7. APS Viewer Integration

- Use Autodesk Viewer v7 JS SDK (CDN loaded)
- Token refresh: `rvt-token` Edge Function returns short-lived token, Viewer SDK handles refresh callback
- Viewer config: disable unnecessary toolbar buttons, match IdeaNest dark theme
- Alternative: if Viewer SDK is too heavy, can use `<iframe>` embed URL from APS

## 8. Cost & Pricing

| Item | Cost | User Price |
|------|------|------------|
| APS Viewer | Free | Free (included in RVT preview) |
| Model Derivative (per conversion) | ~$0.5–2 | 3 credits (configurable) |
| OSS Storage | Free (transient) | — |

Credit pricing inherits from existing Stripe integration. Suggested: 3 credits per RVT audit to cover APS cost + margin.

## 9. Security

- APS credentials never leave Supabase Edge Functions
- All Edge Functions require valid Supabase auth token
- RVT files uploaded to transient bucket (auto-deleted in 24h)
- RLS on `rvt_jobs` table: users see only their own jobs
- Rate limit: max 5 concurrent conversions per user

## 10. Error Handling

| Scenario | Handling |
|----------|----------|
| RVT file > 100MB | Reject at client before upload |
| APS auth failure | Retry once, then show error + contact support |
| Conversion fails | Refund credits, show APS error message |
| Conversion timeout (>15min) | Refund credits, suggest smaller file |
| Network interruption during upload | Allow retry without re-deducting credits (check `rvt_jobs`) |
| IFC download fails | Allow retry from `rvt-download` (conversion result cached in APS) |

## 11. Scope Boundaries

### In scope
- RVT file upload + APS Viewer preview
- RVT → IFC conversion via Edge Functions
- Credit-based billing for RVT audit
- `rvt_jobs` table + RLS
- Error handling + credit refund on failure

### Out of scope (future)
- RVT version detection / compatibility warnings
- Batch RVT conversion
- RVT-specific property mapping (beyond what IFC conversion preserves)
- RVT comparison (VO diff between two RVT files)
- Caching converted IFC for re-audit without re-conversion
- LiDAR integration
