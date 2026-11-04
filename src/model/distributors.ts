// Ripartitori, morsettiere di distribuzione e barre di terra per i conduttori di potenza (es. L1 che
// alimenta più teleruttori, PE di tutte le utenze): definiti come i cavi, con i gruppi (poli o morsetti ponticellati), la sezione massima
// dell'ingresso e di ogni uscita. Sullo schema ogni gruppo è un simbolo generato dai dati (barra con le
// uscite numerate, o morsetti affiancati con il ponte); il controllo e le liste dicono quali fili vanno su
// ogni uscita e se la somma delle sezioni supera quella ammessa.
import type { Distributor, DistGroup, Project, SymbolDef, Prim, Wire, SymbolInstance, Page } from './types';
import { columnOf } from './types';
import { getSymbol, pinsWorld, samePt, onSegmentInterior, uid } from './geometry';
import type { Pt } from './types';
import { computeNetlist } from './netlist';
import { netSequence, sequenceContext } from './wiringOrder';

/** Passo delle uscite e quota delle uscite nel simbolo (mm, sulla griglia di 4) */
export const DIST_STEP = 8, DIST_OUT_Y = 12;

export const distSymbolId = (d: Pick<Distributor, 'id'>, gi: number) => `dist:${d.id}:${gi}`;
export const isDistSymbol = (id: string) => id.startsWith('dist:');

/** Numero dalla sezione scritta ("2,5" → 2.5); undefined se non indicata */
export const crossNum = (s?: string) => { const v = parseFloat((s ?? '').replace(',', '.')); return isFinite(v) && v > 0 ? v : undefined; };
const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/** Uscite scritte come per i conduttori dei cavi: "4,5; 4,5; 6" oppure "6x4,5" */
export function parseOuts(s: string): string[] {
  const out: string[] = [];
  for (const part of s.split(/[;\s]+/).filter(Boolean)) {
    const m = /^(\d+)\s*[x×*]\s*([\d.,]+)$/i.exec(part);
    if (m) for (let i = 0; i < parseInt(m[1], 10); i++) out.push(m[2].replace('.', ','));
    else if (/^[\d.,]+$/.test(part) || part === '-') out.push(part === '-' ? '' : part.replace('.', ','));
  }
  return out;
}
export const outsText = (outs: string[]) => outs.map(o => o || '-').join('; ');

/** Nomi delle uscite di un gruppo: "L1.1", "L1.2"… */
export const outName = (g: DistGroup, k: number) => `${g.name}.${k + 1}`;

/** Nome del tipo, lettera della sigla e primo numero proposto */
export const DIST_KINDS: Record<Distributor['kind'], { name: string; letter: string; first: number }> = {
  bar: { name: 'Ripartitore', letter: 'Q', first: 50 },
  terminals: { name: 'Morsettiera di distribuzione', letter: 'X', first: 50 },
  earth: { name: 'Barra di terra', letter: 'PE', first: 1 },
};

/**
 * Simbolo del gruppo: ingresso in alto a sinistra, uscite in basso ogni 8 mm. Ripartitore: barra piena;
 * morsettiera: un morsetto per uscita con il ponte che li unisce (il primo è anche
 * l'ingresso); barra di terra: barra piena con il segno di terra a sinistra e un foro (bullone) per
 * uscita. Sotto ogni uscita la sezione massima, per il cablatore
 */
