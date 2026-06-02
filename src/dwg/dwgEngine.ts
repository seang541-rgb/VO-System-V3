// Browser DWG takeoff engine — ported from dwg-mvp, adapted for browser (no fs).
// Parses a DWG ArrayBuffer via libredwg-web WASM, runs signature-based takeoff,
// returns unified QuantityItem[] + an annotated SVG of the column plan.
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

// Layers that are noise / not part of the building drawing.
const RENDER_NOISE = new Set(['tblk', 'KEY PLAN', 'DEFPOINTS', 'DIM', 'PATRN']);

// per-layer stroke colour so the rendered drawing reads like the real plan
function layerColor(layer: string): string {
  const L = layer.toUpperCase();
  if (L === 'COLUMN') return '#e0564d';
  if (L === 'WALL') return '#cbd5e1';
  if (L === 'BEAM') return '#f59e0b';
  if (L.startsWith('DOOR')) return '#38bdf8';
  if (L.startsWith('WIN')) return '#34d399';
  if (L === 'GRID') return '#475569';
  if (L.includes('ROOF') || L.includes('TRUSS')) return '#fb923c';
  if (L === 'SANITARY') return '#22d3ee';
  if (L === 'RAINWDP' || L === 'RWDP') return '#60a5fa';
  if (L.includes('STAIR')) return '#a78bfa';
  return '#3a4a64';
}

interface Seg { x1: number; y1: number; x2: number; y2: number; layer: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectSegments(db: any): Seg[] {
  const segs: Seg[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of db.entities as any[]) {
    if (RENDER_NOISE.has(e.layer)) continue;
    if (e.type === 'LINE' && e.startPoint && e.endPoint) {
      segs.push({ x1: e.startPoint.x, y1: e.startPoint.y, x2: e.endPoint.x, y2: e.endPoint.y, layer: e.layer });
    } else if (e.type === 'LWPOLYLINE' && e.vertices) {
      for (let i = 0; i < e.vertices.length - 1; i++) {
        const a = e.vertices[i], b = e.vertices[i + 1];
        segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, layer: e.layer });
      }
    }
  }
  return segs;
}

// Render the real drawing linework (all building layers) + highlight detected columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderDrawingSvg(db: any, columns: Pt[]): string {
  const segs = collectSegments(db);
  if (!segs.length && !columns.length) return '';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of segs) { minX = Math.min(minX, s.x1, s.x2); minY = Math.min(minY, s.y1, s.y2); maxX = Math.max(maxX, s.x1, s.x2); maxY = Math.max(maxY, s.y1, s.y2); }
  if (!isFinite(minX)) { for (const c of columns) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); } }
  const mgn = (maxX - minX) * 0.03 || 1000; minX -= mgn; minY -= mgn; maxX += mgn; maxY += mgn;
  const W = 1600, scale = W / (maxX - minX), H = Math.round((maxY - minY) * scale);
  const X = (x: number) => ((x - minX) * scale).toFixed(1);
  const Y = (y: number) => ((maxY - y) * scale).toFixed(1);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%"><rect width="${W}" height="${H}" fill="#0b1220"/>`];
  // group segments by colour for compact output
  const byColor: Record<string, string[]> = {};
  for (const s of segs) {
    const col = layerColor(s.layer);
    (byColor[col] = byColor[col] || []).push(`M${X(s.x1)} ${Y(s.y1)}L${X(s.x2)} ${Y(s.y2)}`);
  }
  for (const [col, paths] of Object.entries(byColor)) {
    const op = col === '#3a4a64' ? 0.45 : 0.85;
    const sw = col === '#3a4a64' ? 1.0 : 1.6;
    parts.push(`<path d="${paths.join('')}" stroke="${col}" stroke-width="${sw}" fill="none" opacity="${op}"/>`);
  }
  // highlight detected columns on top
  for (const c of columns) {
    const color = Math.abs(c.d - 300) < 40 ? '#ff5555' : Math.abs(c.d - 450) < 40 ? '#fde047' : '#22d3ee';
    const r = Math.max(3, (c.d / 2) * scale);
    parts.push(`<circle cx="${X(c.x)}" cy="${Y(c.y)}" r="${r.toFixed(1)}" fill="${color}33" stroke="${color}" stroke-width="1.5"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

export async function runDwgTakeoff(buffer: ArrayBuffer, fileName: string): Promise<DwgTakeoffResult> {
  // Lazy-load the heavy WASM parser only when a DWG is actually uploaded.
  const { Dwg_File_Type, LibreDwg } = await import('@mlightcad/libredwg-web');
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

  // ── Rainwater downpipes (circle Ø100) ── minR low: downpipe radius is ~50mm
  const rwdp = dedupColocated(circlesOn(db, 'Rainwdp', 10), 150).points.filter((c) => Math.abs(c.d - 100) < 40);
  if (rwdp.length) items.push({ source: 'dwg', category: '雨水管 Ø100mm', measureKind: 'count', quantity: rwdp.length, unit: 'nr', confidence: 'high', needsReview: false, description: 'Rainwater downpipe Ø100' });

  const annotatedSvg = renderDrawingSvg(db, colDD);
  const sizeMB = buffer.byteLength / 1024 / 1024;
  const entities = db.entities.length;
  libredwg.dwg_free(dwg);

  return { fileName, sizeMB, entities, items, annotatedSvg };
}
