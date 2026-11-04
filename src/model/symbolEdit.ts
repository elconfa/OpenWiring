// Operazioni dell'editor dei componenti, come in un CAD semplice: selezione di più elementi,
// spostamento, rotazione, copia e incolla, maniglie per allungare tratti e rettangoli.
// Lavorano su una copia del simbolo e ne restituiscono una nuova.
import type { Prim, PinDef, PinDir, Pt, SymbolDef } from './types';
import { primBounds, segmentTouchesBox, polylineTouchesBox } from './geometry';
import { alignDeltas, type AlignBox, type AlignMode } from './align';

export type Item = { kind: 'prim' | 'pin' | 'field'; i: number } | { kind: 'tag' };

/**
 * Elementi copiati: grafica e punti di connessione, in coordinate del simbolo. origin: punto che
 * segue il mouse e va sulla griglia dei punti di connessione (per un simbolo inserito come
 * grafica, la sua origine)
 */
export interface Clip { prims: Prim[]; pins: PinDef[]; origin?: Pt }

/**
 * Un simbolo esistente come sola grafica da inserire in un altro (simbolo composto): le linee, gli
 * archi e i testi restano, i punti di connessione no; le sue primitive formano un gruppo
 */
export function symbolAsGraphic(s: SymbolDef): Clip {
  // Il simbolo inserito resta un gruppo (si sposta intero; si esplode per modificarlo)
  const prims = structuredClone(s.prims).map(p => (s.prims.length > 1 ? { ...p, g: 'ins' } : p));
  return { prims, pins: [], origin: { x: 0, y: 0 } };
}

const r2 = (v: number) => Math.round(v * 100) / 100 + 0;
export const sameItem = (a: Item, b: Item) => a.kind === b.kind && (a.kind === 'tag' || a.i === (b as { i: number }).i);

// ——— Gruppi e blocco ———

/** Elemento bloccato: non si sposta, non si modifica e non si cancella finché non si sblocca */
export function isLocked(sym: SymbolDef, it: Item): boolean {
  if (it.kind === 'prim') return !!sym.prims[it.i]?.lock;
  if (it.kind === 'pin') return !!sym.pins[it.i]?.lock;
  return false;
}
/** Solo gli elementi che si possono modificare (non bloccati) */
export const editable = (sym: SymbolDef, items: Item[]): Item[] => items.filter(it => !isLocked(sym, it));
/** Gruppo di una primitiva */
export const groupOf = (sym: SymbolDef, i: number): string | undefined => sym.prims[i]?.g;

/** Aggiunge alla selezione tutte le primitive dei gruppi toccati (un gruppo si seleziona intero) */
export function withGroups(sym: SymbolDef, items: Item[]): Item[] {
  const gs = new Set(items.flatMap(it => (it.kind === 'prim' && sym.prims[it.i]?.g ? [sym.prims[it.i].g!] : [])));
  if (!gs.size) return items;
  const out = [...items];
  sym.prims.forEach((p, i) => { if (p.g && gs.has(p.g) && !out.some(it => it.kind === 'prim' && it.i === i)) out.push({ kind: 'prim', i }); });
  return out;
}

const newGroupId = () => `g${Math.random().toString(36).slice(2, 9)}`;
const setPrimKey = <K extends 'g' | 'lock'>(p: Prim, k: K, v: Prim[K] | undefined): Prim => {
  const q = { ...p } as Prim;
  if (v === undefined || v === false) delete q[k]; else q[k] = v;
  return q;
};

/**
 * Raggruppa le primitive selezionate (con i gruppi a cui appartengono, che si fondono in uno):
 * servono almeno due primitive. I punti di connessione e i testi del componente restano fuori.
 */
export function groupItems(sym: SymbolDef, items: Item[]): SymbolDef {
  const idx = new Set(withGroups(sym, items).flatMap(it => (it.kind === 'prim' ? [it.i] : [])));
  if (idx.size < 2) return sym;
  const g = newGroupId();
  return { ...sym, prims: sym.prims.map((p, i) => (idx.has(i) ? setPrimKey(p, 'g', g) : p)) };
}

