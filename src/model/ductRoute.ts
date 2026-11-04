// Percorso dei fili nelle canaline del layout: il filo esce dall'apparecchio verso la canalina più
// comoda, la segue (anche passando da una canalina all'altra dove si toccano) fino all'altro
// apparecchio ed esce. Serve per le lunghezze dei fili e per il riempimento delle canaline.
import type { Layout, LayoutItem } from './types';

interface Seg { duct: LayoutItem; horiz: boolean; c: number; a: number; b: number }
interface Node { x: number; y: number; seg: number }

const segOf = (d: LayoutItem): Seg => (d.w >= d.h
  ? { duct: d, horiz: true, c: d.y + d.h / 2, a: d.x, b: d.x + d.w }
  : { duct: d, horiz: false, c: d.x + d.w / 2, a: d.y, b: d.y + d.h });

const touch = (p: LayoutItem, q: LayoutItem, tol = 1) =>
  p.x <= q.x + q.w + tol && q.x <= p.x + p.w + tol && p.y <= q.y + q.h + tol && q.y <= p.y + p.h + tol;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const md = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);

/** Rete delle canaline di un layout, con le distanze minime tra i suoi nodi */
export interface DuctNet { segs: Seg[]; nodes: Node[]; dist: number[][]; next: number[][]; bySeg: number[][] }

export function ductNet(l: Layout): DuctNet | undefined {
  const segs = l.items.filter(i => i.kind === 'duct').map(segOf);
  if (!segs.length) return undefined;
  const nodes: Node[] = [];
  const add = (x: number, y: number, seg: number) => { nodes.push({ x, y, seg }); return nodes.length - 1; };
  const point = (s: Seg, t: number) => (s.horiz ? { x: t, y: s.c } : { x: s.c, y: t });
  segs.forEach((s, i) => { const p = point(s, s.a), q = point(s, s.b); add(p.x, p.y, i); add(q.x, q.y, i); });
  // Passaggi tra canaline che si toccano: un nodo su ciascuna, collegati
  const links: [number, number][] = [];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const s = segs[i], t = segs[j];
    if (!touch(s.duct, t.duct)) continue;
    if (s.horiz !== t.horiz) {
      const h = s.horiz ? s : t, v = s.horiz ? t : s;
      const hi = s.horiz ? i : j, vi = s.horiz ? j : i;
      const ph = { x: clamp(v.c, h.a, h.b), y: h.c }, pv = { x: v.c, y: clamp(h.c, v.a, v.b) };
      links.push([add(ph.x, ph.y, hi), add(pv.x, pv.y, vi)]);
    } else {
      // Canaline in fila: si passa dall'estremo più vicino dell'una a quello dell'altra
      const ends = (k: number) => nodes.filter(n => n.seg === k).slice(0, 2).map((n, m) => ({ n, idx: nodes.indexOf(n), m }));
      let best: [number, number] | undefined, bd = Infinity;
      for (const p of ends(i)) for (const q of ends(j)) { const d = md(p.n, q.n); if (d < bd) { bd = d; best = [p.idx, q.idx]; } }
      if (best) links.push(best);
    }
  }
  const n = nodes.length;
  const dist = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  const next = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? i : -1)));
  const edge = (a: number, b: number, d: number) => { if (d < dist[a][b]) { dist[a][b] = dist[b][a] = d; next[a][b] = b; next[b][a] = a; } };
  // Lungo ogni canalina: nodi in ordine, collegati ai vicini
  const bySeg = segs.map((s, k) => nodes.map((_, i) => i).filter(i => nodes[i].seg === k)
    .sort((a, b) => (s.horiz ? nodes[a].x - nodes[b].x : nodes[a].y - nodes[b].y)));
  for (const list of bySeg) for (let i = 1; i < list.length; i++) edge(list[i - 1], list[i], md(nodes[list[i - 1]], nodes[list[i]]));
  for (const [a, b] of links) edge(a, b, md(nodes[a], nodes[b]));
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const dik = dist[i][k];
    if (dik === Infinity) continue;
    for (let j = 0; j < n; j++) {
      const d = dik + dist[k][j];
      if (d < dist[i][j]) { dist[i][j] = d; next[i][j] = next[i][k]; }
    }
  }
  return { segs, nodes, dist, next, bySeg };
}

export interface DuctRoute { length: number; ducts: Set<LayoutItem> }

