import { supabase } from './lib/supabase';
import type { BqLineItem } from './vo-diff-core';

const NVIDIA_EMBED_ENDPOINT = 'https://integrate.api.nvidia.com/v1/embeddings';
const EMBED_MODEL = 'nvidia/nv-embedqa-e5-v5';

interface VectorMatchResult {
  itemReference: string;
  description: string;
  unit: string;
  contractRate: number;
  similarity: number;
}

export async function uploadBqEmbeddings(projectId: string, items: BqLineItem[]): Promise<{ ok: boolean; embedded: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await supabase.functions.invoke('embed-bq', {
    body: {
      projectId,
      items: items.map((i) => ({
        itemReference: i.itemReference,
        description: i.description,
        unit: i.unit,
        contractRate: i.contractRate,
      })),
    },
  });

  if (res.error) throw new Error(res.error.message);
  return res.data as { ok: boolean; embedded: number };
}

export async function semanticBqMatch(
  projectId: string,
  queryText: string,
  limit = 5,
  threshold = 0.3,
): Promise<VectorMatchResult[]> {
  const queryEmbedding = await getQueryEmbedding(queryText);
  if (!queryEmbedding) return [];

  const { data, error } = await supabase.rpc('match_bq_items', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_project_id: projectId,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) throw new Error(`Vector match failed: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    itemReference: r.item_reference as string,
    description: r.description as string,
    unit: r.unit as string,
    contractRate: Number(r.contract_rate),
    similarity: Number(r.similarity),
  }));
}

async function getQueryEmbedding(text: string): Promise<number[] | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const res = await supabase.functions.invoke('embed-bq', {
    body: { __queryOnly: true, text },
  });

  if (res.error || !res.data?.embedding) return null;
  return res.data.embedding as number[];
}

export async function hasBqEmbeddings(projectId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('bq_embeddings')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) return false;
  return (count ?? 0) > 0;
}
