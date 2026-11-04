// Macro EPLAN (.ema) in formato XML (EplanPxfRoot): il disegno dell'apparecchio fatto dal
// costruttore (linee, rettangoli, cerchi, archi, polilinee, testi, cornice della scatola nera e
// blocchi grafici interni) e i punti di connessione con il loro nome. Ogni variante schematica
// (MacroFuncType 1: per esempio "tutti i poli", "solo potenza", "solo comando") diventa un simbolo.
// I simboli delle librerie EPLAN richiamati per numero non sono inclusi nella macro: li
// ridisegniamo noi dal tipo di funzione (emaLibrary.ts). I punti di connessione dell'apparecchio
// (simboli SPECIAL) stanno 4 mm dentro la cornice e la variante ne dà la direzione: il punto
// va sul bordo della cornice con un tratto fino alla posizione EPLAN.
import type { SymbolDef, Prim, PinDef, PinDir, Pt } from '../model/types';
import { libraryDrawing, LIB_KIND_LABEL } from './emaLibrary';

export interface Node { tag: string; attrs: Record<string, string>; children: Node[] }

/** Parser XML minimo (la macro è XML semplice; DOMParser non c'è in Node e nei test) */
export function parseXml(xml: string): Node | undefined {
  const root: Node = { tag: '#root', attrs: {}, children: [] };
  const stack: Node[] = [root];
  const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g;
  const attrRe = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
  const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (!m[2]) continue;
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const attrs: Record<string, string> = {};
    let a: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(m[3]))) attrs[a[1]] = unescape(a[2]);
    const n: Node = { tag: m[2], attrs, children: [] };
    stack[stack.length - 1].children.push(n);
    if (!m[4]) stack.push(n);
  }
  return root.children[0];
}

const kids = (n: Node, tag: string) => n.children.filter(c => c.tag === tag);
const kid = (n: Node, tag: string) => n.children.find(c => c.tag === tag);
function* walk(n: Node): Generator<Node> { yield n; for (const c of n.children) yield* walk(c); }

const pt = (s?: string): Pt | undefined => {
  if (!s) return undefined;
  const [x, y] = s.split('/').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e6 && Math.abs(y) < 1e6 ? { x, y } : undefined;
};

/** Testo multilingua EPLAN "it_IT@testo;en_US@text;" → italiano, inglese, neutro o il primo */
export function pickLang(s: string): string {
  const parts = s.split(';').filter(Boolean).map(x => { const i = x.indexOf('@'); return i > 0 ? [x.slice(0, i), x.slice(i + 1)] : ['??_??', x]; });
  for (const l of ['it_IT', 'en_US', 'en_GB', '??_??', 'de_DE']) { const f = parts.find(p => p[0] === l); if (f) return f[1]; }
  return parts[0]?.[1] ?? '';
}

/** Trasformazione di un blocco grafico posizionato: offset e matrice 2×2 */
interface Tf { ox: number; oy: number; a: number; b: number; c: number; d: number }
const ID: Tf = { ox: 0, oy: 0, a: 1, b: 0, c: 0, d: 1 };
const apply = (t: Tf, p: Pt): Pt => ({ x: t.ox + t.a * p.x + t.c * p.y, y: t.oy + t.b * p.x + t.d * p.y });

export interface EmaSymbol {
  symbol: SymbolDef;
  variant: number;
  pins: string[];
  /** La variante usa funzioni disegnate con simboli della libreria EPLAN che non sappiamo ridisegnare: incompleta */
  librarySymbols: boolean;
  /** Simboli della libreria EPLAN ridisegnati con un nostro equivalente, es. "IEC_symbol 1525 (contatto NA)" */
  redrawn: string[];
}

/** Direzione del punto di connessione dell'apparecchio per variante (A su, B sinistra, C giù, D destra; E-H come A-D) */
const POINT_DIR: PinDir[] = ['up', 'left', 'down', 'right'];

/**
 * Simboli dalle varianti schematiche di una macro .ema in XML. "id" è la base degli
 * identificativi (es. il codice articolo); il primo simbolo è la variante completa.
 */