/** Ingresso nella canalina k dal punto p: proiezione sulla linea centrale e nodi vicini sulla stessa canalina */
function entry(net: DuctNet, k: number, p: { x: number; y: number }) {
  const s = net.segs[k];
  const t = clamp(s.horiz ? p.x : p.y, s.a, s.b);
  const q = s.horiz ? { x: t, y: s.c } : { x: s.c, y: t };
  const list = net.bySeg[k];
  const pos = (i: number) => (s.horiz ? net.nodes[i].x : net.nodes[i].y);
  let lo = list[0], hi = list[list.length - 1];
  for (const i of list) { if (pos(i) <= t) lo = i; if (pos(i) >= t) { hi = i; break; } }
  return { q, d: md(p, q), lo, hi, t };
}

/**
 * Percorso più breve tra due punti della piastra passando per le canaline (undefined senza canaline):
 * lunghezza in mm (uscita, tratto nelle canaline, entrata) e canaline attraversate.
 */
export function ductRoute(net: DuctNet, p: { x: number; y: number }, q: { x: number; y: number }): DuctRoute {
  let best = Infinity, bestPath: { a: number; ea: number; b: number; eb: number; na?: number; nb?: number } | undefined;
  // Il filo esce dall'apparecchio verso la canalina più vicina (o una quasi altrettanto vicina), non
  // attraversa la piastra fino a una canalina lontana
  const near = (pt: { x: number; y: number }) => {
    const all = net.segs.map((_, k) => ({ k, e: entry(net, k, pt) }));
    const min = Math.min(...all.map(x => x.e.d));
    return all.filter(x => x.e.d <= min * 1.5 + 20);
  };
  const ins = near(p), outs = near(q);
  for (const { k: a, e: ea } of ins) {
    for (const { k: b, e: eb } of outs) {
      if (a === b) {
        const d = ea.d + Math.abs(ea.t - eb.t) + eb.d;
        if (d < best) { best = d; bestPath = { a, ea: 0, b, eb: 0 }; }
        continue;
      }
      for (const na of [ea.lo, ea.hi]) for (const nb of [eb.lo, eb.hi]) {
        const d = ea.d + md(ea.q, net.nodes[na]) + net.dist[na][nb] + md(net.nodes[nb], eb.q) + eb.d;
        if (d < best) { best = d; bestPath = { a, ea: 0, b, eb: 0, na, nb }; }
      }
    }
  }
  const ducts = new Set<LayoutItem>();
  if (bestPath) {
    ducts.add(net.segs[bestPath.a].duct);
    ducts.add(net.segs[bestPath.b].duct);
    if (bestPath.na !== undefined && bestPath.nb !== undefined) {
      for (let i = bestPath.na, guard = 0; i !== bestPath.nb && i >= 0 && guard < 10000; guard++) { ducts.add(net.segs[net.nodes[i].seg].duct); i = net.next[i][bestPath.nb]; }
      ducts.add(net.segs[net.nodes[bestPath.nb].seg].duct);
    }
  }
  return { length: best === Infinity ? md(p, q) : best, ducts };
}

/** Diametro esterno indicativo di un conduttore unipolare H07V-K per sezione (mm² → mm) */
const OUTER: [number, number][] = [[0.5, 2.1], [0.75, 2.3], [1, 2.5], [1.5, 3.0], [2.5, 3.6], [4, 4.2], [6, 4.8], [10, 6.0], [16, 7.2], [25, 9.0], [35, 10.2], [50, 12.0], [70, 14.0], [95, 16.0]];

/** Area occupata in canalina da un filo della sezione indicata (mm²; senza sezione come 1,5 mm²) */
export function wireArea(cross?: string): number {
  const v = parseFloat((cross ?? '').replace(',', '.'));
  const d = (Number.isFinite(v) ? OUTER.find(([s]) => s >= v - 1e-6)?.[1] ?? 18 : 3.0);
  return Math.PI * d * d / 4;
}

/** Sezione utile della canalina in mm² dalla sigla «40x60» (larghezza × altezza), altrimenti larghezza × 60 */
export function ductCapacity(d: LayoutItem): number {
  const m = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i.exec(d.label ?? '');
  if (m) return parseFloat(m[1].replace(',', '.')) * parseFloat(m[2].replace(',', '.'));
  return Math.min(d.w, d.h) * 60;
}

/** Riempimento consigliato al massimo (per lasciare spazio a modifiche e al calore) */
export const DUCT_FILL_MAX = 70;
