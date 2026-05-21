import type { BqLineItem } from '../BimEngine';
import { formatCurrencyValue } from '../lib/format';
import { useLang } from '../i18n/LanguageContext';

interface MappingRow {
  label: string;
  section: string;
  instanceCount: number;
  systemUnit: string;
  selectedUnit: string;
  hasUnitMismatch: boolean;
  unitStatus: string;
  mappedReference: string;
  draftReference: string;
  mappedItem: BqLineItem | undefined;
  draftItem: BqLineItem | undefined;
  suggestedItem: { itemReference: string; score: number; description: string } | undefined;
  suggestedSelectableItem: { itemReference: string; score: number; description: string } | undefined;
  selectableItems: Array<BqLineItem & { mismatch: boolean }>;
  typeGroupKey: string;
}

interface BQMappingPanelProps {
  mappingRows: MappingRow[];
  bqFileName: string;
  bqItems: BqLineItem[];
  bqError: string;
  mappingError: string;
  orphanRows: MappingRow[];
  orphanInstanceCount: number;
  orphanPreview: string;
  mappedLabelCount: number;
  mappingCandidatesCount: number;
  totalPendingRates: number;
  contractBqCount: number;
  compareMessage: string;
  onUpdateMapping: (label: string, itemReference: string) => void;
  onStageDraft: (label: string, itemReference: string) => void;
}

