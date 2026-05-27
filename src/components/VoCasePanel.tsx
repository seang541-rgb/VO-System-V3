// VO Case Panel — 集成 Case 列表和详情的容器组件
// 在 ProjectWorkspace 中作为一个 tab 使用

import React, { useState, useCallback } from 'react';
import { useVoCases, useVoCase } from '../hooks/useVoCases';
import type { OrchestratorAction } from '../agent/vo-case-types';
import VoCaseList from './VoCaseList';
import VoCaseDetail from './VoCaseDetail';

interface VoCasePanelProps {
  projectId: string | undefined;
  userId: string | undefined;
  /** 跳转到 Copilot tab */
  onSwitchToCopilot?: () => void;
}

export default function VoCasePanel({ projectId, userId, onSwitchToCopilot }: VoCasePanelProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // 列表数据
  const { cases, loading: listLoading, error: listError, create } = useVoCases(projectId);

  // 详情数据
  const { voCase, evidence, loading: detailLoading, error: detailError, act, refresh } = useVoCase(
    selectedCaseId ?? undefined,
  );

  // 创建 Case
  const handleCreate = useCallback(
    async (title: string) => {
      if (!userId) throw new Error('未登录');
      const newCase = await create(userId, title);
      setSelectedCaseId(newCase.id);
    },
    [create, userId],
  );

  // 执行操作
  const handleAction = useCallback(
    async (action: OrchestratorAction) => {
      await act(action);
      // 操作完成后，刷新一下详情
      await refresh();
    },
    [act, refresh],
  );

  // 返回列表
  const handleBack = useCallback(() => {
    setSelectedCaseId(null);
  }, []);

  if (!projectId) {
    return (
      <div className="py-12 text-center text-xs text-slate-500">
        未选择项目
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      {selectedCaseId ? (
        <VoCaseDetail
          voCase={voCase}
          evidence={evidence}
          loading={detailLoading}
          error={detailError}
          onBack={handleBack}
          onAction={handleAction}
          onSwitchToCopilot={onSwitchToCopilot}
        />
      ) : (
        <VoCaseList
          cases={cases}
          loading={listLoading}
          error={listError}
          onSelectCase={setSelectedCaseId}
          onCreateCase={handleCreate}
        />
      )}
    </div>
  );
}
