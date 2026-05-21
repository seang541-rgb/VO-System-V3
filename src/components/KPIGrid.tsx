import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrencyValue, formatSignedCurrencyValue } from '../lib/format';

interface KPIGridProps {
  totalChanges: number;
  totalCommercialOmissions: number;
  totalCommercialAdditions: number;
  totalNetValue: number;
  totalPendingRates: number;
  totalProtectedValue: number;
  // Secondary (collapsible)
  rawModified: number;
  totalRatedActions: number;
  totalHighRiskQuantityItems: number;
  mappedLabelCount: number;
  mappingCandidatesCount: number;
  contractBqCount: number;
  totalFormworkAlerts: number;
  totalStarRateCandidates: number;
  totalEotFlags: number;
}

interface KPICardProps {
  label: string;
  value: string | number;
  borderColor?: string;
  labelColor?: string;
  valueColor?: string;
}

function KPICard({ label, value, borderColor = 'border-slate-700', labelColor = 'text-slate-500', valueColor = 'text-slate-100' }: KPICardProps) {
  return (
    <div className={`rounded-xl border bg-slate-800 px-3 py-2.5 ${borderColor}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${labelColor}`}>{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

export default function KPIGrid(props: KPIGridProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-slate-800 px-4 py-3">
      {/* Primary 6 cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPICard label="Total Changes" value={props.totalChanges} />
        <KPICard label="VO Omissions" value={props.totalCommercialOmissions} borderColor="border-red-500/30" labelColor="text-red-400" valueColor="text-red-300" />
        <KPICard label="VO Additions" value={props.totalCommercialAdditions} borderColor="border-green-500/30" labelColor="text-green-400" valueColor="text-green-300" />
        <KPICard label="Net Rated Value" value={formatSignedCurrencyValue(props.totalNetValue)} borderColor="border-blue-500/30" labelColor="text-blue-400" valueColor="text-blue-300" />
        <KPICard label="Pending Rates" value={props.totalPendingRates} borderColor="border-amber-500/30" labelColor="text-amber-400" valueColor="text-amber-300" />
        <KPICard label="Protected Value" value={formatCurrencyValue(props.totalProtectedValue)} borderColor="border-amber-500/30" labelColor="text-slate-500" valueColor="text-amber-300" />
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] text-slate-500 hover:bg-slate-800 hover:text-slate-300"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? '收起更多指标' : '展开更多指标'}
      </button>

      {/* Secondary 8 cards */}
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <KPICard label="Raw Modified" value={props.rawModified} valueColor="text-amber-400" />
          <KPICard label="Rated Actions" value={props.totalRatedActions} valueColor="text-blue-300" />
          <KPICard label="High-Risk Qty" value={props.totalHighRiskQuantityItems} borderColor="border-red-500/30" valueColor="text-red-300" />
          <KPICard label="BQ Mounted" value={`${props.mappedLabelCount}/${props.mappingCandidatesCount}`} borderColor="border-emerald-500/30" valueColor="text-emerald-300" />
          <KPICard label="Contract BQ Rated" value={props.contractBqCount} valueColor="text-blue-300" />
          <KPICard label="Formwork Alerts" value={props.totalFormworkAlerts} borderColor="border-red-500/30" valueColor="text-red-300" />
          <KPICard label="Star Rate" value={props.totalStarRateCandidates} borderColor="border-orange-500/30" valueColor="text-orange-300" />
          <KPICard label="EOT Flags" value={props.totalEotFlags} borderColor="border-violet-500/30" valueColor="text-violet-300" />
        </div>
      )}
    </div>
  );
}
