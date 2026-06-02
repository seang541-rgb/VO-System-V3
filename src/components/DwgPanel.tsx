import { useRef, useState } from 'react';
import type { WheelEvent as ReactWheelEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { DwgTakeoffResult, QuantityItem } from '../dwg/quantityModel';
import { exportDwgBoq } from '../dwg/dwgReport';
import { useLang } from '../i18n/LanguageContext';

/** Pan + wheel-zoom wrapper around an inline SVG drawing. */
function ZoomableSvg({ svg, hint, resetLabel }: { svg: string; hint: string; resetLabel: string }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const onWheel = (e: ReactWheelEvent) => {
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => ({ ...v, scale: Math.min(20, Math.max(1, v.scale * factor)) }));
  };
  const onDown = (e: ReactMouseEvent) => { drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }; };
  const onMove = (e: ReactMouseEvent) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, x: drag.current!.ox + (e.clientX - drag.current!.sx), y: drag.current!.oy + (e.clientY - drag.current!.sy) }));
  };
  const onUp = () => { drag.current = null; };
  const reset = () => setView({ scale: 1, x: 0, y: 0 });

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button onClick={() => setView((v) => ({ ...v, scale: Math.min(20, v.scale * 1.3) }))} className="rounded bg-slate-800/90 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700">＋</button>
        <button onClick={() => setView((v) => ({ ...v, scale: Math.max(1, v.scale / 1.3) }))} className="rounded bg-slate-800/90 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700">－</button>
        <button onClick={reset} className="rounded bg-slate-800/90 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700">{resetLabel}</button>
      </div>
      <div
        className="overflow-hidden rounded-lg border border-slate-700 bg-[#0b1220]"
        style={{ cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      >
        <div
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: 'center center', transition: drag.current ? 'none' : 'transform 0.08s' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div className="mt-1 text-[10px] text-slate-500">{hint} · {(view.scale).toFixed(1)}×</div>
    </div>
  );
}

interface DwgPanelProps {
  result: DwgTakeoffResult | null;
  loading: boolean;
  error: string;
  onUpload: () => void;
}

type ReviewState = 'confirmed' | 'rejected';

