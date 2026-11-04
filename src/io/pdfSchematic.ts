// Import di schemi elettrici da PDF vettoriale (provato con i PDF di SEE Electrical): dalla grafica
// si ricostruiscono fili veri (con colore, giunzioni e numeri/nomi), componenti con sigla e
// morsetti, morsetti di morsettiera, rimandi tra pagine e testi. Quello che non si riconosce resta
// come grafica dentro un simbolo senza sigla, così il disegno è comunque completo.
//
// Passi per ogni pagina: cornice e cartiglio → spostamento sulla griglia di 4 mm → trattini del PE
// uniti → rettangoli (corpi dei componenti) → fili (tratti orizzontali/verticali con estremi sulla
// griglia) → gruppi di grafica collegata (componenti) → morsetti dove arrivano i fili → testi
// assegnati (sigle, nomi dei morsetti, numeri filo) → simboli (uguali condivisi tra le pagine).
import type { Project, Page, Element, SymbolDef, Prim, Wire, SymbolInstance, TextItem, Panel, PinDef, PinDir, Pt } from '../model/types';
import { FRAME, GRID } from '../model/types';
import type { RawPage, RawSeg, RawText } from './pdfRead';
import { emptyProject } from '../model/project';
import { uid, distToSegment } from '../model/geometry';

export interface PdfImportReport {
  /** Pagine importate e saltate (numeri di pagina del PDF) */
  imported: number;
  skipped: number[];
  wires: number;
  devices: number;
  terminals: number;
  links: number;
  symbols: number;
  texts: number;
  warnings: string[];
}

export interface PdfImportOptions {
  /** Importa anche le pagine senza cartiglio di schema riconosciuto (liste, copertine) */
  allPages?: boolean;
  /** Nome del file, per il nome del progetto se il cartiglio non lo riporta */
  fileName?: string;
}

/** Dati letti dal cartiglio (SEE Electrical e simili) */
export interface SheetInfo { /** Totale dei fogli della serie ("DI 125") */ total?: string; sheet?: string; title?: string; project?: string; customer?: string; order?: string; author?: string; date?: string; address?: string }

const LABELS: Record<string, keyof SheetInfo> = {
  'TITOLO:': 'title', 'PROGETTO:': 'project', 'CLIENTE:': 'customer', 'COMMESSA:': 'order', 'DIS.:': 'author', 'DATA:': 'date',
  'TITLE:': 'title', 'PROJECT:': 'project', 'CUSTOMER:': 'customer', 'DRAWN:': 'author', 'DATE:': 'date',
};

/** Legge il cartiglio: etichette come "TITOLO:" con il valore alla loro destra, numero del foglio */
export function sheetInfo(p: RawPage): SheetInfo | undefined {
  const t = p.texts.filter(x => x.rot === 0 && x.y > p.h * 0.8);
  const info: SheetInfo = {};
  const labels = t.filter(x => LABELS[x.s.toUpperCase()]);
  for (const l of labels) {
    const next = labels.filter(o => o !== l && Math.abs(o.y - l.y) < 1 && o.x > l.x).sort((a, b) => a.x - b.x)[0];
    const vals = t.filter(o => !LABELS[o.s.toUpperCase()] && Math.abs(o.y - l.y) < 1.2 && o.x > l.x + l.w - 0.5 && (!next || o.x < next.x) && o.x < l.x + 120)
      .sort((a, b) => a.x - b.x).map(o => o.s.trim()).filter(Boolean);
    if (vals.length) info[LABELS[l.s.toUpperCase()]] = vals.join(' ');
  }
  // Foglio: "FOGLIO 210" oppure il numero grande alla destra di "FOGLIO"
  const fog = t.find(x => /^(FOGLIO|SHEET|BLATT)/i.test(x.s));
  if (fog) {
    const inline = /^(?:FOGLIO|SHEET|BLATT)\s*(\S+)/i.exec(fog.s)?.[1];
    const right = t.filter(o => o !== fog && Math.abs(o.y - fog.y) < 2.5 && o.x > fog.x && o.x < fog.x + 30 && /^\w[\w.]*$/.test(o.s)).sort((a, b) => a.x - b.x)[0];
    info.sheet = inline ?? right?.s;
  }
  const di = t.find(x => /^(DI|OF|VON)$/i.test(x.s));
  if (di) info.total = t.filter(o => o !== di && Math.abs(o.y - di.y) < 2.5 && o.x > di.x && o.x < di.x + 30 && /^\d+$/.test(o.s)).sort((a, b) => a.x - b.x)[0]?.s;
  if (!info.title && !info.sheet) return undefined;
  // Indirizzo: testi nel cartiglio sotto "Via …"
  const via = t.find(x => /^(via|viale|piazza|corso|strada)\b/i.test(x.s));
  if (via) info.address = t.filter(o => Math.abs(o.x - via.x) < 3 && o.y >= via.y - 0.5 && o.y < via.y + 9).sort((a, b) => a.y - b.y).map(o => o.s).join(', ');
  return info;
}

// ——— Geometria di base ———

