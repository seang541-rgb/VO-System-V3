import React from 'react';
import { Home, BoxSelect } from 'lucide-react';
import type { BimComponent, BqLineItem } from '../BimEngine';
import type { ModelLoadState } from '../lib/format';
import { modelStateLabel } from '../lib/format';

interface ModelViewerProps {
  containerRef: React.RefObject<HTMLDivElement>;
  sysLog: string;
  v1File: File | null;
  v2File: File | null;
  v1State: ModelLoadState;
  v2State: ModelLoadState;
  v1Components: BimComponent[];
  v2Components: BimComponent[];
  v1Error: string;
  v2Error: string;
  bqFileName: string;
  bqItems: BqLineItem[];
  bqError: string;
  mappingError: string;
  compareMessage: string;
  onResetCamera: () => void;
  onToggleClipping: () => void;
}

export default function ModelViewer({
  containerRef, sysLog,
  v1File, v2File, v1State, v2State,
  v1Components, v2Components,
  v1Error, v2Error,
  bqFileName, bqItems, bqError, mappingError,
  compareMessage,
  onResetCamera, onToggleClipping,
}: ModelViewerProps) {
  return (
    <div ref={containerRef} className="relative h-[60vh] min-h-[30rem] overflow-hidden rounded-xl border border-slate-300 bg-slate-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75)] lg:h-[58vh]">
      <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-slate-300/90 bg-white/88 px-4 py-2 font-mono text-xs text-slate-700 shadow-sm backdrop-blur">{sysLog}</div>
      <div className="absolute left-4 top-4 z-10 flex max-w-[60rem] flex-col gap-2 text-xs">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Base IFC</div>
            <div className="mt-1 truncate font-semibold text-slate-900">{v1File ? v1File.name : 'No file selected'}</div>
            <div className="mt-1 text-slate-500">{modelStateLabel(v1State, v1Components.length, v1File?.name ?? null)}</div>
            {v1Error && <div className="mt-1 text-red-400">{v1Error}</div>}
          </div>
          <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Revision IFC</div>
            <div className="mt-1 truncate font-semibold text-slate-900">{v2File ? v2File.name : 'No file selected'}</div>
            <div className="mt-1 text-slate-500">{modelStateLabel(v2State, v2Components.length, v2File?.name ?? null)}</div>
            {v2Error && <div className="mt-1 text-red-400">{v2Error}</div>}
          </div>
          <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Awarded BQ</div>
            <div className="mt-1 truncate font-semibold text-slate-900">{bqFileName || 'Built-in Test BQ Library'}</div>
            <div className="mt-1 text-slate-500">{bqItems.length} line items ready</div>
            {bqError && <div className="mt-1 text-red-400">{bqError}</div>}
            {mappingError && <div className="mt-1 text-red-300">{mappingError}</div>}
          </div>
          <div className="rounded-xl border border-blue-200/90 bg-white/84 px-3 py-2 text-blue-700 shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-500">Workspace Status</div>
            <div className="mt-1 text-xs leading-5">{compareMessage}</div>
          </div>
        </div>
      </div>
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button className="rounded bg-black/50 p-2 text-white hover:bg-black/80" onClick={onResetCamera}><Home size={16} /></button>
        <button className="rounded bg-black/50 p-2 text-white hover:bg-black/80" onClick={onToggleClipping}><BoxSelect size={16} /></button>
      </div>
    </div>
  );
}
