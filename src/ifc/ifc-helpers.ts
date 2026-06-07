/**
 * Pure utility functions for unwrapping / normalizing IFC property
 * values returned by web-ifc's GetLine(). Stateless and side-effect
 * free — safe to use from any extraction context.
 */

import type { BimAttributeValue, BimQuantityValue } from '../vo-diff-core';
import type { IfcAPI, IfcLine } from './web-ifc-api';

// ── Value unwrapping ────────────────────────────────────────────────

export function unwrapIfcValue(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((item) => unwrapIfcValue(item));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('value' in record) return unwrapIfcValue(record.value);
  }
  return value;
}

export function normalizeIfcText(value: unknown): string {
  const normalized = unwrapIfcValue(value);
  if (normalized == null) return '';
  if (Array.isArray(normalized)) return normalized.map((entry) => normalizeIfcText(entry)).filter(Boolean).join(', ');
  if (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean') return String(normalized).trim();
  if (typeof normalized === 'object') {
    const record = normalized as Record<string, unknown>;
    if ('Name' in record) return normalizeIfcText(record.Name);
    if ('type' in record) return normalizeIfcText(record.type);
  }
  return '';
}

export function readIfcRef(value: unknown): number | null {
  const normalized = unwrapIfcValue(value);
  return typeof normalized === 'number' && Number.isFinite(normalized) ? normalized : null;
}

export function readIfcRefList(value: unknown): number[] {
  const normalized = unwrapIfcValue(value);
  if (!Array.isArray(normalized)) return [];
  return normalized.map((entry) => readIfcRef(entry)).filter((entry): entry is number => entry !== null);
}

// ── Name helpers ────────────────────────────────────────────────────

export function humanizeIfcName(name: string) {
  return name.replace(/^Ifc/, '') || name;
}

export function getSafeIfcTypeName(api: IfcAPI, typeCode: unknown, fallback = 'IfcEntity') {
  if (typeof typeCode !== 'number' || !Number.isFinite(typeCode)) return fallback;
  try {
    const resolved = api.GetNameFromTypeCode?.(typeCode);
    return typeof resolved === 'string' && resolved.trim() ? resolved : `${fallback}#${typeCode}`;
  } catch {
    return `${fallback}#${typeCode}`;
  }
}

export function summarizeRelatedLine(typeName: string, line: IfcLine | null): string {
  if (!line) return typeName || 'IfcReference';
  const globalId = normalizeIfcText(line.GlobalId);
  const name = normalizeIfcText(line.Name);
  const predefinedType = normalizeIfcText(line.PredefinedType);
  return [
    typeName || 'IfcReference',
    line.expressID ? `#${line.expressID}` : '',
    globalId ? `[${globalId}]` : '',
    name ? `"${name}"` : '',
    predefinedType ? `<${predefinedType}>` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function resolveIfcEntityLine(api: IfcAPI, modelID: number, expressID: number, props: IfcLine | null): IfcLine | null {
  if (props && normalizeIfcText(props.GlobalId)) return props;
  try {
    return api.GetLine(modelID, expressID);
  } catch {
    return props ?? null;
  }
}

// ── Metric helpers ──────────────────────────────────────────────────

export function roundMetric(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : '0.0000';
}

// ── Factory helpers ─────────────────────────────────────────────────

export function makeAttribute(key: string, value: string, source: BimAttributeValue['source']): BimAttributeValue {
  return { key, label: key, value, source };
}

export function makeQuantity(key: string, value: number, unit: string, source: BimQuantityValue['source']): BimQuantityValue {
  return { key, label: key, value, unit, source };
}
