import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Webhook, Key, Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useSubscription } from '../hooks/useSubscription';
import { useCredits } from '../hooks/useCredits';
import { useUsageStats } from '../hooks/useUsageStats';
import { getPlanLimits, formatStorageSize } from '../lib/plan-limits';
import { useWebhooks, type WebhookEvent } from '../hooks/useWebhooks';
import { useApiKeys, type ApiScope } from '../hooks/useApiKeys';
import PlanBadge from '../components/PlanBadge';
import LanguageSwitcher from '../components/LanguageSwitcher';

const WEBHOOK_EVENT_OPTIONS: { value: WebhookEvent; label: string }[] = [
  { value: 'comparison.completed', label: 'Comparison Completed' },
  { value: 'report.generated', label: 'Report Generated' },
  { value: 'audit.completed', label: 'Audit Completed' },
  { value: 'file.uploaded', label: 'File Uploaded' },
  { value: 'threshold.exceeded', label: 'Cost Threshold Exceeded' },
];

const API_SCOPE_OPTIONS: { value: ApiScope; label: string }[] = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'compare', label: 'Compare' },
  { value: 'audit', label: 'Audit' },
  { value: 'export', label: 'Export' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { subscription, plan } = useSubscription(user?.id);
  const { balance } = useCredits(user?.id);
  const { comparisonsThisMonth, storageUsedBytes } = useUsageStats(user?.id);
  const limits = getPlanLimits(plan);

  // Webhooks
  const { webhooks, create: createWebhook, update: updateWebhook, remove: removeWebhook } = useWebhooks();
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<WebhookEvent[]>(['comparison.completed']);
  const [showWebhookForm, setShowWebhookForm] = useState(false);

  // API Keys
  const { keys: apiKeys, create: createApiKey, revoke: revokeApiKey } = useApiKeys();
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<ApiScope[]>(['read']);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showRevealedKey, setShowRevealedKey] = useState(false);

  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Slim top bar with back button */}
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-lg font-semibold text-white">{t('settings.title')}</h1>
      </div>

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
            {comparisonsThisMonth}
            {limits.maxComparisonsPerMonth !== Infinity && (
              <span className="text-slate-500">
                {' '}/ {limits.maxComparisonsPerMonth}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{t('settings.storageUsed')}</span>
          <span className="text-xs text-white">
            {formatStorageSize(storageUsedBytes)}
            <span className="text-slate-500">
              {' '}/ {formatStorageSize(limits.maxStorageBytes)}
            </span>
          </span>
        </div>
      </section>

      {/* Webhooks */}
      <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Webhook className="h-3.5 w-3.5" /> Webhooks
          </h2>
          <button
            type="button"
            onClick={() => setShowWebhookForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-blue-500/50 hover:text-blue-300"
          >
            <Plus className="h-3 w-3" /> 新增
          </button>
        </div>

        {showWebhookForm && (
          <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4 space-y-3">
            <input
              type="url"
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-600 focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENT_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={newWebhookEvents.includes(opt.value)}
                    onChange={(e) => {
                      setNewWebhookEvents((prev) =>
                        e.target.checked ? [...prev, opt.value] : prev.filter((v) => v !== opt.value),
                      );
                    }}
                    className="rounded border-slate-600"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={!newWebhookUrl.trim() || newWebhookEvents.length === 0}
              onClick={async () => {
                await createWebhook(newWebhookUrl, newWebhookEvents);
                setNewWebhookUrl('');
                setNewWebhookEvents(['comparison.completed']);
                setShowWebhookForm(false);
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              创建 Webhook
            </button>
          </div>
        )}

        {webhooks.length === 0 && !showWebhookForm && (
          <div className="text-[11px] text-slate-500">暂无 Webhook。点击「新增」添加一个接收项目事件通知的端点。</div>
        )}

        {webhooks.map((wh) => (
          <div key={wh.id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-white font-mono">{wh.url}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {wh.events.map((ev) => (
                  <span key={ev} className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{ev}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button
                type="button"
                onClick={() => void updateWebhook(wh.id, { enabled: !wh.enabled })}
                className={`rounded-lg px-2 py-1 text-[11px] ${wh.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-500'}`}
              >
                {wh.enabled ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => void removeWebhook(wh.id)}
                className="rounded p-1 text-slate-500 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* API Keys */}
      <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Key className="h-3.5 w-3.5" /> API Keys
          </h2>
          <button
            type="button"
            onClick={() => setShowKeyForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-blue-500/50 hover:text-blue-300"
          >
            <Plus className="h-3 w-3" /> 生成密钥
          </button>
        </div>

        {showKeyForm && (
          <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4 space-y-3">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. CI Pipeline)"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-600 focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              {API_SCOPE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={newKeyScopes.includes(opt.value)}
                    onChange={(e) => {
                      setNewKeyScopes((prev) =>
                        e.target.checked ? [...prev, opt.value] : prev.filter((v) => v !== opt.value),
                      );
                    }}
                    className="rounded border-slate-600"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={!newKeyName.trim() || newKeyScopes.length === 0}
              onClick={async () => {
                const result = await createApiKey(newKeyName, newKeyScopes);
                if (result) {
                  setRevealedKey(result.rawKey);
                  setShowRevealedKey(true);
                }
                setNewKeyName('');
                setNewKeyScopes(['read']);
                setShowKeyForm(false);
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              生成 API Key
            </button>
          </div>
        )}

        {revealedKey && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
            <div className="text-[11px] font-semibold text-amber-300">⚠️ 密钥只显示一次，请立即复制保存</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-black/30 px-3 py-1.5 font-mono text-xs text-amber-100">
                {showRevealedKey ? revealedKey : '•'.repeat(40)}
              </code>
              <button
                type="button"
                onClick={() => setShowRevealedKey((v) => !v)}
                className="rounded p-1.5 text-slate-400 hover:text-white"
              >
                {showRevealedKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(revealedKey)}
                className="rounded p-1.5 text-slate-400 hover:text-white"
                title="Copy"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setRevealedKey(null); setShowRevealedKey(false); }}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              我已保存，关闭
            </button>
          </div>
        )}

        {apiKeys.length === 0 && !showKeyForm && !revealedKey && (
          <div className="text-[11px] text-slate-500">暂无 API Key。生成一个密钥以通过 REST API 访问 VO System。</div>
        )}

        {apiKeys.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-white">{k.name}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <code className="text-[11px] font-mono text-slate-400">{k.key_prefix}…</code>
                <div className="flex gap-1">
                  {k.scopes.map((s) => (
                    <span key={s} className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{s}</span>
                  ))}
                </div>
              </div>
              {k.last_used_at && (
                <div className="mt-0.5 text-[10px] text-slate-500">
                  Last used: {new Date(k.last_used_at).toLocaleDateString()}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void revokeApiKey(k.id)}
              className="ml-3 rounded p-1 text-slate-500 hover:text-red-400"
              title="Revoke"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
