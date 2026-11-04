// CAD 2D dei simboli: taglia, estendi e offset sulle primitive, come in un CAD (AutoCAD, LibreCAD).
// Ricevono le primitive del simbolo e restituiscono le primitive nuove.
import type { Prim, Pt } from '../model/types';
import { EPS, angleOf, circsOf, inArc, norm, onCircle, rectPts, rp, segCirc, segSeg, segsOf, type Circ, type Seg, circCirc } from './geom';

const r2 = (v: number) => Math.round(v * 1000) / 1000 + 0;
/** Proprietà del tratto da copiare sulle parti nuove (tipo di linea, spessore, livello) */
const strokeOf = (p: Prim) => {
  const o: Record<string, unknown> = {};
  for (const k of ['lt', 'lw', 'layer', 'dash'] as const) if (k in p && (p as unknown as Record<string, unknown>)[k] !== undefined) o[k] = (p as unknown as Record<string, unknown>)[k];
  return o;
};

/** Parametri (0..1) in cui il segmento s è tagliato dalle altre primitive */
function cutsOnSeg(s: Seg, others: Prim[]): number[] {
  const ts: number[] = [];
  for (const o of others) {
    for (const q of segsOf(o)) { const x = segSeg(s, q); if (x && x.t > EPS && x.t < 1 - EPS) ts.push(x.t); }
    for (const c of circsOf(o)) for (const x of segCirc(s, c)) if (x.t > EPS && x.t < 1 - EPS) ts.push(x.t);
  }
  return ts.sort((a, b) => a - b);
}

/** Angoli in cui il cerchio o arco c è tagliato dalle altre primitive */
function cutsOnCirc(c: Circ, others: Prim[]): number[] {
  const as: number[] = [];
  for (const o of others) {
    for (const q of segsOf(o)) for (const x of segCirc(q, c)) if (x.t >= -EPS && x.t <= 1 + EPS) as.push(angleOf(c.c, x.p));
    for (const d of circsOf(o)) for (const p of circCirc(c, d)) as.push(angleOf(c.c, p));
  }
  return as;
}

/** Proiezione di q sul segmento: parametro t */
const tOn = (s: Seg, q: Pt) => {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l2 = dx * dx + dy * dy;
  return l2 ? ((q.x - s.a.x) * dx + (q.y - s.a.y) * dy) / l2 : 0;
};
const at = (s: Seg, t: number): Pt => rp({ x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) });
const distSeg = (s: Seg, q: Pt) => { const t = Math.max(0, Math.min(1, tOn(s, q))); const p = at(s, t); return Math.hypot(p.x - q.x, p.y - q.y); };

/**
 * Taglia: toglie il pezzo della primitiva i su cui si è cliccato, tra le due intersezioni più vicine
 * con le altre primitive (o fino all'estremo). Linee, polilinee, rettangoli, cerchi e archi; una
 * primitiva senza intersezioni si toglie tutta. Ritorna le primitive nuove o undefined.
 */
