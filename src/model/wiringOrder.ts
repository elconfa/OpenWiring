// Sequenza di cablaggio (da–a): in che ordine il cablatore collega i punti di un conduttore. Lo schema
// dice solo quali punti sono collegati; la sequenza viene, in quest'ordine di precedenza:
//   1) dall'ordine scelto a mano (Project.wireOrders, finestra «Ordine dei collegamenti»): catena;
//   2) dai nodi a T con verso (Wire.tNode, come in EPLAN): il gambo della T si collega al braccio
//      indicato della linea passante, la linea passante collega i suoi due bracci;
//   3) dai ripartitori e dalle barre di terra: ogni filo parte dal foro (stella);
//   4) dalla posizione: catena dall'alto in basso e da sinistra a destra (come prima).
// Le linee di potenziale (L1, 0V…) restano a parte in connections(): ogni punto va al potenziale.
import type { Page, PinDir, Project, Pt, Wire } from './types';
import type { Net, NetPin } from './netlist';
import { keyOf, onSegmentInterior, samePt } from './geometry';
import { allPlaced } from './devices';
import { linkPartners } from './links';
import { tn } from '../i18n/ui';

export type SeqMode = 'manual' | 'tnode' | 'distributor' | 'position';
export interface NetSequence {
  mode: SeqMode;
  /** Collegamenti da–a nell'ordine di cablaggio */
  pairs: [NetPin, NetPin][];
  /** Punti nell'ordine in cui si incontrano seguendo i collegamenti */
  order: NetPin[];
}

export const OPPOSITE: Record<PinDir, PinDir> = { left: 'right', right: 'left', up: 'down', down: 'up' };
export const DIR_VEC: Record<PinDir, Pt> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };

/** Chiave stabile di un punto di connessione per l'ordine scelto a mano */
export const pinKey = (p: Pick<NetPin, 'pinId'> & { el: { inst: { id: string } } }) => `${p.el.inst.id}|${p.pinId}`;

const byPos = (a: NetPin, b: NetPin) => a.el.pageIndex - b.el.pageIndex || a.pos.y - b.pos.y || a.pos.x - b.pos.x;

function dirTo(a: Pt, b: Pt): PinDir | undefined {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dy) < 0.01 && Math.abs(dx) > 0.01) return dx > 0 ? 'right' : 'left';
  if (Math.abs(dx) < 0.01 && Math.abs(dy) > 0.01) return dy > 0 ? 'down' : 'up';
  return undefined;
}

// ---------------------------------------------------------------------------
// Nodi a T

/** Braccio di filo che parte da un punto: direzione, filo e, se il punto è un suo estremo, quale */
export interface Arm { dir: PinDir; wire: Wire; end?: 'start' | 'end' }

const drawn = (page: Page) => page.elements.filter((e): e is Wire => e.kind === 'wire' && e.bundle === undefined);

/** Bracci dei fili che partono da un punto (estremi, vertici e punti interni dei tratti) */
export function armsAt(wires: Wire[], p: Pt): Arm[] {
  const out: Arm[] = [];
  for (const w of wires) {
    const n = w.points.length;
    w.points.forEach((q, i) => {
      const b = w.points[i + 1];
      if (samePt(q, p)) {
        const back = i > 0 ? dirTo(p, w.points[i - 1]) : undefined, fwd = b ? dirTo(p, b) : undefined;
        if (back) out.push({ dir: back, wire: w, ...(i === n - 1 ? { end: 'end' as const } : {}) });
        if (fwd) out.push({ dir: fwd, wire: w, ...(i === 0 ? { end: 'start' as const } : {}) });
      } else if (b && onSegmentInterior(p, q, b)) {
        const d1 = dirTo(p, q), d2 = dirTo(p, b);
        if (d1) out.push({ dir: d1, wire: w });
        if (d2) out.push({ dir: d2, wire: w });
      }
    });
  }
  return out;
}

/** Nodo a T di una pagina: gambo, i due bracci della linea passante e il verso scelto (se c'è) */
export interface TNode {
  p: Pt;
  stem: PinDir;
  through: [PinDir, PinDir];
  /** Braccio della linea passante a cui si collega il gambo (assente = senza verso) */
  join?: PinDir;
  /** Estremi di filo nel nodo: lì si scrive il verso */
  holders: { wire: Wire; end: 'start' | 'end' }[];
}