export function distSymbol(d: Distributor, gi: number): SymbolDef {
  const g = d.groups[gi];
  const n = Math.max(1, g.outs.length), x1 = (n - 1) * DIST_STEP;
  const prims: Prim[] = [];
  if (d.kind === 'bar') {
    prims.push({ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'rect', x: -2, y: 4, w: x1 + 4, h: 2.4, fill: true });
    for (let k = 0; k < n; k++) prims.push({ t: 'line', x1: k * DIST_STEP, y1: 6.4, x2: k * DIST_STEP, y2: DIST_OUT_Y });
  } else if (d.kind === 'earth') {
    // Barra con un foro per uscita; a sinistra il segno di terra (PE) o di massa
    prims.push({ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }, { t: 'rect', x: -3, y: 4, w: x1 + 6, h: 2.4, lw: 0.5 });
    for (let k = 0; k < n; k++) prims.push({ t: 'circle', cx: k * DIST_STEP, cy: 5.2, r: 0.55, fill: true }, { t: 'line', x1: k * DIST_STEP, y1: 6.4, x2: k * DIST_STEP, y2: DIST_OUT_Y });
    prims.push({ t: 'line', x1: -3, y1: 5.2, x2: -5, y2: 5.2 }, { t: 'line', x1: -5, y1: 3.2, x2: -5, y2: 7.2 }, { t: 'line', x1: -6.2, y1: 3.9, x2: -6.2, y2: 6.5 }, { t: 'line', x1: -7.4, y1: 4.6, x2: -7.4, y2: 5.8 });
  } else {
    prims.push({ t: 'line', x1: 0, y1: 0, x2: 0, y2: 4.7 });
    for (let k = 0; k < n; k++) {
      const x = k * DIST_STEP;
      prims.push({ t: 'circle', cx: x, cy: 6, r: 1.3 }, { t: 'line', x1: x, y1: 7.3, x2: x, y2: DIST_OUT_Y });
    }
    // Ponte tra i morsetti (a pettine): linea spessa con un punto su ogni morsetto
    if (n > 1) prims.push({ t: 'line', x1: 0, y1: 3, x2: x1, y2: 3, lw: 0.6 }, ...Array.from({ length: n }, (_, k): Prim => ({ t: 'line', x1: k * DIST_STEP, y1: 3, x2: k * DIST_STEP, y2: 4.7 })));
  }
  // Sezione massima a sinistra di ogni uscita, in basso (il nome dell'uscita sta a destra)
  g.outs.forEach((o, k) => { if (o) prims.push({ t: 'text', x: k * DIST_STEP - 0.5, y: DIST_OUT_Y - 0.6, s: o, size: 1.3, anchor: 'end', muted: true }); });
  return {
    id: distSymbolId(d, gi), name: `${DIST_KINDS[d.kind].name} -${d.tag} ${g.name}`,
    category: 'Ripartitori', letter: d.kind === 'terminals' ? 'X' : d.kind === 'earth' ? 'X' : 'Q', role: 'single', hidden: true, prims,
    pins: [
      { id: 'in', x: 0, y: 0, dir: 'up', label: g.name },
      ...Array.from({ length: n }, (_, k) => ({ id: `o${k + 1}`, x: k * DIST_STEP, y: DIST_OUT_Y, dir: 'down' as const, label: outName(g, k) })),
    ],
    tagPos: { x: d.kind === 'earth' ? -8 : -4, y: 2 }, textsUnderTag: false, rotations: [0, 180], noMirror: true,
  };
}

/** Simboli dei ripartitori nel progetto: creati o aggiornati dai dati, tolti quelli dei ripartitori eliminati */
export function syncDistSymbols(p: Project) {
  const want = (p.distributors ?? []).flatMap(d => d.groups.map((_, gi) => distSymbol(d, gi)));
  const ids = new Set(want.map(s => s.id));
  p.customSymbols = [...p.customSymbols.filter(s => !isDistSymbol(s.id) || ids.has(s.id)).map(s => want.find(w => w.id === s.id) ?? s),
    ...want.filter(w => !p.customSymbols.some(s => s.id === w.id))];
}

/** Ripartitore del simbolo (dal suo id) e il gruppo */
export function distOf(p: Project, symbolId: string): { d: Distributor; gi: number } | undefined {
  if (!isDistSymbol(symbolId)) return undefined;
  const [, id, gi] = symbolId.split(':');
  const d = p.distributors?.find(x => x.id === id);
  return d && d.groups[+gi] ? { d, gi: +gi } : undefined;
}

/** Sigla nuova: Q per i ripartitori, X per le morsettiere, PE per le barre di terra, il primo numero libero */
export function nextDistTag(p: Project, kind: Distributor['kind']): string {
  const used = new Set([...(p.distributors ?? []).map(d => d.tag), ...p.pages.flatMap(pg => pg.elements.flatMap(e => (e.kind === 'symbol' ? [e.tag.split(':')[0]] : [])))]);
  const { letter, first } = DIST_KINDS[kind];
  let n = first;
  while (used.has(`${letter}${n}`)) n++;
  return `${letter}${n}`;
}

