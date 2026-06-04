import React, { useEffect, useRef, useState } from 'react';
import type { BimComponent, BqLineItem } from '../BimEngine';
import { DEFAULT_TEST_BQ_ITEMS, parseBqWorkbook, normalizeBqUnit } from '../bq-tools';
import { PROJECT_QS_OVERRIDES } from '../qs-project-config';
import { formatElementLabel, guessUnitBySection } from '../lib/format';

const BQ_MAPPING_STORAGE_KEY = `vo-system-bq-mappings:${PROJECT_QS_OVERRIDES.projectName}`;

export function useBqMapping(callbacks: {
  setSysLog: (msg: string) => void;
  v1Components: BimComponent[];
  v2Components: BimComponent[];
}) {
  // Use a ref so handleBqUpload always reads the latest component arrays
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [bqItems, setBqItems] = useState<BqLineItem[]>(DEFAULT_TEST_BQ_ITEMS);
  const [bqFileName, setBqFileName] = useState('');
  const [bqError, setBqError] = useState('');
  const [mappingError, setMappingError] = useState('');
  const [labelMappings, setLabelMappings] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem(BQ_MAPPING_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, string>>({});
  const bqInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BQ_MAPPING_STORAGE_KEY, JSON.stringify(labelMappings));
  }, [labelMappings]);

  const handleBqUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBqError('');
    try {
      const buffer = await file.arrayBuffer();
      const items = parseBqWorkbook(buffer);
      const currentCandidates = (() => {
        const map = new Map<string, string>();
        [...callbacksRef.current.v1Components, ...callbacksRef.current.v2Components].forEach((component) => {
          const label = formatElementLabel(component);
          if (!label || map.has(label)) return;
          map.set(label, guessUnitBySection(component.smm2SectionCode));
        });
        return map;
      })();
      let sanitizedCount = 0;
      setLabelMappings((current) => {
        const next: Record<string, string> = {};
        Object.entries(current).forEach(([label, itemReference]) => {
          const item = items.find((entry) => entry.itemReference === itemReference);
          const systemUnit = normalizeBqUnit(currentCandidates.get(label) || '');
          if (!item || !systemUnit || item.unit === systemUnit) {
            next[label] = String(itemReference);
            return;
          }
          sanitizedCount += 1;
        });
        return next;
      });
      setBqItems(items);
      setBqFileName(file.name);
      setMappingError(sanitizedCount > 0 ? `${sanitizedCount} invalid BQ mappings were cleared because their units did not match the system SMM2 unit.` : '');
      callbacksRef.current.setSysLog(`BQ loaded: ${items.length} contract line items ready for QS mapping.${sanitizedCount > 0 ? ` Cleared ${sanitizedCount} invalid unit-mismatch mappings.` : ''}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown BQ import error';
      setBqItems([]);
      setBqFileName('');
      setBqError(message);
      callbacksRef.current.setSysLog(`BQ import failed: ${message}`);
    }

    e.target.value = '';
  };

  return {
    bqItems, bqFileName, bqError, mappingError,
    labelMappings, setLabelMappings,
    mappingDrafts, setMappingDrafts,
    setMappingError,
    bqInputRef,
    handleBqUpload,
  };
}