export function emaToSymbols(xml: string, id: string, name: string, category = 'Macro EPLAN'): EmaSymbol[] {
  if (!/<EplanPxfRoot/.test(xml.slice(0, 2000))) return [];
  const root = parseXml(xml);
  if (!root) return [];
  const out: EmaSymbol[] = [];
  const variants = kids(root, 'MacroVariant').filter(v => v.attrs.MacroFuncType === '1');
  variants.forEach((v, vi) => {
    // Blocchi grafici (O5) richiamati dalle loro posizioni (O144)
    const blocks = new Map<string, Node>();
    for (const n of walk(v)) if (n.tag === 'O5' && n.attrs.A1) blocks.set(n.attrs.A1, n);
    const lines: { a: Pt; b: Pt; dash: boolean }[] = [];
    const prims: Prim[] = [];
    const texts: { p: Pt; s: string; h: number; rot: number; align: number }[] = [];
    const circles: { c: Pt; r: number; a0: number; a1: number }[] = [];
    const polys: { pts: Pt[]; dash: boolean }[] = [];
    const rects: { a: Pt; b: Pt; dash: boolean; fill?: boolean }[] = [];
    const ellipses: { c: Pt; rx: number; ry: number }[] = [];
    /** Cornici della scatola nera, del PLC e della struttura: i punti di connessione vanno sul loro bordo */
    const frames: { a: Pt; b: Pt }[] = [];
    const dashed = (n: Node) => n.attrs.A415 !== undefined && n.attrs.A415 !== 'L' && n.attrs.A415 !== '0';
    const textOf = (n: Node, t: Tf) => {
      const p = pt(n.attrs.A501), s = n.attrs.A511 && pickLang(n.attrs.A511);
      const fmt = kid(n, 'S54x505');
      if (!p || !s) return;
      const h = parseFloat(fmt?.attrs.A961 ?? '') || 2.5;
      const rot = parseFloat(fmt?.attrs.A962 ?? '0') || 0;
      texts.push({ p: apply(t, p), s, h, rot, align: parseInt(fmt?.attrs.A965 ?? '0', 10) & 3 });
    };
    // rel: elementi di una funzione posizionata, relativi alla sua posizione (un estremo assente è l'origine)
    const graphics = (n: Node, t: Tf, rel = false) => {
      for (const c of n.children) {
        const a = pt(c.attrs.A531) ?? (rel ? { x: 0, y: 0 } : undefined), b = pt(c.attrs.A532) ?? (rel ? { x: 0, y: 0 } : undefined);
        if ((c.tag === 'O31' || c.tag === 'S31x5') && a && b) lines.push({ a: apply(t, a), b: apply(t, b), dash: dashed(c) });
        else if ((c.tag === 'O89' || c.tag === 'S89x5') && (rel || c.attrs.A411 !== '305')) {
          const p1 = pt(c.attrs.A1651), p2 = pt(c.attrs.A1652);
          if (p1 && p2) {
            rects.push({ a: apply(t, p1), b: apply(t, p2), dash: dashed(c) || c.attrs.A411 === '308' });
            // 305 scatola nera, 306 PLC, 308 struttura
            if (rel && /^30[568]$/.test(c.attrs.A411 ?? '')) frames.push({ a: apply(t, p1), b: apply(t, p2) });
          }
        } else if (c.tag === 'S90x5') {
          const p1 = pt(c.attrs.A1661), p2 = pt(c.attrs.A1662);
          if (p1 && p2) {
            const q1 = apply(t, p1), q2 = apply(t, p2);
            ellipses.push({ c: { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }, rx: Math.abs(q1.x - q2.x) / 2, ry: Math.abs(q1.y - q2.y) / 2 });
          }
        } else if (c.tag === 'O32' || c.tag === 'S32x5') {
          const cc = pt(c.attrs.A555), r = pt(c.attrs.A556)?.x;
          if (cc && r) circles.push({ c: apply(t, cc), r, a0: parseFloat(c.attrs.A553 ?? '0'), a1: parseFloat(c.attrs.A554 ?? `${2 * Math.PI}`) });
        } else if ((c.tag === 'O34' || c.tag === 'S34x5') && c.attrs.A621) {
          const pts = c.attrs.A621.split(';').map(pt).filter((q): q is Pt => !!q).map(q => apply(t, q));
          if (pts.length > 1) polys.push({ pts, dash: dashed(c) });
        } else if (c.tag === 'O30' || c.tag === 'S30x5') textOf(c, t);
        else if (c.tag === 'O26') graphics(c, t);
        else if (c.tag === 'O144') {
          const blk = blocks.get(c.attrs.R9 ?? '');
          const pos = pt(kid(c, 'S40x1201')?.attrs.A762);
          const m = kid(kid(c, 'S40x1201') ?? c, 'S39x761')?.attrs;
          if (blk && pos) graphics(blk, { ox: t.ox + pos.x, oy: t.oy + pos.y, a: +(m?.A751 ?? 1), b: +(m?.A752 ?? 0), c: +(m?.A753 ?? 0), d: +(m?.A754 ?? 1) });
        } else if (/^O\d+$/.test(c.tag) && !rel) {
          // Funzione posizionata (punto di connessione, scatola nera, cornice, definizione del cavo…):
          // la sua grafica è relativa alla posizione
          const s = kid(c, 'S40x1201');
          const pos = pt(s?.attrs.A762);
          if (!pos) continue;
          const m = kid(s!, 'S39x761')?.attrs;
          const ma = +(m?.A751 ?? 1), mb = +(m?.A752 ?? 0), mc = +(m?.A753 ?? 0), md = +(m?.A754 ?? 1);
          const o = apply(t, pos);
          graphics(c, { ox: o.x, oy: o.y, a: t.a * ma + t.c * mb, b: t.b * ma + t.d * mb, c: t.a * mc + t.c * md, d: t.b * mc + t.d * md }, true);
        }
      }
    };
    const page = kid(v, 'O4');
    if (!page) return;
    graphics(page, ID);
    const libs = new Map<string, string>();
    for (const n of [...kids(root, 'ESymLib'), ...kids(v, 'ESymLib')]) if (n.attrs.ID) libs.set(n.attrs.ID, n.attrs.Name ?? '');
    // Punti di connessione dell'apparecchio (funzioni "punto di connessione" con designazione)
    /** frame: punto dell'apparecchio o del PLC, da portare sul bordo della cornice */
    const pinsRaw: { name: string; p: Pt; dir?: PinDir; frame?: boolean }[] = [];
    let librarySymbols = false;
    const redrawn = new Set<string>();
    /** Linee disegnate dal costruttore (quelle dopo sono dei nostri simboli o generate) */
    const maker = lines.length;
    const addPin = (name: string, p: Pt, dir?: PinDir, frame = false) => {
      if (!pinsRaw.some(q => q.name === name && Math.abs(q.p.x - p.x) < 0.01 && Math.abs(q.p.y - p.y) < 0.01)) pinsRaw.push({ name, p, dir, frame });
    };
    for (const n of walk(page)) {
      if (n.tag !== 'O17') continue;
      const lib = libs.get(n.attrs.A1261 ?? '') ?? '';
      const point = lib === 'SPECIAL' && /^(1302|300)$/.test(n.attrs.A1381 ?? '');
      // Punto dell'apparecchio senza designazione (es. la seconda uscita dei moduli E-T-A REX):
      // il nome è la sua descrizione ("2.2"), altrimenti il punto andrebbe perso
      const des = n.attrs.A185 || (point && !/[;\n]/.test(n.attrs.A186 ?? '') ? n.attrs.A186 : undefined);
      if (!des) continue;
      const p = pt(kid(n, 'S40x1201')?.attrs.A762);
      if (!p) continue;
      const category = [n.attrs.A1381, n.attrs.A1382, n.attrs.A1383].join('.');
      const variant = parseInt(n.attrs.A1263 ?? '0', 10) || 0;
      // Più designazioni in una funzione ("1;2;3;4;5;6"): simbolo di libreria, ridisegnato dal tipo di funzione
      if (/[;\n]/.test(des)) {
        const des = n.attrs.A185!.split(/;|\n/).map(x => x.trim());
        const d = libraryDrawing(category, des, variant);
        // Senza designazioni (maniglie, accessori disegnati) il simbolo si può tralasciare
        if (!d) { if (des.some(Boolean)) librarySymbols = true; continue; }
        redrawn.add(`${lib || 'libreria'} ${n.attrs.A1262 ?? '?'} (${LIB_KIND_LABEL[d.kind]})`);
        // Dal disegno locale (y in basso) alle coordinate EPLAN (y in alto)
        const E = (q: Pt): Pt => ({ x: p.x + q.x, y: p.y - q.y });
        for (const q of d.prims) {
          if (q.t === 'line') lines.push({ a: E({ x: q.x1, y: q.y1 }), b: E({ x: q.x2, y: q.y2 }), dash: !!q.dash });
          else if (q.t === 'rect') rects.push({ a: E({ x: q.x, y: q.y }), b: E({ x: q.x + q.w, y: q.y + q.h }), dash: false, ...(q.fill ? { fill: true } : {}) });
          else if (q.t === 'circle') circles.push({ c: E({ x: q.cx, y: q.cy }), r: q.r, a0: 0, a1: 2 * Math.PI });
          else if (q.t === 'poly') polys.push({ pts: q.pts.map(E), dash: false });
          else if (q.t === 'text') texts.push({ p: E(q), s: q.s, h: (q.size ?? 2.5) / 0.85, rot: 0, align: q.anchor === 'middle' ? 1 : 0 });
        }
        for (const q of d.pins) addPin(q.label, E(q), q.dir);
        continue;
      }
      // Punto di connessione dell'apparecchio o del PLC: direzione dalla variante
      addPin(des, p, point ? POINT_DIR[variant % 4] : undefined, point);
    }
    // Il punto va sul bordo della cornice che ha davanti (entro 12 mm), con un tratto fino alla posizione EPLAN
    for (const q of pinsRaw) {
      if (!q.dir || !q.frame) continue;
      let best: { p: Pt; d: number } | undefined;
      for (const f of frames) {
        const x0 = Math.min(f.a.x, f.b.x), x1 = Math.max(f.a.x, f.b.x), y0 = Math.min(f.a.y, f.b.y), y1 = Math.max(f.a.y, f.b.y);
        const vertical = q.dir === 'up' || q.dir === 'down';
        if (vertical ? q.p.x < x0 - 0.01 || q.p.x > x1 + 0.01 : q.p.y < y0 - 0.01 || q.p.y > y1 + 0.01) continue;
        const edge = q.dir === 'up' ? y1 : q.dir === 'down' ? y0 : q.dir === 'left' ? x0 : x1;
        const d = q.dir === 'up' ? edge - q.p.y : q.dir === 'down' ? q.p.y - edge : q.dir === 'left' ? q.p.x - edge : edge - q.p.x;
        if (d > 0.01 && d <= 12 && (!best || d < best.d)) best = { p: vertical ? { x: q.p.x, y: edge } : { x: edge, y: q.p.y }, d };
      }
      if (best) { lines.push({ a: q.p, b: best.p, dash: false }); q.p = best.p; }
    }
    autoconnect(pinsRaw, lines.slice(0, maker), (a, b) => lines.push({ a, b, dash: false }));
    if (!pinsRaw.length && !lines.length) return;
    // Origine: il primo punto di connessione in alto a sinistra (così i punti cadono sulla griglia)
    const all = [...pinsRaw.map(q => q.p), ...lines.flatMap(l => [l.a, l.b]), ...rects.flatMap(r => [r.a, r.b])];
    const minX = Math.min(...all.map(q => q.x)), maxX = Math.max(...all.map(q => q.x));
    const minY = Math.min(...all.map(q => q.y)), maxY = Math.max(...all.map(q => q.y));
    const sorted = [...pinsRaw].sort((a, b) => b.p.y - a.p.y || a.p.x - b.p.x);
    const o = sorted[0]?.p ?? { x: minX, y: maxY };
    // EPLAN ha la y verso l'alto: si ribalta
    const L = (q: Pt): Pt => ({ x: r2(q.x - o.x), y: r2(o.y - q.y) });
    for (const l of lines) { const a = L(l.a), b = L(l.b); prims.push({ t: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...(l.dash ? { dash: true } : {}) }); }
    for (const r of rects) {
      const a = L(r.a), b = L(r.b);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
      prims.push(r.dash ? { t: 'poly', pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true, dash: true } : { t: 'rect', x, y, w: r2(w), h: r2(h), ...(r.fill ? { fill: true } : {}) });
    }
    for (const c of circles) {
      const cc = L(c.c);
      const span = c.a1 - c.a0;
      if (Math.abs(Math.abs(span) - 2 * Math.PI) < 1e-3 || span === 0) prims.push({ t: 'circle', cx: cc.x, cy: cc.y, r: r2(c.r) });
      else {
        const deg = (a: number) => r2((a * 180) / Math.PI);
        // Antiorario con y in alto = da -a1 a -a0 nel nostro verso
        prims.push({ t: 'arc', cx: cc.x, cy: cc.y, r: r2(c.r), a0: -deg(c.a1), a1: -deg(c.a0) });
      }
    }
    for (const p of polys) prims.push({ t: 'poly', pts: p.pts.map(L), ...(p.dash ? { dash: true } : {}) });
    for (const e of ellipses) { const c = L(e.c); prims.push({ t: 'ellipse', cx: c.x, cy: c.y, rx: r2(e.rx), ry: r2(e.ry) }); }
    for (const t of texts) {
      const q = L(t.p);
      prims.push({ t: 'text', x: q.x, y: q.y, s: t.s, size: r2(t.h * 0.85), anchor: t.align === 1 ? 'middle' : t.align === 2 ? 'end' : 'start', ...(t.rot ? { rot: -r2((t.rot * 180) / Math.PI) } : {}) });
    }
    // Direzione dei punti: verso il bordo più vicino dell'apparecchio
    const pins: PinDef[] = pinsRaw.map((q, i) => {
      if (q.dir) { const lp = L(q.p); return { id: String(i + 1), x: lp.x, y: lp.y, dir: q.dir, label: q.name }; }
      const dTop = maxY - q.p.y, dBot = q.p.y - minY, dLeft = q.p.x - minX, dRight = maxX - q.p.x;
      const m = Math.min(dTop, dBot, dLeft, dRight);
      const dir: PinDir = m === dTop ? 'up' : m === dBot ? 'down' : m === dLeft ? 'left' : 'right';
      const lp = L(q.p);
      return { id: String(i + 1), x: lp.x, y: lp.y, dir, label: q.name };
    });
    // Il simbolo del punto di connessione (non incluso nella macro) unisce il punto al suo tratto
    for (const q of pins) {
      const ends = prims.flatMap(p => (p.t === 'line' ? [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }] : []));
      if (ends.some(e => Math.abs(e.x - q.x) < 0.01 && Math.abs(e.y - q.y) < 0.01)) continue;
      const vertical = q.dir === 'up' || q.dir === 'down';
      const near = ends.filter(e => (vertical ? Math.abs(e.x - q.x) < 0.01 : Math.abs(e.y - q.y) < 0.01))
        .map(e => ({ e, d: vertical ? Math.abs(e.y - q.y) : Math.abs(e.x - q.x) })).filter(x => x.d <= 3).sort((a, b) => a.d - b.d)[0];
      if (near) prims.push({ t: 'line', x1: q.x, y1: q.y, x2: near.e.x, y2: near.e.y });
    }
    const vName = kid(page, 'P49')?.attrs.P1500;
    const symbol: SymbolDef = {
      id: vi ? `${id}~${vi + 1}` : id,
      name: vi ? `${name} (variante ${vi + 1}: ${pins.map(p => p.label).slice(0, 4).join(', ')}${pins.length > 4 ? '…' : ''})` : name,
      category, letter: '', role: 'single', prims, pins,
      tagPos: { x: r2(minX - o.x - 2), y: r2(o.y - maxY + 3) },
      description: (vName ? `Macro EPLAN del costruttore: ${vName}` : 'Macro EPLAN del costruttore')
        + (redrawn.size ? `. Simboli della libreria EPLAN ridisegnati con un equivalente: ${[...redrawn].join(', ')}` : ''),
      source: 'Macro EPLAN (EDZ)',
    };
    out.push({ symbol, variant: vi, pins: pins.map(p => p.label), librarySymbols, redrawn: [...redrawn] });
  });
  return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Collegamento automatico di EPLAN, che non è salvato nella macro: un punto rivolto verso il basso
 * (o verso destra) si unisce al punto più vicino sullo stesso asse rivolto verso di lui o senza
 * direzione propria (per esempio le anime di un cavo). Restano fuori i punti già raggiunti da una
 * linea del costruttore e i punti dell'apparecchio sul bordo della cornice (vanno verso l'esterno).
 * Coordinate EPLAN, y verso l'alto.
 */
