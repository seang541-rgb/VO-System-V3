import { Loader2, FileBox, AlertCircle, CheckCircle2, Upload } from 'lucide-react';
import RvtViewer from './RvtViewer';
import type { RvtConvertStatus } from '../rvt/types';
import type { AuditResult } from '../audit/types';
import { useLang } from '../i18n/LanguageContext';

interface RvtAuditPanelProps {
  rvtFile: File | null;
  rvtUrn: string | null;
  convertStatus: RvtConvertStatus;
  convertProgress: string;
  convertError: string;
  auditResult: AuditResult | null;
  auditDurationMs: number;
  creditCost: number;
  onUpload: () => void;
  onRunAudit: () => void;
  canRunAudit: boolean;
}

const STATUS_LABELS: Record<RvtConvertStatus, string> = {
  idle: '',
  credit_check: 'Checking credits...',
  uploading: 'Uploading RVT to cloud...',
  converting: 'Converting RVT → IFC...',
  downloading: 'Downloading converted IFC...',
  done: 'Conversion complete',
  error: 'Conversion failed',
};

export default function RvtAuditPanel({
  rvtFile,
  rvtUrn,
  convertStatus,
  convertProgress,
  convertError,
  auditResult,
  auditDurationMs,
  creditCost,
  onUpload,
  onRunAudit,
  canRunAudit,
}: RvtAuditPanelProps) {
  const { t } = useLang();
  const isConverting = convertStatus !== 'idle' && convertStatus !== 'done' && convertStatus !== 'error';

  return (
    <div className="flex flex-col gap-4 p-4">
      {!rvtFile && (
        <div className="flex flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed border-slate-700 py-16">
          <FileBox className="h-12 w-12 text-slate-600" />
          <div className="text-center">
            <div className="text-lg font-bold text-slate-300">{t('rvt.title')}</div>
            <div className="mt-2 text-sm text-slate-500">{t('rvt.uploadHint')}</div>
          </div>
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow hover:bg-blue-500"
          >
            <Upload className="h-4 w-4" />
            {t('rvt.uploadBtn')}
          </button>
        </div>
      )}

      {rvtFile && <RvtViewer urn={rvtUrn} />}

      {rvtFile && convertStatus === 'idle' && !auditResult && (
        <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-200">{rvtFile.name}</div>
            <div className="text-xs text-slate-500">
              {(rvtFile.size / 1024 / 1024).toFixed(1)} MB · {t('rvt.auditCost', { cost: String(creditCost) })}
            </div>
          </div>
          <button
            type="button"
            onClick={onRunAudit}
            disabled={!canRunAudit}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:opacity-40"
          >
            {t('rvt.runAudit')}
          </button>
        </div>
      )}

      {isConverting && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-900 bg-blue-950/40 px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <div>
            <div className="text-sm font-semibold text-blue-200">{STATUS_LABELS[convertStatus]}</div>
            {convertProgress && <div className="text-xs text-blue-400">{convertProgress}</div>}
          </div>
        </div>
      )}

      {convertStatus === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-red-400" />
          <div>
            <div className="text-sm font-semibold text-red-200">{t('rvt.conversionFailed')}</div>
            <div className="mt-1 text-xs text-red-400">{convertError}</div>
          </div>
        </div>
      )}

      {convertStatus === 'done' && auditResult && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <span className="text-sm text-emerald-200">
            {t('rvt.auditComplete', { count: String(auditResult.records.length), duration: (auditDurationMs / 1000).toFixed(1) })}
          </span>
        </div>
      )}
    </div>
  );
}
