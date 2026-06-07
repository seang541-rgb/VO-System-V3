import { useCallback, useRef, useState } from 'react';
import type { BimEngine } from '../BimEngine';
import type { AuditState } from '../components/AuditPanel';
import type { AuditResult } from '../audit/types';
import type { ActiveTab } from '../lib/format';
import toast from 'react-hot-toast';
import { useLang } from '../i18n/LanguageContext';

export function useAudit(callbacks: {
  ensureEngine: () => BimEngine | null;
  setSysLog: (msg: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
}) {
  const { t } = useLang();
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditState, setAuditState] = useState<AuditState>('idle');
  const [auditError, setAuditError] = useState('');
  const [auditDurationMs, setAuditDurationMs] = useState(0);

  const runAudit = useCallback(async () => {
    const cb = callbacksRef.current;
    const engine = cb.ensureEngine();
    if (!engine) return;
    const handle = engine.getIfcHandle();
    if (!handle) {
      setAuditError(t('sys.auditNotReady'));
      setAuditState('error');
      return;
    }
    setAuditState('running');
    setAuditError('');
    setAuditResult(null);
    cb.setActiveTab('audit');
    const t0 = performance.now();
    try {
      const { runAudit: doAudit } = await import('../audit/extractor');
      const result = doAudit({ api: handle.api, modelID: handle.modelID });
      const duration = performance.now() - t0;
      setAuditDurationMs(duration);
      setAuditResult(result);
      setAuditState('done');
      cb.setSysLog(`Audit complete: ${result.records.length} elements in ${(duration / 1000).toFixed(1)}s`);
      toast.success(t('toast.auditComplete', { count: String(result.records.length), duration: (duration / 1000).toFixed(1) }));
    } catch (err) {
      setAuditDurationMs(performance.now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      setAuditError(message);
      setAuditState('error');
      cb.setSysLog(`Audit failed: ${message}`);
      toast.error(t('toast.auditFailed', { message }));
    }
  }, [t]);

  return {
    auditResult, auditState, auditError, auditDurationMs,
    runAudit,
  };
}