export function autoconnect(pins: { p: Pt; dir?: PinDir; frame?: boolean }[], drawn: { a: Pt; b: Pt }[], add: (a: Pt, b: Pt) => void): number {
  const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
  const free = pins.filter(q => !q.frame && !drawn.some(l => same(l.a, q.p) || same(l.b, q.p)));
  const taken = new Set<object>();
  let n = 0;
  for (const q of free) {
    if (q.dir !== 'down' && q.dir !== 'right') continue;
    const down = q.dir === 'down';
    let best: { t: typeof q; d: number } | undefined;
    for (const t of free) {
      if (t === q || taken.has(t) || (t.dir && t.dir !== (down ? 'up' : 'left'))) continue;
      const d = down ? q.p.y - t.p.y : t.p.x - q.p.x;
      const off = down ? Math.abs(t.p.x - q.p.x) : Math.abs(t.p.y - q.p.y);
      if (off < 0.01 && d > 0.01 && d <= 80 && (!best || d < best.d)) best = { t, d };
    }
    if (!best) continue;
    // Ogni punto riceve un solo collegamento
    taken.add(best.t);
    add(q.p, best.t.p);
    n++;
  }
  return n;
}

export interface EmaLibraryRef {
  lib: string; num: string; variant: string; pins: string[]; names: string[]; category: string;
  /** Più punti di connessione in una funzione: simbolo di libreria da ridisegnare */
  multi: boolean;
}

