// Cavi multipolari: linee di definizione sullo schema, conduttori assegnati ai fili
// attraversati, lista cavi e collegamenti dei cavi.
import type { Project, Cable, CableLine, CableMarking, Part, Wire, Pt, Page } from './types';
import { columnOf } from './types';
import { computeNetlist, type Net } from './netlist';
import { uid, getSymbol, pinsWorld } from './geometry';
import { nextTagFor } from './numbering';
import { bundleTaps, isBundle } from './bundles';

/** Colori standard dei cavi per numero di conduttori (HD 308, con il giallo-verde) */
const COLOR_SETS: Record<number, string[]> = {
  2: ['BN', 'BU'],
  3: ['BN', 'BU', 'GNYE'],
  4: ['BN', 'BK', 'GY', 'GNYE'],
  5: ['BN', 'BK', 'GY', 'BU', 'GNYE'],
};

/** Conduttori proposti per un cavo nuovo: colori fino a 5, oltre numerati con il giallo-verde */
export function defaultConductors(n: number, withPe = true): string[] {
  if (n <= 5 && COLOR_SETS[n] && (withPe || n < 3)) return [...COLOR_SETS[n]];
  const count = withPe ? n - 1 : n;
  return [...Array.from({ length: Math.max(1, count) }, (_, i) => String(i + 1)), ...(withPe ? ['GNYE'] : [])];
}

/**
 * Colori dei cavi con molti conduttori (DIN 47100, i cavi di comando e segnale): dopo i dieci
 * colori semplici vengono le coppie di colori. Oltre i 44 si riparte con i numeri.
 */
const DIN_47100 = ['WH', 'BN', 'GN', 'YE', 'GY', 'PK', 'BU', 'RD', 'BK', 'VT', 'GY-PK', 'RD-BU', 'WH-GN', 'BN-GN', 'WH-YE', 'YE-BN',
  'WH-GY', 'GY-BN', 'WH-PK', 'PK-BN', 'WH-BU', 'BN-BU', 'WH-RD', 'BN-RD', 'WH-BK', 'BN-BK', 'GY-GN', 'YE-GY', 'PK-GN', 'YE-PK',
  'GN-BU', 'YE-BU', 'GN-RD', 'YE-RD', 'GN-BK', 'YE-BK', 'GY-BU', 'PK-BU', 'GY-RD', 'PK-RD', 'GY-BK', 'PK-BK', 'BU-BK', 'RD-BK'];

export const isPeName = (n: string) => /^(GNYE|GN-YE|YEGN|YE-GN|PE)$/i.test(n.trim());

/** Conduttori di un cavo nuovo con la marcatura scelta: numeri (1…n) o colori, con o senza giallo-verde */
export function conductorsFor(n: number, withPe: boolean, marking: CableMarking): string[] {
  const count = Math.max(1, withPe ? n - 1 : n);
  if (marking === 'colors') {
    if (n <= 5 && COLOR_SETS[n] && (withPe || n < 3)) return [...COLOR_SETS[n]];
    return [...Array.from({ length: count }, (_, i) => DIN_47100[i] ?? String(i + 1)), ...(withPe ? ['GNYE'] : [])];
  }
  return [...Array.from({ length: count }, (_, i) => String(i + 1)), ...(withPe ? ['GNYE'] : [])];
}

/** Marcatura del cavo: quella scelta, altrimenti dedotta dai nomi dei conduttori */
export function markingOf(c: Pick<Cable, 'conductors' | 'marking'>): CableMarking {
  if (c.marking) return c.marking;
  const others = c.conductors.filter(n => !isPeName(n));
  return others.length && others.every(n => /^\d+$/.test(n)) ? 'numbers' : 'colors';
}

/** Le scelte fatte a mano (filo → conduttore) seguono la posizione del conduttore quando i nomi cambiano */
export function followAssign(c: Cable, conductors: string[]): Record<string, string> {
  const assign: Record<string, string> = {};
  for (const [w, n] of Object.entries(c.assign)) {
    const i = c.conductors.indexOf(n);
    assign[w] = i >= 0 && conductors[i] !== undefined ? conductors[i] : n;
  }
  return assign;
}

