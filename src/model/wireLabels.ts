// Posizione dei numeri filo: il testo va accanto al filo in un punto libero, senza finire sopra
// componenti, sigle, testi, altri fili o altri numeri. Si provano i tratti dal più lungo, punti
// diversi lungo il tratto e i due lati (a sinistra/sopra per primo, come in EPLAN).
import { textBounds } from './textFlow';
import type { Page, Project, Pt, SymbolInstance, Wire } from './types';
import { getSymbol, instanceBounds, toWorld, pinLabelPlace } from './geometry';
import { settingsOf } from './numbering';

export interface WireLabelPos {
  x: number;
  y: number;
  /** Testo ruotato di -90° (su un tratto verticale) */
  vertical: boolean;
}

interface Box { x0: number; y0: number; x1: number; y1: number }

export const WIRE_LABEL_SIZE = 1.8;
const CHAR = 0.6;
const textW = (s: string, size: number) => s.length * size * CHAR;

/** Ingombro del numero filo nella posizione data (anchor middle, linea di base in y o ruotato) */
export function labelBox(p: WireLabelPos, text: string, size = WIRE_LABEL_SIZE): Box {
  const w = textW(text, size);
  return p.vertical
    ? { x0: p.x - size * 0.8, y0: p.y - w / 2, x1: p.x + size * 0.2, y1: p.y + w / 2 }
    : { x0: p.x - w / 2, y0: p.y - size * 0.8, x1: p.x + w / 2, y1: p.y + size * 0.2 };
}

/**
 * Testi di un rimando (freccia di interruzione): su una freccia orizzontale il nome sta sopra il
 * filo, dal lato del filo, e i rimandi /pagina.colonna di fianco alla punta della freccia; su una
 * freccia verticale nome e rimandi stanno a destra della punta.
 */
export function linkTextLayout(inst: Pick<SymbolInstance, 'x' | 'y' | 'rot' | 'mirror'>) {
  const pin = toWorld(inst, { x: 0, y: 0 }), tip = toWorld(inst, { x: 0, y: 3.6 });
  const dx = tip.x - pin.x, dy = tip.y - pin.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    // Nome sopra il filo, dall'attacco della freccia verso il filo; pagine di arrivo subito dopo la punta
    const anchor = dx < 0 ? 'start' as const : 'end' as const;
    const x = pin.x + (dx < 0 ? 0.6 : -0.6);
    return { name: { x, y: pin.y - 1.6, anchor }, refs: { x: tip.x + (dx < 0 ? -0.8 : 0.8), y: pin.y + 0.7, anchor: dx < 0 ? 'end' as const : 'start' as const } };
  }
  // Rimando su un filo verticale: nome e pagine scritti in verticale, dal basso verso l'alto
  // (rotazione -90°), come per il filo orizzontale: il nome a sinistra del filo, dall'attacco della
  // freccia verso il filo; le pagine dopo la punta, sull'asse del filo
  const down = dy > 0;
  return {
    name: { x: pin.x - 0.6, y: pin.y + (down ? -0.6 : 0.6), anchor: down ? 'start' as const : 'end' as const, rot: -90 },
    refs: { x: pin.x + 0.7, y: tip.y + (down ? 0.8 : -0.8), anchor: down ? 'end' as const : 'start' as const, rot: -90 },
  };
}

const overlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Il segmento (orizzontale, verticale o obliquo) attraversa il riquadro? */
function segHitsBox(a: Pt, b: Pt, r: Box): boolean {
  if (Math.max(a.x, b.x) < r.x0 || Math.min(a.x, b.x) > r.x1 || Math.max(a.y, b.y) < r.y0 || Math.min(a.y, b.y) > r.y1) return false;
  if (a.x === b.x || a.y === b.y) return true;
  // Obliquo: Liang-Barsky semplificato con campionamento
  for (let k = 0; k <= 20; k++) {
    const x = a.x + (b.x - a.x) * k / 20, y = a.y + (b.y - a.y) * k / 20;
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return true;
  }
  return false;
}