/** Esplode i gruppi delle primitive selezionate: tornano elementi singoli, modificabili uno per uno */
export function explodeItems(sym: SymbolDef, items: Item[]): SymbolDef {
  const gs = new Set(items.flatMap(it => (it.kind === 'prim' && sym.prims[it.i]?.g ? [sym.prims[it.i].g!] : [])));
  if (!gs.size) return sym;
  return { ...sym, prims: sym.prims.map(p => (p.g && gs.has(p.g) ? setPrimKey(p, 'g', undefined) : p)) };
}

/** Blocca o sblocca le primitive e i punti di connessione selezionati (con i loro gruppi interi) */
export function lockItems(sym: SymbolDef, items: Item[], lock: boolean): SymbolDef {
  const all = withGroups(sym, items);
  const has = (kind: 'prim' | 'pin', i: number) => all.some(it => it.kind === kind && it.i === i);
  return {
    ...sym,
    prims: sym.prims.map((p, i) => (has('prim', i) ? setPrimKey(p, 'lock', lock || undefined) : p)),
    pins: sym.pins.map((q, i) => {
      if (!has('pin', i)) return q;
      const { lock: _l, ...rest } = q;
      return lock ? { ...rest, lock: true } : rest;
    }),
  };
}

/** Tutti gli elementi bloccati del simbolo */
export function lockedItems(sym: SymbolDef): Item[] {
  return [...sym.prims.flatMap((p, i) => (p.lock ? [{ kind: 'prim' as const, i }] : [])), ...sym.pins.flatMap((q, i) => (q.lock ? [{ kind: 'pin' as const, i }] : []))];
}

function mapPrim(p: Prim, f: (q: Pt) => Pt): Prim {
  switch (p.t) {
    case 'line': { const a = f({ x: p.x1, y: p.y1 }), b = f({ x: p.x2, y: p.y2 }); return { ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
    case 'rect': {
      const a = f({ x: p.x, y: p.y }), b = f({ x: p.x + p.w, y: p.y + p.h });
      return { ...p, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: r2(Math.abs(b.x - a.x)), h: r2(Math.abs(b.y - a.y)) };
    }
    case 'circle': case 'arc': case 'ellipse': { const c = f({ x: p.cx, y: p.cy }); return { ...p, cx: c.x, cy: c.y }; }
    case 'text': { const q = f({ x: p.x, y: p.y }); return { ...p, x: q.x, y: q.y }; }
    case 'poly': return { ...p, pts: p.pts.map(f) };
  }
}

const shift = (dx: number, dy: number) => (q: Pt): Pt => ({ x: r2(q.x + dx), y: r2(q.y + dy) });
/** 90° in senso orario sullo schermo (y verso il basso) attorno a c */
const turn = (c: Pt) => (q: Pt): Pt => ({ x: r2(c.x - (q.y - c.y)), y: r2(c.y + (q.x - c.x)) });
const NEXT_DIR: Record<PinDir, PinDir> = { up: 'right', right: 'down', down: 'left', left: 'up' };
export const rotateDir = (d: PinDir): PinDir => NEXT_DIR[d];

function rotatePrim(p: Prim, c: Pt): Prim {
  const q = mapPrim(p, turn(c));
  if (q.t === 'ellipse') return { ...q, rx: q.ry, ry: q.rx };
  if (q.t === 'arc') return { ...q, a0: (q.a0 + 90) % 360, a1: (q.a1 + 90) % 360 || 360 };
  // I testi girano con il disegno: orizzontale → verticale dall'alto → capovolto → dal basso verso l'alto
  if (q.t === 'text') return { ...q, rot: turnRot(q.rot) };
  return q;
}

/** Rotazione di un testo dopo 90° in senso orario, tra -90 e 180 (0 = orizzontale, assente) */
export function turnRot(rot: number | undefined): number | undefined {
  const r = (((rot ?? 0) + 90) % 360 + 360) % 360;
  return r === 0 ? undefined : r === 270 ? -90 : r;
}

const tagSize = 2.6, fieldSize = 1.9;
function itemBox(sym: SymbolDef, it: Item) {
  if (it.kind === 'prim') return primBounds([sym.prims[it.i]]);
  if (it.kind === 'pin') { const q = sym.pins[it.i]; return { x0: q.x, y0: q.y, x1: q.x, y1: q.y }; }
  if (it.kind === 'field') { const f = (sym.fields ?? [])[it.i]; return { x0: f.x, y0: f.y - (f.size ?? fieldSize), x1: f.x + 8, y1: f.y }; }
  const t = sym.tagPos ?? { x: 0, y: 0 };
  return { x0: t.x - 6, y0: t.y - tagSize, x1: t.x, y1: t.y };
}

/** Ingombro degli elementi selezionati */
export function itemsBounds(sym: SymbolDef, items: Item[]) {
  const bs = items.map(it => itemBox(sym, it));
  return { x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)), x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1)) };
}

