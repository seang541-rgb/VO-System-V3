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

const LIMIT_KEY: Record<UpgradePromptProps['limitReached'], string> = {
  projects: 'upgrade.limitProjects',
  comparisons: 'upgrade.limitComparisons',
  copilot: 'upgrade.limitCopilot',
  storage: 'upgrade.limitStorage',
  pdf: 'upgrade.limitPdf',
};

export default function UpgradePrompt({
  open,
  currentPlan,
  limitReached,
  onUpgrade,
  onClose,
}: UpgradePromptProps) {
  const { t } = useTranslation();
  const proLimits = getPlanLimits('pro');

  if (!open) return null;

  const limitMessage = t(LIMIT_KEY[limitReached]);

  const proFeatures = [
    t('upgrade.unlimitedProjects'),
    t('upgrade.unlimitedVO'),
    t('upgrade.copilotQuota', { count: proLimits.maxCopilotPerMonth }),
    t('upgrade.pdfExport'),
    t('upgrade.storage', { size: formatStorageSize(proLimits.maxStorageBytes) }),
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-white">
              {t('upgrade.title')}
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
              {t('upgrade.proIncludes')}
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
              {t('upgrade.currentPlan', { plan: currentPlan })}
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
            {t('upgrade.upgradeToPro')}
          </button>
        </div>
      </div>
    </div>
  );
}
