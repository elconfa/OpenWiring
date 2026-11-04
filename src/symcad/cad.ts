// CAD 2D dei simboli: riga di comando e precisione come in AutoCAD.
// Coordinate scritte (assolute, relative @dx,dy, polari @d<a, distanza diretta), orto e
// puntamento polare, arco per tre punti, rotazione e specchio di un angolo qualsiasi. Solo
// funzioni pure: l'interfaccia è in ui/SymbolEditor.tsx.
//
// Nel disegno del simbolo y cresce verso il basso (come sullo schermo). Le coordinate scritte
// seguono invece AutoCAD: y verso l'alto e angoli in senso antiorario da destra. La conversione
// è solo qui.
import type { Prim, PinDef, PinDir, Pt, SymbolDef } from '../model/types';
import { editable, type Item } from '../model/symbolEdit';
import { EPS, inArc, angleOf, norm } from './geom';

const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
const rp = (p: Pt): Pt => ({ x: r3(p.x), y: r3(p.y) });

/** Numero scritto con il punto o, se c'è il punto e virgola come separatore, con la virgola */
function num(s: string, comma: boolean): number {
  const t = comma ? s.replace(',', '.') : s;
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN;
}

/**
 * Punto scritto nella riga di comando, rispetto all'ultimo punto last:
 * - `x,y` (o `#x,y`) assoluto; `@dx,dy` relativo; `d<a` / `@d<a` polare (a in gradi, antiorario)
 * - un numero solo: distanza diretta da last verso il mouse (toward)
 * Con il punto e virgola come separatore la virgola è il decimale (`2,5;10`).
 */
export function parsePoint(input: string, last?: Pt, toward?: Pt): Pt | undefined {
  let s = input.replace(/\s+/g, '');
  if (!s) return undefined;
  const comma = s.includes(';');
  const sep = comma ? ';' : ',';
  let rel = false;
  if (s.startsWith('@')) { rel = true; s = s.slice(1); } else if (s.startsWith('#')) s = s.slice(1);
  const base = rel ? last ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  if (s.includes('<')) {
    const [d, a] = s.split('<').map(v => num(v, comma || !s.includes(',')));
    if (!isFinite(d) || !isFinite(a)) return undefined;
    const r = (a * Math.PI) / 180;
    return rp({ x: base.x + d * Math.cos(r), y: base.y - d * Math.sin(r) });
  }
  if (s.includes(sep)) {
    const [x, y] = s.split(sep).map(v => num(v, comma));
    if (!isFinite(x) || !isFinite(y)) return undefined;
    return rp({ x: base.x + x, y: base.y - y });
  }
  // Distanza diretta: verso il mouse
  const d = num(s, true);
  if (!isFinite(d) || !last || !toward) return undefined;
  const dx = toward.x - last.x, dy = toward.y - last.y, l = Math.hypot(dx, dy);
  if (l < EPS) return undefined;
  return rp({ x: last.x + (dx / l) * d, y: last.y + (dy / l) * d });
}

/** Numero scritto (raggio, angolo, fattore), con il punto o la virgola come decimale */
export function parseNumber(input: string): number | undefined {
  const v = num(input.trim(), true);
  return isFinite(v) ? v : undefined;
}

/** Angolo come lo scrive AutoCAD (antiorario, y verso l'alto) da a verso b */
export const cadAngle = (a: Pt, b: Pt) => norm((Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI);
/** Coordinate come le scrive AutoCAD (y verso l'alto), per la barra di stato */
export const cadCoord = (p: Pt) => ({ x: r3(p.x), y: r3(-p.y) + 0 });

/**
 * Orto e puntamento polare rispetto al punto base: con orto il punto va sull'orizzontale o sulla
 * verticale più vicina; con il polare, se la direzione è entro 4° da un multiplo di step, va sul
 * raggio a quell'angolo (alla stessa distanza proiettata)
 */
export function constrain(base: Pt | undefined, p: Pt, ortho: boolean, polarStep: number | 0): { p: Pt; angle?: number } {
  if (!base) return { p };
  const dx = p.x - base.x, dy = p.y - base.y;
  if (Math.hypot(dx, dy) < EPS) return { p };
  if (ortho) return Math.abs(dx) >= Math.abs(dy) ? { p: { x: p.x, y: base.y }, angle: dx >= 0 ? 0 : 180 } : { p: { x: base.x, y: p.y }, angle: dy <= 0 ? 90 : 270 };
  if (!polarStep) return { p };
  const a = cadAngle(base, p);
  const k = Math.round(a / polarStep) * polarStep;
  const diff = Math.abs(norm(a - k + 180) - 180);
  if (diff > 4) return { p };
  const r = (k * Math.PI) / 180, ux = Math.cos(r), uy = -Math.sin(r);
  const d = dx * ux + dy * uy;
  return { p: rp({ x: base.x + ux * d, y: base.y + uy * d }), angle: norm(k) };
}

/** Arco che passa per a, b, c (nell'ordine): undefined se i punti sono allineati */
export function arcThrough(a: Pt, b: Pt, c: Pt): Extract<Prim, { t: 'arc' }> | undefined {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPS) return undefined;
  const sa = a.x * a.x + a.y * a.y, sb = b.x * b.x + b.y * b.y, sc = c.x * c.x + c.y * c.y;
  const cx = (sa * (b.y - c.y) + sb * (c.y - a.y) + sc * (a.y - b.y)) / d;
  const cy = (sa * (c.x - b.x) + sb * (a.x - c.x) + sc * (b.x - a.x)) / d;
  const ctr = { x: cx, y: cy };
  const r = Math.hypot(a.x - cx, a.y - cy);
  const aa = angleOf(ctr, a), ab = angleOf(ctr, b), ac = angleOf(ctr, c);
  // Gli archi vanno ad angoli crescenti: se b non sta tra a e c, l'arco va da c ad a
  const [a0, a1] = inArc(ab, aa, ac) ? [aa, ac] : [ac, aa];
  return { t: 'arc', cx: r3(cx), cy: r3(cy), r: r3(r), a0: r3(a0), a1: r3(a1) || 360 };
}

