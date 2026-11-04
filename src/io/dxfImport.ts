// Import DXF (ASCII) di un disegno 2D come grafica: cartigli disegnati in AutoCAD o in altri CAD e
// grafica dei simboli (es. i DXF dell'EPLAN Data Portal). Legge LINE, LWPOLYLINE e POLYLINE (anche
// con archi), CIRCLE, ARC, ELLIPSE, SPLINE, TEXT, MTEXT, ATTDEF e i blocchi inseriti (INSERT).
// Il risultato ha l'asse y verso il basso.
import type { Prim, Pt } from '../model/types';

interface Pair { code: number; value: string }
type Ent = { type: string; pairs: Pair[] };

function readPairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    out.push({ code, value: lines[i + 1].replace(/\s+$/, '') });
  }
  return out;
}

/** Divide una sequenza di coppie in entità (ognuna inizia con il codice 0) */
function entities(pairs: Pair[]): Ent[] {
  const out: Ent[] = [];
  for (const p of pairs) {
    if (p.code === 0) out.push({ type: p.value.trim(), pairs: [] });
    else out[out.length - 1]?.pairs.push(p);
  }
  return out;
}

const num = (e: Ent, code: number, def = 0) => { const p = e.pairs.find(x => x.code === code); return p ? parseFloat(p.value) : def; };
const str = (e: Ent, code: number) => e.pairs.find(x => x.code === code)?.value ?? '';

/** Testo MTEXT senza codici di formattazione */
function cleanMtext(s: string): string {
  return s.replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/[{}]/g, '').replace(/\\~/g, ' ').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').trim();
}

/** Attributi con nomi comuni → segnaposto del cartiglio */
const ATTR_MAP: Record<string, string> = {
  progetto: '{progetto}', project: '{progetto}', titolo: '{titolo}', title: '{titolo}', descrizione: '{titolo}',
  data: '{data}', date: '{data}', foglio: '{pagina}', sheet: '{pagina}', pagina: '{pagina}', page: '{pagina}',
  fogli: '{totale}', sheets: '{totale}', cliente: '{cliente}', customer: '{cliente}', client: '{cliente}',
  autore: '{autore}', disegnatore: '{autore}', drawn: '{autore}', author: '{autore}', rev: '{revisione}', revisione: '{revisione}',
  revision: '{revisione}', disegno: '{disegno}', dwg: '{disegno}', dwg_no: '{disegno}', drawing: '{disegno}', ditta: '{ditta}', company: '{ditta}',
};
export const attrPlaceholder = (tag: string) => ATTR_MAP[tag.trim().toLowerCase()] ?? `{${tag.trim()}}`;

interface Xf { a: number; b: number; c: number; d: number; tx: number; ty: number; s: number; rot: number }
const ID: Xf = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, s: 1, rot: 0 };
const apply = (m: Xf, x: number, y: number) => ({ x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty });
function compose(m: Xf, e: Ent, base: Pt): Xf {
  const sx = num(e, 41, 1), sy = num(e, 42, sx), r = num(e, 50) * Math.PI / 180;
  const ix = num(e, 10), iy = num(e, 20);
  // Locale: (p - base) * scala, ruotato, + inserimento
  const la = Math.cos(r) * sx, lb = Math.sin(r) * sx, lc = -Math.sin(r) * sy, ld = Math.cos(r) * sy;
  const ltx = ix - (la * base.x + lc * base.y), lty = iy - (lb * base.x + ld * base.y);
  return {
    a: m.a * la + m.c * lb, b: m.b * la + m.d * lb, c: m.a * lc + m.c * ld, d: m.b * lc + m.d * ld,
    tx: m.a * ltx + m.c * lty + m.tx, ty: m.b * ltx + m.d * lty + m.ty, s: m.s * Math.abs(sx), rot: m.rot + num(e, 50),
  };
}

/** Grafica in coordinate DXF (y verso l'alto), testi con altezza e allineamento */
type Raw =
  | { t: 'line'; a: Pt; b: Pt }
  | { t: 'poly'; pts: Pt[]; closed: boolean }
  | { t: 'circle'; c: Pt; r: number }
  | { t: 'text'; p: Pt; s: string; h: number; anchor: 'start' | 'middle' | 'end'; rot: number };

