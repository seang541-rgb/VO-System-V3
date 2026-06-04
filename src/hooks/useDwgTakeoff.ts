import React, { useRef, useState } from 'react';
import type { DwgTakeoffResult } from '../dwg/quantityModel';
import { runDwgTakeoff } from '../dwg/dwgEngine';
import type { ActiveTab } from '../lib/format';
import toast from 'react-hot-toast';

export function useDwgTakeoff(callbacks: {
  setSysLog: (msg: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
}) {
  const [dwgResult, setDwgResult] = useState<DwgTakeoffResult | null>(null);
  const [dwgLoading, setDwgLoading] = useState(false);
  const [dwgError, setDwgError] = useState('');
  const dwgInputRef = useRef<HTMLInputElement>(null);

  const handleDwgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    callbacks.setActiveTab('dwg');
    setDwgLoading(true);
    setDwgError('');
    setDwgResult(null);
    callbacks.setSysLog(`Parsing DWG locally: ${file.name}...`);
    try {
      const buffer = await file.arrayBuffer();
      const result = await runDwgTakeoff(buffer, file.name);
      setDwgResult(result);
      callbacks.setSysLog(`DWG takeoff complete: ${result.items.length} quantity items from ${result.entities} entities.`);
      toast.success(`DWG 算量完成 · ${result.items.length} 条工程量`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown DWG parse error';
      setDwgError(message);
      callbacks.setSysLog(`DWG takeoff failed: ${message}`);
      toast.error('DWG 解析失败');
    } finally {
      setDwgLoading(false);
      e.target.value = '';
    }
  };

  return {
    dwgResult, dwgLoading, dwgError,
    dwgInputRef,
    handleDwgUpload,
  };
}
