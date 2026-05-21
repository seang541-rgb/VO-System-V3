import { useEffect, useRef, useState } from 'react';
import { Loader2, Zap, ChevronDown, ChevronUp, AlertCircle, BarChart3 } from 'lucide-react';
import type { AuditResult } from '../audit/types';
import { useLang } from '../i18n/LanguageContext';

export type AuditState = 'idle' | 'running' | 'done' | 'error';

interface AuditPanelProps {
  auditResult: AuditResult | null;
  auditState: AuditState;
  auditError: string;
  auditDurationMs: number;
  onRunAudit: () => void;
  canRun: boolean;
}

function KPI({ label, value, accent = 'text-slate-100' }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function ElapsedTimer({ running }: { running: boolean }) {
  const startRef = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(performance.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, [running]);

  return <span className="font-mono text-blue-300">{(elapsed / 1000).toFixed(1)}s</span>;
}

export default function AuditPanel({ auditResult, auditState, auditError, auditDurationMs, onRunAudit, canRun }: AuditPanelProps) {
  const { t } = useLang();
  const [showClassifications, setShowClassifications] = useState(false);
  const [showSources, setShowSources] = useState(false);

  // ── Idle state ──────────────────────────────────────────────
  if (auditState === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 px-6 py-20">
        <BarChart3 className="h-12 w-12 text-slate-600" />
        <div className="text-center">
          <div className="text-lg font-bold text-slate-300">{t('audit.title')}</div>
          <div className="mt-2 text-sm text-slate-500">{t('audit.instruction')}</div>
        </div>
        <button
          type="button"
          onClick={onRunAudit}
          disabled={!canRun}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Zap className="h-4 w-4" /> {t('audit.runButton')}
        </button>
      </div>
    );
  }

  // ── Running state ───────────────────────────────────────────
  if (auditState === 'running') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 px-6 py-20">
        <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
        <div className="text-center">
          <div className="text-lg font-bold text-blue-300">{t('audit.running')}</div>
          <div className="mt-2 text-sm text-slate-500">{t('audit.processing')}</div>
          <div className="mt-3 text-3xl font-bold">
            <ElapsedTimer running />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────
  if (auditState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 px-6 py-20">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <div className="text-center">
          <div className="text-lg font-bold text-red-300">{t('audit.errorTitle')}</div>
          <div className="mt-2 max-w-md text-sm text-red-400">{auditError}</div>
        </div>
        <button
          type="button"
          onClick={onRunAudit}
          disabled={!canRun}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Zap className="h-4 w-4" /> {t('audit.retry')}
        </button>
      </div>
    );
  }

  // ── Done state ──────────────────────────────────────────────
  const result = auditResult!;
  const { summary, bqRows, quantityModeUsed } = result;
  const durationSec = (auditDurationMs / 1000).toFixed(1);

  // Compute Qto coverage
  const qtoSources = summary.quantitySources.filter((s) => s.source.toLowerCase().includes('qto'));
  const qtoCount = qtoSources.reduce((sum, s) => sum + s.count, 0);
  const qtoCoverage = summary.recordCount > 0 ? Math.round((qtoCount / summary.recordCount) * 100) : 0;

  return (
    <div className="flex flex-col border-t border-slate-700 bg-slate-900">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-800/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-400" />
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-amber-400">{t('audit.reportLabel')}</div>
            <div className="text-[11px] text-slate-400">
              {t('audit.completeMsg', { count: String(summary.recordCount), duration: durationSec })}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KPI label={t('audit.elementCount')} value={summary.recordCount} accent="text-white" />
          <KPI label={t('audit.jkrCount')} value={summary.jkrCodeCount} accent="text-blue-300" />
          <KPI label={t('audit.quantityMode')} value={quantityModeUsed === 'compat' ? t('audit.modeQto') : quantityModeUsed === 'mesh' ? t('audit.modeMesh') : quantityModeUsed} accent="text-emerald-300" />
          <KPI label={t('audit.duration')} value={`${durationSec}s`} accent="text-amber-300" />
          <KPI label={t('audit.qtoCoverage')} value={`${qtoCoverage}%`} accent={qtoCoverage >= 70 ? 'text-emerald-300' : qtoCoverage >= 40 ? 'text-amber-300' : 'text-red-300'} />
        </div>
      </div>

      {/* Main BQ Table */}
      <div className="px-4 py-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-blue-400">{t('audit.bqSummary')}</div>
        <div className="overflow-auto rounded-xl border border-slate-700">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 bg-slate-800/80 text-xs uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-2.5 font-bold">{t('audit.jkrCode')}</th>
                <th className="px-4 py-2.5 font-bold">{t('audit.description')}</th>
                <th className="px-4 py-2.5 font-bold">{t('audit.unit')}</th>
                <th className="px-4 py-2.5 font-bold text-right">{t('audit.netQuantity')}</th>
                <th className="px-4 py-2.5 font-bold text-right">{t('audit.elements')}</th>
              </tr>
            </thead>
            <tbody className="font-mono text-slate-300">
              {bqRows.map((row) => (
                <tr key={row.item} className="border-b border-slate-700/40 even:bg-slate-800/20">
                  <td className="px-4 py-2 font-semibold text-slate-100">{row.item}</td>
                  <td className="px-4 py-2 text-slate-300">{row.description}</td>
                  <td className="px-4 py-2 text-slate-400">{row.unit}</td>
                  <td className="px-4 py-2 text-right text-slate-100">{row.netQty.toFixed(4)}</td>
                  <td className="px-4 py-2 text-right text-blue-300">{row.elementCount}</td>
                </tr>
              ))}
              {bqRows.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-500">{t('audit.noRecords')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collapsible: Classifications */}
      <div className="border-t border-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={() => setShowClassifications(!showClassifications)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <span>{t('audit.classifications', { count: String(summary.classifications.length) })}</span>
          {showClassifications ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showClassifications && (
          <div className="mt-2 overflow-auto rounded-xl border border-slate-700">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 bg-slate-800/80 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-3 py-2 font-bold">{t('audit.classification')}</th>
                  <th className="px-3 py-2 font-bold">{t('audit.jkrCode')}</th>
                  <th className="px-3 py-2 font-bold">{t('audit.elementGroup')}</th>
                  <th className="px-3 py-2 font-bold text-right">{t('audit.count')}</th>
                  <th className="px-3 py-2 font-bold text-right">{t('audit.netVolume')}</th>
                  <th className="px-3 py-2 font-bold text-right">{t('audit.netArea')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-300">
                {summary.classifications.map((c) => (
                  <tr key={`${c.jkrCode}-${c.classification}`} className="border-b border-slate-700/40 even:bg-slate-800/20">
                    <td className="px-3 py-1.5 text-slate-100">{c.classification}</td>
                    <td className="px-3 py-1.5 text-blue-300">{c.jkrCode}</td>
                    <td className="px-3 py-1.5 text-slate-400">{c.elementGroup}</td>
                    <td className="px-3 py-1.5 text-right">{c.count}</td>
                    <td className="px-3 py-1.5 text-right">{c.netVolumeM3.toFixed(4)}</td>
                    <td className="px-3 py-1.5 text-right">{c.netAreaM2.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Collapsible: Quantity Sources */}
      <div className="border-t border-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={() => setShowSources(!showSources)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <span>{t('audit.quantitySources', { count: String(summary.quantitySources.length) })}</span>
          {showSources ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showSources && (
          <div className="mt-2 overflow-auto rounded-xl border border-slate-700">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 bg-slate-800/80 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-3 py-2 font-bold">{t('audit.source')}</th>
                  <th className="px-3 py-2 font-bold text-right">{t('audit.count')}</th>
                  <th className="px-3 py-2 font-bold text-right">{t('audit.netVolume')}</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-300">
                {summary.quantitySources.map((s) => (
                  <tr key={s.source} className="border-b border-slate-700/40 even:bg-slate-800/20">
                    <td className="px-3 py-1.5 text-slate-100">{s.source}</td>
                    <td className="px-3 py-1.5 text-right">{s.count}</td>
                    <td className="px-3 py-1.5 text-right">{s.netVolumeM3.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
