// CAD 2D dei simboli: geometria comune. Ogni primitiva si scompone in
// segmenti e archi di cerchio, su cui si calcolano intersezioni e punti di aggancio (estremi, punti
// medi, centri, quadranti, intersezioni). Solo funzioni pure, senza interfaccia.
import type { Prim, Pt } from '../model/types';

export const EPS = 1e-6;
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
export const rp = (p: Pt): Pt => ({ x: r3(p.x), y: r3(p.y) });

/** Segmento tra due punti */
export interface Seg { a: Pt; b: Pt }
/** Arco di cerchio da a0 ad a1 in gradi (crescenti, nel sistema y verso il basso); cerchio: 0 → 360 */
export interface Circ { c: Pt; r: number; a0: number; a1: number; full: boolean }

/** Angolo in gradi tra 0 e 360 */
export const norm = (a: number) => ((a % 360) + 360) % 360;
export const angleOf = (c: Pt, p: Pt) => norm((Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI);
export const onCircle = (c: Pt, r: number, a: number): Pt => ({ x: c.x + r * Math.cos((a * Math.PI) / 180), y: c.y + r * Math.sin((a * Math.PI) / 180) });
/** L'angolo a cade nell'arco (da a0 in senso crescente fino ad a1)? */
export function inArc(a: number, a0: number, a1: number): boolean {
  const span = norm(a1 - a0) || 360;
  return norm(a - a0) <= span + EPS;
}

/** Lati di un rettangolo e di una polilinea chiusa, in ordine */
export function rectPts(p: Extract<Prim, { t: 'rect' }>): Pt[] {
  return [{ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, { x: p.x, y: p.y + p.h }];
}

/** Segmenti di una primitiva (linee, polilinee, rettangoli) */
export function segsOf(p: Prim): Seg[] {
  switch (p.t) {
    case 'line': return [{ a: { x: p.x1, y: p.y1 }, b: { x: p.x2, y: p.y2 } }];
    case 'rect': { const q = rectPts(p); return q.map((a, i) => ({ a, b: q[(i + 1) % 4] })); }
    case 'poly': {
      const q = p.closed ? [...p.pts, p.pts[0]] : p.pts;
      return q.slice(0, -1).map((a, i) => ({ a, b: q[i + 1] }));
    }
    default: return [];
  }
}

/** Cerchi e archi di una primitiva */
export function circsOf(p: Prim): Circ[] {
  if (p.t === 'circle') return [{ c: { x: p.cx, y: p.cy }, r: p.r, a0: 0, a1: 360, full: true }];
  if (p.t === 'arc') return [{ c: { x: p.cx, y: p.cy }, r: p.r, a0: norm(p.a0), a1: norm(p.a1) || 360, full: false }];
  return [];
}

/** Intersezione di due segmenti: parametri t (sul primo) e u (sul secondo) tra 0 e 1 */
export function segSeg(s: Seg, q: Seg): { t: number; u: number; p: Pt } | undefined {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, ex = q.b.x - q.a.x, ey = q.b.y - q.a.y;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < EPS) return undefined;
  const t = ((q.a.x - s.a.x) * ey - (q.a.y - s.a.y) * ex) / den;
  const u = ((q.a.x - s.a.x) * dy - (q.a.y - s.a.y) * dx) / den;
  if (u < -EPS || u > 1 + EPS) return undefined;
  return { t, u, p: { x: s.a.x + t * dx, y: s.a.y + t * dy } };
}

/** Intersezioni della retta del segmento s con un cerchio o arco: parametri t sulla retta */
export function segCirc(s: Seg, c: Circ): { t: number; p: Pt }[] {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, fx = s.a.x - c.c.x, fy = s.a.y - c.c.y;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (A < EPS || disc < -EPS) return [];
  const sq = Math.sqrt(Math.max(0, disc));
  const ts = disc < EPS ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
  return ts.map(t => ({ t, p: { x: s.a.x + t * dx, y: s.a.y + t * dy } })).filter(x => c.full || inArc(angleOf(c.c, x.p), c.a0, c.a1));
}

/** Intersezioni di due cerchi o archi */
export function circCirc(a: Circ, b: Circ): Pt[] {
  const d = Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y);
  if (d < EPS || d > a.r + b.r + EPS || d < Math.abs(a.r - b.r) - EPS) return [];
  const l = (a.r * a.r - b.r * b.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a.r * a.r - l * l));
  const mx = a.c.x + (l * (b.c.x - a.c.x)) / d, my = a.c.y + (l * (b.c.y - a.c.y)) / d;
  const ps = h < EPS ? [{ x: mx, y: my }] : [
    { x: mx + (h * (b.c.y - a.c.y)) / d, y: my - (h * (b.c.x - a.c.x)) / d },
    { x: mx - (h * (b.c.y - a.c.y)) / d, y: my + (h * (b.c.x - a.c.x)) / d },
  ];
  return ps.filter(p => (a.full || inArc(angleOf(a.c, p), a.a0, a.a1)) && (b.full || inArc(angleOf(b.c, p), b.a0, b.a1)));
}

