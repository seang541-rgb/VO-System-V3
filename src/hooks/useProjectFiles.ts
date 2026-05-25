import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadProjectFile, deleteProjectFile } from '../lib/storage';

export type FileRole = 'base' | 'revision' | 'bq' | 'contract' | 'other';

export interface ProjectFile {
  id: string;
  project_id: string;
  label: string;
  role: FileRole;
  storage_path: string;
  file_size: number;
  element_count: number | null;
  uploaded_at: string;
}

export function useProjectFiles(projectId?: string) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!projectId) {
      setFiles([]);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return null;
    }

    setFiles((data as ProjectFile[]) ?? []);
    setLoading(false);
    return (data as ProjectFile[]) ?? [];
  }, [projectId]);

  const upload = useCallback(
    async (
      userId: string,
      file: File,
      label: string,
      role: FileRole,
      elementCount?: number,
    ): Promise<ProjectFile | null> => {
      if (!projectId) return null;

      // Generate a unique file ID
      const fileId = crypto.randomUUID();

      let storagePath: string;
      let fileSize: number;

      try {
        const result = await uploadProjectFile(userId, projectId, fileId, file);
        storagePath = result.storagePath;
        fileSize = result.fileSize;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
        return null;
      }

      const { data, error: insertError } = await supabase
        .from('project_files')
        .insert({
          id: fileId,
          project_id: projectId,
          label,
          role,
          storage_path: storagePath,
          file_size: fileSize,
          element_count: elementCount ?? null,
        })
        .select()
        .single();

      if (insertError || !data) {
        // Cleanup storage on DB error
        try {
          await deleteProjectFile(storagePath);
        } catch {
          // Ignore cleanup errors
        }
        setError(insertError?.message ?? 'Failed to save file record');
        return null;
      }

      const projectFile = data as ProjectFile;
      setFiles((prev) => [projectFile, ...prev]);
      return projectFile;
    },
    [projectId],
  );

  const deleteFile = useCallback(async (fileId: string): Promise<void> => {
    // Fetch storage path before deletion
    const { data, error: fetchError } = await supabase
      .from('project_files')
      .select('storage_path')
      .eq('id', fileId)
      .single();

    if (fetchError || !data) {
      setError(fetchError?.message ?? 'File not found');
      return;
    }

    const { error: deleteError } = await supabase
      .from('project_files')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    // Delete storage file (best-effort)
    try {
      await deleteProjectFile((data as { storage_path: string }).storage_path);
    } catch {
      // Ignore storage delete errors
    }

    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const baseFiles = files.filter((f) => f.role === 'base');
  const revisionFiles = files.filter((f) => f.role === 'revision');
  const bqFiles = files.filter((f) => f.role === 'bq');
  const contractFiles = files.filter((f) => f.role === 'contract');

  return {
    files,
    baseFiles,
    revisionFiles,
    bqFiles,
    contractFiles,
    loading,
    error,
    refresh,
    upload,
    deleteFile,
  };
}