function collect(ents: Ent[], blocks: Map<string, { base: Pt; ents: Ent[] }>, m: Xf, out: Raw[], depth: number) {
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    const P = (cx: number, cy: number) => apply(m, num(e, cx), num(e, cy));
    switch (e.type) {
      case 'LINE': out.push({ t: 'line', a: P(10, 20), b: P(11, 21) }); break;
      case 'LWPOLYLINE': {
        // Vertici con il loro "bulge" (codice 42, dopo il vertice): arco fino al vertice successivo
        const vs: { x: number; y: number; bulge: number }[] = [];
        for (const p of e.pairs) {
          if (p.code === 10) vs.push({ x: parseFloat(p.value), y: 0, bulge: 0 });
          else if (p.code === 20 && vs.length) vs[vs.length - 1].y = parseFloat(p.value);
          else if (p.code === 42 && vs.length) vs[vs.length - 1].bulge = parseFloat(p.value);
        }
        const closed = (num(e, 70) & 1) === 1;
        out.push({ t: 'poly', pts: bulgePoints(vs, closed).map(q => apply(m, q.x, q.y)), closed });
        break;
      }
      case 'POLYLINE': {
        const vs: { x: number; y: number; bulge: number }[] = [];
        let j = i + 1;
        for (; j < ents.length && ents[j].type === 'VERTEX'; j++) vs.push({ x: num(ents[j], 10), y: num(ents[j], 20), bulge: num(ents[j], 42) });
        if (ents[j]?.type === 'SEQEND') j++;
        const closed = (num(e, 70) & 1) === 1;
        out.push({ t: 'poly', pts: bulgePoints(vs, closed).map(q => apply(m, q.x, q.y)), closed });
        i = j - 1;
        break;
      }
      case 'ELLIPSE': {
        // Centro, estremo dell'asse maggiore (relativo), rapporto degli assi, parametri iniziale e finale
        const cx = num(e, 10), cy = num(e, 20), mx = num(e, 11), my = num(e, 21), ratio = num(e, 40, 1);
        let t0 = num(e, 41), t1 = num(e, 42, Math.PI * 2);
        if (t1 <= t0) t1 += Math.PI * 2;
        const n = Math.max(8, Math.ceil((t1 - t0) / (Math.PI / 18)));
        const pts = Array.from({ length: n + 1 }, (_, k) => {
          const t = t0 + (t1 - t0) * k / n, c = Math.cos(t), s = Math.sin(t) * ratio;
          return apply(m, cx + mx * c - my * s, cy + my * c + mx * s);
        });
        out.push({ t: 'poly', pts, closed: Math.abs(t1 - t0 - Math.PI * 2) < 1e-6 });
        break;
      }
      case 'SPLINE': {
        // Approssimata con i punti di passaggio (11/21) o, se mancano, con i punti di controllo (10/20)
        const pick = (cx: number, cy: number) => {
          const xs = e.pairs.filter(p => p.code === cx).map(p => parseFloat(p.value));
          const ys = e.pairs.filter(p => p.code === cy).map(p => parseFloat(p.value));
          return xs.map((x, k) => apply(m, x, ys[k] ?? 0));
        };
        const fit = pick(11, 21);
        const pts = fit.length >= 2 ? fit : pick(10, 20);
        if (pts.length >= 2) out.push({ t: 'poly', pts, closed: (num(e, 70) & 1) === 1 });
        break;
      }
      case 'CIRCLE': out.push({ t: 'circle', c: P(10, 20), r: num(e, 40) * m.s }); break;
      case 'ARC': {
        const cx = num(e, 10), cy = num(e, 20), r = num(e, 40);
        let a0 = num(e, 50), a1 = num(e, 51);
        if (a1 < a0) a1 += 360;
        const n = Math.max(4, Math.ceil((a1 - a0) / 10));
        const pts = Array.from({ length: n + 1 }, (_, k) => {
          const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180;
          return apply(m, cx + r * Math.cos(a), cy + r * Math.sin(a));
        });
        out.push({ t: 'poly', pts, closed: false });
        break;
      }
      case 'TEXT': case 'ATTDEF': {
        const h = num(e, 40, 2.5) * m.s;
        const hal = num(e, 72);
        const aligned = hal > 0 && e.pairs.some(p => p.code === 11);
        const p = aligned ? P(11, 21) : P(10, 20);
        const s = e.type === 'ATTDEF' ? attrPlaceholder(str(e, 2)) : str(e, 1).replace(/%%[uUoO]/g, '');
        if (s.trim()) out.push({ t: 'text', p, s, h, anchor: hal === 1 || hal === 4 ? 'middle' : hal === 2 ? 'end' : 'start', rot: m.rot + num(e, 50) });
        break;
      }
      case 'MTEXT': {
        const h = num(e, 40, 2.5) * m.s;
        const att = num(e, 71, 1);
        const raw = e.pairs.filter(p => p.code === 3).map(p => p.value).join('') + str(e, 1);
        const p = P(10, 20);
        // Attacco in alto o al centro: la linea di base scende di conseguenza
        const dy = att <= 3 ? h : att <= 6 ? h / 2 : 0;
        const anchor = att % 3 === 2 ? 'middle' : att % 3 === 0 ? 'end' : 'start';
        const s = cleanMtext(raw);
        if (s) out.push({ t: 'text', p: { x: p.x, y: p.y - dy }, s, h, anchor, rot: m.rot + num(e, 50) });
        break;
      }
      case 'INSERT': {
        const b = blocks.get(str(e, 2));
        if (b && depth < 8) collect(b.ents, blocks, compose(m, e, b.base), out, depth + 1);
        break;
      }
    }
  }
}