/** Ingombri da evitare: simboli, sigle e testi dei dispositivi, testi liberi */
function obstacleBoxes(project: Project, page: Page, tags: Map<string, string>, lines: Map<string, string[]>): Box[] {
  const out: Box[] = [];
  for (const e of page.elements) {
    if (e.kind === 'symbol') {
      const sym = getSymbol(e.symbolId, project);
      if (!sym) continue;
      // Il riquadro del simbolo un po' più stretto: il numero può stare accanto ai morsetti
      const b = instanceBounds(e, sym);
      out.push({ x0: b.x0 + 0.6, y0: b.y0 + 0.6, x1: b.x1 - 0.6, y1: b.y1 - 0.6 });
      // Designazioni dei morsetti scritte accanto ai pin (vedi pinLabelOffset in PageSvg)
      if (sym.role !== 'potential' && sym.role !== 'link' && sym.role !== 'terminal' && sym.role !== 'pin') {
        for (const pin of sym.pins) {
          const q = pinLabelPlace(e, pin);
          const w = textW(pin.label || '00', 1.8);
          const x0 = q.anchor === 'end' ? q.x - w : q.x;
          out.push({ x0, y0: q.y - 1.5, x1: x0 + w, y1: q.y + 0.3 });
        }
      }
      if (sym.role === 'link') {
        // Nome e rimandi della freccia (larghezza stimata)
        const l = linkTextLayout(e);
        const texts = [...(e.show?.tag === false ? [] : [[l.name, textW(e.tag || '?', 2.8), 2.4] as const]), ...(e.show?.refs === false ? [] : [[l.refs, 12, 1.7] as const])];
        for (const [t, w, h] of texts) {
          if ('rot' in t && t.rot) {
            // Testo verticale dal basso verso l'alto: "start" in basso, lettere a sinistra della base
            const y1 = t.anchor === 'start' ? t.y : t.y + w;
            out.push({ x0: t.x - h, y0: y1 - w, x1: t.x + 0.4, y1 });
            continue;
          }
          const x0 = t.anchor === 'start' ? t.x : t.x - w;
          out.push({ x0, y0: t.y - h, x1: x0 + w, y1: t.y + 0.4 });
        }
        continue;
      }
      const tag = tags.get(e.id) ?? (e.tag && sym.role !== 'terminal' && sym.role !== 'pin' ? `-${e.tag}` : '');
      const extra = lines.get(e.id) ?? [];
      if (tag || extra.length) {
        // Sigla e righe sotto la sigla, anche spostate a mano (per semplicità con lo spostamento della sigla)
        const t0 = toWorld(e, sym.tagPos ?? { x: -6, y: 8 }), o = settingsOf(project).freeSymbolTexts ? e.textOffsets?.tag ?? e.textOffsets?.lines : undefined;
        const t = o ? { x: t0.x + o.x, y: t0.y + o.y } : t0;
        const w = Math.max(textW(tag, 2.6), ...extra.map(l => textW(l, 1.9)));
        const x0 = t0.x < e.x - 0.5 ? t.x - w : t0.x > e.x + 0.5 ? t.x : t.x - w / 2;
        out.push({ x0, y0: t.y - 2.2, x1: x0 + w, y1: t.y + 2.6 * extra.length + 0.5 });
      }
    } else if (e.kind === 'text') {
      out.push(textBounds(e));
    }
  }
  return out;
}

/**
 * Posizioni dei numeri filo di una pagina. texts: testo da scrivere per ogni filo (solo i fili
 * con un numero). tags/lines: sigle e righe di testo scritte accanto ai simboli.
 */
