import { X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPlanLimits, formatStorageSize, type PlanName } from '../lib/plan-limits';

interface UpgradePromptProps {
  open: boolean;
  currentPlan: PlanName;
  limitReached: 'projects' | 'comparisons' | 'copilot' | 'storage' | 'pdf';
  onUpgrade: (plan: PlanName) => void;
  onClose: () => void;
}

const LIMIT_MESSAGES: Record<
  UpgradePromptProps['limitReached'],
  { zh: string; en: string }
> = {
  projects: {
    zh: '您已达到免费版项目数量上限（3 个）。升级至专业版可创建无限项目。',
    en: 'You have reached the free plan project limit (3). Upgrade to Pro for unlimited projects.',
  },
  comparisons: {
    zh: '您已达到本月变更单比对次数上限。升级至专业版可无限次比对。',
    en: 'You have reached this month\'s comparison limit. Upgrade to Pro for unlimited comparisons.',
  },
  copilot: {
    zh: '您已达到本月 Copilot 查询上限（5 次）。升级至专业版每月可使用 100 次。',
    en: 'You have reached this month\'s Copilot query limit (5). Upgrade to Pro for 100 queries/month.',
  },
  storage: {
    zh: '您的存储空间已不足。升级至专业版可获得 5 GB 存储空间。',
    en: 'You have reached your storage limit. Upgrade to Pro for 5 GB of storage.',
  },
  pdf: {
    zh: 'PDF 导出功能仅限专业版及以上套餐使用。',
    en: 'PDF export is available on Pro and Enterprise plans only.',
  },
};

export default function UpgradePrompt({
  open,
  currentPlan,
  limitReached,
  onUpgrade,
  onClose,
}: UpgradePromptProps) {
  const { t, i18n } = useTranslation();
  const proLimits = getPlanLimits('pro');

  if (!open) return null;

  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
  const limitMessage = LIMIT_MESSAGES[limitReached][lang];

  const proFeatures = [
    t('upgrade.unlimitedProjects', { defaultValue: lang === 'zh' ? '无限项目数量' : 'Unlimited projects' }),
    t('upgrade.unlimitedVO', { defaultValue: lang === 'zh' ? '无限变更单比对' : 'Unlimited VO comparisons' }),
    t('upgrade.copilotQuota', {
      defaultValue: lang === 'zh'
        ? `每月 ${proLimits.maxCopilotPerMonth} 次 Copilot 查询`
        : `${proLimits.maxCopilotPerMonth} Copilot queries/month`,
    }),
    t('upgrade.pdfExport', { defaultValue: lang === 'zh' ? 'PDF 导出' : 'PDF export' }),
    t('upgrade.storage', {
      defaultValue: lang === 'zh'
        ? `${formatStorageSize(proLimits.maxStorageBytes)} 存储空间`
        : `${formatStorageSize(proLimits.maxStorageBytes)} storage`,
    }),
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-white">
              {lang === 'zh' ? '升级到专业版' : 'Upgrade to Pro'}
            </h2>
          </div>
          <button
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Limit message */}
          <p className="text-sm text-slate-300">{limitMessage}</p>

          {/* Pro features */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-600/5 p-4 space-y-2">
            <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider">
              {lang === 'zh' ? '专业版包含' : 'Pro includes'}
            </p>
            <ul className="space-y-1.5">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Current plan note */}
          {currentPlan !== 'free' && (
            <p className="text-[11px] text-slate-500">
              {lang === 'zh'
                ? `当前套餐：${currentPlan}`
                : `Current plan: ${currentPlan}`}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-slate-700 px-6 py-4">
          <button
            type="button"
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
            onClick={() => onUpgrade('pro')}
          >
            <Zap size={12} />
            {lang === 'zh' ? '升级至专业版' : 'Upgrade to Pro'}
          </button>
        </div>
      </div>
    </div>
  );
}
