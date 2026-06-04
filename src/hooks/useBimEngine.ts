import { useEffect, useRef, useState } from 'react';
import { BimEngine } from '../BimEngine';

export function useBimEngine() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BimEngine | null>(null);
  const [sysLog, setSysLog] = useState('System Live. Awaiting IFC models and QS mapping.');

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new BimEngine(containerRef.current);
    engineRef.current = engine;
    engine.onLog = (text) => setSysLog(text);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const ensureEngine = () => {
    if (engineRef.current) return engineRef.current;
    if (!containerRef.current) return null;

    const engine = new BimEngine(containerRef.current);
    engine.onLog = (text) => setSysLog(text);
    engineRef.current = engine;
    // DEV: expose to window for console debugging (Phase 3 geometry verification).
    if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__engine = engine;
    return engine;
  };

  const getIfcHandle = () => engineRef.current?.getIfcHandle() ?? null;

  return {
    containerRef,
    engineRef,
    sysLog,
    setSysLog,
    ensureEngine,
    getIfcHandle,
  };
}