/** Cambio di marcatura: stesso numero di conduttori e stesso giallo-verde, nomi rifatti */
export function remarkCable(c: Cable, marking: CableMarking): Pick<Cable, 'conductors' | 'marking' | 'assign'> {
  const conductors = conductorsFor(c.conductors.length, c.conductors.some(isPeName), marking);
  return { conductors, marking, assign: followAssign(c, conductors) };
}

/** Dati del cavo presi da un articolo cavo (tipologia): tutti i conduttori, sezione, schermo */
export function cableFromPart(c: Cable, part: Part): Partial<Cable> {
  const patch: Partial<Cable> = { partNr: part.partNr, type: part.typeNr || part.descr1 || part.partNr };
  const pc = part.cable;
  if (!pc?.conductors.length) return patch;
  // Anche i conduttori fissati dalla numerazione automatica seguono i nomi nuovi per posizione
  return { ...patch, conductors: [...pc.conductors], marking: pc.marking, cross: pc.cross ?? c.cross, shield: pc.shield, assign: followAssign(c, pc.conductors), fixed: followFixed(c, pc.conductors) };
}

/** Il cavo ha conduttori diversi da quelli del suo articolo (articolo cambiato dopo averlo scelto) */
export const differsFromPart = (c: Pick<Cable, 'conductors'>, part?: Part) =>
  !!part?.cable?.conductors.length && part.cable.conductors.join('\u0000') !== c.conductors.join('\u0000');

/**
 * Cavi che usano l'articolo: prendono i conduttori, la marcatura, la sezione e lo schermo dell'articolo
 * cambiato; i fili restano sullo stesso conduttore per posizione (il 17° numero diventa il 17° colore).
 * Restituisce le sigle dei cavi cambiati.
 */
export function syncCablesWithPart(project: Project, part: Part): string[] {
  const out: string[] = [];
  for (const c of project.cables ?? []) {
    if (c.partNr !== part.partNr || !differsFromPart(c, part)) continue;
    Object.assign(c, cableFromPart(c, part));
    if (!c.fixed) delete c.fixed;
    out.push(c.tag);
  }
  return out;
}

