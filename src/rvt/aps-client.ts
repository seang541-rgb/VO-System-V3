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
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_DURATION_MS) {
    const headers = await getAuthHeaders();
    const res = await fetch(fnUrl('rvt-status'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ job_id: jobId }),
    });
    const data: RvtStatusResponse = await res.json();
    if (!res.ok) throw new Error((data as unknown as Record<string, string>).error || `Status check failed`);

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