/** Elementi dentro il riquadro (crossing: anche quelli solo toccati, come nello schema da destra a sinistra) */
export function itemsInBox(sym: SymbolDef, box: { x0: number; y0: number; x1: number; y1: number }, crossing: boolean): Item[] {
  const all: Item[] = [
    ...sym.prims.map((_, i) => ({ kind: 'prim' as const, i })), ...sym.pins.map((_, i) => ({ kind: 'pin' as const, i })),
    ...(sym.fields ?? []).map((_, i) => ({ kind: 'field' as const, i })), ...(sym.tagPos ? [{ kind: 'tag' as const }] : []),
  ];
  // Gli elementi bloccati non si prendono con il riquadro (si selezionano con un clic)
  const found = all.filter(it => {
    if (isLocked(sym, it)) return false;
    // Linee e polilinee: da destra a sinistra contano i tratti, non il rettangolo che le contiene
    const p = it.kind === 'prim' ? sym.prims[it.i] : undefined;
    if (crossing && p?.t === 'line') return segmentTouchesBox({ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }, box);
    if (crossing && p?.t === 'poly') return polylineTouchesBox(p.closed && p.pts.length > 2 ? [...p.pts, p.pts[0]] : p.pts, box);
    const b = itemBox(sym, it);
    return crossing ? b.x1 >= box.x0 && b.x0 <= box.x1 && b.y1 >= box.y0 && b.y0 <= box.y1
      : b.x0 >= box.x0 && b.x1 <= box.x1 && b.y0 >= box.y0 && b.y1 <= box.y1;
  });
  // Gruppi: toccandone una parte si prende tutto (da destra a sinistra); con il riquadro da sinistra
  // a destra il gruppo va preso tutto dentro
  if (crossing) return withGroups(sym, found);
  const has = (i: number) => found.some(it => it.kind === 'prim' && it.i === i);
  return found.filter(it => it.kind !== 'prim' || !sym.prims[it.i].g || sym.prims.every((p, j) => p.g !== sym.prims[it.i].g || has(j)));
}

function transform(sym: SymbolDef, items: Item[], fp: (p: Prim) => Prim, fq: (q: Pt) => Pt, fd: (d: PinDir) => PinDir): SymbolDef {
  const has = (kind: Item['kind'], i?: number) => items.some(it => it.kind === kind && (kind === 'tag' || (it as { i: number }).i === i));
  return {
    ...sym,
    prims: sym.prims.map((p, i) => (has('prim', i) ? fp(p) : p)),
    pins: sym.pins.map((q, i) => (has('pin', i) ? { ...q, ...fq(q), dir: fd(q.dir) } : q)),
    ...(sym.fields ? { fields: sym.fields.map((f, i) => (has('field', i) ? { ...f, ...fq(f) } : f)) } : {}),
    ...(sym.tagPos && has('tag') ? { tagPos: fq(sym.tagPos) } : {}),
  };
}

/**
 * Allinea gli elementi selezionati (vedi align.ts): bordi sull'elemento più esterno, centri sul
 * primo selezionato; per testi e punti di connessione il riferimento è il punto di inserimento
 */
