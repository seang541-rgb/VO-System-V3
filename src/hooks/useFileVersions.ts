import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface FileVersion {
  id: string;
  file_id: string;
  version: number;
  storage_path: string;
  file_size: number | null;
  checksum: string | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
}

export function useFileVersions(fileId: string | null) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!fileId) { setVersions([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('file_versions')
      .select('*')
      .eq('file_id', fileId)
      .order('version', { ascending: false });
    if (!error) setVersions((data ?? []) as FileVersion[]);
    setLoading(false);
  }, [fileId]);

  useEffect(() => { load(); }, [load]);

  const addVersion = useCallback(async (
    storagePath: string,
    opts?: { fileSize?: number; checksum?: string; notes?: string },
  ) => {
    if (!fileId) return null;
    const nextVersion = versions.length > 0 ? versions[0].version + 1 : 1;

    const { data, error } = await supabase
      .from('file_versions')
      .insert({
        file_id: fileId,
        version: nextVersion,
        storage_path: storagePath,
        file_size: opts?.fileSize ?? null,
        checksum: opts?.checksum ?? null,
        notes: opts?.notes ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create version: ${error.message}`);

    await supabase
      .from('project_files')
      .update({ current_version: nextVersion })
      .eq('id', fileId);

    await load();
    return data as FileVersion;
  }, [fileId, versions, load]);

  const removeVersion = useCallback(async (versionId: string) => {
    const { error } = await supabase.from('file_versions').delete().eq('id', versionId);
    if (error) throw new Error(`Failed to delete version: ${error.message}`);
    await load();
  }, [load]);

  return { versions, loading, addVersion, removeVersion, reload: load };
}
