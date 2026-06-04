import React, { useCallback, useRef, useState } from 'react';
import type { BimEngine } from '../BimEngine';
import type { RvtConvertStatus } from '../rvt/types';
import type { AuditResult } from '../audit/types';
import type { ActiveTab } from '../lib/format';
import { rvtConvertInit, rvtUploadToAps, rvtConvertStart, rvtPollUntilDone, rvtDownloadIfc } from '../rvt/aps-client';
import toast from 'react-hot-toast';
import { useLang } from '../i18n/LanguageContext';

export const RVT_CREDIT_COST = 3;

export function useRvtConvert(callbacks: {
  ensureEngine: () => BimEngine | null;
  setSysLog: (msg: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  user: { id: string } | null;
  setCreditsBalance: (balance: number) => void;
  setShowPaywall: (show: boolean) => void;
  refreshCredits: () => Promise<number | null>;
}) {
  const { t } = useLang();
  const [rvtFile, setRvtFile] = useState<File | null>(null);
  const [rvtUrn, setRvtUrn] = useState<string | null>(null);
  const [rvtConvertStatus, setRvtConvertStatus] = useState<RvtConvertStatus>('idle');
  const [rvtConvertProgress, setRvtConvertProgress] = useState('');
  const [rvtConvertError, setRvtConvertError] = useState('');
  const [rvtAuditResult, setRvtAuditResult] = useState<AuditResult | null>(null);
  const [rvtAuditDurationMs, setRvtAuditDurationMs] = useState(0);
  const rvtInputRef = useRef<HTMLInputElement>(null);

  const handleRvtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error('RVT file exceeds 100MB limit');
      e.target.value = '';
      return;
    }
    setRvtFile(file);
    setRvtUrn(null);
    setRvtConvertStatus('idle');
    setRvtConvertError('');
    setRvtAuditResult(null);
    callbacks.setActiveTab('rvt');
    callbacks.setSysLog(`RVT file loaded: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    e.target.value = '';
  };

  const runRvtAudit = useCallback(async () => {
    if (!rvtFile || !callbacks.user) return;

    setRvtConvertStatus('credit_check');
    setRvtConvertError('');
    setRvtAuditResult(null);
    const t0 = performance.now();

    try {
      setRvtConvertStatus('uploading');
      callbacks.setSysLog('RVT: Initializing cloud conversion...');
      const init = await rvtConvertInit(rvtFile.name, rvtFile.size);

      if (init.credits_balance !== null) callbacks.setCreditsBalance(init.credits_balance);

      callbacks.setSysLog('RVT: Uploading to Autodesk cloud...');
      await rvtUploadToAps(init.upload_url, rvtFile);

      setRvtConvertStatus('converting');
      callbacks.setSysLog('RVT: Starting RVT -> IFC conversion...');
      const start = await rvtConvertStart(init.job_id, init.upload_key, init.bucket, init.object_key);

      setRvtUrn(start.urn);

      await rvtPollUntilDone(init.job_id, (status, progress) => {
        setRvtConvertProgress(progress);
        callbacks.setSysLog(`RVT: Converting... ${progress}`);
      });

      setRvtConvertStatus('downloading');
      callbacks.setSysLog('RVT: Downloading converted IFC...');
      const ifcBuffer = await rvtDownloadIfc(init.job_id);

      callbacks.setSysLog('RVT: Running audit on converted IFC...');
      const engine = callbacks.ensureEngine();
      if (!engine) throw new Error('BIM engine not available');

      await engine.loadIfcModel(ifcBuffer, (p) => {
        callbacks.setSysLog(`RVT: Loading converted IFC... ${Math.round(p * 100)}%`);
      });

      const handle = engine.getIfcHandle();
      if (!handle) throw new Error('IFC model failed to load from converted file');

      const { runAudit: doAudit } = await import('../audit/extractor');
      const result = doAudit({ api: handle.api, modelID: handle.modelID });
      const duration = performance.now() - t0;

      setRvtAuditResult(result);
      setRvtAuditDurationMs(duration);
      setRvtConvertStatus('done');
      callbacks.setSysLog(`RVT audit complete: ${result.records.length} elements in ${(duration / 1000).toFixed(1)}s`);
      toast.success(`RVT 审计完成 · ${result.records.length} 个构件`);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setRvtConvertError(message);
      setRvtConvertStatus('error');
      callbacks.setSysLog(`RVT audit failed: ${message}`);

      if (message.includes('Insufficient credits') || message.includes('NO_CREDITS')) {
        callbacks.setShowPaywall(true);
        toast.error(t('rvt.insufficientCredits'));
      } else {
        toast.error('RVT 审计失败');
      }

      await callbacks.refreshCredits();
    }
  }, [rvtFile, callbacks, t]);

  return {
    rvtFile, rvtUrn,
    rvtConvertStatus, rvtConvertProgress, rvtConvertError,
    rvtAuditResult, rvtAuditDurationMs,
    rvtInputRef,
    handleRvtUpload,
    runRvtAudit,
  };
}