export function alignItems(sym: SymbolDef, items: Item[], mode: AlignMode): SymbolDef {
  items = editable(sym, items);
  // Un gruppo si allinea come un elemento solo: il suo ingombro, il centro come riferimento
  const units: Item[][] = [];
  const byGroup = new Map<string, Item[]>();
  for (const it of items) {
    const g = it.kind === 'prim' ? sym.prims[it.i]?.g : undefined;
    if (!g) { units.push([it]); continue; }
    const u = byGroup.get(g);
    if (u) u.push(it); else { const nu = [it]; byGroup.set(g, nu); units.push(nu); }
  }
  const boxes: AlignBox[] = units.map(u => {
    if (u.length > 1) { const b = itemsBounds(sym, u); return { ...b, ref: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } }; }
    const it = u[0];
    const b = itemBox(sym, it);
    let ref: Pt = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    if (it.kind === 'pin') ref = { x: sym.pins[it.i].x, y: sym.pins[it.i].y };
    else if (it.kind === 'field') { const f = (sym.fields ?? [])[it.i]; ref = { x: f.x, y: f.y }; }
    else if (it.kind === 'tag') ref = sym.tagPos ?? { x: 0, y: 0 };
    else { const q = sym.prims[it.i]; if (q.t === 'text') ref = { x: q.x, y: q.y }; }
    return { ...b, ref };
  });
  const d = alignDeltas(boxes, mode);
  let out = sym;
  units.forEach((u, i) => { if (d[i].x || d[i].y) out = moveItems(out, u, Math.round(d[i].x * 100) / 100, Math.round(d[i].y * 100) / 100); });
  return out;
}

const withRot = <T extends { rot?: number }>(x: T, rot: number | undefined): T => {
  const { rot: _r, ...rest } = x;
  return (rot ? { ...rest, rot } : rest) as T;
};

export function moveItems(sym: SymbolDef, items: Item[], dx: number, dy: number): SymbolDef {
  items = editable(sym, items);
  const f = shift(dx, dy);
  return transform(sym, items, p => mapPrim(p, f), f, d => d);
}

/**
 * Ruota di 90° in senso orario attorno al centro della selezione, preso sulla griglia dei punti di
 * connessione perché restino sulla griglia. Un punto di connessione da solo cambia solo direzione.
 */
export function rotateItems(sym: SymbolDef, items: Item[], grid: number): SymbolDef {
  items = editable(sym, items);
  if (!items.length) return sym;
  // Un testo da solo gira sul suo punto di inserimento
  const it = items[0];
  if (items.length === 1 && it.kind === 'field') return { ...sym, fields: (sym.fields ?? []).map((x, i) => (i === it.i ? withRot(x, turnRot(x.rot)) : x)) };
  if (items.length === 1 && it.kind === 'prim' && sym.prims[it.i].t === 'text') {
    return { ...sym, prims: sym.prims.map((x, i) => (i === it.i && x.t === 'text' ? withRot(x, turnRot(x.rot)) : x)) };
  }
  const b = itemsBounds(sym, items);
  const c = { x: Math.round((b.x0 + b.x1) / 2 / grid) * grid, y: Math.round((b.y0 + b.y1) / 2 / grid) * grid };
  const f = turn(c);
  const out = transform(sym, items, p => rotatePrim(p, c), f, rotateDir);
  // Anche i testi del componente girano
  if (!out.fields) return out;
  return { ...out, fields: out.fields.map((x, i) => (items.some(it => it.kind === 'field' && it.i === i) ? withRot(x, turnRot(x.rot)) : x)) };
}

/**
 * Specchia la selezione: 'h' da sinistra a destra (attorno a una verticale), 'v' dall'alto in basso
 * (attorno a un'orizzontale), passando per il centro della selezione preso sulla griglia dei punti
 * di connessione. Gli archi cambiano verso, i testi restano leggibili, i punti di connessione
 * cambiano direzione.
 */
