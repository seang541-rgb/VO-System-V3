import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PlanName } from '../lib/plan-limits';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: PlanName;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export function useSubscription(userId?: string) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return null;
    }

    setSubscription((data as Subscription) ?? null);
    setLoading(false);
    return (data as Subscription) ?? null;
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const plan: PlanName = subscription?.plan ?? 'free';

  const isActive: boolean =
    plan === 'free' ||
    (subscription?.current_period_end != null &&
      new Date(subscription.current_period_end) > new Date());

  return {
    subscription,
    plan,
    isActive,
    loading,
    error,
    refresh,
  };
}