export interface EmaInfo {
  xml: boolean;
  /** Varianti per tipo di rappresentazione (MacroFuncType: 1 schema, gli altri non ancora letti) */
  variantTypes: Record<string, number>;
  /** Funzioni disegnate con un simbolo della libreria EPLAN (nome della libreria, numero, variante) */
  libraryRefs: EmaLibraryRef[];
}

/** Riepilogo veloce di una macro (senza interpretarne il disegno), per il banco di prova */
export function emaInfo(xml: string): EmaInfo {
  const info: EmaInfo = { xml: /<EplanPxfRoot/.test(xml.slice(0, 2000)), variantTypes: {}, libraryRefs: [] };
  if (!info.xml) return info;
  for (const m of xml.matchAll(/<MacroVariant\b[^>]*\bMacroFuncType="(\d+)"/g)) info.variantTypes[m[1]] = (info.variantTypes[m[1]] ?? 0) + 1;
  const libs = new Map([...xml.matchAll(/<ESymLib Name="([^"]*)" ID="(\d+)"/g)].map(m => [m[2], m[1]]));
  for (const m of xml.matchAll(/<O17 ([^>]*)>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/(A\d+)="([^"]*)"/g)].map(x => [x[1], x[2]]));
    if (a.A1261 === undefined || !a.A1262) continue;
    const split = (s?: string) => (s ? s.split(/[;\n]/).filter(Boolean) : []);
    info.libraryRefs.push({ lib: libs.get(a.A1261) ?? a.A1261, num: a.A1262, variant: a.A1263 ?? '0', pins: split(a.A185), names: split(a.A186), category: [a.A1381, a.A1382, a.A1383].filter(x => x !== undefined).join('.'), multi: /[;\n]/.test(a.A185 ?? '') });
  }
  return info;
}