export function trimAt(prims: Prim[], i: number, click: Pt): Prim[] | undefined {
  const p = prims[i];
  const others = prims.filter((_, k) => k !== i && prims[k].t !== 'text');
  const st = strokeOf(p);
  let parts: Prim[] = [];
  if (p.t === 'line' || p.t === 'poly' || p.t === 'rect') {
    const pts = p.t === 'rect' ? rectPts(p) : p.t === 'poly' ? p.pts : [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }];
    const closed = p.t === 'rect' || (p.t === 'poly' && !!p.closed);
    const segs = segsOf(p);
    const n = segs.length;
    // Tagli lungo il percorso: segmento k + parametro t
    const cuts = segs.flatMap((s, k) => cutsOnSeg(s, others).map(t => k + t));
    let k0 = 0, best = Infinity;
    segs.forEach((s, k) => { const d = distSeg(s, click); if (d < best) { best = d; k0 = k; } });
    const c = k0 + Math.max(0, Math.min(1, tOn(segs[k0], click)));
    // Punto al parametro u (sui percorsi chiusi u può arrivare a un giro e mezzo)
    const point = (u: number) => {
      const v = closed && u >= n - EPS ? u - n : u;
      const k = Math.max(0, Math.min(n - 1, Math.floor(v + EPS)));
      return at(segs[k], Math.min(1, v - k));
    };
    /** Percorso dal parametro u0 al parametro u1 (u1 > u0), con i vertici in mezzo */
    const path = (u0: number, u1: number): Pt[] => {
      const out = [point(u0)];
      for (let v = Math.floor(u0 + EPS) + 1; v < u1 - EPS; v++) out.push(rp(pts[v % pts.length]));
      out.push(point(u1));
      return out;
    };
    const asPrim = (q: Pt[]): Prim => (q.length === 2 ? { t: 'line', x1: q[0].x, y1: q[0].y, x2: q[1].x, y2: q[1].y, ...st } as Prim : { t: 'poly', pts: q, ...st } as Prim);
    if (!closed) {
      const lo = Math.max(0, ...cuts.filter(u => u < c));
      const hi = Math.min(n, ...cuts.filter(u => u > c));
      if (lo > EPS) parts.push(asPrim(path(0, lo)));
      if (hi < n - EPS) parts.push(asPrim(path(hi, n)));
    } else {
      if (cuts.length < 2) return prims.filter((_, k) => k !== i);
      const below = cuts.filter(u => u < c), above = cuts.filter(u => u > c);
      const lo = below.length ? Math.max(...below) : Math.max(...cuts) - n;
      const hi = above.length ? Math.min(...above) : Math.min(...cuts) + n;
      // Resta il giro da hi fino a lo, un giro dopo
      let from = hi, to = lo + n;
      if (from >= n) { from -= n; to -= n; }
      parts.push(asPrim(path(from, to)));
    }
  } else if (p.t === 'circle' || p.t === 'arc') {
    const c = circsOf(p)[0];
    const cuts = cutsOnCirc(c, others).map(a => norm(a - c.a0)).filter(a => c.full || (a > EPS && a < (norm(c.a1 - c.a0) || 360) - EPS));
    const span = c.full ? 360 : norm(c.a1 - c.a0) || 360;
    const ca = norm(angleOf(c.c, click) - c.a0);
    if (c.full) {
      if (cuts.length < 2) return prims.filter((_, k) => k !== i);
      const below = cuts.filter(a => a < ca), above = cuts.filter(a => a > ca);
      const lo = below.length ? Math.max(...below) : Math.max(...cuts);
      const hi = above.length ? Math.min(...above) : Math.min(...cuts);
      // Resta l'arco da hi a lo
      parts.push({ t: 'arc', cx: p.cx, cy: p.cy, r: p.r, a0: r2(norm(c.a0 + hi)), a1: r2(norm(c.a0 + lo)) || 360, ...st } as Prim);
    } else {
      const lo = Math.max(0, ...cuts.filter(a => a < ca)), hi = Math.min(span, ...cuts.filter(a => a > ca));
      if (lo > EPS) parts.push({ t: 'arc', cx: p.cx, cy: p.cy, r: p.r, a0: r2(c.a0), a1: r2(norm(c.a0 + lo)) || 360, ...st } as Prim);
      if (hi < span - EPS) parts.push({ t: 'arc', cx: p.cx, cy: p.cy, r: p.r, a0: r2(norm(c.a0 + hi)), a1: r2(norm(c.a1)) || 360, ...st } as Prim);
    }
  } else return undefined;
  return [...prims.slice(0, i), ...parts, ...prims.slice(i + 1)];
}

/**
 * Estendi: allunga la linea (o il tratto finale della polilinea) dall'estremo più vicino al clic fino
 * alla prima primitiva che incontra proseguendo dritto. Ritorna le primitive nuove o undefined.
 */
export function extendAt(prims: Prim[], i: number, click: Pt): Prim[] | undefined {
  const p = prims[i];
  if (p.t !== 'line' && !(p.t === 'poly' && !p.closed && p.pts.length >= 2)) return undefined;
  const pts = p.t === 'line' ? [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }] : p.pts;
  const last = pts.length - 1;
  const atEnd = Math.hypot(click.x - pts[last].x, click.y - pts[last].y) < Math.hypot(click.x - pts[0].x, click.y - pts[0].y);
  const e = atEnd ? pts[last] : pts[0], o = atEnd ? pts[last - 1] : pts[1];
  const len = Math.hypot(e.x - o.x, e.y - o.y);
  if (len < EPS) return undefined;
  // Semiretta dall'estremo, lunga abbastanza per tutto il disegno
  const ray: Seg = { a: e, b: { x: e.x + ((e.x - o.x) / len) * 1e4, y: e.y + ((e.y - o.y) / len) * 1e4 } };
  let best = Infinity;
  prims.forEach((q, k) => {
    if (k === i || q.t === 'text') return;
    for (const s of segsOf(q)) { const x = segSeg(ray, s); if (x && x.t > 1e-7 && x.t < best) best = x.t; }
    for (const c of circsOf(q)) for (const x of segCirc(ray, c)) if (x.t > 1e-7 && x.t < best) best = x.t;
  });
  if (!isFinite(best)) return undefined;
  const ne = at(ray, best);
  const np = pts.map((q, k) => (k === (atEnd ? last : 0) ? ne : q));
  const next: Prim = p.t === 'line' ? { ...p, x1: np[0].x, y1: np[0].y, x2: np[1].x, y2: np[1].y } : { ...p, pts: np };
  return prims.map((q, k) => (k === i ? next : q));
}

