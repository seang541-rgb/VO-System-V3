import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { useSubscription } from '../hooks/useSubscription';
import { useCredits } from '../hooks/useCredits';
import { getPlanLimits, formatStorageSize } from '../lib/plan-limits';
import PlanBadge from '../components/PlanBadge';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { subscription, plan } = useSubscription(user?.id);
  const { balance } = useCredits(user?.id);
  const limits = getPlanLimits(plan);

  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-lg font-semibold text-white">{t('settings.title')}</h1>

      {/* Account */}
      <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 space-y-3">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {t('settings.account')}
        </h2>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{t('settings.email')}</span>
          <span className="text-xs text-white">{user?.email ?? '—'}</span>
        </div>
      </section>

      {/* Subscription */}
      <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 space-y-4">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {t('settings.subscription')}
        </h2>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{t('settings.currentPlan')}</span>
          <PlanBadge plan={plan} />
        </div>

        {renewalDate && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {t('settings.renewal', { defaultValue: 'Renewal date' })}
            </span>
            <span className="text-xs text-white">{renewalDate}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{t('billing.credits')}</span>
          <span className="text-xs text-white">
            {balance !== null ? balance : '—'}
          </span>
        </div>

        <div className="pt-1">
          {plan === 'free' ? (
            <button
              type="button"
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
              onClick={() => {
                // TODO: invoke create-subscription
              }}
            >
              {t('settings.upgrade')}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-slate-600 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
              onClick={() => {
                // TODO: open Stripe Customer Portal
              }}
            >
              {t('settings.managePlan')}
            </button>
          )}
        </div>
      </section>

      {/* Language */}
      <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 space-y-3">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {t('settings.language')}
        </h2>
        <LanguageSwitcher />
      </section>

      {/* Usage */}
      <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 space-y-3">
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {t('settings.usage')}
        </h2>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{t('settings.comparisonsThisMonth')}</span>
          <span className="text-xs text-white">
            {'— '}
            {limits.maxComparisonsPerMonth !== Infinity && (
              <span className="text-slate-500">
                / {limits.maxComparisonsPerMonth}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{t('settings.storageUsed')}</span>
          <span className="text-xs text-white">
            {'— '}
            <span className="text-slate-500">
              / {formatStorageSize(limits.maxStorageBytes)}
            </span>
          </span>
        </div>
      </section>
    </div>
  );
}
