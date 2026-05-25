// Supabase Edge Function: embed-bq
// Generates vector embeddings for BQ line items using NVIDIA NIM embedding API.
// Called when a user uploads a BQ file — stores embeddings in bq_embeddings table.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NVIDIA_EMBED_ENDPOINT = 'https://integrate.api.nvidia.com/v1/embeddings';
const EMBED_MODEL = 'nvidia/nv-embedqa-e5-v5';
const BATCH_SIZE = 32;

interface BqItem {
  itemReference: string;
  description: string;
  unit: string;
  contractRate: number;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(NVIDIA_EMBED_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
      input_type: 'passage',
      encoding_format: 'float',
      truncate: 'END',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`NVIDIA embedding API failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const nvidiaKey = Deno.env.get('NVIDIA_API_KEY');
    if (!nvidiaKey) return jsonResponse(500, { error: 'Missing NVIDIA_API_KEY secret.' });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { error: 'Missing Authorization header.' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify user
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) return jsonResponse(401, { error: 'Unauthorized.' });

    const body = await req.json();

    // Query-only mode: embed a single text for semantic search
    if (body.__queryOnly && typeof body.text === 'string') {
      const [embedding] = await embedBatch([body.text], nvidiaKey);
      return jsonResponse(200, { embedding });
    }

    const projectId = body.projectId as string;
    const items = body.items as BqItem[];

    if (!projectId || !items?.length) {
      return jsonResponse(400, { error: 'projectId and items[] are required.' });
    }

    // Verify project ownership
    const { data: project } = await anonClient
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!project) return jsonResponse(403, { error: 'Project not found or not yours.' });

    // Delete existing embeddings for this project (re-upload replaces)
    await supabase.from('bq_embeddings').delete().eq('project_id', projectId);

    // Generate embeddings in batches
    const texts = items.map((item) =>
      `${item.itemReference} | ${item.description} | ${item.unit}`
    );

    const allEmbeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const embeddings = await embedBatch(batch, nvidiaKey);
      allEmbeddings.push(...embeddings);
    }

    // Insert into bq_embeddings
    const rows = items.map((item, i) => ({
      project_id: projectId,
      item_reference: item.itemReference,
      description: item.description,
      unit: item.unit,
      contract_rate: item.contractRate,
      embedding: JSON.stringify(allEmbeddings[i]),
    }));

    const { error: insertError } = await supabase.from('bq_embeddings').insert(rows);
    if (insertError) {
      return jsonResponse(500, { error: `Insert failed: ${insertError.message}` });
    }

    return jsonResponse(200, {
      ok: true,
      embedded: items.length,
      dimensions: allEmbeddings[0]?.length ?? 0,
    });
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