export function newDistributor(p: Project, kind: Distributor['kind']): Distributor {
  const tag = nextDistTag(p, kind);
  if (kind === 'bar') return { id: uid('r'), tag, kind, groups: ['L1', 'L2', 'L3', 'N'].map(name => ({ name, outs: Array(6).fill('') })) };
  if (kind === 'earth') return { id: uid('r'), tag, kind, groups: [{ name: 'PE', outs: Array(10).fill('') }] };
  return { id: uid('r'), tag, kind, groups: [{ name: '1', outs: ['', ''] }] };
}

// ---------------------------------------------------------------------------
// Occupazione delle uscite

export interface DistWire { wire: Wire; cross?: number; to: string; wireNo: string; loc: string }

const key = (p: Pt) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/**
 * Fili fisici che partono da un punto (un foro del ripartitore): si seguono i fili e le giunzioni a T
 * fino al primo punto di connessione di un altro elemento; ogni punto raggiunto è un filo dal foro, con la
 * sezione del filo che ci arriva. Così 3 o 4 fili sulla stessa uscita si disegnano con un filo che parte
 * dall'uscita e si dirama, oppure con più fili che partono dallo stesso punto
 */
function branchesFrom(page: Page, start: Pt, stops: Map<string, string>): { wire: Wire; to: string }[] {
  const wires = page.elements.filter((e): e is Wire => e.kind === 'wire' && !e.bus && e.bundle === undefined);
  // Nodi di ogni filo nell'ordine: i suoi vertici e i punti degli altri fili che vi si attaccano a T
  const nodesOf = new Map<Wire, Pt[]>();
  const ends = wires.flatMap(w => [w.points[0], w.points[w.points.length - 1]]);
  for (const w of wires) {
    const list: Pt[] = [];
    w.points.forEach((p, i) => {
      list.push(p);
      const b = w.points[i + 1];
      if (!b) return;
      const mid = ends.filter(q => onSegmentInterior(q, p, b)).sort((m, n) => Math.hypot(m.x - p.x, m.y - p.y) - Math.hypot(n.x - p.x, n.y - p.y));
      list.push(...mid);
    });
    nodesOf.set(w, list);
  }
  const adj = new Map<string, { to: Pt; wire: Wire }[]>();
  const link = (a: Pt, b: Pt, wire: Wire) => {
    if (samePt(a, b)) return;
    (adj.get(key(a)) ?? adj.set(key(a), []).get(key(a))!).push({ to: b, wire });
    (adj.get(key(b)) ?? adj.set(key(b), []).get(key(b))!).push({ to: a, wire });
  };
  for (const [w, list] of nodesOf) for (let i = 0; i + 1 < list.length; i++) link(list[i], list[i + 1], w);
  const out: { wire: Wire; to: string }[] = [];
  const seen = new Set([key(start)]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    for (const e of adj.get(key(p)) ?? []) {
      const k = key(e.to);
      if (seen.has(k)) continue;
      seen.add(k);
      const stop = stops.get(k);
      if (stop !== undefined) out.push({ wire: e.wire, to: stop });
      else queue.push(e.to);
    }
  }
  return out;
}
export interface DistSlot {
  d: Distributor; gi: number;
  /** "in" per l'ingresso, altrimenti l'indice dell'uscita */
  k: number | 'in';
  name: string;
  max?: number;
  wires: DistWire[];
  total: number;
  /** Fili senza sezione indicata */
  unknown: number;
  status: 'libera' | 'ok' | 'superata' | 'non indicata';
  placed: boolean;
}

