import type { Pt, SymbolDef, SymbolInstance, Project, Prim, PinDef, PinDir } from './types';
import { GRID } from './types';
import { BUILTIN_SYMBOLS } from './symbols';

const builtinById = new Map(BUILTIN_SYMBOLS.map(s => [s.id, s]));

let libraryById = new Map<string, SymbolDef>();
/** Simboli importati dall'utente (libreria personale), disponibili in tutti i progetti */
export function setLibrarySymbols(list: SymbolDef[]) { libraryById = new Map(list.map(s => [s.id, s])); }

/** Indice dei simboli del progetto (ricostruito se la lista cambia lunghezza o un simbolo non torna) */
const projectIndex = new WeakMap<SymbolDef[], { n: number; m: Map<string, SymbolDef> }>();
function projectSymbol(list: SymbolDef[], id: string): SymbolDef | undefined {
  if (list.length < 16) return list.find(s => s.id === id);
  let ix = projectIndex.get(list);
  if (!ix || ix.n !== list.length) { ix = { n: list.length, m: new Map(list.map(s => [s.id, s])) }; projectIndex.set(list, ix); }
  // Le modifiche alla lista sostituiscono l'array o ne cambiano la lunghezza (mai un elemento al suo posto)
  return ix.m.get(id);
}

export function getSymbol(id: string, project?: Project): SymbolDef | undefined {
  return builtinById.get(id) ?? (project ? projectSymbol(project.customSymbols, id) : undefined) ?? libraryById.get(id);
}

let gridSize = GRID;
/** Passo di griglia attivo (impostazione del progetto) */
export const setGridSize = (g: number) => { gridSize = g > 0 ? g : GRID; };
export const getGridSize = () => gridSize;
export const snap = (v: number, g = gridSize) => Math.round(v / g) * g;
export const snapPt = (p: Pt, g = gridSize): Pt => ({ x: snap(p.x, g), y: snap(p.y, g) });
export const keyOf = (p: Pt) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
export const samePt = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/** Trasforma un punto locale del simbolo in coordinate pagina (specchio, rotazione oraria, traslazione) */
/**
 * Designazione di un punto di connessione sullo schema: punto di attacco del testo e allineamento.
 * Con labelPos scelta nell'editor (alto/basso, sinistra/destra nel disegno del simbolo) il testo sta
 * nell'angolo indicato; altrimenti accanto al tratto, secondo la direzione del filo.
 */
export function pinLabelPlace(inst: Pick<SymbolInstance, 'x' | 'y' | 'rot' | 'mirror'>, pin: PinDef, size = 1.8): { x: number; y: number; anchor: 'start' | 'end' } {
  if (pin.labelPos) {
    const left = pin.labelPos[1] === 'l', top = pin.labelPos[0] === 't';
    const q = toWorld(inst, { x: pin.x + (left ? -0.8 : 0.8), y: pin.y + (top ? -0.6 : 0.6 + size) });
    const at = toWorld(inst, pin);
    return { ...q, anchor: q.x < at.x - 0.01 ? 'end' : 'start' };
  }
  const off = { up: { x: 0.8, y: 0.8 + size }, down: { x: 0.8, y: -1.4 }, left: { x: 1, y: -0.8 }, right: { x: -1, y: -0.8 } }[pin.dir];
  return { ...toWorld(inst, { x: pin.x + off.x, y: pin.y + off.y }), anchor: 'start' };
}

export function toWorld(inst: Pick<SymbolInstance, 'x' | 'y' | 'rot' | 'mirror'>, p: Pt): Pt {
  let x = inst.mirror ? -p.x : p.x;
  let y = p.y;
  switch (inst.rot) {
    case 90: [x, y] = [-y, x]; break;
    case 180: [x, y] = [-x, -y]; break;
    case 270: [x, y] = [y, -x]; break;
  }
  return { x: inst.x + x, y: inst.y + y };
}

type TextPrim = Extract<Prim, { t: 'text' }>;

