import * as XLSX from 'xlsx';
import type { BqLineItem } from './vo-diff-core';
import { semanticBqMatch } from './bq-vector-match';

export const DEFAULT_TEST_BQ_ITEMS: BqLineItem[] = [
  { itemReference: 'BQ/F/01', description: 'Normal concrete or structural item test rate', unit: 'm3', contractRate: 420 },
  { itemReference: 'BQ/G/01', description: '115mm brickwall', unit: 'm2', contractRate: 45 },
  { itemReference: 'BQ/ERROR', description: '115mm brickwall poison item', unit: 'm3', contractRate: 999 },
];

export interface BqRecommendation extends BqLineItem {
  score: number;
  reasons: string[];
}

const REQUIRED_HEADERS = ['Item Reference', 'Description', 'Unit', 'Contract Rate'] as const;

type BqRow = Record<string, unknown>;

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function normalizeBqUnit(value: string) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return '';
  if (['m2', 'm^2', 'm?', 'sqm'].includes(normalized)) return 'm2';
  if (['m3', 'm^3', 'm?', 'cum'].includes(normalized)) return 'm3';
  if (['nr', 'no', 'nos', 'count', 'item'].includes(normalized)) return 'nr';
  if (['m', 'lm', 'lin m'].includes(normalized)) return 'm';
  if (['kg'].includes(normalized)) return 'kg';
  return normalized;
}


const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'in', 'of', 'to', 'complete', 'including', 'thick']);

function tokenizeBqText(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function scoreBqMatch(item: BqLineItem, qsLabel: string, sectionCode: string, systemUnit: string) {
  const labelTokens = new Set(tokenizeBqText(qsLabel));
  const itemTokens = tokenizeBqText(`${item.itemReference} ${item.description}`);
  const matches = itemTokens.filter((token) => labelTokens.has(token));
  let score = matches.length * 12;
  const reasons: string[] = [];

  if (matches.length > 0) reasons.push(`token overlap: ${matches.slice(0, 5).join(', ')}`);
  if (item.itemReference.toLowerCase().includes(`/${sectionCode.toLowerCase()}/`) || item.itemReference.toLowerCase().includes(`${sectionCode.toLowerCase()}.`)) {
    score += 18;
    reasons.push(`section reference matches ${sectionCode}`);
  }
  if (systemUnit && item.unit === normalizeBqUnit(systemUnit)) {
    score += 20;
    reasons.push(`unit matches ${item.unit}`);
  }
  if (/115/.test(qsLabel) && /115/.test(item.description)) {
    score += 14;
    reasons.push('dimension token 115 matches');
  }
  if (/brick/i.test(qsLabel) && /brick/i.test(item.description)) {
    score += 10;
    reasons.push('material token brick matches');
  }
  if (/concrete/i.test(qsLabel) && /concrete/i.test(item.description)) {
    score += 10;
    reasons.push('material token concrete matches');
  }
  if (/basin|sanitary|wash hand basin/i.test(qsLabel) && /basin|sanitary|wash hand basin/i.test(item.description)) {
    score += 10;
    reasons.push('sanitary equipment wording matches');
  }

  return { score, reasons };
}

export function recommendBqMatches(items: BqLineItem[], qsLabel: string, sectionCode: string, systemUnit: string, limit = 3): BqRecommendation[] {
  return items
    .map((item) => {
      const { score, reasons } = scoreBqMatch(item, qsLabel, sectionCode, systemUnit);
      return { ...item, score, reasons };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.itemReference.localeCompare(right.itemReference))
    .slice(0, limit);
}

export async function recommendBqMatchesHybrid(
  items: BqLineItem[],
  qsLabel: string,
  sectionCode: string,
  systemUnit: string,
  projectId: string | null,
  limit = 5,
): Promise<BqRecommendation[]> {
  const tokenResults = recommendBqMatches(items, qsLabel, sectionCode, systemUnit, limit * 2);

  if (!projectId) return tokenResults.slice(0, limit);

  let vectorResults: { itemReference: string; similarity: number }[] = [];
  try {
    vectorResults = await semanticBqMatch(projectId, qsLabel, limit * 2);
  } catch {
    return tokenResults.slice(0, limit);
  }

  const vectorMap = new Map(vectorResults.map((v) => [v.itemReference, v.similarity]));

  const fused = tokenResults.map((r) => {
    const vectorSim = vectorMap.get(r.itemReference) ?? 0;
    const vectorBonus = Math.round(vectorSim * 50);
    return {
      ...r,
      score: r.score + vectorBonus,
      reasons: vectorBonus > 0
        ? [...r.reasons, `vector similarity: ${(vectorSim * 100).toFixed(0)}%`]
        : r.reasons,
    };
  });

  for (const vr of vectorResults) {
    if (!fused.some((f) => f.itemReference === vr.itemReference)) {
      const matched = items.find((i) => i.itemReference === vr.itemReference);
      if (matched) {
        fused.push({
          ...matched,
          score: Math.round(vr.similarity * 50),
          reasons: [`vector similarity: ${(vr.similarity * 100).toFixed(0)}%`],
        });
      }
    }
  }

  return fused
    .sort((a, b) => b.score - a.score || a.itemReference.localeCompare(b.itemReference))
    .slice(0, limit);
}

function coerceRate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').replace(/[^\d.-]+/g, '');
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function mapRow(row: BqRow, rowIndex: number): BqLineItem {
  const columns = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
  const itemReference = String(columns['item reference'] ?? '').trim();
  const description = String(columns['description'] ?? '').trim();
  const unit = normalizeBqUnit(String(columns['unit'] ?? '').trim());
  const contractRate = coerceRate(columns['contract rate']);

  if (!itemReference) throw new Error(`BQ row ${rowIndex}: Item Reference is required.`);
  if (!description) throw new Error(`BQ row ${rowIndex}: Description is required.`);
  if (!unit) throw new Error(`BQ row ${rowIndex}: Unit is required.`);
  if (!Number.isFinite(contractRate)) throw new Error(`BQ row ${rowIndex}: Contract Rate must be numeric.`);

  return { itemReference, description, unit, contractRate };
}

export function parseBqWorkbook(buffer: ArrayBuffer): BqLineItem[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('BQ workbook is empty.');
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<BqRow>(sheet, { defval: '' });
  if (rows.length === 0) throw new Error('BQ sheet contains no data rows.');

  const firstRowHeaders = Object.keys(rows[0]).map(normalizeHeader);
  for (const header of REQUIRED_HEADERS) {
    if (!firstRowHeaders.includes(normalizeHeader(header))) {
      throw new Error(`BQ sheet must contain the column "${header}".`);
    }
  }

  const items = rows.map((row, index) => mapRow(row, index + 2));
  const seenRefs = new Set<string>();
  items.forEach((item) => {
    const key = item.itemReference.toLowerCase();
    if (seenRefs.has(key)) throw new Error(`Duplicate Item Reference found: ${item.itemReference}`);
    seenRefs.add(key);
  });

  return items;
}

export function exportBqTemplateWorkbook() {
  const aoa = [
    ['Item Reference', 'Description', 'Unit', 'Contract Rate'],
    ...DEFAULT_TEST_BQ_ITEMS.map((item) => [item.itemReference, item.description, item.unit, item.contractRate]),
    ['BQ/U/03', 'Wash hand basin complete with fittings', 'nr', 650],
  ];
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 18 },
    { wch: 56 },
    { wch: 10 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, 'BQ Import Template');
  XLSX.writeFile(workbook, 'vo-bq-import-template.xlsx');
}
