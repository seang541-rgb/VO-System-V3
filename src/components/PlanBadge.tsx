import { useTranslation } from 'react-i18next';
import type { PlanName } from '../lib/plan-limits';

interface PlanBadgeProps { plan: PlanName; }

const PLAN_STYLES: Record<PlanName, string> = {
  free: 'border-slate-600 bg-slate-800 text-slate-300',
  pro: 'border-blue-500/30 bg-blue-600/10 text-blue-300',
  enterprise: 'border-amber-500/30 bg-amber-600/10 text-amber-300',
};

export default function PlanBadge({ plan }: PlanBadgeProps) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLAN_STYLES[plan]}`}>
      {t(`plans.${plan}`)}
    </span>
  );
}