/** Forma a T dai tre bracci (orizzontali e verticali): il gambo è quello senza il braccio opposto */
function tShape(dirs: PinDir[]): { stem: PinDir; through: [PinDir, PinDir] } | undefined {
  if (dirs.length !== 3 || new Set(dirs).size !== 3) return undefined;
  const stem = dirs.find(d => !dirs.includes(OPPOSITE[d]));
  if (!stem) return undefined;
  return { stem, through: dirs.filter(d => d !== stem) as [PinDir, PinDir] };
}

/** Verso scritto su uno degli estremi di filo del nodo, se è un braccio della linea passante */
function joinOf(arms: Arm[], through: PinDir[]): PinDir | undefined {
  for (const a of arms) {
    const j = a.end ? a.wire.tNode?.[a.end] : undefined;
    if (j && through.includes(j)) return j;
  }
  return undefined;
}

export function tNodeAt(wires: Wire[], p: Pt): TNode | undefined {
  const arms = armsAt(wires, p);
  const shape = tShape(arms.map(a => a.dir));
  if (!shape) return undefined;
  const holders = arms.flatMap(a => (a.end ? [{ wire: a.wire, end: a.end }] : []));
  return { p, ...shape, join: joinOf(arms, shape.through), holders };
}

/** Nodi a T con il verso scelto su una pagina (si disegnano al posto del pallino) */
export function pageTNodes(page: Page): TNode[] {
  const wires = drawn(page);
  const out = new Map<string, TNode>();
  for (const w of wires) {
    for (const end of ['start', 'end'] as const) {
      if (!w.tNode?.[end]) continue;
      const p = end === 'start' ? w.points[0] : w.points[w.points.length - 1];
      if (out.has(keyOf(p))) continue;
      const t = tNodeAt(wires, p);
      if (t?.join) out.set(keyOf(p), t);
    }
  }
  return [...out.values()];
}

/** Verso di serie di un nodo senza verso: il gambo si collega al braccio di sinistra (o a quello in alto) */
export const defaultJoin = (through: PinDir[]): PinDir => (through.includes('left') ? 'left' : 'up');

// ---------------------------------------------------------------------------
// Sequenza

export interface SeqContext {
  project: Project;
  orders: string[][];
  wiresOf: (pageId: string) => Wire[];
  /** Rimandi: posizione del punto e corrispondenti (calcolati solo se servono) */
  links: () => { at: Map<string, { pageId: string; p: Pt }>; partners: Map<string, string[]> };
}

export function sequenceContext(project: Project): SeqContext {
  const wires = new Map<string, Wire[]>();
  let links: ReturnType<SeqContext['links']> | undefined;
  return {
    project,
    orders: project.wireOrders ?? [],
    wiresOf: id => {
      let w = wires.get(id);
      if (!w) { const pg = project.pages.find(p => p.id === id); w = pg ? drawn(pg) : []; wires.set(id, w); }
      return w;
    },
    links: () => {
      if (links) return links;
      const placed = allPlaced(project);
      const at = new Map<string, { pageId: string; p: Pt }>();
      for (const el of placed) {
        if (el.sym.role !== 'link' || !el.sym.pins[0]) continue;
        const pin = el.sym.pins[0];
        let x = el.inst.mirror ? -pin.x : pin.x, y = pin.y;
        switch (el.inst.rot) {
          case 90: [x, y] = [-y, x]; break;
          case 180: [x, y] = [-x, -y]; break;
          case 270: [x, y] = [y, -x]; break;
        }
        at.set(el.inst.id, { pageId: el.page.id, p: { x: el.inst.x + x, y: el.inst.y + y } });
      }
      const partners = new Map([...linkPartners(project, placed)].map(([id, ps]) => [id, ps.map(o => o.inst.id)]));
      return (links = { at, partners });
    },
  };
}

/** Collegamenti in catena nell'ordine dato */
const chain = (order: NetPin[]): [NetPin, NetPin][] => order.slice(1).map((p, i) => [order[i], p]);