export function mirrorItems(sym: SymbolDef, items: Item[], axis: 'h' | 'v', grid: number): SymbolDef {
  items = editable(sym, items);
  if (!items.length) return sym;
  const b = itemsBounds(sym, items);
  const c = axis === 'h' ? Math.round((b.x0 + b.x1) / 2 / grid) * grid : Math.round((b.y0 + b.y1) / 2 / grid) * grid;
  const f = (q: Pt): Pt => (axis === 'h' ? { x: r2(2 * c - q.x), y: q.y } : { x: q.x, y: r2(2 * c - q.y) });
  const flipAnchor = <T extends { anchor?: 'start' | 'middle' | 'end' }>(x: T, def: 'start' | 'middle' | 'end'): T => {
    if (axis !== 'h') return x;
    const a = x.anchor ?? def;
    return { ...x, anchor: a === 'start' ? 'end' : a === 'end' ? 'start' : a };
  };
  const nrm = (a: number) => ((a % 360) + 360) % 360;
  const fp = (p: Prim): Prim => {
    const q = mapPrim(p, f);
    // Arco: l'angolo θ diventa 180°-θ (o -θ) e il verso si inverte, quindi inizio e fine si scambiano
    if (q.t === 'arc') {
      const m = (t: number) => nrm(axis === 'h' ? 180 - t : -t);
      return { ...q, a0: m(q.a1), a1: m(q.a0) || 360 };
    }
    if (q.t === 'text') return flipAnchor(q, 'middle');
    return q;
  };
  const fd = (d: PinDir): PinDir => (axis === 'h' ? (d === 'left' ? 'right' : d === 'right' ? 'left' : d) : (d === 'up' ? 'down' : d === 'down' ? 'up' : d));
  const out = transform(sym, items, fp, f, fd);
  if (axis !== 'h' || !out.fields) return out;
  return { ...out, fields: out.fields.map((x, i) => (items.some(it => it.kind === 'field' && it.i === i) ? flipAnchor(x, 'start') : x)) };
}

/**
 * Ingrandisce o rimpicciolisce di k rispetto al punto base: posizioni, raggi, lati e altezze dei
 * testi. I punti di connessione si spostano e tornano sulla loro griglia.
 */
export function scaleItems(sym: SymbolDef, items: Item[], k: number, base: Pt, grid: number): SymbolDef {
  items = editable(sym, items);
  if (!items.length || !(k > 0) || k === 1) return sym;
  const f = (q: Pt): Pt => ({ x: r2(base.x + (q.x - base.x) * k), y: r2(base.y + (q.y - base.y) * k) });
  const onGrid = (q: Pt): Pt => { const p = f(q); return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }; };
  const fp = (p: Prim): Prim => {
    const q = mapPrim(p, f);
    switch (q.t) {
      case 'circle': case 'arc': return { ...q, r: r2(q.r * k) };
      case 'ellipse': return { ...q, rx: r2(q.rx * k), ry: r2(q.ry * k) };
      case 'text': return { ...q, size: r2((q.size ?? 2.5) * k) };
      default: return q;
    }
  };
  const out = transform(sym, items, fp, f, d => d);
  // Punti di connessione sulla griglia, testi del componente con l'altezza in scala
  const has = (kind: 'pin' | 'field', i: number) => items.some(it => it.kind === kind && it.i === i);
  return {
    ...out,
    pins: out.pins.map((q, i) => (has('pin', i) ? { ...q, ...onGrid(sym.pins[i]) } : q)),
    ...(out.fields ? { fields: out.fields.map((x, i) => (has('field', i) ? { ...x, size: r2((x.size ?? fieldSize) * k) } : x)) } : {}),
  };
}

export function deleteItems(sym: SymbolDef, items: Item[]): SymbolDef {
  items = editable(sym, items);
  const has = (kind: Item['kind'], i: number) => items.some(it => it.kind === kind && (it as { i: number }).i === i);
  return {
    ...sym,
    prims: sym.prims.filter((_, i) => !has('prim', i)),
    pins: sym.pins.filter((_, i) => !has('pin', i)),
    ...(sym.fields ? { fields: sym.fields.filter((_, i) => !has('field', i)) } : {}),
    ...(items.some(it => it.kind === 'tag') ? { tagPos: undefined } : {}),
  };
}

export function copyItems(sym: SymbolDef, items: Item[]): Clip {
  return {
    prims: items.filter(it => it.kind === 'prim').map(it => structuredClone(sym.prims[(it as { i: number }).i])),
    pins: items.filter(it => it.kind === 'pin').map(it => structuredClone(sym.pins[(it as { i: number }).i])),
  };
}

