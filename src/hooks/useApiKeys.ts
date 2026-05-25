import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type ApiScope = 'read' | 'write' | 'compare' | 'audit' | 'export';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ApiScope[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ApiUsageEntry {
  id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number | null;
  created_at: string;
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, last_used_at, expires_at, created_at')
      .order('created_at', { ascending: false });
    if (!error) setKeys((data ?? []) as ApiKey[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (
    name: string,
    scopes: ApiScope[] = ['read'],
    expiresInDays?: number,
  ): Promise<{ key: ApiKey; rawKey: string } | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Generate a random API key
    const rawKey = `vo_sk_${crypto.randomUUID().replace(/-/g, '')}`;
    const keyPrefix = rawKey.slice(0, 10);

    // Hash the key for storage (never store raw keys)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey));
    const keyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
      : null;

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes,
        expires_at: expiresAt,
      })
      .select('id, name, key_prefix, scopes, last_used_at, expires_at, created_at')
      .single();

    if (error) throw new Error(`Failed to create API key: ${error.message}`);
    await load();
    return { key: data as ApiKey, rawKey };
  }, [load]);

  const revoke = useCallback(async (id: string) => {
    await supabase.from('api_keys').delete().eq('id', id);
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }, []);

  const getUsage = useCallback(async (keyId: string, limit = 50): Promise<ApiUsageEntry[]> => {
    const { data, error } = await supabase
      .from('api_usage_log')
      .select('*')
      .eq('api_key_id', keyId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as ApiUsageEntry[];
  }, []);

  return { keys, loading, create, revoke, getUsage, reload: load };
}
