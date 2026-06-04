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
