import { useCallback, useEffect, useState } from 'react';
import type { VoCase, OrchestratorAction, EvidenceEntry } from '../agent/vo-case-types';
import {
  createCase,
  listCases,
  fetchCase,
  fetchEvidenceLog,
  dispatch,
  type OrchestratorCallbacks,
} from '../agent/vo-case-orchestrator';

// ── useVoCases — 项目级 Case 列表 ───────────────────────────────────────────

export function useVoCases(projectId: string | undefined) {
  const [cases, setCases] = useState<VoCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listCases(projectId);
      setCases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (userId: string, title: string) => {
      if (!projectId) throw new Error('缺少 project ID');
      const newCase = await createCase(projectId, userId, title);
      setCases((prev) => [newCase, ...prev]);
      return newCase;
    },
    [projectId],
  );

  return { cases, loading, error, refresh, create };
}

// ── useVoCase — 单个 Case 详情 + Orchestrator 操作 ──────────────────────────

export function useVoCase(caseId: string | undefined, callbacks?: OrchestratorCallbacks) {
  const [voCase, setVoCase] = useState<VoCase | null>(null);
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const [caseData, evidenceData] = await Promise.all([
        fetchCase(caseId),
        fetchEvidenceLog(caseId),
      ]);
      setVoCase(caseData);
      setEvidence(evidenceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 发送 Orchestrator 动作，自动刷新状态 */
  const act = useCallback(
    async (action: OrchestratorAction) => {
      if (!caseId) throw new Error('缺少 case ID');
      setError(null);
      try {
        const updated = await dispatch(caseId, action, callbacks);
        setVoCase(updated);
        // 刷新 evidence log
        const newEvidence = await fetchEvidenceLog(caseId);
        setEvidence(newEvidence);
        return updated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      }
    },
    [caseId, callbacks],
  );

  return { voCase, evidence, loading, error, refresh, act };
}