interface Seg {
  x1: number; y1: number; x2: number; y2: number;
  color: string; fill?: boolean; dash?: boolean; path: number;
  o: 'h' | 'v' | 'd';
  len: number;
  rect?: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const orient = (s: { x1: number; y1: number; x2: number; y2: number }): 'h' | 'v' | 'd' =>
  Math.abs(s.y1 - s.y2) < 0.05 && Math.abs(s.x1 - s.x2) >= 0.05 ? 'h' : Math.abs(s.x1 - s.x2) < 0.05 && Math.abs(s.y1 - s.y2) >= 0.05 ? 'v' : 'd';
const onGrid = (v: number) => Math.abs(v - Math.round(v / GRID) * GRID) < 0.001;
const samePt = (a: Pt, b: Pt, t = 0.05) => Math.abs(a.x - b.x) <= t && Math.abs(a.y - b.y) <= t;

/** Colore del filo (sigla IEC 60757) dal colore del disegno */
function wireColor(hex: string): string | undefined {
  const c = hex.toLowerCase();
  if (c === '#0000ff' || c === '#0000fe' || c === '#0080ff') return 'BU';
  if (c === '#00ff00' || c === '#008000' || c === '#00c000') return 'GNYE';
  if (c === '#ff0000' || c === '#c00000') return 'RD';
  if (c === '#804000' || c === '#a52a2a' || c === '#800000') return 'BN';
  if (c === '#ff8000' || c === '#ffa500') return 'OG';
  if (c === '#808080' || c === '#c0c0c0') return 'GY';
  if (c === '#800080' || c === '#ff00ff') return 'VT';
  return undefined;
}

/** Cornice: righe lunghe del foglio, inizio del cartiglio e riga dei numeri di colonna */
function frameOf(p: RawPage) {
  const hs = p.segs.filter(s => orient(s) === 'h' && Math.abs(s.x2 - s.x1) > p.w * 0.8).map(s => s.y1).sort((a, b) => a - b);
  const vls = p.segs.filter(s => orient(s) === 'v' && Math.abs(s.y2 - s.y1) > p.h * 0.6);
  const vs = vls.map(s => s.x1).sort((a, b) => a - b);
  // Alto e basso dalle linee verticali della cornice (il lato alto può essere spezzato)
  const top = vls.length ? Math.min(...vls.map(s => Math.min(s.y1, s.y2))) : hs[0] ?? 0;
  const bottom = vls.length ? Math.max(...vls.map(s => Math.max(s.y1, s.y2))) : hs[hs.length - 1] ?? p.h;
  const left = vs[0] ?? 0, right = vs[vs.length - 1] ?? p.w;
  const titleTop = [...hs].reverse().find(y => y < bottom - 5 && y > p.h * 0.6) ?? bottom;
  // Riga dei numeri di colonna: segmenti orizzontali vicino al bordo alto che coprono la larghezza
  let header = top;
  const near = p.segs.filter(s => orient(s) === 'h' && s.y1 > top + 1 && s.y1 < top + 15);
  const byY = new Map<number, number>();
  for (const s of near) { const k = Math.round(s.y1 * 10) / 10; byY.set(k, (byY.get(k) ?? 0) + Math.abs(s.x2 - s.x1)); }
  for (const [y, len] of byY) if (len > (right - left) * 0.5 && y > header) header = y;
  if (header === top) header = top + 6;
  return { left, right, top, header, titleTop };
}

/** Residuo più frequente delle coordinate sulla griglia di 4 mm (dove cadono i fili del disegno) */
function gridResidue(segs: RawSeg[], axis: 'x' | 'y'): number {
  const h = new Map<number, number>();
  for (const s of segs) {
    const o = orient(s);
    if (o === 'd' || s.fill) continue;
    // Pesato con la lunghezza: contano soprattutto i fili, non i dettagli dei simboli
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (len < 3) continue;
    for (const v of axis === 'x' ? [s.x1, s.x2] : [s.y1, s.y2]) {
      const r = Math.round(v);
      if (Math.abs(v - r) > 0.08) continue;
      const k = ((r % GRID) + GRID) % GRID;
      h.set(k, (h.get(k) ?? 0) + len);
    }
  }
  return [...h].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** Spostamento intero più vicino a "ideal" che porta il residuo sulla griglia */
function bestShift(ideal: number, residue: number): number {
  let best = Math.round(ideal);
  for (let d = Math.round(ideal) - 3; d <= Math.round(ideal) + 3; d++) {
    if (((residue + d) % GRID + GRID) % GRID === 0 && (Math.abs(d - ideal) < Math.abs(best - ideal) || ((residue + best) % GRID + GRID) % GRID !== 0)) best = d;
  }
  return best;
}

/** Indice spaziale semplice per trovare i segmenti vicini */
class Buckets {
  private m = new Map<string, number[]>();
  constructor(private size = 5) {}
  private keys(x0: number, y0: number, x1: number, y1: number): string[] {
    const out: string[] = [];
    for (let i = Math.floor(x0 / this.size); i <= Math.floor(x1 / this.size); i++)
      for (let j = Math.floor(y0 / this.size); j <= Math.floor(y1 / this.size); j++) out.push(`${i},${j}`);
    return out;
  }
  add(id: number, b: [number, number, number, number]) { for (const k of this.keys(...b)) { const l = this.m.get(k); if (l) l.push(id); else this.m.set(k, [id]); } }
  query(b: [number, number, number, number]): Set<number> { const out = new Set<number>(); for (const k of this.keys(...b)) for (const i of this.m.get(k) ?? []) out.add(i); return out; }
}

class UF {
  p: number[];
  constructor(n: number) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(i: number): number { while (this.p[i] !== i) { this.p[i] = this.p[this.p[i]]; i = this.p[i]; } return i; }
  union(a: number, b: number) { this.p[this.find(a)] = this.find(b); }
}

const bbox = (s: Seg, m = 0): [number, number, number, number] => [Math.min(s.x1, s.x2) - m, Math.min(s.y1, s.y2) - m, Math.max(s.x1, s.x2) + m, Math.max(s.y1, s.y2) + m];

/** Distanza minima tra due segmenti (0 se si incrociano) */
function segDist(a: Seg, b: Seg): number {
  const A = { x: a.x1, y: a.y1 }, B = { x: a.x2, y: a.y2 }, C = { x: b.x1, y: b.y1 }, D = { x: b.x2, y: b.y2 };
  const cross = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(A, B, C), d2 = cross(A, B, D), d3 = cross(C, D, A), d4 = cross(C, D, B);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(distToSegment(A, C, D), distToSegment(B, C, D), distToSegment(C, A, B), distToSegment(D, A, B));
}

/** Unisce i trattini di una linea tratteggiata (es. PE tratto-punto disegnato a pezzi) */
function mergeDashes(segs: Seg[]): Seg[] {
  const groups = new Map<string, Seg[]>();
  const rest: Seg[] = [];
  for (const s of segs) {
    if (s.o === 'd' || s.fill) { rest.push(s); continue; }
    const k = `${s.color}|${s.o}|${s.o === 'h' ? s.y1 : s.x1}`;
    const g = groups.get(k); if (g) g.push(s); else groups.set(k, [s]);
  }
  for (const g of groups.values()) {
    const h = g[0].o === 'h';
    const lo = (s: Seg) => (h ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2)), hi = (s: Seg) => (h ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2));
    g.sort((a, b) => lo(a) - lo(b));
    let run: Seg[] = [];
    const flush = () => {
      if (!run.length) return;
      const gaps = run.some((s, i) => i > 0 && lo(s) - hi(run[i - 1]) > 0.05);
      if (run.length > 1 && gaps) {
        const a = lo(run[0]), b = Math.max(...run.map(hi)), c = h ? run[0].y1 : run[0].x1;
        rest.push(h ? { ...run[0], x1: a, x2: b, y1: c, y2: c, dash: true, len: b - a } : { ...run[0], y1: a, y2: b, x1: c, x2: c, dash: true, len: b - a });
      } else rest.push(...run);
      run = [];
    };
    for (const s of g) {
      const last = run[run.length - 1];
      if (last) {
        const gap = lo(s) - Math.max(...run.map(hi));
        const short = (x: Seg) => x.len < 6;
        const join = gap <= 1.8 && (gap > 0.05 ? short(last) || short(s) : short(last) && short(s));
        if (!join) flush();
      }
      run.push(s);
    }
    flush();
  }
  return rest;
}