/** Punto di riferimento degli elementi copiati: il primo punto di connessione, altrimenti l'angolo in alto a sinistra */
export function clipOrigin(clip: Clip): Pt {
  if (clip.origin) return clip.origin;
  if (clip.pins.length) return { x: clip.pins[0].x, y: clip.pins[0].y };
  const b = primBounds(clip.prims);
  return { x: b.x0, y: b.y0 };
}

export function rotateClip(clip: Clip, grid: number): Clip {
  // L'origine ruota con gli elementi, come un punto di connessione in più
  const pins = clip.origin ? [...clip.pins, { id: '@o', ...clip.origin, dir: 'up' as const, label: '' }] : clip.pins;
  const tmp: SymbolDef = { id: '', name: '', category: '', letter: '', role: 'single', prims: clip.prims, pins };
  const r = rotateItems(tmp, [...clip.prims.map((_, i) => ({ kind: 'prim' as const, i })), ...pins.map((_, i) => ({ kind: 'pin' as const, i }))], grid);
  const o = clip.origin ? r.pins[r.pins.length - 1] : undefined;
  return { prims: r.prims, pins: o ? r.pins.slice(0, -1) : r.pins, ...(o ? { origin: { x: o.x, y: o.y } } : {}) };
}

/**
 * Incolla gli elementi spostati di dx, dy. I punti di connessione prendono id nuovi; le designazioni
 * numeriche già usate avanzano (5, 6 copiati accanto a 5, 6 diventano 7, 8), le altre restano.
 */
export function pasteClip(sym: SymbolDef, clip: Clip, dx: number, dy: number): { sym: SymbolDef; items: Item[] } {
  const f = shift(dx, dy);
  let next = Math.max(0, ...sym.pins.map(q => parseInt(q.id, 10) || 0));
  const used = new Set(sym.pins.map(q => q.label));
  const nums = clip.pins.map(q => (/^\d+$/.test(q.label) ? parseInt(q.label, 10) : NaN)).filter(n => !isNaN(n));
  const span = nums.length ? Math.max(...nums) - Math.min(...nums) + 1 : 0;
  const clash = clip.pins.some(q => q.label && used.has(q.label));
  const relabel = (l: string) => {
    if (!clash || !/^\d+$/.test(l)) return l;
    let n = parseInt(l, 10);
    // Avanza finché la designazione è libera, a passi pari al gruppo copiato
    while (used.has(String(n))) n += span;
    return String(n);
  };
  const pins = clip.pins.map(({ lock: _l, ...q }) => ({ ...q, ...f(q), id: String(++next), label: relabel(q.label) }));
  // I gruppi incollati sono gruppi nuovi (non si uniscono a quelli copiati); le copie non sono bloccate
  const ids = new Map<string, string>();
  const prims = clip.prims.map(p => {
    let q = setPrimKey(mapPrim(p, f), 'lock', undefined);
    if (q.g) { if (!ids.has(q.g)) ids.set(q.g, newGroupId()); q = { ...q, g: ids.get(q.g) }; }
    return q;
  });
  return {
    sym: { ...sym, prims: [...sym.prims, ...prims], pins: [...sym.pins, ...pins] },
    items: [...prims.map((_, k) => ({ kind: 'prim' as const, i: sym.prims.length + k })), ...pins.map((_, k) => ({ kind: 'pin' as const, i: sym.pins.length + k }))],
  };
}

const onArc = (p: { cx: number; cy: number; r: number }, a: number): Pt => ({ x: r2(p.cx + p.r * Math.cos((a * Math.PI) / 180)), y: r2(p.cy + p.r * Math.sin((a * Math.PI) / 180)) });
const arcMid = (p: Extract<Prim, { t: 'arc' }>) => p.a0 + ((((p.a1 - p.a0) % 360) + 360) % 360 || 360) / 2;

/**
 * Maniglie di un elemento grafico: estremi delle linee, vertici delle polilinee, angoli dei
 * rettangoli; cerchio: raggio e centro; arco: estremi, raggio (punto medio) e centro; ellisse:
 * semiassi e centro; testo: punto di inserimento
 */