/**
 * Testo di un simbolo in coordinate pagina, sempre leggibile (da sotto o da destra, come
 * vuole la norma): non viene mai specchiato e, se la rotazione lo capovolgerebbe (180° o 90°),
 * è girato di 180° tenendo il testo nella stessa zona.
 */
export function readableText(inst: Pick<SymbolInstance, 'x' | 'y' | 'rot' | 'mirror'>, p: TextPrim) {
  const rad = ((p.rot ?? 0) * Math.PI) / 180;
  const o = toWorld(inst, { x: 0, y: 0 });
  const dir = (v: Pt) => { const w = toWorld(inst, v); return { x: w.x - o.x, y: w.y - o.y }; };
  // Direzione di scrittura e "alto" del testo dopo specchio e rotazione del simbolo
  const run = dir({ x: Math.cos(rad), y: Math.sin(rad) });
  const upOld = dir({ x: Math.sin(rad), y: -Math.cos(rad) });
  let ang = Math.round((Math.atan2(run.y, run.x) * 180) / Math.PI);
  ang = ((ang % 360) + 360) % 360;
  // 0° e 270° (dal basso verso l'alto) si leggono; 90° e 180° vanno girati
  const flip = (ang > 45 && ang <= 225);
  const rot = flip ? (ang + 180) % 360 : ang;
  const r2 = (rot * Math.PI) / 180;
  const runNew = { x: Math.cos(r2), y: Math.sin(r2) };
  const upNew = { x: Math.sin(r2), y: -Math.cos(r2) };
  const h = (p.size ?? 2.5) * 0.7;
  const at = toWorld(inst, { x: p.x, y: p.y });
  // Il corpo del testo resta dove stava: se il suo "alto" si è invertito, la linea di base si sposta
  const x = at.x + (h * (upOld.x - upNew.x)) / 2, y = at.y + (h * (upOld.y - upNew.y)) / 2;
  const reversed = run.x * runNew.x + run.y * runNew.y < 0;
  const a = p.anchor ?? 'middle';
  const anchor = reversed && a !== 'middle' ? (a === 'start' ? 'end' : 'start') : a;
  return { x, y, rot: rot > 180 ? rot - 360 : rot, anchor: anchor as 'start' | 'middle' | 'end' };
}

export function pinsWorld(inst: SymbolInstance, sym: SymbolDef) {
  return sym.pins.map(p => ({ pin: p, ...toWorld(inst, p) }));
}

/** Direzione del filo che esce da un punto di connessione, con rotazione e specchio del simbolo */
export function pinDirWorld(dir: PinDir, inst: Pick<SymbolInstance, 'rot' | 'mirror'>): PinDir {
  const order: PinDir[] = ['up', 'right', 'down', 'left'];
  let d = dir;
  if (inst.mirror && (d === 'left' || d === 'right')) d = d === 'left' ? 'right' : 'left';
  return order[(order.indexOf(d) + inst.rot / 90) % 4];
}

export function primBounds(prims: Prim[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of prims) {
    switch (p.t) {
      case 'line': add(p.x1, p.y1); add(p.x2, p.y2); break;
      case 'rect': add(p.x, p.y); add(p.x + p.w, p.y + p.h); break;
      case 'circle': case 'arc': add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); break;
      case 'text': add(p.x, p.y); break;
      case 'ellipse': add(p.cx - p.rx, p.cy - p.ry); add(p.cx + p.rx, p.cy + p.ry); break;
      case 'poly': for (const q of p.pts) add(q.x, q.y); break;
    }
  }
  if (!isFinite(x0)) return { x0: -2, y0: -2, x1: 2, y1: 2 };
  return { x0, y0, x1, y1 };
}

/** Rettangolo di ingombro del simbolo istanziato, in coordinate pagina */
/** Rappresentazione ridotta disegnata in verticale (come il contatto con rot 0) */
export const pairVertical = (inst: Pick<SymbolInstance, 'rot'>) => inst.rot === 0 || inst.rot === 180;