export interface DxfGraphics { prims: Prim[]; width: number; height: number; scale: number }

/** Punti di una polilinea con archi: ogni "bulge" (tangente di 1/4 dell'angolo) diventa una serie di punti */
function bulgePoints(vs: { x: number; y: number; bulge: number }[], closed: boolean): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < vs.length; k++) {
    const a = vs[k];
    out.push({ x: a.x, y: a.y });
    const b = vs[k + 1] ?? (closed ? vs[0] : undefined);
    if (!b || !a.bulge) continue;
    const ang = 4 * Math.atan(a.bulge), d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1e-9) continue;
    const r = d / (2 * Math.sin(ang / 2));
    // Centro: sulla perpendicolare al punto medio della corda
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = r * Math.cos(ang / 2);
    const ux = -(b.y - a.y) / d, uy = (b.x - a.x) / d;
    const cx = mx + ux * h, cy = my + uy * h;
    const s0 = Math.atan2(a.y - cy, a.x - cx);
    const n = Math.max(2, Math.ceil(Math.abs(ang) / (Math.PI / 18)));
    for (let j = 1; j < n; j++) {
      const t = s0 + ang * j / n;
      out.push({ x: cx + Math.abs(r) * Math.cos(t), y: cy + Math.abs(r) * Math.sin(t) });
    }
  }
  return out;
}

/** Millimetri per unità di disegno, dalla variabile $INSUNITS dell'intestazione (0 = non indicata) */
const UNIT_MM: Record<number, [number, string]> = { 1: [25.4, 'in'], 2: [304.8, 'ft'], 4: [1, 'mm'], 5: [10, 'cm'], 6: [1000, 'm'] };

export interface DxfSymbolInfo {
  /** Dimensioni del disegno in mm (scala 1) */
  width: number; height: number;
  /** Unità del file ("mm", "in"…), vuota se il file non la indica (si considera mm) */
  units: string;
  /** Elementi grafici e testi letti */
  count: number;
}

function readDxf(text: string) {
  const all = entities(readPairs(text));
  const blocks = new Map<string, { base: Pt; ents: Ent[] }>();
  let section = '', cur: { name: string; base: Pt; ents: Ent[] } | undefined;
  const top: Ent[] = [];
  let unit = 0;
  for (let k = 0; k < all.length; k++) {
    const e = all[k];
    if (e.type === 'SECTION') {
      section = str(e, 2);
      // Intestazione: coppie "9 $NOME" seguite dal valore (qui nella stessa entità del codice 0)
      if (section === 'HEADER') {
        const i = e.pairs.findIndex(p => p.code === 9 && p.value.trim() === '$INSUNITS');
        if (i >= 0) unit = parseInt(e.pairs[i + 1]?.value ?? '0', 10) || 0;
      }
      continue;
    }
    if (e.type === 'ENDSEC') { section = ''; continue; }
    if (section === 'BLOCKS') {
      if (e.type === 'BLOCK') { cur = { name: str(e, 2), base: { x: num(e, 10), y: num(e, 20) }, ents: [] }; continue; }
      if (e.type === 'ENDBLK') { if (cur) blocks.set(cur.name, cur); cur = undefined; continue; }
      cur?.ents.push(e);
    } else if (section === 'ENTITIES') top.push(e);
  }
  const raw: Raw[] = [];
  collect(top, blocks, ID, raw, 0);
  const pts = raw.flatMap(r => r.t === 'line' ? [r.a, r.b] : r.t === 'poly' ? r.pts : r.t === 'circle' ? [{ x: r.c.x - r.r, y: r.c.y - r.r }, { x: r.c.x + r.r, y: r.c.y + r.r }] : [r.p]);
  const box = pts.length ? {
    x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)),
    y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)),
  } : undefined;
  const [mm, units] = UNIT_MM[unit] ?? [1, ''];
  return { raw, box, mm, units };
}