export function placeWireLabels(project: Project, page: Page, texts: Map<string, string>,
  tags: Map<string, string> = new Map(), lines: Map<string, string[]> = new Map(), junctions: Pt[] = [],
  sizes: Map<string, number> = new Map(), gaps: Map<string, number> = new Map()): Map<string, WireLabelPos[]> {
  const sizeOf = (id: string) => sizes.get(id) ?? WIRE_LABEL_SIZE;
  const gapOf = (id: string) => gaps.get(id) ?? 0;
  const out = new Map<string, WireLabelPos[]>();
  // Numeri messi a mano: restano dove sono e gli automatici li evitano
  const manual = new Set<string>();
  const placedManual: Box[] = [];
  for (const e of page.elements) {
    if (e.kind !== 'wire' || !texts.has(e.id) || !e.labels?.length) continue;
    // Alla distanza dal filo giusta per l'altezza attuale del testo (che può essere cambiata dopo)
    const ls = e.labels.map(l => relabel(e.points, l, sizeOf(e.id), gapOf(e.id)));
    out.set(e.id, ls);
    manual.add(e.id);
    for (const l of ls) placedManual.push(labelBox(l, texts.get(e.id)!, sizeOf(e.id)));
  }
  const wires = page.elements.filter(e => e.kind === 'wire' && texts.has(e.id) && !manual.has(e.id));
  if (!wires.length) return out;
  const boxes = obstacleBoxes(project, page, tags, lines);
  const segs: { a: Pt; b: Pt; id: string }[] = [];
  for (const e of page.elements) {
    if (e.kind === 'wire') for (let i = 0; i < e.points.length - 1; i++) segs.push({ a: e.points[i], b: e.points[i + 1], id: e.id });
    else if (e.kind === 'cable' || e.kind === 'wiredef') segs.push({ a: e.points[0], b: e.points[1], id: e.id });
  }
  const placed: Box[] = [...placedManual];
  const free = (r: Box, self: { a: Pt; b: Pt }) =>
    !boxes.some(b => overlap(r, b)) && !placed.some(b => overlap(r, b)) &&
    !segs.some(s => !(s.a === self.a && s.b === self.b) && segHitsBox(s.a, s.b, r)) &&
    !junctions.some(j => j.x > r.x0 - 0.3 && j.x < r.x1 + 0.3 && j.y > r.y0 - 0.3 && j.y < r.y1 + 0.3);
  const T = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];
  for (const w of wires) {
    if (w.kind !== 'wire') continue;
    const text = texts.get(w.id)!;
    const size = sizeOf(w.id);
    const tw = textW(text, size);
    const order = w.points.slice(0, -1).map((a, i) => ({ a, b: w.points[i + 1], len: Math.hypot(w.points[i + 1].x - a.x, w.points[i + 1].y - a.y) }))
      .filter(s => s.len >= 6).sort((p, q) => q.len - p.len);
    let best: WireLabelPos | undefined, first: WireLabelPos | undefined;
    search: for (const s of order) {
      const vertical = Math.abs(s.a.x - s.b.x) < 0.01;
      const horizontal = Math.abs(s.a.y - s.b.y) < 0.01;
      if (!vertical && !horizontal) continue;
      for (const t of T) {
        const mx = s.a.x + (s.b.x - s.a.x) * t, my = s.a.y + (s.b.y - s.a.y) * t;
        // Il testo deve stare dentro il tratto, con un po' di margine dagli estremi
        const along = vertical ? Math.min(Math.abs(my - s.a.y), Math.abs(my - s.b.y)) : Math.min(Math.abs(mx - s.a.x), Math.abs(mx - s.b.x));
        if (along < tw / 2 + 1) continue;
        const sides: WireLabelPos[] = [labelSide(vertical, mx, my, -1, size, gapOf(w.id)), labelSide(vertical, mx, my, 1, size, gapOf(w.id))];
        for (const c of sides) {
          first ??= c;
          if (free(labelBox(c, text, size), s)) { best = c; break search; }
        }
      }
    }
    // Nessun posto libero: a metà del tratto più lungo, come prima
    const pos = best ?? first ?? fallback(w.points, gapOf(w.id));
    if (!pos) continue;
    out.set(w.id, [pos]);
    placed.push(labelBox(pos, text, size));
  }
  return out;
}

/**
 * Posizione del numero accanto al punto (mx, my) di un tratto: side -1 sopra (o a sinistra di un
 * tratto verticale, testo ruotato), +1 sotto (o a destra), alla stessa distanza dal filo per
 * qualunque altezza del testo
 */
export function labelSide(vertical: boolean, mx: number, my: number, side: -1 | 1, size = WIRE_LABEL_SIZE, gap = 0): WireLabelPos {
  const r = (v: number) => Math.round(v * 100) / 100;
  return vertical
    ? { x: r(side < 0 ? mx - 0.7 - gap : mx + 0.3 + size + gap), y: r(my), vertical: true }
    : { x: r(mx), y: r(side < 0 ? my - 0.8 - gap : my + 0.5 + size + gap), vertical: false };
}

/**
 * Distanza in più della scritta da un filo disegnato spesso (bus di conduttori): metà dello spessore
 * della linea più un po' d'aria, così la sigla e i rimandi non toccano il bus
 */
export function wireLabelGap(w: Pick<Wire, 'bundle' | 'width'>, bundleWidth: number): number {
  if (w.bundle === undefined) return 0;
  return Math.round(((w.width ?? bundleWidth) / 2 + 0.4) * 100) / 100;
}

/** Passo dei numeri filo spostati a mano lungo il filo (mm) */
export const LABEL_STEP = 2;

