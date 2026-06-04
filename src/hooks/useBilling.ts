import { useEffect, useRef, useState } from 'react';
import type { BimComponent, BqLineItem, VoComparisonResults } from '../BimEngine';
import { exportVoSubstantiationWorkbook } from '../vo-report';
import { buildBqMappingContext, formatSignedCurrencyValue } from '../lib/format';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { useLang } from '../i18n/LanguageContext';

const CHECKOUT_BALANCE_STORAGE_KEY = 'vo-system:checkout-balance';
const CHECKOUT_CREDIT_TOP_UP_AMOUNT = 50;

export function useBilling(deps: {
  user: { id: string } | null;
  creditsBalance: number | null;
  refreshCredits: () => Promise<number | null>;
  setCreditsBalance: (balance: number) => void;
  setSysLog: (msg: string) => void;
  voResults: VoComparisonResults | null;
  v1File: File | null;
  v2File: File | null;
  bqItems: BqLineItem[];
  labelMappings: Record<string, string>;
}) {
  const { t } = useLang();
  const [billingError, setBillingError] = useState('');
  const [billingNotice, setBillingNotice] = useState<{ tone: 'success' | 'info'; message: string } | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const handledCheckoutStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !deps.user) return;

    const searchParams = new URLSearchParams(window.location.search);
    const checkoutState = searchParams.get('checkout');
    if (!checkoutState) return;

    const handledKey = `${deps.user.id}:${checkoutState}`;
    if (handledCheckoutStateRef.current === handledKey) return;
    handledCheckoutStateRef.current = handledKey;

    const clearCheckoutState = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
      window.sessionStorage.removeItem(CHECKOUT_BALANCE_STORAGE_KEY);
    };

    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const handleCheckoutReturn = async () => {
      if (checkoutState === 'success') {
        const storedBalance = window.sessionStorage.getItem(CHECKOUT_BALANCE_STORAGE_KEY);
        const baselineBalance = Number.isFinite(Number(storedBalance)) ? Number(storedBalance) : (deps.creditsBalance ?? 0);
        const targetBalance = baselineBalance + CHECKOUT_CREDIT_TOP_UP_AMOUNT;

        try {
          let refreshedBalance: number | null = null;

          for (let attempt = 0; attempt < 6; attempt += 1) {
            refreshedBalance = await deps.refreshCredits();
            if (typeof refreshedBalance === 'number' && refreshedBalance >= targetBalance) {
              break;
            }
            if (attempt < 5) {
              await sleep(1500);
            }
          }

          setShowPaywall(false);
          setBillingError('');

          if (typeof refreshedBalance === 'number' && refreshedBalance >= targetBalance) {
            setBillingNotice({ tone: 'success', message: 'Top-up successful. Your credit balance has been refreshed.' });
            deps.setSysLog('Stripe Checkout completed successfully. Credit balance refreshed from the cloud.');
          } else {
            setBillingNotice({ tone: 'info', message: 'Payment succeeded, but credit sync is still pending. Refresh again in a few seconds if the new balance does not appear yet.' });
            deps.setSysLog('Stripe Checkout returned successfully, but webhook credit sync did not finish within the polling window.');
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Top-up may have completed, but credit refresh failed.';
          setBillingError(message);
          deps.setSysLog(`Stripe return refresh failed: ${message}`);
        } finally {
          clearCheckoutState();
        }
        return;
      }

      if (checkoutState === 'cancelled') {
        setBillingNotice({ tone: 'info', message: 'Stripe Checkout was cancelled. No credits were added.' });
        deps.setSysLog('Stripe Checkout was cancelled before payment completion.');
        clearCheckoutState();
      }
    };

    void handleCheckoutReturn();
  }, [deps.creditsBalance, deps.refreshCredits, deps.user]);

  const exportWorkbook = async () => {
    if (!deps.voResults || !deps.user || isExporting) return;

    setIsExporting(true);
    setBillingError('');

    try {
      const { data, error } = await supabase.rpc('consume_credit');

      if (error) {
        if (error.message?.includes('NO_CREDITS')) {
          deps.setCreditsBalance(0);
          setShowPaywall(true);
          setBillingError('No premium audit credits remaining. Top up before generating another Excel report.');
          deps.setSysLog('Excel export blocked: credits exhausted.');
          return;
        }

        throw error;
      }

      if (typeof data?.credits_balance === 'number') {
        deps.setCreditsBalance(data.credits_balance);
      } else {
        await deps.refreshCredits();
      }

      exportVoSubstantiationWorkbook(deps.voResults, {
        baseModelName: deps.v1File?.name ?? '',
        revisionModelName: deps.v2File?.name ?? '',
        pricingContext: buildBqMappingContext(deps.bqItems, deps.labelMappings),
      });
      deps.setSysLog('Premium VO Excel generated. One audit credit consumed from the secure cloud balance.');
      toast.success(t('toast.excelExported'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to validate cloud credits.';
      setBillingError(message);
      deps.setSysLog(`Excel export blocked: ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleTopUpCheckout = async () => {
    if (!deps.user || isStartingCheckout) return;

    setIsStartingCheckout(true);
    setBillingError('');
    setBillingNotice(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(CHECKOUT_BALANCE_STORAGE_KEY, String(deps.creditsBalance ?? 0));
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { user_id: deps.user.id },
      });

      if (error) {
        throw error;
      }

      const url = typeof data?.url === 'string' ? data.url : '';
      if (!url) {
        throw new Error('Checkout session URL was not returned by the payment gateway.');
      }

      deps.setSysLog('Redirecting to Stripe Checkout for credit top-up...');
      window.location.href = url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start Stripe Checkout.';
      setBillingError(message);
      deps.setSysLog(`Stripe Checkout bootstrap failed: ${message}`);
    } finally {
      setIsStartingCheckout(false);
    }
  };

  return {
    billingError, billingNotice,
    showPaywall, setShowPaywall,
    isStartingCheckout, isExporting,
    exportWorkbook,
    handleTopUpCheckout,
  };
}
