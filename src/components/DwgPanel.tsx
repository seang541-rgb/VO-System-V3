import type { DwgTakeoffResult } from '../dwg/quantityModel';

interface DwgPanelProps {
  result: DwgTakeoffResult | null;
  loading: boolean;
  error: string;
  onUpload: () => void;
}

export default function DwgPanel({ result, loading, error, onUpload }: DwgPanelProps) {
  return (
    <div className="flex flex-col border-t border-slate-700 bg-slate-900 px-4 py-5 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">2D 图纸 &amp; 算量 (DWG)</div>
          <p className="mt-1 text-sm text-slate-400">全本地解析,零上传 · 数量类自动 · 长度/面积待复核项交 QS 确认</p>
        </div>
        <button
          type="button"
          onClick={onUpload}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
        >
          上传 DWG
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}

      {loading && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-10 text-center text-sm text-slate-400">
          正在本地解析 DWG 并算量...
        </div>
      )}

      {!loading && !result && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 px-4 py-12 text-center text-sm text-slate-500">
          上传一个 .dwg 文件,自动数出柱 / 门 / 雨水管 / 洁具,出工程量表。
        </div>
      )}

      {!loading && result && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi n={result.items.filter((i) => !i.needsReview).reduce((s, i) => s + (i.measureKind === 'count' ? i.quantity : 0), 0)} l="自动构件 (nr)" />
            <Kpi n={result.items.length} l="工程量条目" />
            <Kpi n={result.entities} l="图元总数" />
            <Kpi n={`${result.sizeMB.toFixed(1)}MB`} l={result.fileName} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">柱标注 (红 Ø300 / 黄 Ø450)</div>
              <div className="overflow-hidden rounded-lg border border-slate-700 bg-[#0b1220]" dangerouslySetInnerHTML={{ __html: result.annotatedSvg || '<div style="padding:2rem;color:#64748b;text-align:center">无柱平面</div>' }} />
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">统一工程量表</div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2">构件</th><th>来源</th><th>量</th><th>单位</th><th>置信度</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it, idx) => (
                    <tr key={idx} className="border-b border-slate-800">
                      <td className="py-2 text-slate-200">{it.category}</td>
                      <td><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">DWG</span></td>
                      <td className="text-slate-100">{it.quantity}</td>
                      <td className="text-slate-400">{it.unit}</td>
                      <td className={it.needsReview ? 'text-amber-400' : 'text-emerald-400'}>{it.needsReview ? '复核' : '高'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {result.items.some((i) => i.needsReview) && (
                <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3">
                  <div className="text-xs font-bold text-amber-400">⚠ 待复核 (低置信度)</div>
                  {result.items.filter((i) => i.needsReview).map((it, idx) => (
                    <div key={idx} className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-slate-300">{it.category} · {it.quantity}{it.unit}</span>
                      <button className="ml-auto rounded border border-emerald-800 px-2 py-0.5 text-xs text-emerald-300">✓ 确认</button>
                      <button className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300">✕ 否决</button>
                    </div>
                  ))}
                  <div className="mt-2 text-[11px] text-slate-500">数量类已自动确认 · 模棱两可的交 QS 拍板,不瞎猜</div>
                </div>
              )}
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