export default function DwgPanel({ result, loading, error, onUpload }: DwgPanelProps) {
  const { t } = useLang();
  const [rates, setRates] = useState<Record<number, number>>({});
  const [reviewStatus, setReviewStatus] = useState<Record<number, ReviewState>>({});

  const catLabel = (it: QuantityItem) => `${t('dwg.cat.' + it.kind)}${it.size ? ' ' + it.size : ''}`;
  const isRejected = (i: number) => reviewStatus[i] === 'rejected';
  const total = result
    ? result.items.reduce((s, _it, i) => s + (!isRejected(i) && rates[i] != null ? result.items[i].quantity * rates[i] : 0), 0)
    : 0;

  const handleExport = () => {
    if (!result) return;
    const rated = result.items
      .map((it, i) => ({ it, i }))
      .filter(({ i }) => !isRejected(i))
      .map(({ it, i }) => ({
        ...it,
        category: catLabel(it),
        confidence: reviewStatus[i] === 'confirmed' ? ('high' as const) : it.confidence,
        needsReview: reviewStatus[i] === 'confirmed' ? false : it.needsReview,
        rate: rates[i],
        amount: rates[i] != null ? it.quantity * rates[i] : undefined,
      }));
    exportDwgBoq(rated, result.fileName);
  };

  const pendingReviews = result
    ? result.items.map((it, i) => ({ it, i })).filter(({ it, i }) => it.needsReview && !reviewStatus[i])
    : [];

  return (
    <div className="flex flex-col border-t border-slate-700 bg-slate-900 px-4 py-5 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">{t('dwg.title')}</div>
          <p className="mt-1 text-sm text-slate-400">{t('dwg.subtitle')}</p>
        </div>
        <button type="button" onClick={onUpload} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500">
          {t('dwg.upload')}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}

      {loading && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-10 text-center text-sm text-slate-400">{t('dwg.parsing')}</div>
      )}

      {!loading && !result && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-12 text-center text-sm text-slate-500">{t('dwg.empty')}</div>
      )}

      {!loading && result && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi n={result.items.filter((i) => !i.needsReview).reduce((s, i) => s + (i.measureKind === 'count' ? i.quantity : 0), 0)} l={t('dwg.kpiAuto')} />
            <Kpi n={result.items.length} l={t('dwg.kpiItems')} />
            <Kpi n={result.entities} l={t('dwg.kpiEntities')} />
            <Kpi n={`${result.sizeMB.toFixed(1)}MB`} l={result.fileName} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t('dwg.viewerTitle')}</div>
              {result.annotatedSvg
                ? <ZoomableSvg svg={result.annotatedSvg} hint={t('dwg.zoomHint')} resetLabel={t('dwg.reset')} />
                : <div className="rounded-lg border border-slate-700 bg-[#0b1220] p-8 text-center text-sm text-slate-500">{t('dwg.noDrawing')}</div>}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t('dwg.boqTitle')}</div>
                <button type="button" onClick={handleExport} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500">{t('dwg.exportBoq')}</button>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2">{t('dwg.colItem')}</th><th>{t('dwg.colQty')}</th><th>{t('dwg.colUnit')}</th><th>{t('dwg.colRate')}</th><th>{t('dwg.colAmount')}</th><th>{t('dwg.colConf')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it, idx) => {
                    const rate = rates[idx];
                    const rejected = isRejected(idx);
                    const confirmed = reviewStatus[idx] === 'confirmed';
                    const amount = !rejected && rate != null ? it.quantity * rate : null;
                    const confLabel = rejected ? t('dwg.confRejected') : confirmed ? t('dwg.confConfirmed') : it.needsReview ? t('dwg.confReview') : t('dwg.confHigh');
                    const confColor = rejected ? 'text-slate-500 line-through' : confirmed || !it.needsReview ? 'text-emerald-400' : 'text-amber-400';
                    return (
                      <tr key={idx} className={`border-b border-slate-800 ${rejected ? 'opacity-40' : ''}`}>
                        <td className={`py-2 text-slate-200 ${rejected ? 'line-through' : ''}`}>{catLabel(it)}</td>
                        <td className="text-slate-100">{it.quantity}</td>
                        <td className="text-slate-400">{it.unit}</td>
                        <td>
                          <input
                            type="number"
                            value={rate ?? ''}
                            placeholder="0.00"
                            disabled={rejected}
                            onChange={(e) => setRates((r) => ({ ...r, [idx]: e.target.value === '' ? undefined as unknown as number : Number(e.target.value) }))}
                            className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-50"
                          />
                        </td>
                        <td className="text-emerald-300">{amount != null ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                        <td className={confColor}>{confLabel}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-slate-700">
                    <td colSpan={4} className="py-2 text-right text-xs font-bold uppercase tracking-wide text-slate-400">{t('dwg.total')}</td>
                    <td className="font-black text-white">{total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>

              {pendingReviews.length > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3">
                  <div className="text-xs font-bold text-amber-400">{t('dwg.reviewTitle', { count: pendingReviews.length })}</div>
                  {pendingReviews.map(({ it, i }) => (
                    <div key={i} className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-slate-300">{catLabel(it)} · {it.quantity}{it.unit}</span>
                      <button onClick={() => setReviewStatus((s) => ({ ...s, [i]: 'confirmed' }))} className="ml-auto rounded border border-emerald-800 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-950/40">{t('dwg.confirm')}</button>
                      <button onClick={() => setReviewStatus((s) => ({ ...s, [i]: 'rejected' }))} className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800">{t('dwg.reject')}</button>
                    </div>
                  ))}
                  <div className="mt-2 text-[11px] text-slate-500">{t('dwg.reviewNote')}</div>
                </div>
              ) : result.items.some((i) => i.needsReview) ? (
                <div className="mt-4 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs text-emerald-300">{t('dwg.reviewDone')}</div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
      <div className="truncate text-2xl font-black text-white">{n}</div>
      <div className="mt-1 truncate text-[11px] uppercase tracking-wide text-slate-500">{l}</div>
    </div>
  );
}