/** Trasforma la grafica letta: (x, y) del DXF → coordinate con y verso il basso */
function toPrims(raw: Raw[], X: (x: number) => number, Y: (y: number) => number, k: number): Prim[] {
  const r2 = (v: number) => Math.round(v * 100) / 100 + 0;
  return raw.map((r): Prim => {
    switch (r.t) {
      case 'line': return { t: 'line', x1: X(r.a.x), y1: Y(r.a.y), x2: X(r.b.x), y2: Y(r.b.y) };
      case 'poly': return { t: 'poly', pts: r.pts.map(p => ({ x: X(p.x), y: Y(p.y) })), closed: r.closed };
      case 'circle': return { t: 'circle', cx: X(r.c.x), cy: Y(r.c.y), r: r2(r.r * k) };
      case 'text': return { t: 'text', x: X(r.p.x), y: Y(r.p.y), s: r.s, size: r2(r.h * k), anchor: r.anchor, ...(r.rot ? { rot: -r.rot } : {}) };
    }
  });
}

/** Dimensioni e unità di un DXF, per proporre la scala prima dell'import nel simbolo */
export function dxfSymbolInfo(text: string): DxfSymbolInfo {
  const { raw, box, mm, units } = readDxf(text);
  if (!box) return { width: 0, height: 0, units, count: 0 };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { width: r2((box.x1 - box.x0) * mm), height: r2((box.y1 - box.y0) * mm), units, count: raw.length };
}

/**
 * Grafica di un DXF per un simbolo: in millimetri (dalle unità del file) moltiplicati per scale.
 * L'origine 0,0 del disegno diventa l'origine del simbolo se cade sul disegno o vicino; altrimenti
 * l'angolo in alto a sinistra del disegno va in 0,0.
 */
export function dxfSymbolPrims(text: string, scale = 1): Prim[] {
  const { raw, box, mm } = readDxf(text);
  if (!box) return [];
  const k = mm * scale;
  const mx = (box.x1 - box.x0) * 0.25 + 1e-6, my = (box.y1 - box.y0) * 0.25 + 1e-6;
  const near = box.x0 - mx <= 0 && box.x1 + mx >= 0 && box.y0 - my <= 0 && box.y1 + my >= 0;
  const ox = near ? 0 : box.x0, oy = near ? 0 : box.y1;
  const r2 = (v: number) => Math.round(v * 100) / 100 + 0;
  return toPrims(raw, x => r2((x - ox) * k), y => r2((oy - y) * k), k);
}

/**
 * Legge il DXF e lo adatta a un riquadro largo maxW e alto maxH (mm): 1:1 se ci sta,
 * altrimenti ridotto. Le coordinate partono da 0,0 in alto a sinistra.
 */
export function dxfToPrims(text: string, maxW: number, maxH: number): DxfGraphics {
  const { raw, box } = readDxf(text);
  if (!box) return { prims: [], width: 0, height: 0, scale: 1 };
  const { x0, x1, y0, y1 } = box;
  const w = x1 - x0, h = y1 - y0;
  const k = w <= maxW + 0.5 && h <= maxH + 0.5 ? 1 : Math.min(maxW / (w || 1), maxH / (h || 1));
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const prims = toPrims(raw, x => r2((x - x0) * k), y => r2((y1 - y) * k), k);
  return { prims, width: r2(w * k), height: r2(h * k), scale: k };
}