/** Rettangoli (corpi dei componenti): quattro lati che si chiudono */
function markRects(segs: Seg[]): [number, number, number, number][] {
  const H = segs.filter(s => s.o === 'h' && !s.fill), V = segs.filter(s => s.o === 'v' && !s.fill);
  const rects: [number, number, number, number][] = [];
  const span = (s: Seg) => (s.o === 'h' ? [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)] : [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]);
  const vAt = new Map<number, Seg[]>();
  for (const v of V) { const k = Math.round(v.x1 * 10); const l = vAt.get(k); if (l) l.push(v); else vAt.set(k, [v]); }
  const findV = (x: number, y0: number, y1: number) => (vAt.get(Math.round(x * 10)) ?? []).find(v => { const [a, b] = span(v); return Math.abs(a - y0) < 0.12 && Math.abs(b - y1) < 0.12; });
  for (let i = 0; i < H.length; i++) {
    const [a, b] = span(H[i]);
    for (let j = 0; j < H.length; j++) {
      if (i === j || H[j].y1 <= H[i].y1 + 0.5) continue;
      const [c, d] = span(H[j]);
      if (Math.abs(a - c) > 0.12 || Math.abs(b - d) > 0.12) continue;
      const l = findV(a, H[i].y1, H[j].y1), r = findV(b, H[i].y1, H[j].y1);
      if (!l || !r) continue;
      H[i].rect = H[j].rect = l.rect = r.rect = true;
      rects.push([a, H[i].y1, b, H[j].y1]);
    }
  }
  return rects;
}

// ——— Conversione di una pagina ———

interface Ctx {
  project: Project;
  symbols: Map<string, SymbolDef>;
  report: PdfImportReport;
  /** Rimandi senza nome: chiave di accoppiamento → contatore */
  linkKeys: Map<string, number>;
}