export function gripsOf(p: Prim): Pt[] {
  switch (p.t) {
    case 'line': return [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }];
    case 'poly': return p.pts;
    case 'rect': return [{ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y }, { x: p.x + p.w, y: p.y + p.h }, { x: p.x, y: p.y + p.h }];
    case 'circle': return [{ x: p.cx + p.r, y: p.cy }, { x: p.cx, y: p.cy }];
    case 'arc': return [onArc(p, p.a0), onArc(p, p.a1), onArc(p, arcMid(p)), { x: p.cx, y: p.cy }];
    case 'ellipse': return [{ x: p.cx + p.rx, y: p.cy }, { x: p.cx, y: p.cy - p.ry }, { x: p.cx, y: p.cy }];
    case 'text': return [{ x: p.x, y: p.y }];
  }
}

/** Maniglie del punto medio dei lati di una polilinea: trascinandole si aggiunge un vertice */
export function midGripsOf(p: Prim): Pt[] {
  if (p.t !== 'poly') return [];
  const q = p.closed ? [...p.pts, p.pts[0]] : p.pts;
  return q.slice(0, -1).map((a, i) => ({ x: r2((a.x + q[i + 1].x) / 2), y: r2((a.y + q[i + 1].y) / 2) }));
}

/** Polilinea con un vertice nuovo q dopo il vertice k (sul lato k) */
export function insertVertex(p: Extract<Prim, { t: 'poly' }>, k: number, q: Pt): Extract<Prim, { t: 'poly' }> {
  return { ...p, pts: [...p.pts.slice(0, k + 1), q, ...p.pts.slice(k + 1)] };
}

/** Polilinea senza il vertice k (ne restano almeno 2) */
export function removeVertex(p: Extract<Prim, { t: 'poly' }>, k: number): Extract<Prim, { t: 'poly' }> | undefined {
  if (p.pts.length <= 2) return undefined;
  const pts = p.pts.filter((_, i) => i !== k);
  return { ...p, pts, ...(p.closed && pts.length < 3 ? { closed: undefined } : {}) };
}

/** Lato della polilinea più vicino al punto q (per aggiungere un vertice con il doppio clic) */
export function nearestSide(p: Extract<Prim, { t: 'poly' }>, q: Pt): { k: number; d: number } {
  const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
  let best = { k: 0, d: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
    const d = Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y);
    if (d < best.d) best = { k: i, d };
  }
  return best;
}

/** Sposta la maniglia k nel punto q: allunga una linea, sposta un vertice, ridimensiona un rettangolo */
export function moveGrip(p: Prim, k: number, q: Pt): Prim {
  switch (p.t) {
    case 'line': return k === 0 ? { ...p, x1: q.x, y1: q.y } : { ...p, x2: q.x, y2: q.y };
    case 'poly': return { ...p, pts: p.pts.map((v, i) => (i === k ? q : v)) };
    case 'rect': {
      // Resta fermo l'angolo opposto
      const c = gripsOf(p)[(k + 2) % 4];
      return { ...p, x: Math.min(c.x, q.x), y: Math.min(c.y, q.y), w: r2(Math.abs(q.x - c.x)), h: r2(Math.abs(q.y - c.y)) };
    }
    case 'circle': return k === 1 ? { ...p, cx: q.x, cy: q.y } : { ...p, r: r2(Math.max(0.2, Math.hypot(q.x - p.cx, q.y - p.cy))) };
    case 'arc': {
      const a = ((Math.atan2(q.y - p.cy, q.x - p.cx) * 180) / Math.PI + 360) % 360;
      if (k === 0) return { ...p, a0: r2(a) };
      if (k === 1) return { ...p, a1: r2(a) || 360 };
      if (k === 2) return { ...p, r: r2(Math.max(0.2, Math.hypot(q.x - p.cx, q.y - p.cy))) };
      return { ...p, cx: q.x, cy: q.y };
    }
    case 'ellipse':
      if (k === 0) return { ...p, rx: r2(Math.max(0.2, Math.abs(q.x - p.cx))) };
      if (k === 1) return { ...p, ry: r2(Math.max(0.2, Math.abs(q.y - p.cy))) };
      return { ...p, cx: q.x, cy: q.y };
    case 'text': return { ...p, x: q.x, y: q.y };
  }
}
