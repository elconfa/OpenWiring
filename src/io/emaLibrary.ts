// Simboli delle librerie EPLAN (IEC_symbol…) richiamati per numero dalle macro dei costruttori e
// non inclusi nel pacchetto. Non copiamo la libreria EPLAN: disegniamo un nostro simbolo
// equivalente scelto dal tipo di funzione EPLAN della funzione (A1381.A1382.A1383: 201 contatto NA,
// 202 NC, 200 bobina, 100 morsetto…), con le designazioni dei punti di connessione della macro.
// Geometria ricavata dalle macro dei costruttori (da verificare in EPLAN): origine al centro del
// simbolo, punti di connessione 4 mm sopra e sotto nella variante A, poli affiancati a passo 8 mm
// verso destra. Le varianti B, C, D ruotano di 90° in senso antiorario, E-H sono le stesse specchiate.
import type { Prim, PinDir, Pt } from '../model/types';

export type LibKind = 'NO' | 'NC' | 'CO' | 'coil' | 'terminal' | 'fuse' | 'breaker' | 'lamp' | 'motor' | 'resistor' | 'plug' | 'box' | 'points';

export const LIB_KIND_LABEL: Record<LibKind, string> = {
  NO: 'contatto NA', NC: 'contatto NC', CO: 'contatto in scambio', coil: 'bobina', terminal: 'morsetto',
  fuse: 'fusibile', breaker: 'interruttore', lamp: 'lampada', motor: 'motore', resistor: 'resistenza',
  plug: 'contatto di connettore', box: 'componente generico', points: 'punti di connessione',
};

export interface LibPin { x: number; y: number; dir: PinDir; label: string }
export interface LibDrawing { kind: LibKind; prims: Prim[]; pins: LibPin[] }

const last = (d: string) => /(\d)\D*$/.exec(d)?.[1];

/** Tipo del nostro simbolo sostitutivo dal tipo di funzione EPLAN e dalle designazioni */
export function libKind(category: string, designations: string[] = []): LibKind | undefined {
  const [c, g] = category.split('.');
  // Contatti: la numerazione (x3-x4 NA, x1-x2 NC) prevale sul tipo dichiarato
  const contact = (fallback: LibKind): LibKind => {
    const l = designations.map(last).filter(Boolean);
    if (l.length >= 2 && l.every(x => x === '3' || x === '4' || x === '7' || x === '8')) return 'NO';
    if (l.length >= 2 && l.every(x => x === '1' || x === '2' || x === '5' || x === '6')) return 'NC';
    return fallback;
  };
  switch (c) {
    case '100': return 'terminal';
    case '101': return 'plug';
    case '200': case '505': return 'coil';
    case '201': return 'NO';
    case '202': return 'NC';
    case '203': return 'CO';
    case '500': return 'fuse';
    case '501': case '502': case '504': case '506': return 'breaker';
    case '600': return g === '99' ? undefined : contact(g === '2' ? 'NC' : 'NO');
    case '605': return contact('NC');
    case '900': return 'lamp';
    case '1000': return 'motor';
    case '1203': return 'resistor';
    case '1101': case '801': return 'box';
    // Punti di connessione dell'apparecchio o del PLC con più designazioni
    case '300': case '1302': return 'points';
    default: return undefined;
  }
}

const L = (x1: number, y1: number, x2: number, y2: number): Prim => ({ t: 'line', x1, y1, x2, y2 });

/** Disegno di un polo in coordinate locali (y verso il basso), punti a y = -4 e y = 4 */
function pole(kind: LibKind, x: number): Prim[] {
  switch (kind) {
    case 'NO': return [L(x, -4, x, -1.5), L(x, 4, x, 1.5), L(x, 1.5, x - 2.2, -2)];
    case 'NC': return [L(x, -4, x, -1.5), L(x, -1.5, x + 2, -1.5), L(x, 4, x, 1.5), L(x, 1.5, x + 2.4, -2)];
    case 'breaker': return [L(x, -4, x, -1.5), L(x - 0.7, -2.2, x + 0.7, -0.8), L(x + 0.7, -2.2, x - 0.7, -0.8), L(x, 4, x, 1.5), L(x, 1.5, x - 2.2, -2)];
    case 'coil': return [L(x, -4, x, -1.5), { t: 'rect', x: x - 2.5, y: -1.5, w: 5, h: 3 }, L(x, 1.5, x, 4)];
    case 'terminal': return [L(x, -4, x, -1.2), { t: 'circle', cx: x, cy: 0, r: 1.2 }, L(x, 1.2, x, 4)];
    case 'fuse': return [{ t: 'rect', x: x - 1, y: -2.5, w: 2, h: 5 }, L(x, -4, x, 4)];
    case 'lamp': return [L(x, -4, x, -2), { t: 'circle', cx: x, cy: 0, r: 2 }, L(x - 1.4, -1.4, x + 1.4, 1.4), L(x + 1.4, -1.4, x - 1.4, 1.4), L(x, 2, x, 4)];
    case 'resistor': return [L(x, -4, x, -2.5), { t: 'rect', x: x - 1.2, y: -2.5, w: 2.4, h: 5 }, L(x, 2.5, x, 4)];
    case 'points': return [L(x, -4, x, -2.5), L(x, 4, x, 2.5)];
    case 'plug': return [L(x, -4, x, -1), { t: 'poly', pts: [{ x: x - 1.5, y: -2.2 }, { x: x - 1.5, y: -1 }, { x: x + 1.5, y: -1 }, { x: x + 1.5, y: -2.2 }] }, { t: 'rect', x: x - 0.6, y: 0, w: 1.2, h: 2, fill: true }, L(x, 2, x, 4)];
    default: return [L(x, -4, x, -2), { t: 'rect', x: x - 2, y: -2, w: 4, h: 4 }, L(x, 2, x, 4)];
  }
}

