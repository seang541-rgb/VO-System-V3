import React from 'react';
import type { VoCommercialAction } from '../BimEngine';

export interface ResultRow {
  key: string;
  section: string;
  level: string;
  block: string;
  zone: string;
  gridRoom: string;
  locationKind: string;
  openingLink: string;
  shield: string;
  protectedQty: string;
  protectedValue: string;
  alert: string;
  starRate: string;
  eotFlag: string;
  element: string;
  measurement: string;
  measureRule: string;
  quantitySource: string;
  quantityRisk: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  actionLabel: string;
  techStatus: string;
  qsImpact: string;
  detail: string;
  actionClass: string;
  techClass: string;
  qsClass: string;
  rateClass: string;
  quantityRiskClass: string;
  amountClass: string;
  canFocus: boolean;
  focusHint: string;
  rawAction: VoCommercialAction;
}

interface ResultsTableProps {
  resultRows: ResultRow[];
  selectedRowKey: string | null;
  onRowClick: (action: VoCommercialAction) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  scrollbarRef: React.RefObject<HTMLDivElement>;
  scrollbarInnerRef: React.RefObject<HTMLDivElement>;
}

export default function ResultsTable({
  resultRows, selectedRowKey, onRowClick,
  scrollRef, scrollbarRef, scrollbarInnerRef,
}: ResultsTableProps) {
  return (
    <>
      <div className="border-b border-slate-800 px-4 py-2 text-xs text-slate-500">
        Commercial output now forces every technical modification into Omission + Addition rows. Each commercial row now carries Qty, Unit, Rate, Amount, the exact measurement rule applied, and the quantity source used. Quantity normalization now follows a strict fallback chain: Qto first, geometry mesh calculation second, and BBox estimate last. Any BBox fallback is marked as high risk for manual QS verification. Contract BQ rates override provisional project rates only when a QS-mounted Item Reference exists and its unit matches the system measurement unit. Click a row to focus the affected element in 3D; modified omissions will focus the visible revision counterpart.
      </div>
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-400">
          Drag Horizontally Here To View Hidden Columns
        </div>
        <div ref={scrollbarRef} className="overflow-x-auto overflow-y-hidden rounded-full border border-slate-700 bg-slate-800/90">
          <div ref={scrollbarInnerRef} className="h-4 min-w-full" />
        </div>
      </div>
      <div ref={scrollRef} className="hide-scrollbar overflow-x-auto p-4">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700/60 text-xs uppercase tracking-[0.18em] text-slate-500">
              <th className="w-[7%] px-3 py-2 font-bold">Section</th>
              <th className="w-[10%] px-3 py-2 font-bold">Level</th>
              <th className="w-[8%] px-3 py-2 font-bold">Block</th>
              <th className="w-[8%] px-3 py-2 font-bold">Zone</th>
              <th className="w-[10%] px-3 py-2 font-bold">Grid/Room</th>
              <th className="w-[7%] px-3 py-2 font-bold">Loc Type</th>
              <th className="w-[14%] px-3 py-2 font-bold">Host / Opening</th>
              <th className="w-[9%] px-3 py-2 font-bold">Shield</th>
              <th className="w-[10%] px-3 py-2 font-bold">Protected Qty</th>
              <th className="w-[10%] px-3 py-2 font-bold">Protected Value</th>
              <th className="w-[16%] px-3 py-2 font-bold">Formwork Alert</th>
              <th className="w-[16%] px-3 py-2 font-bold">Star Rate</th>
              <th className="w-[16%] px-3 py-2 font-bold">EOT Trigger</th>
              <th className="w-[15%] px-3 py-2 font-bold">QS Description</th>
              <th className="w-[11%] px-3 py-2 font-bold">Measure</th>
              <th className="w-[14%] px-3 py-2 font-bold">Measure Rule</th>
              <th className="w-[8%] px-3 py-2 font-bold">Qty Source</th>
              <th className="w-[16%] px-3 py-2 font-bold">Qty Risk</th>
              <th className="w-[8%] px-3 py-2 font-bold">Qty</th>
              <th className="w-[6%] px-3 py-2 font-bold">Unit</th>
              <th className="w-[10%] px-3 py-2 font-bold">Rate</th>
              <th className="w-[10%] px-3 py-2 font-bold">Amount</th>
              <th className="w-[7%] px-3 py-2 font-bold">VO Action</th>
              <th className="w-[7%] px-3 py-2 font-bold">Tech Status</th>
              <th className="w-[6%] px-3 py-2 font-bold">QS Impact</th>
              <th className="pb-2 font-bold uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="font-mono text-slate-300">
            {resultRows.map((row) => (
              <tr
                key={row.key}
                className={`border-b border-slate-700/40 align-top even:bg-slate-800/20 ${row.canFocus ? 'cursor-pointer hover:bg-slate-800/55' : 'opacity-80'} ${selectedRowKey === row.key ? 'bg-blue-950/30 ring-1 ring-inset ring-blue-500/40' : ''}`}
                onClick={() => row.canFocus ? onRowClick(row.rawAction) : undefined}
                title={row.focusHint}
              >
                <td className="px-3 py-2 text-slate-100">{row.section}</td>
                <td className="px-3 py-2 text-blue-400">{row.level}</td>
                <td className="px-3 py-2 text-slate-300">{row.block}</td>
                <td className="px-3 py-2 text-slate-300">{row.zone}</td>
                <td className="px-3 py-2 text-slate-300">{row.gridRoom}</td>
                <td className="px-3 py-2 uppercase text-slate-500">{row.locationKind}</td>
                <td className="px-3 py-2 text-slate-400">{row.openingLink}</td>
                <td className="px-3 py-2 text-slate-400">{row.shield}</td>
                <td className="px-3 py-2 text-slate-300">{row.protectedQty}</td>
                <td className="px-3 py-2 text-amber-300">{row.protectedValue}</td>
                <td className={`py-2 ${row.alert === '-' ? 'text-slate-500' : 'font-semibold text-red-300'}`}>{row.alert}</td>
                <td className={`py-2 ${row.starRate === '-' ? 'text-slate-500' : 'font-semibold text-orange-300'}`}>{row.starRate}</td>
                <td className={`py-2 ${row.eotFlag === '-' ? 'text-slate-500' : 'font-semibold text-violet-300'}`}>{row.eotFlag}</td>
                <td className="px-3 py-2 text-slate-100">{row.element}</td>
                <td className="px-3 py-2 text-slate-300">{row.measurement}</td>
                <td className="px-3 py-2 text-slate-400">{row.measureRule}</td>
                <td className="px-3 py-2 text-slate-300">{row.quantitySource}</td>
                <td className={`py-2 ${row.quantityRiskClass}`}>{row.quantityRisk}</td>
                <td className="px-3 py-2 text-slate-300">{row.quantity}</td>
                <td className="px-3 py-2 text-slate-300">{row.unit}</td>
                <td className={`py-2 ${row.rateClass}`}>{row.rate}</td>
                <td className={`py-2 font-semibold ${row.amountClass}`}>{row.amount}</td>
                <td className={`py-2 font-bold ${row.actionClass}`}>{row.actionLabel}</td>
                <td className={`py-2 font-bold ${row.techClass}`}>{row.techStatus}</td>
                <td className={`py-2 font-bold uppercase ${row.qsClass}`}>{row.qsImpact}</td>
                <td className="whitespace-pre-wrap px-3 py-2 text-slate-400">{row.detail}</td>
              </tr>
            ))}
            {resultRows.length === 0 && (
              <tr><td colSpan={26} className="py-4 text-center text-slate-500">Comparison ran successfully. No variations were detected.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
