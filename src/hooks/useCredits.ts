import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useCredits(userId?: string) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!userId) {
      setBalance(null);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('user_credits')
      .select('credits_balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return null;
    }

    const nextBalance = typeof data?.credits_balance === 'number' ? data.credits_balance : 0;
    setBalance(nextBalance);
    setLoading(false);
    return nextBalance;
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    balance,
    loading,
    error,
    refresh,
    setBalance,
  };
}