function draw(kind: LibKind, d: string[]): { prims: Prim[]; pins: LibPin[] } {
  const prims: Prim[] = [], pins: LibPin[] = [];
  const pin = (x: number, y: number, label: string) => pins.push({ x, y, dir: y < 0 ? 'up' : 'down', label });
  if (kind === 'motor') {
    // Morsetti in fila sopra il cerchio
    const xs = d.map((_, i) => (i - Math.floor((d.length - 1) / 2)) * 4);
    const cx = (xs[0] + xs[xs.length - 1]) / 2;
    prims.push({ t: 'circle', cx, cy: 0, r: 5 }, { t: 'text', x: cx, y: 1, s: 'M', size: 3, anchor: 'middle' });
    xs.forEach((x, i) => { prims.push(L(x, -8, x, -Math.sqrt(Math.max(0, 25 - (x - cx) ** 2)))); pin(x, -8, d[i]); });
    return { prims, pins };
  }
  if (kind === 'CO') {
    // Comune in basso, NC e NA in alto
    const com = d.findIndex(x => last(x) === '1' || last(x) === '5');
    const ci = com >= 0 ? com : Math.min(1, d.length - 1);
    const others = d.filter((_, i) => i !== ci);
    const nc = others.find(x => last(x) === '2' || last(x) === '6') ?? others[0] ?? '';
    const no = others.find(x => x !== nc) ?? '';
    prims.push(L(0, 4, 0, 1.5), L(0, 1.5, 3, -2), L(0, -4, 0, -1.5), L(0, -1.5, 1.6, -1.5), L(4, -4, 4, -2.5), L(4, -2.5, 3.2, -2.5));
    pin(0, 4, d[ci] ?? ''); pin(0, -4, nc); pin(4, -4, no);
    return { prims, pins };
  }
  // Coppie di punti: in alto il primo, in basso il secondo; poli affiancati verso destra
  const n = Math.max(1, Math.ceil(d.length / 2));
  for (let i = 0; i < n; i++) {
    const x = i * 8;
    prims.push(...pole(kind, x));
    pin(x, -4, d[2 * i] ?? '');
    if (2 * i + 1 < d.length) pin(x, 4, d[2 * i + 1]);
  }
  // Collegamento meccanico tra i poli di un apparecchio multipolare
  if (n > 1 && (kind === 'NO' || kind === 'NC' || kind === 'breaker')) prims.push({ t: 'line', x1: -1.1, y1: 0, x2: (n - 1) * 8 - 1.1, y2: 0, dash: true });
  return { prims, pins };
}

/** Variante EPLAN (0-7) → trasformazione di un punto in coordinate locali con y verso il basso */
function variantTf(v: number): (p: Pt) => Pt {
  const rot = ((v % 4) + 4) % 4, mirror = v >= 4;
  return (p: Pt) => {
    let x = mirror ? -p.x : p.x, y = p.y;
    // 90° in senso antiorario sullo schermo: (x, y) → (y, -x)
    for (let i = 0; i < rot; i++) [x, y] = [y, -x];
    return { x: r2(x) + 0, y: r2(y) + 0 };
  };
}
const r2 = (v: number) => Math.round(v * 100) / 100;

const DIRS: PinDir[] = ['up', 'left', 'down', 'right'];
/** Direzione di un punto dopo la variante */
export function variantDir(dir: PinDir, v: number): PinDir {
  let i = DIRS.indexOf(dir);
  if (v >= 4 && (dir === 'left' || dir === 'right')) i = (i + 2) % 4;
  return DIRS[(i + (((v % 4) + 4) % 4)) % 4];
}

function transformPrim(q: Prim, f: (p: Pt) => Pt): Prim {
  switch (q.t) {
    case 'line': { const a = f({ x: q.x1, y: q.y1 }), b = f({ x: q.x2, y: q.y2 }); return { ...q, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
    case 'rect': {
      const a = f({ x: q.x, y: q.y }), b = f({ x: q.x + q.w, y: q.y + q.h });
      return { ...q, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: r2(Math.abs(a.x - b.x)), h: r2(Math.abs(a.y - b.y)) };
    }
    case 'circle': { const c = f({ x: q.cx, y: q.cy }); return { ...q, cx: c.x, cy: c.y }; }
    case 'poly': return { ...q, pts: q.pts.map(f) };
    case 'text': { const p = f({ x: q.x, y: q.y }); return { ...q, x: p.x, y: p.y }; }
    default: return q;
  }
}

/**
 * Nostro simbolo al posto di un simbolo della libreria EPLAN: disegno e punti di connessione in
 * coordinate locali (y verso il basso, origine nella posizione della funzione), già nella variante.
 */
export function libraryDrawing(category: string, designations: string[], variant: number): LibDrawing | undefined {
  const kind = libKind(category, designations);
  if (!kind) return undefined;
  const { prims, pins } = draw(kind, designations);
  const f = variantTf(variant);
  return {
    kind,
    prims: prims.map(q => transformPrim(q, f)),
    pins: pins.map(p => ({ ...f(p), dir: variantDir(p.dir, variant), label: p.label })),
  };
}