/** Ordine scelto a mano che riguarda il conduttore (almeno due dei suoi punti) */
export function manualOrderOf(orders: string[][], net: Pick<Net, 'pins'>): { index: number; pins: NetPin[] } | undefined {
  const byKey = new Map(net.pins.map(p => [pinKey(p), p]));
  for (let index = 0; index < orders.length; index++) {
    const pins = [...new Set(orders[index].map(k => byKey.get(k)).filter((p): p is NetPin => !!p))];
    if (pins.length >= 2) return { index, pins };
  }
  return undefined;
}

export function netSequence(ctx: SeqContext, net: Net): NetSequence {
  const sorted = [...net.pins].sort(byPos);
  const manual = manualOrderOf(ctx.orders, net);
  if (manual) {
    const order = [...manual.pins, ...sorted.filter(p => !manual.pins.includes(p))];
    return { mode: 'manual', pairs: chain(order), order };
  }
  if (net.wires.some(w => w.wire.tNode?.start || w.wire.tNode?.end)) {
    const pairs = graphPairs(ctx, net, sorted);
    if (pairs) return walk('tnode', pairs, sorted);
  }
  const hub = sorted.find(p => p.el.sym.id.startsWith('dist:'));
  if (hub) {
    const order = [hub, ...sorted.filter(p => p !== hub)];
    return { mode: 'distributor', pairs: order.slice(1).map(p => [hub, p]), order };
  }
  return { mode: 'position', pairs: chain(sorted), order: sorted };
}

interface Edge { to: string; dir?: PinDir }

/**
 * Collegamenti dal disegno con i nodi a T: si parte da ogni punto di connessione lungo ogni suo filo e
 * si arriva al primo punto che si incontra, attraversando i nodi secondo il verso (i nodi senza verso
 * con quello di serie). undefined se il disegno non si risolve (anelli, incroci a 4, tratti obliqui):
 * allora vale l'ordine per posizione
 */
