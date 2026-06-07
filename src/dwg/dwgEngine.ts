// Browser DWG takeoff engine — ported from dwg-mvp, adapted for browser (no fs).
// Parses a DWG ArrayBuffer via libredwg-web WASM, runs signature-based takeoff,
// returns unified QuantityItem[] + an annotated SVG of the column plan.
import type { QuantityItem, DwgTakeoffResult } from './quantityModel';
import type { DwgDatabase, DwgEntity, DwgLayerEntry } from './libredwg';

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
  const find = (x: number): number => {
    let cur = x;
    while (parent[cur] !== cur) { parent[cur] = parent[parent[cur]!]!; cur = parent[cur]!; }
    return cur;
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y) <= threshold)
        parent[find(i)] = find(j);
  const groups: Record<number, Pt[]> = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    (groups[root] = groups[root] ?? []).push(points[i]!);
  }
  return Object.values(groups).sort((a, b) => b.length - a.length);
}

function circlesOn(db: DwgDatabase, layer: string, minR = 50): Pt[] {
  return db.entities
    .filter((e) => e.layer === layer && e.type === 'CIRCLE' && e.center && e.radius != null && e.radius > minR)
    .map((e) => ({ x: e.center!.x, y: e.center!.y, d: Math.round(e.radius! * 2) }));
}

function ellipsesOn(db: DwgDatabase, layer: string): Pt[] {
  return db.entities
    .filter((e) => e.layer === layer && e.type === 'ELLIPSE' && e.center)
    .map((e) => ({ x: e.center!.x, y: e.center!.y, d: 0 }));
}