/** Scala della rappresentazione ridotta: il simbolo vero più piccolo (0,6 con l'altezza di serie dei testi) */
export const pairScale = (inst: Pick<SymbolInstance, 'pairSize'>) => 0.6 * ((inst.pairSize ?? 1.7) / 1.7);

/** Centro del disegno del simbolo (senza testi): punto di aggancio della rappresentazione ridotta */
export function pairCenter(sym: SymbolDef) {
  const b = primBounds(sym.prims.filter(p => p.t !== 'text'));
  return { b, c: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } };
}

/** Punto del simbolo (sue coordinate) sulla pagina, nella rappresentazione ridotta */
export function pairToWorld(inst: Pick<SymbolInstance, 'x' | 'y' | 'rot' | 'mirror' | 'pairSize'>, sym: SymbolDef, p: Pt): Pt {
  const { c } = pairCenter(sym), k = pairScale(inst);
  return toWorld(inst, { x: (p.x - c.x) * k, y: (p.y - c.y) * k });
}

/** Ingombro della rappresentazione ridotta: il simbolo in scala con il rimando */
export function pairCompactBounds(inst: Pick<SymbolInstance, 'x' | 'y' | 'rot' | 'mirror' | 'pairSize'>, sym: SymbolDef) {
  const { b } = pairCenter(sym);
  const cs = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x0, y: b.y1 }, { x: b.x1, y: b.y1 }].map(p => pairToWorld(inst, sym, p));
  return {
    x0: Math.min(...cs.map(c => c.x)) - 0.8, y0: Math.min(...cs.map(c => c.y)) - 0.8,
    x1: Math.max(...cs.map(c => c.x)) + 0.8, y1: Math.max(...cs.map(c => c.y)) + 0.8,
  };
}

export function instanceBounds(inst: SymbolInstance, sym: SymbolDef) {
  if (inst.pairOf && inst.pairCompact) return pairCompactBounds(inst, sym);
  const b = primBounds(sym.prims);
  const corners = [
    toWorld(inst, { x: b.x0, y: b.y0 }), toWorld(inst, { x: b.x1, y: b.y0 }),
    toWorld(inst, { x: b.x0, y: b.y1 }), toWorld(inst, { x: b.x1, y: b.y1 }),
  ];
  return {
    x0: Math.min(...corners.map(c => c.x)) - 1, y0: Math.min(...corners.map(c => c.y)) - 1,
    x1: Math.max(...corners.map(c => c.x)) + 1, y1: Math.max(...corners.map(c => c.y)) + 1,
  };
}

/** True se p giace sul segmento a-b (estremi esclusi) */
/**
 * Il tratto a–b tocca il riquadro (anche solo in parte)? Ritaglio di Liang–Barsky: serve alla
 * selezione «da destra a sinistra», dove per i fili contano i tratti e non il rettangolo che li contiene
 */
export function segmentTouchesBox(a: Pt, b: Pt, box: { x0: number; y0: number; x1: number; y1: number }): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.x0], [dx, box.x1 - a.x], [-dy, a.y - box.y0], [dy, box.y1 - a.y]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/** Una linea spezzata (filo, linea del cavo…) tocca il riquadro? */
export const polylineTouchesBox = (pts: Pt[], box: { x0: number; y0: number; x1: number; y1: number }) =>
  pts.length === 1 ? segmentTouchesBox(pts[0], pts[0], box) : pts.slice(1).some((p, i) => segmentTouchesBox(pts[i], p, box));

export function onSegmentInterior(p: Pt, a: Pt, b: Pt): boolean {
  if (samePt(p, a) || samePt(p, b)) return false;
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 0.01) return false;
  return p.x >= Math.min(a.x, b.x) - 0.01 && p.x <= Math.max(a.x, b.x) + 0.01 &&
    p.y >= Math.min(a.y, b.y) - 0.01 && p.y <= Math.max(a.y, b.y) + 0.01;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

let counter = 0;
export function uid(prefix = 'e'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