/** Retta spostata di d lungo la normale: punto e direzione */
function shiftSeg(s: Seg, d: number): Seg {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  return { a: { x: s.a.x + nx * d, y: s.a.y + ny * d }, b: { x: s.b.x + nx * d, y: s.b.y + ny * d } };
}
/** Intersezione di due rette (segmenti prolungati) */
function lineLine(s: Seg, q: Seg): Pt | undefined {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, ex = q.b.x - q.a.x, ey = q.b.y - q.a.y;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < EPS) return undefined;
  const t = ((q.a.x - s.a.x) * ey - (q.a.y - s.a.y) * ex) / den;
  return { x: s.a.x + t * dx, y: s.a.y + t * dy };
}

/**
 * Offset: copia parallela della primitiva a distanza d, dal lato del punto side (linee e polilinee:
 * il lato del tratto più vicino; rettangoli, cerchi, archi ed ellissi: fuori o dentro).
 */
export function offsetPrim(p: Prim, d: number, side: Pt): Prim | undefined {
  if (!(d > 0)) return undefined;
  if (p.t === 'line' || p.t === 'poly') {
    const segs = segsOf(p);
    if (!segs.length) return undefined;
    let k0 = 0, best = Infinity;
    segs.forEach((s, k) => { const x = distSeg(s, side); if (x < best) { best = x; k0 = k; } });
    const s0 = segs[k0], cross = (s0.b.x - s0.a.x) * (side.y - s0.a.y) - (s0.b.y - s0.a.y) * (side.x - s0.a.x);
    // Normale (-dy, dx): verso cui sta il punto
    const sd = cross > 0 ? d : -d;
    const sh = segs.map(s => shiftSeg(s, sd));
    if (p.t === 'line') return { ...p, x1: r2(sh[0].a.x), y1: r2(sh[0].a.y), x2: r2(sh[0].b.x), y2: r2(sh[0].b.y) };
    const closed = !!p.closed;
    const pts: Pt[] = [];
    const n = sh.length;
    for (let k = 0; k < (closed ? n : n + 1); k++) {
      if (!closed && k === 0) { pts.push(sh[0].a); continue; }
      if (!closed && k === n) { pts.push(sh[n - 1].b); continue; }
      const a = sh[(k - 1 + n) % n], b = sh[k % n];
      pts.push(lineLine(a, b) ?? a.b);
    }
    return { ...p, pts: pts.map(rp) };
  }
  if (p.t === 'rect') {
    const inside = side.x > p.x && side.x < p.x + p.w && side.y > p.y && side.y < p.y + p.h;
    const g = inside ? -d : d;
    if (p.w + 2 * g <= 0 || p.h + 2 * g <= 0) return undefined;
    return { ...p, x: r2(p.x - g), y: r2(p.y - g), w: r2(p.w + 2 * g), h: r2(p.h + 2 * g) };
  }
  if (p.t === 'circle' || p.t === 'arc') {
    const g = Math.hypot(side.x - p.cx, side.y - p.cy) < p.r ? -d : d;
    return p.r + g > 0 ? { ...p, r: r2(p.r + g) } : undefined;
  }
  if (p.t === 'ellipse') {
    const inside = ((side.x - p.cx) / p.rx) ** 2 + ((side.y - p.cy) / p.ry) ** 2 < 1;
    const g = inside ? -d : d;
    return p.rx + g > 0 && p.ry + g > 0 ? { ...p, rx: r2(p.rx + g), ry: r2(p.ry + g) } : undefined;
  }
  return undefined;
}

/** Distanza e scarti tra due punti (strumento Misura) */
export function measure(a: Pt, b: Pt): { d: number; dx: number; dy: number; angle: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  // Angolo come in un CAD: in senso antiorario, con y verso l'alto
  return { d: r2(Math.hypot(dx, dy)), dx: r2(dx), dy: r2(-dy), angle: r2(norm((Math.atan2(-dy, dx) * 180) / Math.PI)) };
}

export { inArc, onCircle };