function doorArcs(db: DwgDatabase): Pt[] {
  const out: Pt[] = [];
  for (const e of db.entities) {
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
  for (const a of arr) h[a.d] = (h[a.d] ?? 0) + 1;
  return h;
}

// Layers that are noise / blow up the extent (title block, key plan).
const RENDER_NOISE = new Set(['tblk', 'KEY PLAN', 'DEFPOINTS']);

// AutoCAD Color Index (ACI) → hex. The look of a CAD drawing comes from these.
const ACI: Record<number, string> = {
  1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF', 5: '#0000FF', 6: '#FF00FF',
  7: '#FFFFFF', 8: '#808080', 9: '#C0C0C0',
  10: '#FF0000', 11: '#FF7F7F', 12: '#CC0000', 30: '#FF7F00', 31: '#FFBF7F',
  40: '#FFBF00', 50: '#FFFF00', 60: '#BFFF00', 70: '#7FFF00', 90: '#00FF00',
  130: '#00FFBF', 150: '#00BFFF', 170: '#007FFF', 190: '#0000FF', 210: '#7F00FF',
  230: '#FF00BF', 250: '#333333', 251: '#5B5B5B', 252: '#848484', 253: '#ADADAD', 254: '#D6D6D6', 255: '#FFFFFF',
};
function aciToHex(idx: number): string {
  const mapped = ACI[idx];
  if (mapped) return mapped;
  if (idx >= 250 && idx <= 255) return ACI[idx] ?? '#888888';
  // approximate the colour wheel for unlisted indices
  if (idx >= 10 && idx < 250) {
    const hue = ((idx - 10) / 240) * 360;
    return `hsl(${hue.toFixed(0)},90%,60%)`;
  }
  return '#9aa7bd';
}

interface ColorMap { [layer: string]: number }

function buildLayerColors(db: DwgDatabase): ColorMap {
  const map: ColorMap = {};
  const entries: DwgLayerEntry[] = db.tables?.LAYER?.entries ?? [];
  for (const l of entries) map[l.name] = l.colorIndex ?? 7;
  return map;
}

// resolve an entity's effective colour (BYLAYER 256 / BYBLOCK 0 → layer colour)
function entityHex(e: DwgEntity, layerColors: ColorMap): string {
  let ci = e.colorIndex;
  if (ci == null || ci === 256 || ci === 0) ci = layerColors[e.layer] ?? 7;
  if (ci === 7) return '#d8dee9'; // white-on-black → light grey so it shows on dark bg
  return aciToHex(ci);
}

// Render the drawing faithfully using each entity's ACI colour + all geometry types.
function renderDrawingSvg(db: DwgDatabase, columns: Pt[]): string {
  const layerColors = buildLayerColors(db);
  // bounds from model-space geometry
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
  // bounds from line/polyline geometry only (small circles/arcs OK, but huge
  // construction arcs e.g. Ø58m roof arcs must not blow up the extent)
  for (const e of db.entities) {
    if (RENDER_NOISE.has(e.layer)) continue;
    if (e.type === 'LINE' && e.startPoint && e.endPoint) { ext(e.startPoint.x, e.startPoint.y); ext(e.endPoint.x, e.endPoint.y); }
    else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE_2D') && e.vertices) for (const v of e.vertices) ext(v.x, v.y);
    else if (e.type === 'CIRCLE' && e.center && e.radius && e.radius < 2000) { ext(e.center.x - e.radius, e.center.y - e.radius); ext(e.center.x + e.radius, e.center.y + e.radius); }
  }
  if (!isFinite(minX)) { for (const c of columns) ext(c.x, c.y); }
  if (!isFinite(minX)) return '';
  const mgn = (maxX - minX) * 0.02 || 1000; minX -= mgn; minY -= mgn; maxX += mgn; maxY += mgn;
  const W = 1800, scale = W / (maxX - minX), H = Math.round((maxY - minY) * scale);
  const drawingW = maxX - minX;
  const X = (x: number) => ((x - minX) * scale).toFixed(1);
  const Y = (y: number) => ((maxY - y) * scale).toFixed(1);

  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%"><rect width="${W}" height="${H}" fill="#000000"/>`];
  // group line-like paths by colour for compact output
  const byColor: Record<string, string[]> = {};
  const pushSeg = (col: string, d: string) => { (byColor[col] = byColor[col] ?? []).push(d); };
  const shapes: string[] = []; // circles / ellipses / arcs / text kept separate (need own attrs)
  const texts: string[] = [];

  for (const e of db.entities) {
    if (RENDER_NOISE.has(e.layer)) continue;
    const hex = entityHex(e, layerColors);
    switch (e.type) {
      case 'LINE':
        if (e.startPoint && e.endPoint) pushSeg(hex, `M${X(e.startPoint.x)} ${Y(e.startPoint.y)}L${X(e.endPoint.x)} ${Y(e.endPoint.y)}`);
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE_2D':
        if (e.vertices && e.vertices.length > 1) {
          const v0 = e.vertices[0]!;
          let d = `M${X(v0.x)} ${Y(v0.y)}`;
          for (let i = 1; i < e.vertices.length; i++) {
            const v = e.vertices[i]!;
            d += `L${X(v.x)} ${Y(v.y)}`;
          }
          if (e.closed) d += 'Z';
          pushSeg(hex, d);
        }
        break;
      case 'CIRCLE':
        if (e.center && e.radius) shapes.push(`<circle cx="${X(e.center.x)}" cy="${Y(e.center.y)}" r="${(e.radius*scale).toFixed(1)}" fill="none" stroke="${hex}" stroke-width="0.8"/>`);
        break;
      case 'ARC':
        if (e.center && e.radius != null) {
          const a0 = e.startAngle ?? 0, a1 = e.endAngle ?? Math.PI * 2;
          let sweep = a1 - a0; if (sweep < 0) sweep += Math.PI * 2;
          const large = sweep > Math.PI ? 1 : 0;
          const x0 = e.center.x + e.radius * Math.cos(a0), y0 = e.center.y + e.radius * Math.sin(a0);
          const x1 = e.center.x + e.radius * Math.cos(a1), y1 = e.center.y + e.radius * Math.sin(a1);
          const rr = (e.radius * scale).toFixed(1);
          // y flipped → sweep flag flips to 1
          shapes.push(`<path d="M${X(x0)} ${Y(y0)}A${rr} ${rr} 0 ${large} 1 ${X(x1)} ${Y(y1)}" fill="none" stroke="${hex}" stroke-width="0.8"/>`);
        }
        break;
      case 'ELLIPSE':
        if (e.center && e.majorAxisEndPoint) {
          const mx = e.majorAxisEndPoint.x, my = e.majorAxisEndPoint.y;
          const rmaj = Math.hypot(mx, my) * scale;
          const rmin = rmaj * (e.axisRatio ?? 1);
          const rot = -Math.atan2(my, mx) * 180 / Math.PI; // y flipped
          if (rmaj > 0.5) shapes.push(`<ellipse cx="${X(e.center.x)}" cy="${Y(e.center.y)}" rx="${rmaj.toFixed(1)}" ry="${rmin.toFixed(1)}" fill="none" stroke="${hex}" stroke-width="0.8" transform="rotate(${rot.toFixed(1)} ${X(e.center.x)} ${Y(e.center.y)})"/>`);
        }
        break;
      case 'TEXT':
      case 'MTEXT': {
        const raw = e.text ?? e.contents ?? e.textValue ?? e.string ?? '';
        const pos = e.insertionPoint ?? e.startPoint ?? e.position ?? e.center;
        if (!raw || !pos) break;
        const txt = String(raw).replace(/\\[A-Za-z][^;]*;|[{}]|\\P/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
        const h = (e.height ?? e.textHeight ?? 200) * scale;
        if (!txt || h < 2) break;
        const esc = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        texts.push(`<text x="${X(pos.x)}" y="${Y(pos.y)}" font-size="${Math.min(h, drawingW * 0.02).toFixed(1)}" fill="${hex}" opacity="0.9">${esc}</text>`);
        break;
      }
      default: break;
    }
  }

  for (const [col, ds] of Object.entries(byColor)) parts.push(`<path d="${ds.join('')}" stroke="${col}" stroke-width="0.8" fill="none"/>`);
  parts.push(shapes.join(''));
  parts.push(texts.join(''));
  // highlight detected columns on top (takeoff overlay)
  for (const c of columns) {
    const color = Math.abs(c.d - 300) < 40 ? '#ff3b3b' : Math.abs(c.d - 450) < 40 ? '#ffd400' : '#22d3ee';
    const r = Math.max(3, (c.d / 2) * scale);
    parts.push(`<circle cx="${X(c.x)}" cy="${Y(c.y)}" r="${r.toFixed(1)}" fill="${color}44" stroke="${color}" stroke-width="2"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

// ── Area helpers ─────────────────────────────────────────────────────────────
function polygonAreaMm2(verts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i]!;
    const q = verts[(i + 1) % verts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

type XY = { x: number; y: number };

// building footprint via convex hull of column positions → m²
function footprintAreaM2(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  const sorted = pts.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: XY[] = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop(); lower.push(p); }
  const upper: XY[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]!; while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop(); upper.push(p); }
  return polygonAreaMm2(lower.slice(0, -1).concat(upper.slice(0, -1))) / 1e6;
}

// largest closed-polyline area on building layers → m²
function largestSlabAreaM2(db: DwgDatabase): number {
  let best = 0;
  for (const e of db.entities) {
    if (e.type !== 'LWPOLYLINE' || !e.vertices || e.vertices.length < 3) continue;
    if (!['Building', 'Conc. slab', 'ROOF', 'BOUNDARY'].includes(e.layer)) continue;
    const aM2 = polygonAreaMm2(e.vertices) / 1e6;
    if (aM2 > best && aM2 < 100000) best = aM2;
  }
  return best;
}

// ── Wall length (parallel-pair → centerline) within a plan bbox ──────────────
interface LineSegment { x1: number; y1: number; x2: number; y2: number }

function wallCenterlineLengthM(db: DwgDatabase, box: { x0: number; y0: number; x1: number; y1: number }): number {
  const lines: LineSegment[] = [];
  for (const e of db.entities) {
    if (e.layer !== 'WALL') continue;
    if (e.type === 'LINE' && e.startPoint && e.endPoint) lines.push({ x1: e.startPoint.x, y1: e.startPoint.y, x2: e.endPoint.x, y2: e.endPoint.y });
    else if (e.type === 'LWPOLYLINE' && e.vertices) {
      for (let i = 0; i < e.vertices.length - 1; i++) {
        const va = e.vertices[i]!;
        const vb = e.vertices[i + 1]!;
        lines.push({ x1: va.x, y1: va.y, x2: vb.x, y2: vb.y });
      }
    }
  }
  const inBox = (l: LineSegment) => { const mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2; return mx >= box.x0 && mx <= box.x1 && my >= box.y0 && my <= box.y1; };
  const plan = lines.filter((l) => inBox(l) && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) >= 300);
  const ang = (l: LineSegment) => { const a = Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180 / Math.PI; return ((a % 180) + 180) % 180; };
  const perp = (a: LineSegment, px: number, py: number) => { const dx = a.x2 - a.x1, dy = a.y2 - a.y1, L = Math.hypot(dx, dy) || 1; return Math.abs((px - a.x1) * dy - (py - a.y1) * dx) / L; };
  const proj = (a: LineSegment, px: number, py: number) => { const dx = a.x2 - a.x1, dy = a.y2 - a.y1, L2 = dx * dx + dy * dy || 1; return ((px - a.x1) * dx + (py - a.y1) * dy) / Math.sqrt(L2); };
  const used = new Array<boolean>(plan.length).fill(false);
  let totalMm = 0;
  for (let i = 0; i < plan.length; i++) {
    if (used[i]) continue;
    const a = plan[i]!;
    const aAng = ang(a);
    let best = -1, bestOv = 200;
    for (let j = i + 1; j < plan.length; j++) {
      if (used[j]) continue;
      const b = plan[j]!;
      const da = Math.abs(aAng - ang(b));
      if (da > 4 && da < 176) continue;
      const thk = perp(a, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2);
      if (thk < 60 || thk > 400) continue;
      const ta1 = proj(a, a.x1, a.y1), ta2 = proj(a, a.x2, a.y2), tb1 = proj(a, b.x1, b.y1), tb2 = proj(a, b.x2, b.y2);
      const ov = Math.min(Math.max(ta1, ta2), Math.max(tb1, tb2)) - Math.max(Math.min(ta1, ta2), Math.min(tb1, tb2));
      if (ov > bestOv) { bestOv = ov; best = j; }
    }
    if (best >= 0) { used[i] = true; used[best] = true; totalMm += bestOv; }
  }
  return totalMm / 1000;
}

export async function runDwgTakeoff(buffer: ArrayBuffer, fileName: string): Promise<DwgTakeoffResult> {
  // Lazy-load the heavy WASM parser only when a DWG is actually uploaded.
  const { Dwg_File_Type, LibreDwg } = await import('@mlightcad/libredwg-web');
  const libredwg = await LibreDwg.create('/wasm/');
  const dwg = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG)!;
  const db = libredwg.convert(dwg) as unknown as DwgDatabase;
  const items: QuantityItem[] = [];

  // ── Columns (circle, cross-validated) ──
  const rawCols = circlesOn(db, 'COLUMN');
  const colDD = dedupColocated(rawCols).points;
  const colPlans = cluster(colDD).filter((g) => g.length >= 10);
  const colPlan = colPlans[0] ?? [];
  const d300 = colPlan.filter((c) => Math.abs(c.d - 300) < 40).length;
  const d450 = colPlan.filter((c) => Math.abs(c.d - 450) < 40).length;
  if (d300) items.push({ source: 'dwg', category: '柱 Ø300mm', kind: 'col300', size: 'Ø300mm', measureKind: 'count', quantity: d300, unit: 'nr', confidence: 'high', needsReview: false, description: 'Circular column Ø300' });
  if (d450) items.push({ source: 'dwg', category: '柱 Ø450mm', kind: 'col450', size: 'Ø450mm', measureKind: 'count', quantity: d450, unit: 'nr', confidence: 'high', needsReview: false, description: 'Circular column Ø450' });

  // ── Doors (swing arc) ──
  const doors = dedupColocated(doorArcs(db), 150).points;
  const doorPlans = cluster(doors).filter((g) => g.length >= 3);
  const doorPlan = doorPlans[0] ?? [];
  if (doorPlan.length) {
    const wh = widthHist(doorPlan);
    for (const [w, c] of Object.entries(wh).sort((a, b) => b[1] - a[1])) {
      items.push({ source: 'dwg', category: `门 ${w}mm`, kind: 'door', size: `${w}mm`, measureKind: 'count', quantity: c, unit: 'nr', confidence: 'high', needsReview: false, description: `Door leaf ${w}mm` });
    }
  }

  // ── Sanitary (ellipse) ──
  const san = dedupColocated(ellipsesOn(db, 'SANITARY'), 500).points;
  const sanGroups = cluster(san, 6000).filter((g) => g.length >= 3);
  const sanCount = sanGroups.reduce((s, g) => s + g.length, 0);
  if (sanCount) items.push({ source: 'dwg', category: '卫生洁具', kind: 'sanitary', measureKind: 'count', quantity: sanCount, unit: 'nr', confidence: 'review', needsReview: true, description: 'Sanitary fixtures (type needs QS review)' });

  // ── Rainwater downpipes (circle Ø100) ── minR low: downpipe radius is ~50mm
  const rwdp = dedupColocated(circlesOn(db, 'Rainwdp', 10), 150).points.filter((c) => Math.abs(c.d - 100) < 40);
  if (rwdp.length) items.push({ source: 'dwg', category: '雨水管 Ø100mm', kind: 'rwdp', size: 'Ø100mm', measureKind: 'count', quantity: rwdp.length, unit: 'nr', confidence: 'high', needsReview: false, description: 'Rainwater downpipe Ø100' });

  // ── Area: building footprint (column hull) ──
  if (colPlan.length >= 3) {
    const fp = Math.round(footprintAreaM2(colPlan));
    if (fp > 0) items.push({ source: 'dwg', category: '建筑底面积 (柱网)', kind: 'footprint', measureKind: 'area', quantity: fp, unit: 'm²', confidence: 'review', needsReview: true, description: 'Building footprint (column-grid hull, GFA estimate)' });
  }
  // ── Area: largest slab / floor polygon ──
  const slab = Math.round(largestSlabAreaM2(db));
  if (slab > 0) items.push({ source: 'dwg', category: '楼板/屋顶 (最大闭合区)', kind: 'slab', measureKind: 'area', quantity: slab, unit: 'm²', confidence: 'review', needsReview: true, description: 'Largest closed slab/roof polygon' });

  // ── Length: wall centerline within the column plan ──
  if (colPlan.length) {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const c of colPlan) { bx0 = Math.min(bx0, c.x); by0 = Math.min(by0, c.y); bx1 = Math.max(bx1, c.x); by1 = Math.max(by1, c.y); }
    const m = 3000;
    const wallLen = Math.round(wallCenterlineLengthM(db, { x0: bx0 - m, y0: by0 - m, x1: bx1 + m, y1: by1 + m }) * 10) / 10;
    if (wallLen > 0) items.push({ source: 'dwg', category: '墙 (中心线长)', kind: 'wall', measureKind: 'length', quantity: wallLen, unit: 'm', confidence: 'review', needsReview: true, description: 'Wall centerline length (paired, plan only)' });
  }

  const annotatedSvg = renderDrawingSvg(db, colDD);
  const sizeMB = buffer.byteLength / 1024 / 1024;
  const entityCount = db.entities.length;
  libredwg.dwg_free(dwg);

  return { fileName, sizeMB, entities: entityCount, items, annotatedSvg };
}
