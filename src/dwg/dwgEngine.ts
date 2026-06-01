// Browser DWG takeoff engine — ported from dwg-mvp, adapted for browser (no fs).
// Parses a DWG ArrayBuffer via libredwg-web WASM, runs signature-based takeoff,
// returns unified QuantityItem[] + an annotated SVG of the column plan.
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import type { QuantityItem, DwgTakeoffResult } from './quantityModel';

interface Pt { x: number; y: number; d: number; n?: number }

function dedupColocated(points: Pt[], tol = 100) {
  const out: Pt[] = [];
  for (const p of points) {
    const hit = out.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < tol);
    if (hit) { hit.n = (hit.n ?? 1) + 1; if (p.d > hit.d) hit.d = p.d; }
    else out.push({ ...p, n: 1 });
  }
  return { points: out, removed: points.length - out.length };
}

function cluster(points: Pt[], threshold = 8000): Pt[][] {
  const n = points.length;
  const parent = [...Array(n).keys()];
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) <= threshold)
        parent[find(i)] = find(j);
  const groups: Record<number, Pt[]> = {};
  for (let i = 0; i < n; i++) (groups[find(i)] = groups[find(i)] || []).push(points[i]);
  return Object.values(groups).sort((a, b) => b.length - a.length);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function circlesOn(db: any, layer: string, minR = 50): Pt[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.entities.filter((e: any) => e.layer === layer && e.type === 'CIRCLE' && e.center && e.radius > minR)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => ({ x: e.center.x, y: e.center.y, d: Math.round(e.radius * 2) }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ellipsesOn(db: any, layer: string): Pt[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.entities.filter((e: any) => e.layer === layer && e.type === 'ELLIPSE' && e.center)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => ({ x: e.center.x, y: e.center.y, d: 0 }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function doorArcs(db: any): Pt[] {
  const out: Pt[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of db.entities as any[]) {
    if (e.layer !== 'DOOR' || e.type !== 'ARC' || !e.center || !e.radius) continue;
    if (e.radius < 600 || e.radius > 1100) continue;
    let sweep = (((e.endAngle ?? 0) - (e.startAngle ?? 0)) * 180 / Math.PI) % 360;
    if (sweep < 0) sweep += 360;
    if (sweep < 50 || sweep > 110) continue;
    out.push({ x: e.center.x, y: e.center.y, d: Math.round(e.radius / 50) * 50 });
  }
  return out;
}

function widthHist(arr: Pt[]) {
  const h: Record<number, number> = {};
  for (const a of arr) h[a.d] = (h[a.d] || 0) + 1;
  return h;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderColumnSvg(plan: Pt[]): string {
  if (!plan.length) return '';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of plan) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); }
  const mgn = (maxX - minX) * 0.08 || 1000; minX -= mgn; minY -= mgn; maxX += mgn; maxY += mgn;
  const W = 800, scale = W / (maxX - minX), H = Math.round((maxY - minY) * scale);
  const X = (x: number) => ((x - minX) * scale).toFixed(1);
  const Y = (y: number) => ((maxY - y) * scale).toFixed(1);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%"><rect width="${W}" height="${H}" fill="#0b1220"/>`];
  for (const c of plan) {
    const color = Math.abs(c.d - 300) < 40 ? '#f44' : Math.abs(c.d - 450) < 40 ? '#fd0' : '#0cf';
    const r = Math.max(4, (c.d / 2) * scale);
    parts.push(`<circle cx="${X(c.x)}" cy="${Y(c.y)}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

export async function runDwgTakeoff(buffer: ArrayBuffer, fileName: string): Promise<DwgTakeoffResult> {
  const libredwg = await LibreDwg.create('/wasm/');
  const dwg = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = libredwg.convert(dwg);
  const items: QuantityItem[] = [];

  // ── Columns (circle, cross-validated) ──
  const rawCols = circlesOn(db, 'COLUMN');
  const colDD = dedupColocated(rawCols).points;
  const colPlans = cluster(colDD).filter((g) => g.length >= 10);
  const colPlan = colPlans[0] ?? [];
  const d300 = colPlan.filter((c) => Math.abs(c.d - 300) < 40).length;
  const d450 = colPlan.filter((c) => Math.abs(c.d - 450) < 40).length;
  if (d300) items.push({ source: 'dwg', category: '柱 Ø300mm', measureKind: 'count', quantity: d300, unit: 'nr', confidence: 'high', needsReview: false, description: 'Circular column Ø300' });
  if (d450) items.push({ source: 'dwg', category: '柱 Ø450mm', measureKind: 'count', quantity: d450, unit: 'nr', confidence: 'high', needsReview: false, description: 'Circular column Ø450' });

  // ── Doors (swing arc) ──
  const doors = dedupColocated(doorArcs(db), 150).points;
  const doorPlans = cluster(doors).filter((g) => g.length >= 3);
  const doorPlan = doorPlans[0] ?? [];
  if (doorPlan.length) {
    const wh = widthHist(doorPlan);
    for (const [w, c] of Object.entries(wh).sort((a, b) => b[1] - a[1])) {
      items.push({ source: 'dwg', category: `门 ${w}mm`, measureKind: 'count', quantity: c, unit: 'nr', confidence: 'high', needsReview: false, description: `Door leaf ${w}mm` });
    }
  }

  // ── Sanitary (ellipse) ──
  const san = dedupColocated(ellipsesOn(db, 'SANITARY'), 500).points;
  const sanGroups = cluster(san, 6000).filter((g) => g.length >= 3);
  const sanCount = sanGroups.reduce((s, g) => s + g.length, 0);
  if (sanCount) items.push({ source: 'dwg', category: '卫生洁具', measureKind: 'count', quantity: sanCount, unit: 'nr', confidence: 'review', needsReview: true, description: 'Sanitary fixtures (type needs QS review)' });

  // ── Rainwater downpipes (circle Ø100) ──
  const rwdp = dedupColocated(circlesOn(db, 'Rainwdp'), 150).points.filter((c) => Math.abs(c.d - 100) < 40);
  if (rwdp.length) items.push({ source: 'dwg', category: '雨水管 Ø100mm', measureKind: 'count', quantity: rwdp.length, unit: 'nr', confidence: 'high', needsReview: false, description: 'Rainwater downpipe Ø100' });

  const annotatedSvg = renderColumnSvg(colPlan);
  const sizeMB = buffer.byteLength / 1024 / 1024;
  const entities = db.entities.length;
  libredwg.dwg_free(dwg);

  return { fileName, sizeMB, entities, items, annotatedSvg };
}