/** Rettangolo come polilinea chiusa (dopo una rotazione che non è di 90°) */
const rectAsPoly = (p: Extract<Prim, { t: 'rect' }>): Extract<Prim, { t: 'poly' }> => {
  const { t: _t, x, y, w, h, logo: _l, ...rest } = p;
  return { ...rest, t: 'poly', pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true };
};
/** Ellisse come polilinea chiusa di 48 lati */
const ellipseAsPoly = (p: Extract<Prim, { t: 'ellipse' }>): Extract<Prim, { t: 'poly' }> => {
  const { t: _t, cx, cy, rx, ry, ...rest } = p;
  return { ...rest, t: 'poly', closed: true, pts: Array.from({ length: 48 }, (_, i) => ({ x: r3(cx + rx * Math.cos((i * Math.PI) / 24)), y: r3(cy + ry * Math.sin((i * Math.PI) / 24)) })) };
};

/**
 * Trasformazione rigida della selezione: rotazione di deg gradi (antiorari, come AutoCAD) attorno a
 * base, oppure specchio rispetto alla retta per base con angolo deg (mirror). I rettangoli e le
 * ellissi che non restano allineati agli assi diventano polilinee; i testi restano orizzontali o
 * verticali (il multiplo di 90° più vicino); i punti di connessione tornano sulla griglia e
 * prendono la direzione più vicina.
 */