/**
 * Numero filo vicino al punto p: sul tratto più vicino, dal lato del filo in cui si trova p (sopra o
 * sotto, a sinistra o a destra), alla distanza della posizione automatica; lungo il tratto si
 * aggancia alla griglia di 2 mm e resta dentro il tratto.
 */
export function labelNear(pts: Pt[], p: Pt, size = WIRE_LABEL_SIZE, gap = 0): WireLabelPos | undefined {
  let best: { a: Pt; b: Pt; d: number } | undefined;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0;
    const d = Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
    if (!best || d < best.d) best = { a, b, d };
  }
  if (!best) return undefined;
  const { a, b } = best;
  const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
  const snap = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v / LABEL_STEP) * LABEL_STEP));
  if (vertical) {
    // Il centro del testo sulla griglia, entro gli estremi del tratto
    const y = snap(p.y, Math.min(a.y, b.y), Math.max(a.y, b.y));
    // Lato: a sinistra o a destra del filo, dove si trova il punto (il testo a sinistra sta tra x-0,7-altezza e x)
    return labelSide(true, a.x, y, p.x < a.x - 0.3 ? -1 : 1, size, gap);
  }
  const x = snap(p.x, Math.min(a.x, b.x), Math.max(a.x, b.x));
  return labelSide(false, x, a.y, p.y < a.y + size / 2 ? -1 : 1, size, gap);
}

/**
 * Numero filo messo a mano, riportato alla distanza dal filo della posizione automatica per
 * l'altezza del testo size: resta sullo stesso tratto, dallo stesso lato e nello stesso punto lungo
 * il filo
 */
export function relabel(pts: Pt[], l: WireLabelPos, size = WIRE_LABEL_SIZE, gap = 0): WireLabelPos {
  let best: { a: Pt; b: Pt; d: number } | undefined;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
    if (vertical !== l.vertical) continue;
    const inside = vertical ? l.y >= Math.min(a.y, b.y) - 0.01 && l.y <= Math.max(a.y, b.y) + 0.01 : l.x >= Math.min(a.x, b.x) - 0.01 && l.x <= Math.max(a.x, b.x) + 0.01;
    if (!inside) continue;
    const d = vertical ? Math.abs(l.x - a.x) : Math.abs(l.y - a.y);
    if (!best || d < best.d) best = { a, b, d };
  }
  if (!best) return { ...l };
  const { a } = best;
  return l.vertical ? labelSide(true, a.x, l.y, l.x < a.x ? -1 : 1, size, gap) : labelSide(false, l.x, a.y, l.y < a.y ? -1 : 1, size, gap);
}

function fallback(pts: Pt[], gap = 0): WireLabelPos | undefined {
  let best = -1, len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (l > len) { len = l; best = i; }
  }
  if (best < 0 || len < 6) return undefined;
  const a = pts[best], b = pts[best + 1];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return Math.abs(a.x - b.x) < 0.01 ? { x: mx - 0.7 - gap, y: my, vertical: true } : { x: mx, y: my - 0.8 - gap, vertical: false };
}

/** Tratto del filo su cui sta il numero e lato (-1 sinistra/sopra, 1 destra/sotto) */
function labelSeg(pts: Pt[], l: WireLabelPos): { a: Pt; b: Pt; side: -1 | 1 } | undefined {
  let best: { a: Pt; b: Pt; d: number } | undefined;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
    if (vertical !== l.vertical) continue;
    // Distanza dal tratto, contando anche quanto il numero sta oltre gli estremi
    const out = vertical ? Math.max(0, Math.min(a.y, b.y) - l.y, l.y - Math.max(a.y, b.y)) : Math.max(0, Math.min(a.x, b.x) - l.x, l.x - Math.max(a.x, b.x));
    const d = out + (vertical ? Math.abs(l.x - a.x) : Math.abs(l.y - a.y));
    if (!best || d < best.d) best = { a, b, d };
  }
  if (!best) return undefined;
  const { a, b } = best;
  return { a, b, side: (l.vertical ? l.x < a.x : l.y < a.y) ? -1 : 1 };
}

/** Numero sul tratto a-b nel punto along (tenuto dentro il tratto), dal lato side */
function placeOnSeg(a: Pt, b: Pt, vertical: boolean, along: number, side: -1 | 1, size: number): WireLabelPos {
  const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x), hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
  const v = Math.min(hi, Math.max(lo, along));
  return vertical ? labelSide(true, a.x, v, side, size) : labelSide(false, v, a.y, side, size);
}

