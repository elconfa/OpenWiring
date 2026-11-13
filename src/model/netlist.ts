// Calcolo della connettività: fili, punti di connessione, potenziali e rimandi.
import type { Page, Project, Pt, Wire } from './types';
import { columnOf } from './types';
import { settingsOf, formatPattern, counterOf, panelCodeOf } from './numbering';
import { keyOf, onSegmentInterior } from './geometry';
import { allPlaced, effectivePinLabels, stripOf, type PlacedElement } from './devices';
import { linkPartners } from './links';
import { bundleTaps, isBundle } from './bundles';
import { cardByTag, channelName, cardFormat, parseChannel } from './plc';
import { netSequence, sequenceContext, type SeqMode } from './wiringOrder';

class UnionFind {
  private parent = new Map<string, string>();
  find(a: string): string {
    if (!this.parent.has(a)) { this.parent.set(a, a); return a; }
    let root = a;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Compressione del percorso
    while (a !== root) { const next: string = this.parent.get(a)!; this.parent.set(a, root); a = next; }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export interface NetPin {
  el: PlacedElement;
  pinId: string;
  label: string;
  /** "K1:13" oppure "X1:3" */
  ref: string;
  pos: Pt;
}

export interface Net {
  id: string;
  name: string;
  /** true se il nome deriva da un punto di potenziale */
  named: boolean;
  /** Numero filo (es. "200.01"), oppure il nome del potenziale; vuoto se la rete non ha fili */
  wireNo: string;
  /** Conduttore di scorta: un suo filo è segnato «di scorta»; nessun numero filo */
  spare?: boolean;
  pins: NetPin[];
  wires: { wire: Wire; pageId: string }[];
  /** Punti di potenziale e rimandi collegati (per i controlli di cortocircuito) */
  potentials?: string[];
  links?: string[];
  /** Rimandi collegati (id delle istanze): il loro nome è il numero filo */
  linkIds?: string[];
  /** Il numero filo viene dall'indirizzo del canale PLC collegato (impostazione wirePlcNames) */
  plcNamed?: boolean;
  /**
   * Gruppo di numerazione: conduttori uniti da elementi attraversati dal numero filo (morsetti).
   * Restano conduttori distinti, ma con lo stesso numero, colore e sezione.
   */
  group: string;
}

export interface NetlistResult {
  nets: Net[];
  /** wireId → net */
  wireNet: Map<string, Net>;
  /** pageId → punti di giunzione (nodi a T) da disegnare con il pallino */
  junctions: Map<string, Pt[]>;
}

const nodeKey = (pageId: string, p: Pt) => `${pageId}|${keyOf(p)}`;

/**
 * Calcoli che leggono il progetto senza modificarlo (derive, liste): dentro withNetlistCache i
 * conduttori del progetto si calcolano una volta sola, anche se li chiedono più funzioni.
 */
let cache: { project: Project; result?: NetlistResult } | null = null;
export function withNetlistCache<T>(project: Project, fn: () => T): T {
  if (cache?.project === project) return fn();
  const prev = cache;
  cache = { project };
  try { return fn(); } finally { cache = prev; }
}

/** Dopo una modifica che cambia i collegamenti (nomi dei rimandi, fili): la rete in cache non vale più */
export function invalidateNetlist(project: Project): void {
  if (cache?.project === project) cache.result = undefined;
}

export function computeNetlist(project: Project): NetlistResult {
  if (cache?.project === project) return (cache.result ??= computeNetlistNow(project));
  return computeNetlistNow(project);
}

function computeNetlistNow(project: Project): NetlistResult {
  const uf = new UnionFind();
  const junctions = new Map<string, Pt[]>();
  const labels = effectivePinLabels(project);

  for (const page of project.pages) {
    // I bus di conduttori non uniscono i fili che toccano: lo fanno solo i conduttori con lo stesso nome (sotto)
    const wires = page.elements.filter((e): e is Wire => e.kind === 'wire' && !isBundle(e));
    const degree = new Map<string, { p: Pt; n: number }>();
    const bump = (p: Pt, n = 1) => {
      const k = keyOf(p);
      const d = degree.get(k);
      if (d) d.n += n; else degree.set(k, { p, n });
    };
    for (const w of wires) {
      const wk = `wire|${w.id}`;
      for (const p of w.points) uf.union(wk, nodeKey(page.id, p));
      bump(w.points[0]); bump(w.points[w.points.length - 1]);
      for (let i = 1; i < w.points.length - 1; i++) bump(w.points[i], 2);
    }
    // Giunzioni a T: estremo di un filo che cade all'interno di un segmento di un altro filo
    for (const w of wires) {
      for (const end of [w.points[0], w.points[w.points.length - 1]]) {
        for (const o of wires) {
          if (o === w) continue;
          for (let i = 0; i < o.points.length - 1; i++) {
            if (onSegmentInterior(end, o.points[i], o.points[i + 1])) {
              uf.union(nodeKey(page.id, end), `wire|${o.id}`);
              bump(end, 2);
            }
          }
        }
      }
    }
    junctions.set(page.id, [...degree.values()].filter(d => d.n >= 3).map(d => d.p));
  }

  // Bus di conduttori: i fili che entrano con lo stesso nome nello stesso bus sono un conduttore
  for (const t of bundleTaps(project).taps) if (t.name) uf.union(nodeKey(t.pageId, t.at), `cbus|${t.group}|${t.name}`);

  // Lo schema unifilare è una rappresentazione: i suoi simboli non entrano nei conduttori
  const placed = allPlaced(project).filter(el => el.sym.role !== 'oneline' && el.page.type !== 'singleline');
  for (const el of placed) {
    el.sym.pins.forEach(pin => {
      const pk = `pin|${el.inst.id}|${pin.id}`;
      uf.union(pk, nodeKey(el.page.id, worldPin(el, pin)));
      // Potenziali con lo stesso nome sono lo stesso conduttore su tutte le pagine
      if (el.sym.role === 'potential' && el.inst.tag) uf.union(pk, `pot|${el.inst.tag}`);
    });
  }
  // Rimandi: il conduttore prosegue nel rimando corrispondente
  const placedById = new Map(placed.map(e => [e.inst.id, e]));
  for (const [id, partners] of linkPartners(project, placed)) {
    const el = placedById.get(id);
    const pin = el?.sym.pins[0];
    if (!pin) continue;
    for (const o of partners) if (o.sym.pins[0]) uf.union(`pin|${id}|${pin.id}`, `pin|${o.inst.id}|${o.sym.pins[0].id}`);
  }

  const nets = new Map<string, Net>();
  const getNet = (root: string) => {
    let n = nets.get(root);
    if (!n) { n = { id: root, name: '', named: false, wireNo: '', pins: [], wires: [], group: root }; nets.set(root, n); }
    return n;
  };
  const potentialName = new Map<string, string>();
  const linkName = new Map<string, string>();
  for (const el of placed) {
    for (const pin of el.sym.pins) {
      const root = uf.find(`pin|${el.inst.id}|${pin.id}`);
      if (el.sym.role === 'potential') {
        if (el.inst.tag) { potentialName.set(root, el.inst.tag); const n = getNet(root); if (!(n.potentials ??= []).includes(el.inst.tag)) n.potentials.push(el.inst.tag); }
        continue;
      }
      if (el.sym.role === 'link') {
        const n = getNet(root);
        (n.linkIds ??= []).push(el.inst.id);
        if (el.inst.tag) { linkName.set(root, el.inst.tag); if (!(n.links ??= []).includes(el.inst.tag)) n.links.push(el.inst.tag); }
        continue;
      }
      const label = labels.get(el.inst.id)?.[pin.id] ?? pin.label;
      const tag = el.sym.role === 'terminal' || el.sym.role === 'pin' ? el.inst.tag : `${el.inst.tag}:${label}`;
      getNet(root).pins.push({ el, pinId: pin.id, label, ref: tag, pos: worldPin(el, pin) });
    }
  }
  const wireNet = new Map<string, Net>();
  for (const page of project.pages) {
    for (const e of page.elements) {
      if (e.kind !== 'wire' || isBundle(e)) continue;
      const net = getNet(uf.find(`wire|${e.id}`));
      net.wires.push({ wire: e, pageId: page.id });
      wireNet.set(e.id, net);
    }
  }
  let auto = 0;
  const pageIndex = new Map(project.pages.map((p, i) => [p.id, i]));
  const ordered = [...nets.values()].sort((a, b) => firstPos(a, pageIndex) - firstPos(b, pageIndex));
  for (const n of ordered) {
    const pot = potentialName.get(n.id);
    if (pot) { n.name = pot; n.named = true; }
    else n.name = linkName.get(n.id) ?? `N${++auto}`;
  }
  const result = ordered.filter(n => n.pins.length > 0 || n.wires.length > 0);
  // Gruppi di numerazione: i morsetti (e gli elementi con "il numero filo passa") uniscono i conduttori ai loro morsetti
  const groups = new UnionFind();
  for (const el of placed) {
    if (!wirePasses(el) || el.sym.pins.length < 2) continue;
    const roots = el.sym.pins.map(pin => uf.find(`pin|${el.inst.id}|${pin.id}`));
    for (let i = 1; i < roots.length; i++) groups.union(roots[0], roots[i]);
  }
  for (const n of result) n.group = groups.find(n.id);
  numberWires(project, result);
  return { nets: result, wireNet, junctions };
}

/**
 * Numeri filo: un numero per conduttore (rete), assegnato sulla pagina dove il conduttore
 * compare per primo, in ordine di colonna (da sinistra a destra) e poi dall'alto in basso.
 * I numeri già fissati sui fili (bloccati o manuali) restano invariati: i conduttori nuovi
 * ricevono il primo numero dopo il più alto già usato, così gli altri non scalano.
 */
/** Il numero filo attraversa l'elemento? (morsetti sì, salvo diversa scelta sull'elemento) */
export function wirePasses(el: { inst: { wirePass?: boolean }; sym: { role: string; id?: string } }): boolean {
  return el.inst.wirePass ?? defaultWirePass(el.sym);
}

/** Di serie il numero filo passa per i morsetti e per i gruppi dei ripartitori (ingresso e uscite dello stesso polo) */
export const defaultWirePass = (sym: { role: string; id?: string }) => sym.role === 'terminal' || !!sym.id?.startsWith('dist:');

function numberWires(project: Project, all: Net[]) {
  // Un numero per gruppo: il gruppo si numera come un solo conduttore (con tutti i suoi fili)
  const byGroup = new Map<string, Net[]>();
  for (const n of all) { const g = byGroup.get(n.group); if (g) g.push(n); else byGroup.set(n.group, [n]); }
  const nets: Net[] = [];
  const copies: [Net, Net[]][] = [];
  for (const g of byGroup.values()) {
    if (g.length === 1) { nets.push(g[0]); continue; }
    const lead = g.find(n => fixedNumber(n)) ?? g.find(n => n.named) ?? g[0];
    const named = g.find(n => n.named);
    const links = [lead, ...g.filter(n => n !== lead)].flatMap(n => n.links ?? []);
    const copy: Net = { ...lead, wires: [lead, ...g.filter(n => n !== lead)].flatMap(n => n.wires), pins: g.flatMap(n => n.pins), named: !!named, name: named?.name ?? lead.name, links: links.length ? [...new Set(links)] : undefined };
    nets.push(copy);
    copies.push([copy, g]);
  }
  numberGroups(project, nets);
  for (const [copy, g] of copies) for (const m of g) { m.wireNo = copy.wireNo; if (copy.plcNamed) m.plcNamed = true; if (copy.spare) m.spare = true; }
}

function numberGroups(project: Project, nets: Net[]) {
  const s = settingsOf(project);
  const singleline = new Set(project.pages.filter(p => p.type === 'singleline').map(p => p.id));
  const pageIdx = new Map(project.pages.map((p, i) => [p.id, i]));
  // Per righe: prima dall'alto in basso, poi da sinistra a destra; per colonne il contrario
  const rows = s.wireOrder === 'rows';
  const cmp = (p: Pt, q: Pt) => (rows ? p.y - q.y || p.x - q.x : p.x - q.x || p.y - q.y);
  const anchored: { net: Net; pi: number; p: Pt }[] = [];
  const fixed: { net: Net; pi: number }[] = [];
  for (const n of nets) {
    // I collegamenti di rete/bus e le linee dell'unifilare non hanno numero filo
    if (!n.wires.length || n.wires.every(w => w.wire.bus || singleline.has(w.pageId))) continue;
    let best: { pi: number; p: Pt } | undefined;
    for (const w of n.wires) {
      const pi = pageIdx.get(w.pageId) ?? 0;
      for (const p of w.wire.points) {
        if (!best || pi < best.pi || (pi === best.pi && cmp(p, best.p) < 0)) best = { pi, p };
      }
    }
    // Conduttore di scorta: nessun numero filo
    if (n.wires.some(w => w.wire.spare)) { n.spare = true; n.wireNo = ''; continue; }
    if (n.named && s.wireKeepPotentialNames) { n.wireNo = n.name; continue; }
    // Filo collegato a un canale PLC: il nome è l'indirizzo (prima del numero fissato e del rimando)
    const plc = s.wirePlcNames && !n.named ? plcWireName(project, n) : undefined;
    if (plc) { n.wireNo = plc; n.plcNamed = true; fixed.push({ net: n, pi: best!.pi }); continue; }
    // Filo collegato a un rimando: il numero è sempre il nome del rimando
    const manual = n.links?.[0] ?? fixedNumber(n);
    if (manual) { n.wireNo = manual; fixed.push({ net: n, pi: best!.pi }); continue; }
    anchored.push({ net: n, ...best! });
  }
  // Contatore per pagina, per quadro o unico
  const scopeOf = (page: Page) => (s.wireScope === 'page' ? page.id : s.wireScope === 'panel' ? page.panelId ?? '' : '');
  const fixedOf = (page: Page) => (s.wireScope === 'page' ? { pagina: page.name } : s.wireScope === 'panel' && /\{quadro\}/.test(s.wireFormat) ? { quadro: panelCodeOf(project, page) } : {});
  const name = (page: Page, p: Pt, n: number) => formatPattern(s.wireFormat, { pagina: page.name, colonna: columnOf(p.x), lettera: '', n, quadro: panelCodeOf(project, page) });
  // Numeri già occupati: il più alto per contatore e per pagina, e tutti quelli usati. Si saltano anche i
  // numeri scritti uguali (es. il rimando 1010.03 messo a pagina 10 vale per la pagina 1010)
  const counters = new Map<string, number>();
  const pageTop = new Map<number, number>();
  const used = new Set<string>();
  const taken = new Set(fixed.map(f => f.net.wireNo));
  const free = (page: Page, p: Pt, key: string, n: number) => !used.has(`${key}|${n}`) && !taken.has(name(page, p, n));
  for (const f of fixed) {
    const page = project.pages[f.pi];
    const key = scopeOf(page);
    const v = counterOf(s.wireFormat, fixedOf(page), f.net.wireNo!);
    if (v === undefined) continue;
    counters.set(key, Math.max(counters.get(key) ?? 0, v));
    pageTop.set(f.pi, Math.max(pageTop.get(f.pi) ?? 0, v));
    used.add(`${key}|${v}`);
  }
  anchored.sort((a, b) => a.pi - b.pi || cmp(a.p, b.p));
  const reserve = s.wireScope !== 'page' ? Math.max(0, Math.floor(s.wireReserve ?? 0)) : 0;
  if (!reserve) {
    for (const a of anchored) {
      const page = project.pages[a.pi];
      const key = scopeOf(page);
      let n = counters.get(key) ?? 0;
      do n++; while (!free(page, a.p, key, n));
      counters.set(key, n);
      a.net.wireNo = name(page, a.p, n);
    }
    return;
  }
  // Con la riserva ogni pagina continua la propria serie: parte dopo la fine della pagina precedente
  // più i numeri di riserva, o dopo il suo numero più alto già fissato; salta i numeri già usati
  const byPage = new Map<number, typeof anchored>();
  for (const a of anchored) { const l = byPage.get(a.pi); if (l) l.push(a); else byPage.set(a.pi, [a]); }
  const end = new Map<string, number>();
  for (let pi = 0; pi < project.pages.length; pi++) {
    const mine = byPage.get(pi) ?? [];
    const top = pageTop.get(pi);
    if (!mine.length && top === undefined) continue;
    const page = project.pages[pi];
    const key = scopeOf(page);
    let n = Math.max(end.has(key) ? end.get(key)! + reserve : 0, top ?? 0);
    for (const a of mine) {
      do n++; while (!free(page, a.p, key, n));
      a.net.wireNo = name(page, a.p, n);
    }
    end.set(key, n);
  }
}

/**
 * Nome del filo dall'indirizzo del canale PLC collegato: l'indirizzo (es. I0.3) e, se il punto I/O ha
 * più morsetti per canale, la lettera del morsetto (I0.3A, I0.3B). Solo se il conduttore tocca un
 * solo morsetto di un canale PLC: un comune collegato a più canali resta numerato come gli altri.
 */
export function plcWireName(project: Project, n: Pick<Net, 'pins'>): string | undefined {
  const plc = n.pins.filter(p => p.el.sym.role === 'plc' && parseChannel(p.el.inst.plcChannel));
  const one = new Set(plc.map(p => `${p.el.inst.id}|${p.pinId}`));
  if (one.size !== 1) return undefined;
  const p = plc[0];
  const card = cardByTag(project, p.el.inst.tag);
  if (!card) return undefined;
  // Con TwinCAT (%I* uguale per tutti) il nome è sigla della scheda e canale, es. 400A1.DI3
  const addr = channelName(card, p.el.inst.plcChannel!, cardFormat(project, card));
  if (!addr) return undefined;
  const k = p.el.sym.pins.findIndex(q => q.id === p.pinId);
  return p.el.sym.pins.length > 1 && k >= 0 ? `${addr}${String.fromCharCode(65 + k)}` : addr;
}

/**
 * Rimandi dei fili con il nome dall'indirizzo PLC: prendono lo stesso nome (dentro un commit, a ogni
 * modifica, con l'impostazione attiva). Restituisce quanti rimandi sono stati rinominati.
 */
export function syncPlcLinkNames(project: Project): number {
  if (!settingsOf(project).wirePlcNames) return 0;
  const nl = computeNetlist(project);
  const names = new Map<string, string>();
  for (const n of nl.nets) if (n.plcNamed && n.wireNo) for (const id of n.linkIds ?? []) names.set(id, n.wireNo);
  if (!names.size) return 0;
  let changed = 0;
  for (const pg of project.pages) for (const e of pg.elements) {
    const name = e.kind === 'symbol' ? names.get(e.id) : undefined;
    if (name && e.kind === 'symbol' && e.tag !== name) { e.tag = name; changed++; }
  }
  return changed;
}

/** Numero fissato su uno dei fili del conduttore (il primo in ordine di disegno) */
function fixedNumber(n: Net): string | undefined {
  return n.wires.find(w => w.wire.number)?.wire.number;
}

/**
 * Blocca la numerazione: scrive su un filo di ogni conduttore il numero attuale, così le
 * modifiche successive non lo cambiano. Se due conduttori numerati vengono uniti resta il
 * primo numero. Restituisce quanti conduttori sono stati bloccati ora.
 */
export function lockWireNumbers(project: Project): number {
  const s = settingsOf(project);
  const nl = computeNetlist(project);
  let locked = 0;
  for (const n of nl.nets) {
    if (!n.wires.length || (!n.wireNo && !fixedNumber(n))) continue;
    if (n.named && s.wireKeepPotentialNames && !fixedNumber(n)) continue;
    // Il numero viene dal rimando: non si scrive sul filo
    if (n.links?.length) continue;
    // Il numero del gruppo (uguale a quello fissato, se il conduttore non attraversa morsetti)
    const keep = n.wireNo || fixedNumber(n)!;
    const target = n.wires.find(w => w.wire.number === keep)?.wire ?? n.wires[0].wire;
    if (target.number !== keep) locked++;
    target.number = keep;
    for (const { wire } of n.wires) if (wire !== target && wire.number) delete wire.number;
  }
  return locked;
}

/** Toglie tutti i numeri fissati: la numerazione viene ricalcolata da capo */
export function clearWireNumbers(project: Project) {
  for (const pg of project.pages) for (const e of pg.elements) if (e.kind === 'wire') delete e.number;
}

function worldPin(el: PlacedElement, pin: { x: number; y: number }): Pt {
  const { inst } = el;
  let x = inst.mirror ? -pin.x : pin.x;
  let y = pin.y;
  switch (inst.rot) {
    case 90: [x, y] = [-y, x]; break;
    case 180: [x, y] = [-x, -y]; break;
    case 270: [x, y] = [y, -x]; break;
  }
  return { x: inst.x + x, y: inst.y + y };
}

function firstPos(n: Net, pageIndex: Map<string, number>): number {
  const p = n.pins[0];
  if (p) return p.el.pageIndex * 1e6 + p.pos.x * 1e3 + p.pos.y;
  const w = n.wires[0];
  return w ? (pageIndex.get(w.pageId) ?? 0) * 1e6 + w.wire.points[0].x * 1e3 + w.wire.points[0].y : 0;
}

/** Collegamenti punto-punto: in ogni rete i punti vengono concatenati in ordine di posizione */
export interface Connection {
  net: string;
  wireNo: string;
  from: string;
  to: string;
  fromLoc: string;
  toLoc: string;
  cross?: string;
  color?: string;
  /** Filo che realizza il collegamento (per cavo e conduttore) */
  wireId?: string;
  /** Da dove viene la sequenza di cablaggio (vedi wiringOrder.ts); assente sulle linee di potenziale */
  seq?: SeqMode;
}

/**
 * Collegamenti da–a. Con il progetto la sequenza segue l'ordine scelto a mano, i nodi a T con verso e i
 * ripartitori (wiringOrder.ts); senza, i punti di ogni conduttore si concatenano per posizione
 */
export function connections(result: NetlistResult, project?: Project): Connection[] {
  const ctx = project ? sequenceContext(project) : undefined;
  const out: Connection[] = [];
  // Colore e sezione del conduttore (gruppo), per i tratti che non li hanno scritti
  const gColor = new Map<string, string>(), gCross = new Map<string, string>();
  for (const n of result.nets) for (const { wire } of n.wires) {
    if (wire.color && !gColor.has(n.group)) gColor.set(n.group, wire.color);
    if (wire.cross && !gCross.has(n.group)) gCross.set(n.group, wire.cross);
  }
  for (const n of result.nets) {
    // I collegamenti di rete vanno nella lista collegamenti di rete
    if (n.wires.length && n.wires.every(w => w.wire.bus)) continue;
    const pins = [...n.pins].sort((a, b) => a.el.pageIndex - b.el.pageIndex || a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    if (n.named) {
      // Linea di potenziale: ogni dispositivo è collegato al potenziale, non al dispositivo vicino
      for (const p of pins) {
        const w = wireAt(n, p, p);
        out.push({
          net: n.name, wireNo: n.wireNo, from: n.name, to: `-${p.ref}`, fromLoc: '', toLoc: p.el.page.name,
          cross: w?.cross ?? gCross.get(n.group), color: w?.color ?? gColor.get(n.group), wireId: (w ?? wireTouching(n, p))?.id,
        });
      }
      continue;
    }
    const seq = ctx ? netSequence(ctx, n) : undefined;
    const pairs = seq?.pairs ?? pins.slice(1).map((p, i) => [pins[i], p] as const);
    for (const [a, b] of pairs) {
      // Sezione e colore del tratto che arriva a questi punti (possono variare nello stesso conduttore)
      const w = wireAt(n, a, b);
      out.push({
        net: n.name, wireNo: n.wireNo,
        from: `-${a.ref}`, to: `-${b.ref}`,
        fromLoc: `${a.el.page.name}`, toLoc: `${b.el.page.name}`,
        cross: w?.cross ?? gCross.get(n.group), color: w?.color ?? gColor.get(n.group), wireId: (w ?? wireTouching(n, b) ?? wireTouching(n, a))?.id,
        ...(seq ? { seq: seq.mode } : {}),
      });
    }
  }
  return out;
}

/** Un filo qualsiasi del conduttore che tocca il punto di connessione */
function wireTouching(n: Net, p: NetPin): Wire | undefined {
  return n.wires.find(w => w.pageId === p.el.page.id && w.wire.points.some(q => Math.abs(q.x - p.pos.x) < 0.01 && Math.abs(q.y - p.pos.y) < 0.01))?.wire;
}

/**
 * Filo di un conduttore che tocca i punti di connessione indicati: preferisce quello che li
 * tocca entrambi, poi quello sul punto di arrivo, poi quello sul punto di partenza.
 */
function wireAt(n: Net, a: NetPin, b: NetPin): Wire | undefined {
  const touches = (w: { wire: Wire; pageId: string }, p: NetPin) =>
    w.pageId === p.el.page.id && w.wire.points.some(q => Math.abs(q.x - p.pos.x) < 0.01 && Math.abs(q.y - p.pos.y) < 0.01);
  const withData = n.wires.filter(w => w.wire.cross || w.wire.color);
  return (withData.find(w => touches(w, a) && touches(w, b))
    ?? withData.find(w => touches(w, b))
    ?? withData.find(w => touches(w, a)))?.wire;
}

export { stripOf };

/** Potenziale di un filo: tutti i conduttori collegati, anche oltre rimandi, potenziali e morsetti */
export interface PotentialInfo {
  name: string;
  wireIds: Set<string>;
  /** Punti di connessione toccati, per pagina */
  pins: { pageId: string; pos: Pt }[];
  /** Pagine in cui compare, nell'ordine del progetto */
  pageIds: string[];
}

export function potentialOf(project: Project, result: NetlistResult, wireId: string): PotentialInfo | undefined {
  const net = result.wireNet.get(wireId);
  if (!net) return undefined;
  const nets = result.nets.filter(n => n.group === net.group);
  const wireIds = new Set(nets.flatMap(n => n.wires.map(w => w.wire.id)));
  const pins = nets.flatMap(n => n.pins.map(p => ({ pageId: p.el.page.id, pos: p.pos })));
  const on = new Set([...nets.flatMap(n => n.wires.map(w => w.pageId)), ...pins.map(p => p.pageId)]);
  return { name: net.wireNo || net.name, wireIds, pins, pageIds: project.pages.filter(p => on.has(p.id)).map(p => p.id) };
}