/** Sigla: "-10Q1", "-300CPU1", "-X1" (lettere seguite da un numero; non "-2.B" dei morsetti) */
const TAG = /^-[\w.]*[A-Za-z]+\d+[\w.:+]*$/;
const WIRE_LABEL = /^[A-Za-z0-9][\w.+/:-]{0,15}$/;
const PIN_LABEL = /^[\w./+-]{1,6}$/;
const REF = /^\/?\d+(\.\d+)?$/;
/** Nome di morsettiera: X1, X1.1.2, -X10 */
const STRIP = /^-?X\d[\w.]*$/;
/** Morsettiera e numero insieme: "X1.1.12-1.A", "X1.1.2 - 1" */
const STRIP_NUM = /^(-?X\d[\w.]*?)\s*-\s*([\w.]+)$/;

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/** Polilinee dai segmenti consecutivi dello stesso tracciato */
function toPrims(segs: Seg[], ox: number, oy: number): Prim[] {
  const out: Prim[] = [];
  let poly: { pts: Pt[]; seg: Seg } | undefined;
  const flush = () => {
    if (!poly) return;
    const pts = poly.pts, s = poly.seg;
    if (s.fill) out.push({ t: 'poly', pts, closed: true, fill: true });
    else if (pts.length === 2) out.push({ t: 'line', x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, ...(s.dash ? { dash: true } : {}) });
    else out.push({ t: 'poly', pts, closed: samePt(pts[0], pts[pts.length - 1], 0.01), ...(s.dash ? { dash: true } : {}) });
    poly = undefined;
  };
  const sorted = [...segs].sort((a, b) => a.path - b.path);
  for (const s of sorted) {
    const a = { x: r2(s.x1 - ox), y: r2(s.y1 - oy) }, b = { x: r2(s.x2 - ox), y: r2(s.y2 - oy) };
    if (poly && poly.seg.path === s.path && !!poly.seg.fill === !!s.fill && samePt(poly.pts[poly.pts.length - 1], a, 0.01)) { poly.pts.push(b); continue; }
    flush();
    poly = { pts: [a, b], seg: s };
  }
  flush();
  return out;
}