/** Conduttori fissati che seguono i nomi nuovi per posizione */
function followFixed(c: Cable, conductors: string[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [w, n] of Object.entries(c.fixed ?? {})) {
    const i = c.conductors.indexOf(n);
    if (i >= 0 && conductors[i] !== undefined) out[w] = conductors[i];
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Cavo da ordinare a pezzi (confezionato, con connettore saldato): quello scelto sul cavo, poi
 * quello dell'articolo. Gli altri si ordinano a metri.
 */
export const cableByPiece = (c: Pick<Cable, 'pieces'>, part?: Part) => c.pieces ?? !!part?.cable?.pieces;

/** Colori CSS dei codici IEC 60757 */
const CSS: Record<string, string> = {
  BK: '#1a1a1a', BN: '#7b4a1e', RD: '#d32f2f', OG: '#f57c00', YE: '#fdd835', GN: '#2e9e44', BU: '#1e63c8', VT: '#7b3fb0',
  GY: '#8c8c8c', WH: '#f4f4f4', PK: '#f48fb1', TQ: '#26c6da', GD: '#c9a227', SR: '#c0c0c0',
};
/** Nomi e sigle italiane dei colori */
const ALIAS: Record<string, string> = {
  NERO: 'BK', NE: 'BK', MARRONE: 'BN', MA: 'BN', ROSSO: 'RD', RO: 'RD', ARANCIO: 'OG', ARANCIONE: 'OG', AR: 'OG',
  GIALLO: 'YE', GI: 'YE', VERDE: 'GN', VE: 'GN', BLU: 'BU', AZZURRO: 'BU', BL: 'BU', VIOLA: 'VT', VI: 'VT',
  GRIGIO: 'GY', GR: 'GY', BIANCO: 'WH', BI: 'WH', ROSA: 'PK', RS: 'PK', TURCHESE: 'TQ', ORO: 'GD', ARGENTO: 'SR',
};

/** Colori di un conduttore ("BN", "WH-GN", "giallo-verde", "nero"…) per il riquadrino; vuoto se è un numero */
export function conductorColors(name: string): string[] {
  const up = name.trim().toUpperCase();
  if (isPeName(up) || /^(GIALLO-?VERDE|GV)$/.test(up)) return [CSS.GN, CSS.YE];
  const out: string[] = [];
  for (const p of up.split(/[-/+ ]+/).filter(Boolean)) {
    const k = ALIAS[p] ?? p;
    if (CSS[k]) out.push(CSS[k]);
    // Coppia scritta attaccata, es. "WHGN"
    else if (p.length === 4 && CSS[p.slice(0, 2)] && CSS[p.slice(2)]) out.push(CSS[p.slice(0, 2)], CSS[p.slice(2)]);
    else return [];
  }
  return out;
}

/** Designazione del cavo, es. "5G1,5" (G = con giallo-verde, x = senza) */
export function cableSection(c: Cable): string {
  if (!c.conductors.length) return '';
  const pe = c.conductors.some(isPeName);
  return `${c.conductors.length}${pe ? 'G' : 'x'}${c.cross ?? '?'}`;
}

/** Punto d'incrocio tra due segmenti (estremi compresi), se esiste */
function intersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | undefined {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return undefined;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return undefined;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Fili attraversati da una linea di definizione, in ordine lungo la linea */
export function crossedWires(page: Page, line: Pick<CableLine, 'points'>): { wire: Wire; at: Pt }[] {
  const [a, b] = line.points;
  const out: { wire: Wire; at: Pt; t: number }[] = [];
  for (const e of page.elements) {
    // La linea spessa di un bus fili non è un conduttore: contano i fili che vi entrano
    if (e.kind !== 'wire' || isBundle(e)) continue;
    for (let i = 0; i < e.points.length - 1; i++) {
      const p = intersect(a, b, e.points[i], e.points[i + 1]);
      if (p) { out.push({ wire: e, at: p, t: Math.hypot(p.x - a.x, p.y - a.y) }); break; }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

export interface Conductor {
  cable: Cable;
  name: string;
  wire: Wire;
  pageId: string;
  pageName: string;
  at: Pt;
  net?: Net;
  /** Posizione "pagina.colonna" */
  loc: string;
  lineId: string;
  /** Conduttore assegnato due volte o non previsto dal cavo */
  problem?: string;
}

export interface CableInfo {
  cable: Cable;
  conductors: Conductor[];
  lines: { line: CableLine; pageId: string; loc: string }[];
  /** Conduttori del cavo non usati */
  spare: string[];
  /** Tutti gli incroci da marcare sullo schema (anche lo stesso conduttore ripetuto su più pagine) */
  marks: { lineId: string; at: Pt; name: string; problem: boolean }[];
}

const isPe = (w: Wire, net?: Net) => w.color?.toUpperCase() === 'GNYE' || net?.name === 'PE';

/**
 * Conduttori di tutti i cavi. Un filo prende il conduttore scelto a mano; altrimenti il
 * giallo-verde se il filo è PE (o giallo-verde), altrimenti il primo conduttore libero.
 * Sulla stessa linea del cavo ogni filo è un conduttore, anche se più fili sono sullo stesso
 * potenziale (conduttori in parallelo). Su un'altra linea dello stesso cavo (altra pagina) il
 * primo filo di un potenziale riprende il primo conduttore di quel potenziale, il secondo il
 * secondo e così via: è lo stesso conduttore disegnato di nuovo, e conta una volta sola.
 */
export function cableInfos(project: Project, nets?: { wireNet: Map<string, Net> }): CableInfo[] {
  const nl = nets ?? computeNetlist(project);
  const out = new Map<string, CableInfo>();
  for (const c of project.cables ?? []) out.set(c.id, { cable: c, conductors: [], lines: [], spare: [], marks: [] });
  const byNet = new Map<string, Map<string, Conductor[]>>();
  // Conduttori già fissati ad altri fili: l'assegnazione automatica non li prende
  const fixedNames = new Map<string, Set<string>>();
  for (const c of project.cables ?? []) fixedNames.set(c.id, new Set(Object.values(c.fixed ?? {})));
  // Bus fili con il nome del cavo: il conduttore scritto nel bus (WH, BN…) vale per il cavo
  const busCond = new Map<string, Map<string, string>>();
  if (project.cables?.length && project.pages.some(pg => pg.elements.some(e => e.kind === 'wire' && isBundle(e)))) {
    const { taps, names } = bundleTaps(project);
    for (const t of taps) {
      const n = names.get(t.group)?.trim().replace(/^-/, '');
      const net = t.name && n ? nl.wireNet.get(t.wire.id) : undefined;
      if (!net) continue;
      const m = busCond.get(n!) ?? new Map<string, string>();
      busCond.set(n!, m);
      if (!m.has(net.id)) m.set(net.id, t.name!);
    }
  }
  for (const pg of project.pages) {
    for (const e of pg.elements) {
      if (e.kind !== 'cable') continue;
      const info = out.get(e.cableId);
      if (!info) continue;
      info.lines.push({ line: e, pageId: pg.id, loc: `${pg.name}.${columnOf(e.points[0].x)}` });
      const crossed = crossedWires(pg, e);
      const used = new Set(info.conductors.map(c => c.name));
      const seen = byNet.get(info.cable.id) ?? new Map<string, Conductor[]>();
      byNet.set(info.cable.id, seen);
      const remember = (net: Net | undefined, cond: Conductor) => { if (net) seen.set(net.id, [...(seen.get(net.id) ?? []), cond]); };
      // Fili di ogni potenziale già contati su questa linea
      const nth = new Map<string, number>();
      // Prima i conduttori scelti a mano, poi il PE, poi gli altri in ordine
      const pending: typeof crossed = [];
      for (const x of crossed) {
        const net = nl.wireNet.get(x.wire.id);
        const fromBus = net ? busCond.get(info.cable.tag)?.get(net.id) : undefined;
        const manual = info.cable.assign[x.wire.id] ?? (fromBus && info.cable.conductors.includes(fromBus) ? fromBus : undefined);
        const i = net ? nth.get(net.id) ?? 0 : 0;
        if (net) nth.set(net.id, i + 1);
        const again = net && seen.get(net.id)?.[i];
        if (again && (!manual || manual === again.name)) { info.marks.push({ lineId: e.id, at: x.at, name: again.name, problem: !!again.problem }); continue; }
        if (manual) {
          const cond = mk(info.cable, manual, x.wire, pg, x.at, net, e.id);
          if (used.has(manual)) cond.problem = `conduttore ${manual} usato due volte`;
          else if (!info.cable.conductors.includes(manual)) cond.problem = `il cavo non ha il conduttore ${manual}`;
          used.add(manual); info.conductors.push(cond);
          remember(net, cond);
        } else pending.push(x);
      }
      // Connettore integrato in un dispositivo: il conduttore è quello del numero del morsetto da cui parte il filo
      const byPin = info.cable.pinsOf ? pinConductors(project, pg, info.cable, pending.map(x => x.wire)) : new Map<string, string>();
      // I conduttori dei morsetti restano a quei fili: gli altri fili prendono i successivi liberi
      const reserved = new Set(byPin.values());
      for (const x of pending) {
        const pinName = byPin.get(x.wire.id);
        if (pinName && !used.has(pinName)) {
          const net = nl.wireNet.get(x.wire.id);
          used.add(pinName);
          const cond = mk(info.cable, pinName, x.wire, pg, x.at, net, e.id);
          info.conductors.push(cond);
          remember(net, cond);
          continue;
        }
        const net = nl.wireNet.get(x.wire.id);
        const peName = info.cable.conductors.find(isPeName);
        // Conduttore già fissato a questo filo: resta il suo (se è ancora del cavo e libero)
        const fx = info.cable.fixed?.[x.wire.id];
        const taken = fixedNames.get(info.cable.id)!;
        let name = fx && !used.has(fx) && info.cable.conductors.includes(fx) ? fx
          : isPe(x.wire, net) && peName && !used.has(peName) ? peName
          : info.cable.conductors.find(n => !used.has(n) && n !== peName && !reserved.has(n) && !taken.has(n))
            ?? info.cable.conductors.find(n => !used.has(n) && n !== peName && !reserved.has(n));
        let problem: string | undefined;
        if (!name) { name = '?'; problem = 'conduttori del cavo esauriti'; }
        else if (isPe(x.wire, net) && !peName) problem = 'filo PE in un cavo senza giallo-verde';
        used.add(name);
        const cond = mk(info.cable, name, x.wire, pg, x.at, net, e.id);
        cond.problem = problem;
        info.conductors.push(cond);
        remember(net, cond);
      }
    }
  }
  for (const info of out.values()) {
    for (const k of info.conductors) info.marks.push({ lineId: k.lineId, at: k.at, name: k.name, problem: !!k.problem });
    const used = new Set(info.conductors.map(c => c.name));
    info.spare = info.cable.conductors.filter(n => !used.has(n));
  }
  return [...out.values()];
}

/**
 * Fili attraversati che partono da un morsetto del dispositivo pinsOf (seguendo il filo, anche se
 * è fatto di più tratti, fino a una giunzione): filo → conduttore con l'indice del numero del
 * morsetto (morsetto 1 → primo conduttore). I morsetti senza numero non danno un conduttore.
 */
export function pinConductors(project: Project, pg: Page, cable: Cable, wires: Wire[]): Map<string, string> {
  const out = new Map<string, string>();
  const key = (p: Pt) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  const pins = new Map<string, string>();
  for (const e of pg.elements) {
    if (e.kind !== 'symbol' || e.tag !== cable.pinsOf) continue;
    const sym = getSymbol(e.symbolId, project);
    if (sym) for (const p of pinsWorld(e, sym)) if (p.pin.label) pins.set(key(p), p.pin.label);
  }
  if (!pins.size) return out;
  // Capi dei fili della pagina: per seguire un filo spezzato in più tratti
  const ends = new Map<string, Wire[]>();
  for (const w of pg.elements) {
    if (w.kind !== 'wire' || w.points.length < 2) continue;
    for (const q of [w.points[0], w.points[w.points.length - 1]]) ends.set(key(q), [...(ends.get(key(q)) ?? []), w]);
  }
  const follow = (start: Wire): string | undefined => {
    const seen = new Set<string>([start.id]);
    const queue: Wire[] = [start];
    while (queue.length) {
      const w = queue.shift()!;
      for (const q of [w.points[0], w.points[w.points.length - 1]]) {
        const k = key(q);
        const label = pins.get(k);
        if (label) return label;
        const next = (ends.get(k) ?? []).filter(o => !seen.has(o.id));
        // Si prosegue solo lungo il filo, non oltre una giunzione a T
        if (next.length === 1 && (ends.get(k)?.length ?? 0) === 2) { seen.add(next[0].id); queue.push(next[0]); }
      }
    }
    return undefined;
  };
  for (const w of wires) {
    const n = parseInt(follow(w) ?? '', 10);
    const name = !isNaN(n) && n >= 1 ? cable.conductors[n - 1] : undefined;
    if (name && ![...out.values()].includes(name)) out.set(w.id, name);
  }
  return out;
}

function mk(cable: Cable, name: string, wire: Wire, pg: Page, at: Pt, net: Net | undefined, lineId: string): Conductor {
  return { cable, name, wire, pageId: pg.id, pageName: pg.name, at, net, loc: `${pg.name}.${columnOf(at.x)}`, lineId };
}

/** Estremità di un conduttore: i punti di connessione del suo conduttore elettrico */
export function conductorEnds(c: Conductor): [string, string] {
  const refs = (c.net?.pins ?? []).map(p => `-${p.ref}`);
  if (refs.length >= 2) return [refs[0], refs.slice(1).join(', ')];
  return [refs[0] ?? c.net?.name ?? '', ''];
}

/** Sigla proposta per un cavo nuovo, es. "1W1" */
export function nextCableTag(project: Project, page: Page, x: number): string {
  return nextTagFor(project, 'W', page, x, (project.cables ?? []).map(c => c.tag));
}

/** Crea un cavo con conduttori proposti in base ai fili attraversati dalla linea */
export function newCable(project: Project, page: Page, line: Pick<CableLine, 'points'>): Cable {
  const crossed = crossedWires(page, { points: line.points });
  const nl = computeNetlist(project);
  const nets = new Set(crossed.map(x => nl.wireNet.get(x.wire.id)?.id ?? x.wire.id));
  const pe = crossed.some(x => isPe(x.wire, nl.wireNet.get(x.wire.id)));
  const n = Math.max(2, nets.size + (pe ? 0 : 1));
  const cross = crossed.map(x => x.wire.cross).find(Boolean) ?? '1,5';
  return {
    id: uid('c'), tag: nextCableTag(project, page, line.points[0].x), type: 'FG16OR16',
    cross, conductors: defaultConductors(n, true), marking: n <= 5 ? 'colors' : 'numbers', assign: {},
  };
}

/** Pagine e righe per la lista cavi */
export function cableTag(c: Cable): string {
  return `-${c.tag}`;
}

/** Proprietà di un cavo copiate per incollarle su altri cavi */
export interface CableClip {
  tag: string;
  /** Tutti i dati tranne id, sigla e conduttori scelti a mano */
  props: Omit<Cable, 'id' | 'tag' | 'assign' | 'pinsOf'>;
  /** Conduttori scelti a mano, nell'ordine in cui il cavo attraversa i fili (null = automatico) */
  manual: (string | null)[];
}

/**
 * Fissa i conduttori assegnati in automatico (come la numerazione bloccata dei fili): prima di una
 * modifica, perché un filo nuovo non faccia scalare gli altri, e dopo, per fissare quello del filo nuovo.
 * Restano fuori i conduttori scelti a mano e quelli con un problema; i fili tolti escono dall'elenco.
 */
export function lockCableConductors(project: Project, nets?: { wireNet: Map<string, Net> }): void {
  if (!project.cables?.length) return;
  for (const info of cableInfos(project, nets)) {
    const c = info.cable, fixed: Record<string, string> = {};
    for (const k of info.conductors) if (!k.problem && k.name !== '?' && c.assign[k.wire.id] === undefined) fixed[k.wire.id] = k.name;
    if (Object.keys(fixed).length) c.fixed = fixed; else delete c.fixed;
  }
}

export function copyCableProps(project: Project, cableId: string): CableClip | undefined {
  const info = cableInfos(project).find(i => i.cable.id === cableId);
  if (!info) return undefined;
  // Il dispositivo del connettore integrato è di quel cavo: non si copia
  const { id: _id, tag, assign, pinsOf: _pins, fixed: _fixed, ...props } = structuredClone(info.cable);
  return { tag, props, manual: info.conductors.map(k => assign[k.wire.id] ?? null) };
}

/**
 * Incolla le proprietà copiate: il cavo prende tutti i dati tranne la sigla, e i conduttori
 * scelti a mano passano ai suoi fili nello stesso ordine (primo filo attraversato, secondo…).
 */
export function pasteCableProps(project: Project, cableId: string, clip: CableClip): void {
  const c = project.cables?.find(x => x.id === cableId);
  if (!c) return;
  const order = cableInfos(project).find(i => i.cable.id === cableId)?.conductors.map(k => k.wire.id) ?? [];
  for (const k of Object.keys(c) as (keyof Cable)[]) if (k !== 'id' && k !== 'tag' && k !== 'assign' && k !== 'pinsOf') delete c[k];
  Object.assign(c, structuredClone(clip.props));
  c.assign = {};
  order.forEach((w, i) => { const n = clip.manual[i]; if (n) c.assign[w] = n; });
}

/** Dispositivi che possono avere il connettore integrato del cavo: quelli con morsetti numerati sulle pagine delle sue linee */
export function pinDeviceOptions(project: Project, cableId: string): string[] {
  const out = new Set<string>();
  for (const pg of project.pages) {
    if (!pg.elements.some(e => e.kind === 'cable' && e.cableId === cableId)) continue;
    for (const e of pg.elements) {
      if (e.kind !== 'symbol' || !e.tag || e.tag.includes(':')) continue;
      const sym = getSymbol(e.symbolId, project);
      if (sym && ['main', 'single', 'plc'].includes(sym.role) && sym.pins.some(p => /^\d+$/.test(p.label))) out.add(e.tag);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

