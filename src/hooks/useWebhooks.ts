import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type WebhookEvent =
  | 'comparison.completed'
  | 'report.generated'
  | 'audit.completed'
  | 'file.uploaded'
  | 'threshold.exceeded';

export interface Webhook {
  id: string;
  user_id: string;
  project_id: string | null;
  url: string;
  events: WebhookEvent[];
  secret: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status_code: number | null;
  response_body: string | null;
  delivered_at: string;
}

export function useWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setWebhooks((data ?? []) as Webhook[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (
    url: string,
    events: WebhookEvent[],
    projectId?: string,
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Generate a random secret for HMAC verification
    const secret = crypto.randomUUID();

    const { data, error } = await supabase
      .from('webhooks')
      .insert({
        user_id: user.id,
        project_id: projectId ?? null,
        url,
        events,
        secret,
        enabled: true,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create webhook: ${error.message}`);
    await load();
    return data as Webhook;
  }, [load]);

  const update = useCallback(async (id: string, fields: Partial<Pick<Webhook, 'url' | 'events' | 'enabled'>>) => {
    const { error } = await supabase
      .from('webhooks')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to update webhook: ${error.message}`);
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    await supabase.from('webhooks').delete().eq('id', id);
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const getDeliveries = useCallback(async (webhookId: string, limit = 20): Promise<WebhookDelivery[]> => {
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('delivered_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as WebhookDelivery[];
  }, []);

  return { webhooks, loading, create, update, remove, getDeliveries, reload: load };
}

// Client-side event dispatcher — triggers webhook delivery via Edge Function
export async function dispatchWebhookEvent(
  eventType: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.functions.invoke('dispatch-webhook', {
      body: { eventType, payload },
    });
  } catch {
    // Webhook delivery is best-effort — don't block the main flow
  }
}