function convertPage(raw: RawPage, info: SheetInfo | undefined, pageNo: number, ctx: Ctx): Page {
  const fr = frameOf(raw);
  const inArea = (x: number, y: number) => x > fr.left + 0.4 && x < fr.right - 0.4 && y > fr.header + 0.3 && y < fr.titleTop - 0.3;
  const rx = gridResidue(raw.segs.filter(s => inArea(s.x1, s.y1)), 'x'), ry = gridResidue(raw.segs.filter(s => inArea(s.x1, s.y1)), 'y');
  const dx = bestShift((FRAME.left + FRAME.right) / 2 - (fr.left + fr.right) / 2, rx);
  let dy = bestShift(FRAME.bottom - fr.titleTop, ry);
  if (fr.header + dy < FRAME.top - 4) dy += GRID;
  const tx = (v: number) => { const w = r2(v + dx); return Math.abs(w - Math.round(w)) < 0.09 ? Math.round(w) : w; };
  const ty = (v: number) => { const w = r2(v + dy); return Math.abs(w - Math.round(w)) < 0.09 ? Math.round(w) : w; };

  // Segmenti dentro l'area di disegno, già sulla griglia di OpenWiring
  let segs: Seg[] = [];
  for (const s of raw.segs) {
    if (!inArea(s.x1, s.y1) || !inArea(s.x2, s.y2)) continue;
    const q = { x1: tx(s.x1), y1: ty(s.y1), x2: tx(s.x2), y2: ty(s.y2) };
    const len = Math.hypot(q.x2 - q.x1, q.y2 - q.y1);
    if (len < 0.02) continue;
    const o = orient(q);
    if (o === 'h') q.y2 = q.y1; else if (o === 'v') q.x2 = q.x1;
    segs.push({ ...q, color: s.color, fill: s.fill, path: s.path, o, len });
  }
  segs = mergeDashes(segs);
  const rects = markRects(segs);
  const insideRect = (s: Seg) => rects.some(([a, b, c, d]) => {
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    return mx > a + 0.05 && mx < c - 0.05 && my > b + 0.05 && my < d - 0.05;
  });

  // Fili: tratti orizzontali/verticali con entrambi gli estremi sulla griglia; i tratteggiati solo se
  // colorati (PE), i tratteggi neri sono collegamenti meccanici
  const isWire = (s: Seg) => s.o !== 'd' && !s.fill && !s.rect && s.len >= 2.9 &&
    onGrid(s.x1) && onGrid(s.y1) && onGrid(s.x2) && onGrid(s.y2) && (!s.dash || !!wireColor(s.color)) && !insideRect(s);
  const wireSegs = segs.filter(isWire);
  const gfx = segs.filter(s => !isWire(s));

  // Gruppi di grafica collegata
  const uf = new UF(gfx.length);
  const bk = new Buckets(4);
  gfx.forEach((s, i) => bk.add(i, bbox(s, 0.3)));
  gfx.forEach((s, i) => {
    for (const j of bk.query(bbox(s, 0.3))) if (j > i && segDist(s, gfx[j]) <= 0.3) uf.union(i, j);
  });
  const groups = new Map<number, Seg[]>();
  gfx.forEach((s, i) => { const r = uf.find(i); const g = groups.get(r); if (g) g.push(s); else groups.set(r, [s]); });
  interface Cluster { segs: Seg[]; box: [number, number, number, number]; pins: { p: Pt; dir: PinDir }[]; tag?: string; tagText?: RawText; kind: 'device' | 'terminal' | 'arrow' | 'dot' | 'gfx' | 'mark'; texts: RawText[] }
  const clusters: Cluster[] = [...groups.values()].map(g => ({
    segs: g, pins: [], kind: 'gfx' as const, texts: [],
    box: [Math.min(...g.map(s => Math.min(s.x1, s.x2))), Math.min(...g.map(s => Math.min(s.y1, s.y2))), Math.max(...g.map(s => Math.max(s.x1, s.x2))), Math.max(...g.map(s => Math.max(s.y1, s.y2)))] as [number, number, number, number],
  }));
  const cb = new Buckets(6);
  clusters.forEach((c, i) => cb.add(i, [c.box[0] - 0.5, c.box[1] - 0.5, c.box[2] + 0.5, c.box[3] + 0.5]));

  // Estremi dei fili: dove toccano un gruppo diventano morsetti
  const wires: Wire[] = wireSegs.map(s => ({ kind: 'wire', id: uid('w'), points: [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }], ...(wireColor(s.color) ? { color: wireColor(s.color) } : {}) }));
  const touches = (c: Cluster, p: Pt) => c.segs.some(s => distToSegment(p, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <= 0.25);
  const wireAt = new Map<Wire, Cluster[]>();
  for (const w of wires) {
    const ends = [w.points[0], w.points[1]];
    ends.forEach((p, k) => {
      const other = ends[1 - k];
      const near = [...cb.query([p.x - 0.3, p.y - 0.3, p.x + 0.3, p.y + 0.3])].map(i => clusters[i]).filter(c => touches(c, p));
      if (!near.length) return;
      const c = near.sort((a, b) => (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) - (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]))[0];
      const dir: PinDir = Math.abs(other.x - p.x) > Math.abs(other.y - p.y) ? (other.x > p.x ? 'right' : 'left') : (other.y > p.y ? 'down' : 'up');
      if (!c.pins.some(q => samePt(q.p, p))) c.pins.push({ p, dir });
      const l = wireAt.get(w); if (l) l.push(c); else wireAt.set(w, [c]);
    });
  }

  // Testi: trasformati, dentro l'area; le sigle e i nomi dei morsetti vanno ai componenti
  const texts: RawText[] = raw.texts.filter(t => inArea(t.x, t.y)).map(t => ({ ...t, x: r2(t.x + dx), y: r2(t.y + dy) }));
  const used = new Set<RawText>();
  // Riquadro approssimato del testo (rotazione 0 o ±90)
  const tbox = (t: RawText): [number, number, number, number] => {
    if (t.rot === -90) return [t.x - t.size * 0.8, t.y - t.w, t.x + t.size * 0.1, t.y];
    if (t.rot === 90) return [t.x - t.size * 0.1, t.y, t.x + t.size * 0.8, t.y + t.w];
    return [t.x, t.y - t.size * 0.8, t.x + t.w, t.y + t.size * 0.1];
  };
  const boxDist = (a: [number, number, number, number], b: [number, number, number, number]) =>
    Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
  const center = (b: [number, number, number, number]) => ({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 });

  // Tipi di gruppo: punti di giunzione, frecce dei rimandi, morsetti, componenti
  const onAnyWire = (p: Pt, t = 0.6) => wires.some(w => distToSegment(p, w.points[0], w.points[1]) <= t);
  for (const c of clusters) {
    const w = c.box[2] - c.box[0], h = c.box[3] - c.box[1];
    const center = { x: (c.box[0] + c.box[2]) / 2, y: (c.box[1] + c.box[3]) / 2 };
    const curvy = c.segs.filter(s => s.o === 'd').length;
    if (w <= 2.4 && h <= 2.4 && c.segs.some(s => s.fill) && onAnyWire(center)) { c.kind = 'dot'; continue; }
    if (w <= 4.5 && h <= 4.5 && c.pins.length === 1 && c.segs.every(s => s.o === 'd' || s.fill) && c.segs.filter(s => !s.fill).length <= 4) { c.kind = 'arrow'; continue; }
    // Morsetto: cerchio piccolo con al massimo due codoli, collegato a uno o due fili
    const ring = c.segs.filter(s => s.o === 'd');
    if (c.pins.length >= 1 && c.pins.length <= 2 && ring.length >= 8 && w <= 3.2 && h <= 5.2 && Math.max(w, h) >= 1.6 && curvy >= 8) {
      // Morsetto vero: filo da due lati opposti, oppure il nome di una morsettiera vicino
      const opposite = c.pins.length === 2 && ((c.pins[0].dir === 'up' && c.pins[1].dir === 'down') || (c.pins[0].dir === 'down' && c.pins[1].dir === 'up') ||
        (c.pins[0].dir === 'left' && c.pins[1].dir === 'right') || (c.pins[0].dir === 'right' && c.pins[1].dir === 'left'));
      const stripNear = texts.some(t => (STRIP.test(t.s) || STRIP_NUM.test(t.s)) && boxDist(tbox(t), c.box) < 22);
      if (opposite || stripNear) { c.kind = 'terminal'; continue; }
      c.kind = 'mark';
      continue;
    }
    c.kind = c.pins.length ? 'device' : 'gfx';
  }

  // Cerchietti di connessione di un componente (non morsetti): uniti al componente più vicino
  for (const c of clusters.filter(k => k.kind === 'mark')) {
    let best: Cluster | undefined, bd = 3.5;
    for (const o of clusters) {
      if (o === c || (o.kind !== 'device' && o.kind !== 'gfx')) continue;
      const d = boxDist(c.box, o.box);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      best.segs.push(...c.segs);
      for (const p of c.pins) if (!best.pins.some(q => samePt(q.p, p.p))) best.pins.push(p);
      best.box = [Math.min(best.box[0], c.box[0]), Math.min(best.box[1], c.box[1]), Math.max(best.box[2], c.box[2]), Math.max(best.box[3], c.box[3])];
      if (best.kind === 'gfx') best.kind = 'device';
      c.kind = 'dot';
    } else c.kind = 'device';
  }
  // Morsetti di morsettiera: numero vicino al cerchio, nome della morsettiera dal testo "X…" più
  // vicino. SEE scrive "X1.1.12-1.A" (morsettiera e numero insieme) e poi solo "- 2.A", "- 3.A"…
  const terms = clusters.filter(c => c.kind === 'terminal');
  const stripTexts = texts.filter(t => !used.has(t) && (STRIP.test(t.s) || STRIP_NUM.test(t.s)));
  const levelNo = (n: string) => n.replace(/\.([A-Za-z])$/, '$1');
  for (const c of terms) {
    const cc = center(c.box);
    let num: RawText | undefined, nd = 4.5;
    for (const t of texts) {
      if (used.has(t) || !(/^-?\s*[\w.]{1,6}$/.test(t.s) || STRIP_NUM.test(t.s)) || STRIP.test(t.s) || TAG.test(t.s)) continue;
      const d = boxDist(tbox(t), c.box);
      if (d < nd) { nd = d; num = t; }
    }
    if (num) used.add(num);
    const combined = num && STRIP_NUM.exec(num.s);
    let stripName = combined?.[1];
    if (!stripName) {
      let sd = 40;
      for (const t of stripTexts) {
        const tc = center(tbox(t));
        const d = Math.hypot(tc.x - cc.x, tc.y - cc.y);
        if (d < sd) { sd = d; stripName = (STRIP_NUM.exec(t.s)?.[1] ?? t.s); }
      }
    }
    const no = levelNo(combined?.[2] ?? num?.s.replace(/^-\s*/, '') ?? '?');
    c.tag = `${(stripName ?? 'X?').replace(/^-/, '')}:${no}`;
  }
  for (const t of stripTexts) if (terms.length && STRIP.test(t.s)) used.add(t);
  // I trattini "-" accanto ai numeri dei morsetti (SEE scrive "X1.1.2 - 1") non servono più
  for (const t of texts) if (!used.has(t) && t.s === '-' && terms.some(c => boxDist(tbox(t), c.box) < 6)) used.add(t);

  // Nomi dei morsetti dei componenti: testo corto vicino al punto di connessione
  const pinLabels = new Map<Cluster, Map<number, string>>();
  for (const c of clusters) {
    if (c.kind !== 'device') continue;
    c.pins.forEach((pin, k) => {
      let best: RawText | undefined, bd = 3.2;
      for (const t of texts) {
        if (used.has(t) || !PIN_LABEL.test(t.s) || TAG.test(t.s)) continue;
        const d = boxDist(tbox(t), [pin.p.x, pin.p.y, pin.p.x, pin.p.y]);
        if (d < bd) { bd = d; best = t; }
      }
      if (best) {
        used.add(best);
        const m = pinLabels.get(c) ?? new Map<number, string>(); m.set(k, best.s); pinLabels.set(c, m);
      }
    });
  }

  // Numeri e nomi dei fili: testo parallelo al filo, accanto a esso
  for (const t of texts) {
    if (used.has(t) || !WIRE_LABEL.test(t.s) || TAG.test(t.s)) continue;
    const b = tbox(t);
    let best: Wire | undefined, bd = 2.8;
    for (const w of wires) {
      const [a, z] = w.points;
      const hor = a.y === z.y;
      if ((t.rot === 0) !== hor) continue;
      if (hor) {
        if (b[2] < Math.min(a.x, z.x) || b[0] > Math.max(a.x, z.x)) continue;
        const d = Math.min(Math.abs(b[1] - a.y), Math.abs(b[3] - a.y));
        if (d < bd) { bd = d; best = w; }
      } else {
        if (b[3] < Math.min(a.y, z.y) || b[1] > Math.max(a.y, z.y)) continue;
        const d = Math.min(Math.abs(b[0] - a.x), Math.abs(b[2] - a.x));
        if (d < bd) { bd = d; best = w; }
      }
    }
    if (best && !best.number) { best.number = t.s; used.add(t); }
    else if (best && best.number === t.s) used.add(t);
  }

  // Sigle: al componente più vicino (un componente, una sigla)
  const tagTexts = texts.filter(t => !used.has(t) && TAG.test(t.s));
  const pairs: { t: RawText; c: Cluster; d: number }[] = [];
  for (const t of tagTexts) for (const c of clusters) {
    if (c.kind !== 'device' && c.kind !== 'gfx') continue;
    const d = boxDist(tbox(t), c.box);
    if (d <= 16) pairs.push({ t, c, d: d + (c.kind === 'gfx' ? 6 : 0) });
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const { t, c } of pairs) {
    if (used.has(t) || c.tag !== undefined) continue;
    c.tag = t.s.slice(1); c.tagText = t; used.add(t);
    if (c.kind === 'gfx') c.kind = 'device';
  }

  const wireName = (start: Wire): string | undefined => {
    const seen = new Set<Wire>([start]);
    const queue = [start];
    while (queue.length) {
      const w = queue.shift()!;
      if (w.number) return w.number;
      for (const o of wires) {
        if (seen.has(o)) continue;
        const touch = [...w.points].some(p => distToSegment(p, o.points[0], o.points[1]) < 0.01) || [...o.points].some(p => distToSegment(p, w.points[0], w.points[1]) < 0.01);
        if (touch) { seen.add(o); queue.push(o); }
      }
    }
    return undefined;
  };
  // Rimandi tra pagine: la freccia diventa un rimando con il nome del filo
  const elements: Element[] = [];
  const arrows = clusters.filter(c => c.kind === 'arrow');
  for (const c of arrows) {
    const tip = c.pins[0].p;
    const w = wires.find(x => samePt(x.points[0], tip) || samePt(x.points[1], tip));
    if (!w) { c.kind = 'gfx'; continue; }
    const other = samePt(w.points[0], tip) ? w.points[1] : w.points[0];
    const pts = c.segs.flatMap(s => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]).filter(p => !samePt(p, tip, 0.2));
    const open = pts.length ? { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length } : other;
    const outgoing = (open.x - tip.x) * (other.x - tip.x) + (open.y - tip.y) * (other.y - tip.y) > 0;
    const d = { x: Math.sign(tip.x - other.x), y: Math.sign(tip.y - other.y) };
    const rot = (d.y > 0 ? 0 : d.x < 0 ? 90 : d.y < 0 ? 180 : 270) as SymbolInstance['rot'];
    // Riferimento scritto accanto alla freccia (es. "11.0"): non serve più, OpenWiring scrive i suoi
    const ref = texts.filter(t => !used.has(t) && REF.test(t.s) && boxDist(tbox(t), [tip.x - 1, tip.y - 1, tip.x + 1, tip.y + 1]) < 9)
      .sort((a, b) => boxDist(tbox(a), [tip.x, tip.y, tip.x, tip.y]) - boxDist(tbox(b), [tip.x, tip.y, tip.x, tip.y]))[0];
    if (ref) used.add(ref);
    // Nome: quello del filo o di un tratto collegato (stesso conduttore sulla pagina)
    let name = w.number ?? wireName(w);
    if (!name && ref && info?.sheet) {
      // Senza nome del filo: si accoppiano i due lati dal riferimento "foglio.colonna"
      const col = Math.floor((tip.x - dx - fr.left) / ((fr.right - fr.left) / 10));
      const a = `${info.sheet}.${col}`, b = ref.s.replace(/^\//, '');
      const key = [a, b].sort().join('↔');
      const n = (ctx.linkKeys.get(`${key}|${info.sheet}`) ?? 0) + 1;
      ctx.linkKeys.set(`${key}|${info.sheet}`, n);
      name = `${key}${n > 1 ? `#${n}` : ''}`;
    }
    // La freccia di OpenWiring è lunga 3,6 mm: il filo si accorcia di un passo di griglia perché la
    // punta resti dove era nel PDF (e i testi accanto non escano dalla cornice)
    let at = tip;
    const len = Math.abs(other.x - tip.x) + Math.abs(other.y - tip.y);
    if (len >= 2 * GRID) {
      at = { x: tip.x - d.x * GRID, y: tip.y - d.y * GRID };
      const k = samePt(w.points[0], tip) ? 0 : 1;
      w.points[k] = at;
    }
    elements.push({ kind: 'symbol', id: uid('s'), symbolId: outgoing ? 'link' : 'link_in', x: at.x, y: at.y, rot, tag: name ?? '?', pinLabels: {}, autoPins: true } as SymbolInstance);
    ctx.report.links++;
  }

  // Testi rimasti dentro un componente fanno parte del suo disegno
  for (const t of texts) {
    if (used.has(t)) continue;
    const tb = tbox(t);
    const c = clusters.find(k => (k.kind === 'device' || k.kind === 'gfx') && tb[0] >= k.box[0] - 0.2 && tb[2] <= k.box[2] + 0.2 && tb[1] >= k.box[1] - 0.2 && tb[3] <= k.box[3] + 0.2 && (k.box[2] - k.box[0]) > 4);
    if (c) { c.texts.push(t); used.add(t); }
  }

  // Simboli
  for (const c of clusters) {
    if (c.kind === 'dot' || c.kind === 'arrow') continue;
    const pins = [...c.pins].sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
    const o = pins[0]?.p ?? { x: Math.round(c.box[0] / GRID) * GRID, y: Math.round(c.box[1] / GRID) * GRID };
    const prims = toPrims(c.segs, o.x, o.y);
    for (const t of c.texts) prims.push({ t: 'text', x: r2(t.x - o.x), y: r2(t.y - o.y), s: t.s, size: r2(t.size * 0.72), anchor: 'start', ...(t.rot ? { rot: t.rot } : {}) });
    const pinDefs: PinDef[] = pins.map((p, k) => ({ id: String(k + 1), x: r2(p.p.x - o.x), y: r2(p.p.y - o.y), dir: p.dir, label: '' }));
    let tagPos: Pt | undefined;
    if (c.tagText) {
      const t = c.tagText;
      const end = t.x + t.w;
      tagPos = { x: r2((end < o.x - 0.5 ? end : t.x) - o.x), y: r2(t.y - o.y) };
    }
    const role = c.kind === 'terminal' ? 'terminal' as const : 'single' as const;
    const letter = c.kind === 'terminal' ? 'X' : (c.tag && /[A-Za-z]+/.exec(c.tag.replace(/^[\d.]+/, ''))?.[0]) || 'A';
    const key = JSON.stringify([prims, pinDefs.map(p => [p.x, p.y, p.dir]), tagPos, role]);
    const id = `pdf:${hash(key)}`;
    if (!ctx.symbols.has(id)) {
      ctx.symbols.set(id, {
        id, name: c.kind === 'terminal' ? 'Morsetto (da PDF)' : pins.length ? `Componente ${letter} · ${pins.length} morsetti (da PDF)` : 'Grafica (da PDF)',
        category: 'Importati da PDF', letter, role, prims, pins: pinDefs, tagPos: tagPos ?? { x: -6, y: -2 }, source: 'Import PDF',
      });
    }
    const labels: Record<string, string> = {};
    for (const [k, v] of pinLabels.get(c) ?? []) {
      const idx = pins.indexOf(c.pins[k]);
      if (idx >= 0) labels[String(idx + 1)] = v;
    }
    elements.push({
      kind: 'symbol', id: uid('s'), symbolId: id, x: o.x, y: o.y, rot: 0, tag: c.tag ?? '',
      pinLabels: labels, autoPins: false,
    } as SymbolInstance);
    if (c.kind === 'terminal') ctx.report.terminals++;
    else if (c.tag) ctx.report.devices++;
  }

  // Testi liberi
  for (const t of texts) {
    if (used.has(t)) continue;
    elements.push({ kind: 'text', id: uid('t'), x: t.x, y: t.y, text: t.s, size: r2(t.size * 0.72), ...(t.rot ? { rot: t.rot } : {}) } as TextItem);
    ctx.report.texts++;
  }
  elements.unshift(...wires);
  ctx.report.wires += wires.length;

  const page: Page = { id: uid('p'), name: info?.sheet ?? String(pageNo), title: info?.title ?? `Pagina ${pageNo} del PDF`, type: 'multiline', elements };
  // Luogo dal titolo: "Q1.1 Ingresso linea" → luogo +Q1.1, titolo "Ingresso linea"
  const m = info?.title && /^([A-Z]{1,4}\d+(?:\.\d+)*)\s+(.+)$/.exec(info.title);
  if (m) {
    const panels = ctx.project.panels ?? (ctx.project.panels = []);
    let pn: Panel | undefined = panels.find(x => x.code === m[1]);
    if (!pn) { pn = { id: uid('q'), code: m[1], name: m[1], kind: 'Quadro elettrico' }; panels.push(pn); }
    page.panelId = pn.id;
    page.title = m[2];
  }
  return page;
}