export default function BQMappingPanel({
  mappingRows, bqFileName, bqItems, bqError, mappingError,
  orphanRows, orphanInstanceCount, orphanPreview,
  mappedLabelCount, mappingCandidatesCount,
  totalPendingRates, contractBqCount, compareMessage,
  onUpdateMapping, onStageDraft,
}: BQMappingPanelProps) {
  const { t } = useLang();
  return (
    <div className="flex flex-col border-t border-slate-700 bg-slate-900">
      <div className="shrink-0 border-b border-slate-800 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">{t('bq.title')}</div>
            <div className="mt-2 max-w-3xl text-sm text-slate-400">{t('bq.description')}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">{t('bq.mounted')}</div><div className="mt-2 text-2xl font-black text-white">{mappedLabelCount}/{mappingCandidatesCount}</div></div>
            <div className="rounded-xl border border-red-900/70 bg-red-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-red-300">{t('bq.unmapped')}</div><div className="mt-2 text-2xl font-black text-white">{orphanRows.length}</div></div>
            <div className="rounded-xl border border-amber-900/70 bg-amber-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-amber-300">{t('bq.pendingRates')}</div><div className="mt-2 text-2xl font-black text-white">{totalPendingRates}</div></div>
            <div className="rounded-xl border border-blue-900/70 bg-blue-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-blue-300">{t('bq.contractRated')}</div><div className="mt-2 text-2xl font-black text-white">{contractBqCount}</div></div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-300">{t('bq.awardedLabel', { name: bqFileName || t('bq.notLoadedBq'), count: String(bqItems.length) })}{bqError && <div className="mt-2 text-red-400">{bqError}</div>}{mappingError && <div className="mt-2 text-red-300">{mappingError}</div>}</div>
          <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-blue-300">{t('bq.statusLabel', { message: compareMessage })}</div>
        </div>
        {orphanRows.length > 0 && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-4 py-4">
            <div className="text-sm font-black uppercase tracking-[0.2em] text-red-200">{t('bq.unmappedWarning', { count: String(orphanInstanceCount) })}</div>
            <div className="mt-2 text-sm text-red-300">{t('bq.unmappedDetail', { count: String(orphanRows.length) })} {orphanPreview ? `Examples: ${orphanPreview}` : ""}</div>
          </div>
        )}
      </div>
      <div className="px-4 pb-6">
        <div className="flex flex-col rounded-xl border border-slate-700 bg-slate-800/80 shadow-2xl shadow-black/30">
          <div className="shrink-0 border-b border-slate-700 bg-slate-900/80 px-5 py-4">
            <div className="text-sm font-black uppercase tracking-[0.28em] text-white">{t('bq.consoleTitle')}</div>
            <div className="mt-2 text-sm text-slate-400">{t('bq.consoleDescription')}</div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[110rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-20 bg-slate-900 text-xs uppercase tracking-[0.18em] text-slate-400">
                <tr className="border-b border-slate-700">
                  <th className="sticky left-0 z-30 min-w-[24rem] border-r border-slate-700 bg-slate-900 px-3 py-2 font-black text-white">{t('bq.qsDescription')}</th>
                  <th className="min-w-[6rem] px-3 py-2 font-black">{t('bq.section')}</th>
                  <th className="min-w-[7rem] px-3 py-2 font-black">{t('bq.instances')}</th>
                  <th className="min-w-[9rem] px-3 py-2 font-black">{t('bq.systemUnit')}</th>
                  <th className="min-w-[9rem] px-3 py-2 font-black">{t('bq.bqUnit')}</th>
                  <th className="min-w-[16rem] px-3 py-2 font-black">{t('bq.suggestedBq')}</th>
                  <th className="min-w-[18rem] px-3 py-2 font-black">{t('bq.bqItemReference')}</th>
                  <th className="min-w-[14rem] px-3 py-2 font-black">{t('bq.bqDescription')}</th>
                  <th className="min-w-[10rem] px-3 py-2 font-black">{t('bq.contractRate')}</th>
                  <th className="min-w-[12rem] px-3 py-2 font-black">{t('bq.statusCol')}</th>
                  <th className="min-w-[12rem] px-3 py-2 font-black">{t('bq.confirm')}</th>
                </tr>
              </thead>
              <tbody>
                {mappingRows.map((row) => {
                  const stagedMismatch = row.hasUnitMismatch;
                  const unitCellClass = stagedMismatch ? "bg-red-950/70 text-red-200 ring-1 ring-inset ring-red-500/50" : row.draftReference ? "bg-emerald-950/30 text-emerald-200" : "bg-slate-900 text-slate-300";
                  return (
                    <tr key={row.label} className={`border-b border-slate-700/40 align-top text-sm even:bg-slate-800/20 ${stagedMismatch ? "bg-red-950/25" : row.mappedReference ? "bg-slate-800/35" : "bg-slate-900/10"}`}>
                      <td className={`sticky left-0 z-10 min-w-[24rem] border-r border-slate-700/50 px-3 py-2 ${stagedMismatch ? "bg-red-950 text-red-100" : "bg-slate-900 text-slate-100"}`}>
                        <div className="font-semibold leading-6">{row.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{t('bq.liveInstances', { count: String(row.instanceCount) })}</div>
                      </td>
                      <td className="border-r border-slate-700/40 px-3 py-2 text-slate-300">{row.section}</td>
                      <td className="border-r border-slate-700/40 px-3 py-2 text-slate-300">{row.instanceCount}</td>
                      <td className="border-r border-slate-700/40 px-3 py-2"><div className="inline-flex min-w-[6rem] justify-center rounded-lg border border-blue-900/70 bg-blue-950/30 px-3 py-2 font-semibold text-blue-200">{row.systemUnit || "-"}</div></td>
                      <td className="border-r border-slate-700/40 px-3 py-2"><div className={`inline-flex min-w-[6rem] justify-center rounded-lg border px-3 py-2 font-semibold ${unitCellClass}`}>{row.selectedUnit || "-"}</div></td>
                      <td className="border-r border-slate-700/40 px-3 py-2">
                        {row.suggestedItem ? (
                          <div className="space-y-2">
                            <div className={`${row.suggestedSelectableItem ? "text-emerald-300" : "text-amber-300"} font-semibold`}>{row.suggestedItem.itemReference} ({row.suggestedItem.score})</div>
                            <div className="text-xs text-slate-500">{row.suggestedItem.description}</div>
                            <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${row.suggestedSelectableItem ? "border-slate-600 bg-transparent text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200" : "border-red-800 bg-transparent text-red-300"}`} onClick={() => row.suggestedSelectableItem ? onUpdateMapping(row.label, row.suggestedSelectableItem.itemReference) : undefined}>{row.suggestedSelectableItem ? t('bq.approveSuggestion') : t('bq.suggestionBlocked')}</button>
                          </div>
                        ) : <span className="text-slate-500">{t('bq.noRecommendation')}</span>}
                      </td>
                      <td className="border-r border-slate-700/40 px-3 py-2"><select className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold text-white outline-none transition ${stagedMismatch ? "border-red-500 bg-red-950/50 focus:border-red-400" : "border-slate-700 bg-slate-900 focus:border-blue-500"}`} value={row.draftReference} onChange={(event) => onStageDraft(row.label, event.target.value)}><option value="">{t('bq.unmappedOption')}</option>{row.selectableItems.map((item) => <option key={item.itemReference} value={item.itemReference}>{item.itemReference}{item.mismatch ? ` ${t('bq.unitMismatchOption', { bqUnit: item.unit, sysUnit: row.systemUnit || "-" })}` : ""}</option>)}</select></td>
                      <td className="border-r border-slate-700/40 px-3 py-2 text-slate-300">{row.draftItem?.description ?? row.mappedItem?.description ?? "-"}</td>
                      <td className="border-r border-slate-700/40 px-3 py-2 text-slate-100">{row.draftItem ? formatCurrencyValue(row.draftItem.contractRate) : row.mappedItem ? formatCurrencyValue(row.mappedItem.contractRate) : "-"}</td>
                      <td className="border-r border-slate-700/40 px-3 py-2"><div className={`inline-flex rounded-lg border px-3 py-2 text-xs font-bold ${stagedMismatch ? "border-red-700 bg-red-950/60 text-red-200" : row.unitStatus === "Mounted" ? "border-emerald-700 bg-emerald-950/30 text-emerald-200" : row.unitStatus === "Ready to confirm" ? "border-amber-700 bg-amber-950/30 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{row.unitStatus}</div></td>
                      <td className="px-3 py-2"><div className="flex flex-col gap-2"><button type="button" className={`rounded-lg px-3 py-2 text-sm font-black transition ${stagedMismatch ? "cursor-not-allowed bg-slate-700 text-slate-300" : "bg-blue-600 text-white hover:bg-blue-500"}`} onClick={() => onUpdateMapping(row.label, row.draftReference)} disabled={!row.draftReference || stagedMismatch}>{stagedMismatch ? t('bq.blocked') : t('bq.confirmMount')}</button>{stagedMismatch && <div className="text-xs font-semibold text-red-300">{t('bq.unitMismatchMsg')}</div>}<button type="button" className="rounded-lg border border-slate-700 bg-transparent px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800" onClick={() => onUpdateMapping(row.label, "")}>{t('bq.clear')}</button></div></td>
                    </tr>
                  );
                })}
                {mappingRows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">{t('bq.emptyState')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