/** Fili che arrivano a ogni ingresso e uscita dei ripartitori, con la somma delle sezioni e lo stato */
export function distSlots(project: Project, nets?: ReturnType<typeof computeNetlist>): DistSlot[] {
  if (!project.distributors?.length) return [];
  const nl = nets ?? computeNetlist(project);
  // Punti di connessione di ogni pagina (sigla:punto), dove i rami dei fili si fermano
  const stopsOf = new Map<string, Map<string, { ref: string; inst: string }>>();
  for (const n of nl.nets) for (const x of n.pins) {
    const m = stopsOf.get(x.el.page.id) ?? stopsOf.set(x.el.page.id, new Map()).get(x.el.page.id)!;
    m.set(key(x.pos), { ref: x.ref, inst: x.el.inst.id });
  }
  const placed = new Map<string, { inst: SymbolInstance; sym: SymbolDef; page: Page }>();
  for (const page of project.pages) for (const e of page.elements) {
    if (e.kind !== 'symbol' || !isDistSymbol(e.symbolId)) continue;
    const sym = getSymbol(e.symbolId, project);
    if (sym) placed.set(e.symbolId, { inst: e, sym, page });
  }
  // Con l'ordine dei collegamenti scelto (a mano o con i nodi a T) dal foro partono solo i fili verso i
  // punti collegati al foro; gli altri sono in catena dopo
  const ctx = sequenceContext(project);
  const pinNet = new Map(nl.nets.flatMap(n => n.pins.map(x => [`${x.el.inst.id}|${x.pinId}`, n] as const)));
  const fromHole = (instId: string, pinId: string): Set<string> | undefined => {
    const net = pinNet.get(`${instId}|${pinId}`);
    if (!net) return undefined;
    const seq = netSequence(ctx, net);
    if (seq.mode !== 'manual' && seq.mode !== 'tnode') return undefined;
    const mine = (x: { el: { inst: { id: string } }; pinId: string }) => x.el.inst.id === instId && x.pinId === pinId;
    return new Set(seq.pairs.flatMap(([a, b]) => (mine(a) ? [b.ref] : mine(b) ? [a.ref] : [])));
  };
  const out: DistSlot[] = [];
  for (const d of project.distributors) {
    d.groups.forEach((g, gi) => {
      const pl = placed.get(distSymbolId(d, gi));
      const pts = pl ? new Map(pinsWorld(pl.inst, pl.sym).map(w => [w.pin.id, { x: w.x, y: w.y }])) : undefined;
      const slot = (k: number | 'in', max?: number): DistSlot => {
        const at = pts?.get(k === 'in' ? 'in' : `o${k + 1}`);
        const wires: DistWire[] = [];
        if (pl && at) {
          // Si fermano sui punti degli altri elementi (non su quelli di questo gruppo)
          const stops = new Map([...(stopsOf.get(pl.page.id) ?? new Map<string, { ref: string; inst: string }>())].filter(([, v]) => v.inst !== pl.inst.id).map(([kk, v]) => [kk, v.ref]));
          const only = fromHole(pl.inst.id, k === 'in' ? 'in' : `o${k + 1}`);
          for (const b of branchesFrom(pl.page, at, stops)) {
            if (only && !only.has(b.to)) continue;
            const net = nl.wireNet.get(b.wire.id);
            wires.push({ wire: b.wire, cross: crossNum(b.wire.cross), to: `-${b.to}`, wireNo: net?.wireNo ?? '', loc: `${pl.page.name}.${columnOf(at.x)}` });
          }
        }
        const total = wires.reduce((a, w) => a + (w.cross ?? 0), 0), unknown = wires.filter(w => w.cross === undefined).length;
        const status = !wires.length ? 'libera' : max === undefined ? 'non indicata' : total > max + 1e-6 ? 'superata' : 'ok';
        return { d, gi, k, name: k === 'in' ? `${g.name} (ingresso)` : outName(g, k), max, wires, total, unknown, status, placed: !!pl };
      };
      out.push(slot('in', crossNum(g.inMax)));
      g.outs.forEach((o, k) => out.push(slot(k, crossNum(o))));
    });
  }
  return out;
}

/** Righe di occupazione per la lista e la vista: ripartitore, uscita, sezione massima, fili, totale, stato */
export function slotRow(s: DistSlot): string[] {
  return [`-${s.d.tag}`, s.name, s.max !== undefined ? fmt(s.max) : '', String(s.wires.length), s.wires.length ? fmt(s.total) + (s.unknown ? ` + ${s.unknown}?` : '') : '',
    s.wires.map(w => w.to).filter(Boolean).join(' · '), s.status];
}
export const SLOT_COLUMNS = ['Ripartitore', 'Uscita', 'Sez. max (mm²)', 'Fili', 'Sez. totale (mm²)', 'Destinazioni', 'Stato'];
