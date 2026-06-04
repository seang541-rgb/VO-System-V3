import React, { useRef, useState } from 'react';
import type { BimComponent, BimEngine } from '../BimEngine';
import type { ModelLoadState, ActiveTab } from '../lib/format';
import { formatElementLabel } from '../lib/format';
import toast from 'react-hot-toast';
import { useLang } from '../i18n/LanguageContext';

const MAX_IFC_SIZE = 100 * 1024 * 1024; // 100 MB

export function useIfcModels(callbacks: {
  ensureEngine: () => BimEngine | null;
  setSysLog: (msg: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  resetComparison: () => void;
}) {
  const { t } = useLang();
  const [v1File, setV1File] = useState<File | null>(null);
  const [v2File, setV2File] = useState<File | null>(null);
  const [v1Components, setV1Components] = useState<BimComponent[]>([]);
  const [v2Components, setV2Components] = useState<BimComponent[]>([]);
  const [v1State, setV1State] = useState<ModelLoadState>('idle');
  const [v2State, setV2State] = useState<ModelLoadState>('idle');
  const [v1Error, setV1Error] = useState('');
  const [v2Error, setV2Error] = useState('');
  const [activeIfcSlot, setActiveIfcSlot] = useState<'base' | 'revision' | null>(null);

  const v1InputRef = useRef<HTMLInputElement>(null);
  const v2InputRef = useRef<HTMLInputElement>(null);

  const handleIFCUpload = async (e: React.ChangeEvent<HTMLInputElement>, version: 'v1' | 'v2') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IFC_SIZE) {
      const setErr = version === 'v1' ? setV1Error : setV2Error;
      const sizeMsg = t('sys.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) });
      setErr(sizeMsg);
      toast.error(sizeMsg);
      e.target.value = '';
      return;
    }

    callbacks.resetComparison();

    const setFile = version === 'v1' ? setV1File : setV2File;
    const setComponents = version === 'v1' ? setV1Components : setV2Components;
    const setState = version === 'v1' ? setV1State : setV2State;
    const setError = version === 'v1' ? setV1Error : setV2Error;
    const label = version === 'v1' ? t('misc.v1Base') : t('misc.v2Revision');

    setFile(file);
    setComponents([]);
    setError('');
    setState('loading');
    callbacks.setSysLog(`Parsing ${label} IFC: ${file.name}...`);

    const engine = callbacks.ensureEngine();
    if (!engine) {
      const message = t('sys.engineNotReady');
      setState('error');
      setError(message);
      callbacks.setSysLog(`Failed to parse ${label}: ${message}`);
      e.target.value = '';
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const components = await engine.loadIfcModel(buffer, (_progress, text) => {
        if (text) callbacks.setSysLog(text);
      });
      setComponents(components);
      setState('ready');
      setActiveIfcSlot(version === 'v1' ? 'base' : 'revision');
      callbacks.setSysLog(`${label} loaded: ${components.length} indexed elements.`);
      toast.success(t('toast.loadSuccess', { label, count: String(components.length) }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown parsing error';
      setState('error');
      setError(message);
      callbacks.setSysLog(`Failed to parse ${label}: ${message}`);
      toast.error(t('toast.loadFailed', { label }));
    }

    e.target.value = '';
  };

  return {
    v1File, v2File,
    v1Components, v2Components,
    v1State, v2State,
    v1Error, v2Error,
    activeIfcSlot,
    v1InputRef, v2InputRef,
    handleIFCUpload,
  };
}
