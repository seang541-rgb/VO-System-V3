// Idea Nest Audit — Aggregation layer
// Source: D:/IdeaNest/IdeaNest_Portable/ideanest_server_portable.js
// (summarizeRecords + buildBqRows). Pure aggregation — no IFC API.

import type {
  AuditSummary,
  BqRow,
  ClassificationBucket,
  ElementAuditRecord,
  QuantitySourceBucket,
} from './types';

/**
 * Build a quantity-source breakdown — for each `quantitySource` string, how
 * many records used it and what's the total net volume sourced from it.
 * Useful for the agent to narrate "65% of volumes came from
 * Qto_WallBaseQuantities.NetVolume" etc.
 */
export function summarizeQuantitySources(records: ElementAuditRecord[]): QuantitySourceBucket[] {
  const buckets = new Map<string, QuantitySourceBucket>();
  for (const r of records) {
    const source = r.quantitySource || '(none)';
    const bucket = buckets.get(source) ?? { source, count: 0, netVolumeM3: 0 };
    bucket.count += 1;
    bucket.netVolumeM3 += r.netVolumeM3 ?? 0;
    buckets.set(source, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
}

/**
 * Aggregate records by (classification, jkrCode, elementGroup). One bucket
 * per distinct triple, with summed quantities.
 */
export function summarizeClassifications(records: ElementAuditRecord[]): ClassificationBucket[] {
  const buckets = new Map<string, ClassificationBucket>();
  for (const r of records) {
    const key = `${r.jkrCode}|${r.classification}|${r.elementGroup}`;
    const bucket = buckets.get(key) ?? {
      classification: r.classification,
      jkrCode: r.jkrCode,
      elementGroup: r.elementGroup,
      count: 0,
      netVolumeM3: 0,
      netAreaM2: 0,
    };
    bucket.count += 1;
    bucket.netVolumeM3 += r.netVolumeM3 ?? 0;
    // Wall side area as a proxy for net area; if absent, fall back to opening area or 0.
    bucket.netAreaM2 += r.wallSideAreaM2 ?? 0;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => Math.abs(b.netVolumeM3) - Math.abs(a.netVolumeM3));
}

/**
 * Build BQ-shaped rows: one row per JKR code, with description, unit,
 * total net quantity, and how many elements contribute. This is what the
 * agent surfaces in the conversational summary.
 */
export function buildBqRows(records: ElementAuditRecord[]): BqRow[] {
  const buckets = new Map<string, BqRow & { _accNetArea: number; _hasVolume: boolean }>();

  for (const r of records) {
    const key = r.jkrCode || '(unclassified)';
    const bucket = buckets.get(key) ?? {
      item: key,
      description: r.description || r.classification || r.ifcClass,
      unit: 'm3',
      netQty: 0,
      elementCount: 0,
      _accNetArea: 0,
      _hasVolume: false,
    };
    bucket.elementCount += 1;
    if (r.netVolumeM3 != null) {
      bucket.netQty += r.netVolumeM3;
      bucket._hasVolume = true;
    }
    if (r.wallSideAreaM2 != null) {
      bucket._accNetArea += r.wallSideAreaM2;
    }
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map(({ _accNetArea, _hasVolume, ...bucket }) => {
      // Covering: prefer area as unit if no volumes were available
      if (!_hasVolume && _accNetArea > 0) {
        return { ...bucket, unit: 'm2', netQty: _accNetArea };
      }
      return bucket;
    })
    .sort((a, b) => Math.abs(b.netQty) - Math.abs(a.netQty));
}

/**
 * One-shot summary for the agent. Combines all aggregations into the
 * `AuditSummary` shape declared in types.ts.
 */
export function buildAuditSummary(records: ElementAuditRecord[]): AuditSummary {
  return {
    recordCount: records.length,
    jkrCodeCount: new Set(records.map((r) => r.jkrCode || '(unclassified)')).size,
    quantitySources: summarizeQuantitySources(records),
    classifications: summarizeClassifications(records),
  };
}
