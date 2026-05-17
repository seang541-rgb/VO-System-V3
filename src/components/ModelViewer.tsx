import React, { useState } from 'react';
import { Home, BoxSelect, Ruler, Camera, ChevronDown, ChevronUp, X, Layers, Filter } from 'lucide-react';
import type { BimComponent, BqLineItem, ElementProperties, StoreyInfo, ElementTypeInfo } from '../BimEngine';
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
  // New 3D feature props
  storeys?: StoreyInfo[];
  elementTypes?: ElementTypeInfo[];
  activeStoreyFilter?: number | null;
  activeTypeFilter?: number[] | null;
  isMeasuring?: boolean;
  isIsolationActive?: boolean;
  pickedElement?: ElementProperties | null;
  onFilterStorey?: (storeyId: number | null) => void;
  onFilterType?: (typeCodes: number[] | null) => void;
  onToggleMeasurement?: () => void;
  onCaptureScreenshot?: () => void;
  onClippingHeight?: (value: number) => void;
  onClearIsolation?: () => void;
  onClearMeasurements?: () => void;
  onDismissPickedElement?: () => void;
}

export default function ModelViewer({
  containerRef, sysLog,
  v1File, v2File, v1State, v2State,
  v1Components, v2Components,
  v1Error, v2Error,
  bqFileName, bqItems, bqError, mappingError,
  compareMessage,
  onResetCamera, onToggleClipping,
  storeys = [],
  elementTypes = [],
  activeStoreyFilter,
  activeTypeFilter,
  isMeasuring = false,
  isIsolationActive = false,
  pickedElement,
  onFilterStorey,
  onFilterType,
  onToggleMeasurement,
  onCaptureScreenshot,
  onClippingHeight,
  onClearIsolation,
  onClearMeasurements,
  onDismissPickedElement,
}: ModelViewerProps) {
  const [toolsPanelOpen, setToolsPanelOpen] = useState(false);
  const [clippingValue, setClippingValue] = useState(100);
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);

  const handleClippingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setClippingValue(val);
    onClippingHeight?.(val / 100);
  };

  const handleTypeToggle = (typeCode: number) => {
    if (!onFilterType) return;
    const current = activeTypeFilter ?? null;
    if (current === null) {
      // Filter to only this type
      onFilterType([typeCode]);
    } else if (current.includes(typeCode)) {
      const next = current.filter((tc) => tc !== typeCode);
      onFilterType(next.length === 0 ? null : next);
    } else {
      onFilterType([...current, typeCode]);
    }
  };

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

      {/* Top-right camera controls */}
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button className="rounded bg-black/50 p-2 text-white hover:bg-black/80" onClick={onResetCamera}><Home size={16} /></button>
        <button className="rounded bg-black/50 p-2 text-white hover:bg-black/80" onClick={onToggleClipping}><BoxSelect size={16} /></button>
      </div>

      {/* 3D Tools floating panel — bottom-right */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
        {/* Active state badges */}
        {isMeasuring && (
          <div className="flex items-center gap-1.5 rounded-lg bg-blue-600/90 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            <Ruler size={12} /> Measuring — click two points
            <button onClick={onClearMeasurements} className="ml-1 rounded p-0.5 hover:bg-blue-500"><X size={12} /></button>
          </div>
        )}
        {isIsolationActive && (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-600/90 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            Isolation Mode
            <button onClick={onClearIsolation} className="ml-1 rounded p-0.5 hover:bg-amber-500"><X size={12} /></button>
          </div>
        )}

        {/* Collapsible tools panel */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/90 shadow-xl backdrop-blur">
          <button
            onClick={() => setToolsPanelOpen(!toolsPanelOpen)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white"
          >
            <span>3D Tools</span>
            {toolsPanelOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {toolsPanelOpen && (
            <div className="flex flex-col gap-3 border-t border-slate-700 px-3 py-3">
              {/* Storey Filter */}
              {storeys.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    <Layers size={10} /> Storey
                  </label>
                  <select
                    value={activeStoreyFilter ?? ''}
                    onChange={(e) => onFilterStorey?.(e.target.value ? Number(e.target.value) : null)}
                    className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                  >
                    <option value="">All Storeys</option>
                    {storeys.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.elevation.toFixed(1)}m)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Element Type Filter */}
              {elementTypes.length > 0 && (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setTypeFilterOpen(!typeFilterOpen)}
                    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-300"
                  >
                    <Filter size={10} /> Element Types
                    {activeTypeFilter && <span className="rounded bg-blue-600 px-1 py-0.5 text-[9px] text-white">{activeTypeFilter.length}</span>}
                  </button>
                  {typeFilterOpen && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 p-1.5">
                      <button
                        onClick={() => onFilterType?.(null)}
                        className="mb-1 w-full rounded px-2 py-1 text-left text-[10px] font-medium text-blue-400 hover:bg-slate-700"
                      >
                        Show All
                      </button>
                      {elementTypes.map((et) => (
                        <label key={et.typeCode} className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700">
                          <input
                            type="checkbox"
                            checked={activeTypeFilter?.includes(et.typeCode) ?? false}
                            onChange={() => handleTypeToggle(et.typeCode)}
                            className="h-3 w-3 rounded border-slate-600 bg-slate-700 text-blue-600"
                          />
                          {et.name} <span className="text-slate-500">({et.count})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Clipping Slider */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Clip Height</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={clippingValue}
                  onChange={handleClippingChange}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-blue-500"
                />
                <div className="text-[10px] text-slate-500 text-right">{clippingValue}%</div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1.5">
                <button
                  onClick={onToggleMeasurement}
                  className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition ${
                    isMeasuring
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Ruler size={12} /> Measure
                </button>
                <button
                  onClick={onCaptureScreenshot}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-[10px] font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
                >
                  <Camera size={12} /> Screenshot
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Picked element properties card */}
      {pickedElement && (
        <div className="absolute left-4 bottom-16 z-20 max-w-sm rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">Element Properties</div>
            <button onClick={onDismissPickedElement} className="rounded p-0.5 text-slate-400 hover:text-white"><X size={14} /></button>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="font-semibold text-slate-400">Type:</span>
              <span className="text-slate-200">{pickedElement.ifcType}</span>
            </div>
            {pickedElement.name && (
              <div className="flex gap-2">
                <span className="font-semibold text-slate-400">Name:</span>
                <span className="text-slate-200">{pickedElement.name}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="font-semibold text-slate-400">ID:</span>
              <span className="font-mono text-slate-300">#{pickedElement.expressId}</span>
            </div>
            {pickedElement.globalId && (
              <div className="flex gap-2">
                <span className="font-semibold text-slate-400">GUID:</span>
                <span className="font-mono text-[10px] text-slate-400">{pickedElement.globalId}</span>
              </div>
            )}
            {pickedElement.storey && (
              <div className="flex gap-2">
                <span className="font-semibold text-slate-400">Storey:</span>
                <span className="text-slate-200">{pickedElement.storey}</span>
              </div>
            )}
            {Object.keys(pickedElement.properties).length > 0 && (
              <div className="mt-2 border-t border-slate-700 pt-2">
                <div className="text-[10px] font-semibold text-slate-500 mb-1">Properties</div>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {Object.entries(pickedElement.properties).slice(0, 15).map(([k, v]) => (
                    <div key={k} className="flex gap-1 text-[10px]">
                      <span className="shrink-0 text-slate-500 truncate max-w-[140px]">{k}:</span>
                      <span className="text-slate-300 truncate">{v}</span>
                    </div>
                  ))}
                  {Object.keys(pickedElement.properties).length > 15 && (
                    <div className="text-[10px] text-slate-500">...and {Object.keys(pickedElement.properties).length - 15} more</div>
                  )}
                </div>
              </div>
            )}
            {Object.keys(pickedElement.quantities).length > 0 && (
              <div className="mt-2 border-t border-slate-700 pt-2">
                <div className="text-[10px] font-semibold text-slate-500 mb-1">Quantities</div>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {Object.entries(pickedElement.quantities).map(([k, v]) => (
                    <div key={k} className="flex gap-1 text-[10px]">
                      <span className="shrink-0 text-slate-500 truncate max-w-[140px]">{k}:</span>
                      <span className="text-emerald-400 font-mono">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