export function transformItems(sym: SymbolDef, items: Item[], base: Pt, deg: number, mirror: boolean, grid: number): SymbolDef {
  items = editable(sym, items);
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  // In coordinate y verso il basso: rotazione antioraria visiva = angolo interno -deg
  const f = (q: Pt): Pt => {
    const x = q.x - base.x, y = -(q.y - base.y);
    const [nx, ny] = mirror
      ? [x * Math.cos(2 * t) + y * Math.sin(2 * t), x * Math.sin(2 * t) - y * Math.cos(2 * t)]
      : [x * c - y * s, x * s + y * c];
    return rp({ x: base.x + nx, y: base.y - ny });
  };
  const right = Math.abs(norm(deg + 45) % 90 - 45) < 1e-6;
  const has = (kind: Item['kind'], i?: number) => items.some(it => it.kind === kind && (kind === 'tag' || (it as { i: number }).i === i));
  /** Angolo interno (y verso il basso, gradi) dopo la trasformazione */
  const ang = (a: number) => norm(mirror ? 2 * -deg - a : a - deg);
  const textRot = (rot: number | undefined): number | undefined => {
    // Multiplo di 90° più vicino, come i testi ruotati dall'editor (0, 90, 180, -90)
    const r = Math.round(ang(rot ?? 0) / 90) * 90 % 360;
    return r === 0 ? undefined : r === 270 ? -90 : r;
  };
  const flip = (a: 'start' | 'middle' | 'end' | undefined, def: 'start' | 'middle' | 'end') => {
    const v = a ?? def;
    // Lo specchio rispetto a un asse quasi verticale scambia sinistra e destra
    if (!mirror || Math.abs(Math.cos(t)) > 0.71) return a;
    return v === 'start' ? 'end' : v === 'end' ? 'start' : v;
  };
  const fp = (p: Prim): Prim => {
    switch (p.t) {
      case 'line': { const a = f({ x: p.x1, y: p.y1 }), b = f({ x: p.x2, y: p.y2 }); return { ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
      case 'poly': return { ...p, pts: p.pts.map(f) };
      case 'rect': {
        if (!right) return fp(rectAsPoly(p));
        const a = f({ x: p.x, y: p.y }), b = f({ x: p.x + p.w, y: p.y + p.h });
        return { ...p, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: r3(Math.abs(b.x - a.x)), h: r3(Math.abs(b.y - a.y)) };
      }
      case 'circle': { const q = f({ x: p.cx, y: p.cy }); return { ...p, cx: q.x, cy: q.y }; }
      case 'ellipse': {
        if (!right) return fp(ellipseAsPoly(p));
        const q = f({ x: p.cx, y: p.cy });
        const swap = Math.abs(Math.sin(t)) > 0.5 && !mirror;
        return { ...p, cx: q.x, cy: q.y, ...(swap ? { rx: p.ry, ry: p.rx } : {}) };
      }
      case 'arc': {
        const q = f({ x: p.cx, y: p.cy });
        const [a0, a1] = mirror ? [ang(p.a1), ang(p.a0)] : [ang(p.a0), ang(p.a1)];
        return { ...p, cx: q.x, cy: q.y, a0: r3(a0), a1: r3(a1) || 360 };
      }
      case 'text': {
        const q = f({ x: p.x, y: p.y });
        const { rot: _r, ...rest } = p;
        const rot = mirror ? p.rot : textRot(p.rot);
        return { ...rest, ...q, ...(rot ? { rot } : {}), ...(flip(p.anchor, 'middle') ? { anchor: flip(p.anchor, 'middle') } : {}) };
      }
    }
  };
  const fd = (d: PinDir): PinDir => {
    const v = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[d];
    const o = f({ x: 0, y: 0 }), w = f(v);
    const dx = w.x - o.x, dy = w.y - o.y;
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
  };
  const onGrid = (q: Pt): Pt => { const p = f(q); return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }; };
  return {
    ...sym,
    prims: sym.prims.map((p, i) => (has('prim', i) ? fp(p) : p)),
    pins: sym.pins.map((q, i): PinDef => (has('pin', i) ? { ...q, ...onGrid(q), dir: fd(q.dir) } : q)),
    ...(sym.fields ? { fields: sym.fields.map((x, i) => {
      if (!has('field', i)) return x;
      const { rot: _r, ...rest } = x;
      const rot = mirror ? x.rot : textRot(x.rot);
      const anchor = flip(x.anchor, 'start');
      return { ...rest, ...f(x), ...(rot ? { rot } : {}), ...(anchor ? { anchor } : {}) };
    }) } : {}),
    ...(sym.tagPos && has('tag') ? { tagPos: f(sym.tagPos) } : {}),
  };
}

/** Comandi della riga di comando: nome (anche abbreviato, italiano o inglese) → comando */
export type CmdId = 'line' | 'pline' | 'circle' | 'rect' | 'arc' | 'ellipse' | 'text' | 'move' | 'copy' | 'rotate' | 'mirror' | 'scale' | 'erase'
  | 'trim' | 'extend' | 'offset' | 'measure' | 'zoom' | 'undo' | 'redo';
export const CMD_ALIASES: Record<string, CmdId> = {
  l: 'line', line: 'line', linea: 'line',
  pl: 'pline', pline: 'pline', polilinea: 'pline', poly: 'pline',
  c: 'circle', circle: 'circle', cerchio: 'circle',
  rec: 'rect', rectang: 'rect', rett: 'rect', rettangolo: 'rect',
  a: 'arc', arc: 'arc', arco: 'arc',
  el: 'ellipse', ellipse: 'ellipse', ellisse: 'ellipse',
  t: 'text', dt: 'text', text: 'text', testo: 'text',
  m: 'move', move: 'move', sposta: 'move',
  co: 'copy', cp: 'copy', copy: 'copy', copia: 'copy',
  ro: 'rotate', rotate: 'rotate', ruota: 'rotate',
  mi: 'mirror', mirror: 'mirror', specchia: 'mirror',
  sc: 'scale', scale: 'scale', scala: 'scale',
  e: 'erase', erase: 'erase', cancella: 'erase', canc: 'erase',
  tr: 'trim', trim: 'trim', taglia: 'trim',
  ex: 'extend', extend: 'extend', estendi: 'extend',
  o: 'offset', offset: 'offset',
  di: 'measure', dist: 'measure', misura: 'measure',
  z: 'zoom', zoom: 'zoom',
  u: 'undo', undo: 'undo', annulla: 'undo',
  redo: 'redo', ripeti: 'redo',
};