export type LabelAlign = 'left' | 'right' | 'top' | 'bottom' | 'column' | 'row';

/**
 * Numeri filo allineati (il primo numero di ogni filo, nell'ordine dei fili): sui fili verticali
 * «in alto», «in basso» e «stessa riga» portano i numeri alla stessa altezza, «a sinistra» e «a
 * destra» li mettono da quel lato del filo; sui fili orizzontali il contrario. «Stessa riga» e
 * «stessa colonna» vanno sul numero del primo filo. Il numero resta sul suo tratto.
 */
export function alignWireLabels(wires: { id: string; points: Pt[] }[], cur: Map<string, WireLabelPos[]>, mode: LabelAlign,
  sizeOf: (id: string) => number = () => WIRE_LABEL_SIZE): Map<string, WireLabelPos[]> {
  const items = wires.flatMap(w => {
    const ls = cur.get(w.id);
    const s = ls?.[0] && labelSeg(w.points, ls[0]);
    return s ? [{ w, ls: ls!, l: ls![0], ...s }] : [];
  });
  const vs = items.filter(i => i.l.vertical), hs = items.filter(i => !i.l.vertical);
  const ys = vs.map(i => i.l.y), xs = hs.map(i => i.l.x);
  const out = new Map<string, WireLabelPos[]>();
  for (const i of items) {
    const size = sizeOf(i.w.id);
    let along = i.l.vertical ? i.l.y : i.l.x, side = i.side;
    if (i.l.vertical) {
      if (mode === 'top') along = Math.min(...ys);
      else if (mode === 'bottom') along = Math.max(...ys);
      else if (mode === 'row') along = ys[0];
      else if (mode === 'left') side = -1;
      else if (mode === 'right') side = 1;
    } else {
      if (mode === 'left') along = Math.min(...xs);
      else if (mode === 'right') along = Math.max(...xs);
      else if (mode === 'column') along = xs[0];
      else if (mode === 'top') side = -1;
      else if (mode === 'bottom') side = 1;
    }
    out.set(i.w.id, [placeOnSeg(i.a, i.b, i.l.vertical, along, side, size), ...i.ls.slice(1)]);
  }
  return out;
}

/**
 * Numeri filo sulla linea tracciata da p a q (resa orizzontale o verticale): ogni filo che la linea
 * attraversa di traverso prende il numero nel punto d'incrocio, dal lato in cui aveva il numero (o a
 * sinistra/sopra). Sostituisce il numero del filo più vicino all'incrocio.
 */
export function labelsOnLine(wires: { id: string; points: Pt[] }[], cur: Map<string, WireLabelPos[]>, p: Pt, q: Pt,
  sizeOf: (id: string) => number = () => WIRE_LABEL_SIZE): Map<string, WireLabelPos[]> {
  const horizontal = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
  const lo = horizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y), hi = horizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
  const at = horizontal ? p.y : p.x;
  const out = new Map<string, WireLabelPos[]>();
  for (const w of wires) {
    for (let i = 0; i < w.points.length - 1; i++) {
      const a = w.points[i], b = w.points[i + 1];
      // Linea orizzontale: tratti verticali che la attraversano, e viceversa
      const segV = Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) > 0.01, segH = Math.abs(a.y - b.y) < 0.01 && Math.abs(a.x - b.x) > 0.01;
      if (horizontal ? !segV : !segH) continue;
      const pos = horizontal ? a.x : a.y;
      const s0 = horizontal ? Math.min(a.y, b.y) : Math.min(a.x, b.x), s1 = horizontal ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
      if (pos < lo || pos > hi || at < s0 || at > s1) continue;
      const ls = cur.get(w.id) ?? [];
      const vertical = horizontal;
      const same = ls.map((l, k) => ({ l, k })).filter(x => x.l.vertical === vertical);
      const near = same.sort((m, n) => Math.hypot(m.l.x - (vertical ? a.x : at), m.l.y - (vertical ? at : a.y)) - Math.hypot(n.l.x - (vertical ? a.x : at), n.l.y - (vertical ? at : a.y)))[0];
      const side = near ? (vertical ? near.l.x < a.x : near.l.y < a.y) ? -1 : 1 : -1;
      const nl = placeOnSeg(a, b, vertical, at, side, sizeOf(w.id));
      const k = near?.k ?? 0;
      out.set(w.id, ls.length ? ls.map((l, j) => (j === k ? nl : l)) : [nl]);
      break;
    }
  }
  return out;
}