/** Tutte le intersezioni tra le primitive (escluse i testi) */
export function intersections(prims: Prim[]): Pt[] {
  const out: Pt[] = [];
  const parts = prims.map(p => ({ s: segsOf(p), c: circsOf(p) }));
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    for (const s of parts[i].s) {
      for (const q of parts[j].s) { const x = segSeg(s, q); if (x && x.t >= -EPS && x.t <= 1 + EPS) out.push(x.p); }
      for (const c of parts[j].c) for (const x of segCirc(s, c)) if (x.t >= -EPS && x.t <= 1 + EPS) out.push(x.p);
    }
    for (const c of parts[i].c) {
      for (const q of parts[j].s) for (const x of segCirc(q, c)) if (x.t >= -EPS && x.t <= 1 + EPS) out.push(x.p);
      for (const d of parts[j].c) out.push(...circCirc(c, d));
    }
    if (out.length > 2000) break;
  }
  return out.map(rp);
}

export type SnapKind = 'end' | 'mid' | 'center' | 'quad' | 'int' | 'pin';
export interface SnapPt extends Pt { kind: SnapKind }

/** Punti di aggancio di una primitiva: estremi, punti medi, centro, quadranti */
export function snapPointsOf(p: Prim): SnapPt[] {
  const out: SnapPt[] = [];
  for (const s of segsOf(p)) {
    out.push({ ...s.a, kind: 'end' }, { ...s.b, kind: 'end' }, { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2, kind: 'mid' });
  }
  if (p.t === 'rect') out.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, kind: 'center' });
  if (p.t === 'circle' || p.t === 'arc' || p.t === 'ellipse') out.push({ x: p.cx, y: p.cy, kind: 'center' });
  if (p.t === 'circle') for (const a of [0, 90, 180, 270]) out.push({ ...onCircle({ x: p.cx, y: p.cy }, p.r, a), kind: 'quad' });
  if (p.t === 'ellipse') out.push({ x: p.cx + p.rx, y: p.cy, kind: 'quad' }, { x: p.cx - p.rx, y: p.cy, kind: 'quad' }, { x: p.cx, y: p.cy + p.ry, kind: 'quad' }, { x: p.cx, y: p.cy - p.ry, kind: 'quad' });
  if (p.t === 'arc') {
    out.push({ ...onCircle({ x: p.cx, y: p.cy }, p.r, p.a0), kind: 'end' }, { ...onCircle({ x: p.cx, y: p.cy }, p.r, p.a1), kind: 'end' });
    out.push({ ...onCircle({ x: p.cx, y: p.cy }, p.r, p.a0 + (norm(p.a1 - p.a0) || 360) / 2), kind: 'mid' });
  }
  if (p.t === 'text') out.push({ x: p.x, y: p.y, kind: 'end' });
  return out.map(q => ({ ...rp(q), kind: q.kind }));
}

/** Punti di aggancio del disegno (con le intersezioni e i punti di connessione) */
export function snapPoints(prims: Prim[], pins: Pt[] = []): SnapPt[] {
  return [
    ...pins.map(p => ({ ...p, kind: 'pin' as const })),
    ...prims.flatMap(snapPointsOf),
    ...intersections(prims).map(p => ({ ...p, kind: 'int' as const })),
  ];
}

/** Punto di aggancio più vicino a q entro tol (i punti di connessione e gli estremi prima degli altri) */
export function nearestSnap(points: SnapPt[], q: Pt, tol: number): SnapPt | undefined {
  const rank: Record<SnapKind, number> = { pin: 0, end: 1, int: 1, center: 2, quad: 2, mid: 3 };
  let best: SnapPt | undefined, bd = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d > tol) continue;
    // A parità quasi di distanza vince il tipo più importante
    const score = d + rank[p.kind] * tol * 0.15;
    if (score < bd) { bd = score; best = p; }
  }
  return best;
}
