import { supabase } from './supabase';

const PROJECT_FILES_BUCKET = 'project-files';
const EXPORTS_BUCKET = 'exports';
const MAX_IFC_SIZE = 100 * 1024 * 1024; // 100 MB

export interface UploadResult {
  storagePath: string;
  fileSize: number;
}

export async function uploadProjectFile(
  userId: string,
  projectId: string,
  fileId: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_IFC_SIZE) {
    throw new Error(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 100 MB.`);
  }

  const storagePath = `${userId}/${projectId}/${fileId}.ifc`;

  const { error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return { storagePath, fileSize: file.size };
}

export async function downloadProjectFile(storagePath: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Download failed: ${error?.message ?? 'No data returned'}`);
  }

  return data.arrayBuffer();
}

export async function deleteProjectFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

export async function uploadExport(
  userId: string,
  projectId: string,
  exportId: string,
  blob: Blob,
  format: 'xlsx' | 'pdf',
): Promise<string> {
  const storagePath = `${userId}/${projectId}/${exportId}.${format}`;

  const { error } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .upload(storagePath, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf',
    });

  if (error) {
    throw new Error(`Export upload failed: ${error.message}`);
  }

  return storagePath;
}

export async function getExportDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate download URL: ${error?.message ?? 'Unknown error'}`);
  }

  return data.signedUrl;
}

export async function getUserStorageUsage(userId: string): Promise<number> {
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId);

  if (!projects || projects.length === 0) return 0;

  const projectIds = projects.map((p) => p.id);
  const { data: files } = await supabase
    .from('project_files')
    .select('file_size')
    .in('project_id', projectIds);

  if (!files) return 0;
  return files.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
}