/** Converte le pagine lette dal PDF in un progetto OpenWiring */
export function pdfToProject(pages: RawPage[], opts: PdfImportOptions = {}, pageNumbers?: number[]): { project: Project; report: PdfImportReport } {
  const project = emptyProject();
  project.pages = [];
  project.panels = [];
  const report: PdfImportReport = { imported: 0, skipped: [], wires: 0, devices: 0, terminals: 0, links: 0, symbols: 0, texts: 0, warnings: [] };
  const ctx: Ctx = { project, symbols: new Map(), report, linkKeys: new Map() };
  let first: SheetInfo | undefined;
  const infos = pages.map(sheetInfo);
  // Fogli di schema: la serie più numerosa ("DI 125"); le liste (morsettiere, distinte) hanno la loro
  const totals = new Map<string, number>();
  for (const i of infos) if (i?.title && i.total) totals.set(i.total, (totals.get(i.total) ?? 0) + 1);
  const mainTotal = [...totals].sort((a, b) => b[1] - a[1])[0]?.[0];
  pages.forEach((raw, i) => {
    const no = pageNumbers?.[i] ?? i + 1;
    const info = infos[i];
    const schematic = !!info?.title && (!mainTotal || !info.total || info.total === mainTotal);
    if (!schematic && !opts.allPages) { report.skipped.push(no); return; }
    first ??= info;
    project.pages.push(convertPage(raw, info, no, ctx));
    report.imported++;
  });
  // Nomi di pagina doppi (fogli con lo stesso numero): si aggiunge un suffisso
  const seen = new Map<string, number>();
  for (const pg of project.pages) {
    const n = seen.get(pg.name) ?? 0;
    seen.set(pg.name, n + 1);
    if (n) { report.warnings.push(`Foglio ${pg.name} ripetuto: rinominato ${pg.name}_${n + 1}`); pg.name = `${pg.name}_${n + 1}`; }
  }
  project.customSymbols = [...ctx.symbols.values()];
  report.symbols = project.customSymbols.length;
  project.info = {
    ...project.info,
    name: first?.project || opts.fileName?.replace(/\.pdf$/i, '') || 'Progetto da PDF',
    customer: first?.customer ?? '',
    author: first?.author ?? '',
    drawingNr: first?.order ?? '',
    description: 'Importato da PDF',
  };
  if (first?.address) project.titleBlock = { address: first.address };
  if (!project.panels.length) delete project.panels;
  if (!project.pages.length) project.pages.push({ id: uid('p'), name: '1', title: 'Schema', type: 'multiline', elements: [] });
  return { project, report };
}