function graphPairs(ctx: SeqContext, net: Net, sorted: NetPin[]): [NetPin, NetPin][] | undefined {
  const K = (pageId: string, p: Pt) => `${pageId}|${keyOf(p)}`;
  const adj = new Map<string, Edge[]>();
  const add = (a: string, e: Edge) => (adj.get(a) ?? adj.set(a, []).get(a)!).push(e);
  const joins = new Map<string, { stem: PinDir; through: PinDir[]; join: PinDir }>();
  const byPage = new Map<string, Wire[]>();
  for (const { wire, pageId } of net.wires) (byPage.get(pageId) ?? byPage.set(pageId, []).get(pageId)!).push(wire);
  for (const [pageId, wires] of byPage) {
    const ends = wires.flatMap(w => [w.points[0], w.points[w.points.length - 1]]);
    for (const w of wires) {
      // Nodi del filo nell'ordine: i suoi vertici e gli estremi degli altri fili che vi si attaccano a T
      const list: Pt[] = [];
      w.points.forEach((p, i) => {
        list.push(p);
        const b = w.points[i + 1];
        if (b) list.push(...ends.filter(q => onSegmentInterior(q, p, b)).sort((m, n) => Math.hypot(m.x - p.x, m.y - p.y) - Math.hypot(n.x - p.x, n.y - p.y)));
      });
      for (let i = 0; i + 1 < list.length; i++) {
        if (samePt(list[i], list[i + 1])) continue;
        const a = K(pageId, list[i]), b = K(pageId, list[i + 1]);
        add(a, { to: b, dir: dirTo(list[i], list[i + 1]) });
        add(b, { to: a, dir: dirTo(list[i + 1], list[i]) });
      }
    }
    for (const p of ends) {
      const k = K(pageId, p);
      if (joins.has(k)) continue;
      const t = tNodeAt(ctx.wiresOf(pageId).filter(w => wires.includes(w)), p);
      if (t) joins.set(k, { stem: t.stem, through: t.through, join: t.join ?? defaultJoin(t.through) });
    }
  }
  // Rimandi: il conduttore prosegue dal punto del rimando a quello del corrispondente
  if (net.linkIds?.length) {
    const { at, partners } = ctx.links();
    for (const id of net.linkIds) {
      const a = at.get(id);
      for (const o of partners.get(id) ?? []) {
        const b = at.get(o);
        if (a && b && id < o) { add(K(a.pageId, a.p), { to: K(b.pageId, b.p) }); add(K(b.pageId, b.p), { to: K(a.pageId, a.p) }); }
      }
    }
  }
  const pinsAt = new Map<string, NetPin[]>();
  for (const p of sorted) { const k = K(p.el.page.id, p.pos); (pinsAt.get(k) ?? pinsAt.set(k, []).get(k)!).push(p); }

  const BAD = null;
  /** Primo punto di connessione raggiunto andando da `from` verso `at` */
  const port = (from: string, at: string, seen: Set<string>): NetPin | undefined | null => {
    for (;;) {
      const here = pinsAt.get(at);
      if (here) return here[0];
      if (seen.has(at)) return BAD;
      seen.add(at);
      const edges = adj.get(at) ?? [];
      const inIdx = edges.findIndex(e => e.to === from);
      const others = edges.filter((_, i) => i !== inIdx);
      if (!others.length) return undefined;
      let next: Edge | undefined;
      if (others.length === 1) next = others[0];
      else if (others.length === 2) {
        const t = joins.get(at), inDir = edges[inIdx]?.dir;
        if (!t || !inDir) return BAD;
        // Dal gambo verso il braccio scelto; da un braccio della linea passante si prosegue dritti
        next = others.find(e => e.dir === (inDir === t.stem ? t.join : OPPOSITE[inDir]));
      } else return BAD;
      if (!next) return BAD;
      from = at; at = next.to;
    }
  };
  const pairs: [NetPin, NetPin][] = [];
  const seenPair = new Set<string>();
  const push = (a: NetPin, b: NetPin) => {
    if (a === b) return;
    const k = [pinKey(a), pinKey(b)].sort().join('~');
    if (seenPair.has(k)) return;
    seenPair.add(k);
    pairs.push([a, b]);
  };
  for (const [k, here] of pinsAt) {
    // Punti a contatto diretto (simboli posati uno sull'altro)
    for (let i = 1; i < here.length; i++) push(here[0], here[i]);
    for (const e of adj.get(k) ?? []) {
      const q = port(k, e.to, new Set());
      if (q === BAD) return undefined;
      if (q) push(here[0], q);
    }
  }
  return pairs;
}

/** Collegamenti messi in fila seguendoli da un capo (il primo per posizione), con l'ordine dei punti */
function walk(mode: SeqMode, pairs: [NetPin, NetPin][], sorted: NetPin[]): NetSequence {
  const nb = new Map<NetPin, [NetPin, NetPin][]>();
  for (const pr of pairs) for (const p of pr) (nb.get(p) ?? nb.set(p, []).get(p)!).push(pr);
  const outPairs: [NetPin, NetPin][] = [], order: NetPin[] = [];
  const used = new Set<[NetPin, NetPin]>(), visited = new Set<NetPin>();
  const visit = (p: NetPin) => {
    if (!visited.has(p)) { visited.add(p); order.push(p); }
    for (const pr of nb.get(p) ?? []) {
      if (used.has(pr)) continue;
      used.add(pr);
      const o = pr[0] === p ? pr[1] : pr[0];
      outPairs.push([p, o]);
      visit(o);
    }
  };
  const starts = [...sorted.filter(p => (nb.get(p)?.length ?? 0) === 1), ...sorted];
  for (const s of starts) if (!visited.has(s) && nb.has(s)) visit(s);
  // Punti non raggiunti dai fili disegnati: in coda, in catena
  const rest = sorted.filter(p => !visited.has(p));
  let last = order[order.length - 1];
  for (const p of rest) { if (last) outPairs.push([last, p]); order.push(p); last = p; }
  return { mode, pairs: outPairs, order };
}

/** Testo del modo, per le liste e la finestra */
export const SEQ_MODE_NAMES: Record<SeqMode, string> = {
  manual: tn('ordine scelto a mano'), tnode: tn('dai nodi a T'), distributor: tn('dal ripartitore'), position: tn('per posizione'),
};
