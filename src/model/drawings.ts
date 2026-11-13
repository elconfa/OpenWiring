// Pagine disegnate dai dati del progetto, che si aggiornano da sole come gli schemi delle morsettiere:
// - disegno del cablaggio di un cavo: il cavo con le due estremità (dispositivi e morsetti per luogo)
//   e la tabella dei conduttori;
// - piedinatura di un connettore: la faccia del connettore con i pin numerati e la tabella dei pin;
// - schema d'insieme: i luoghi (quadri, pulsantiere, bordo macchina…) con i dispositivi collegati dai
//   cavi, le loro foto e i cavi tra un luogo e l'altro.
import type { Page, Part, Project } from './types';
import { landing, landingCtx } from './landing';
import { uid } from './geometry';
import { buildDevices, deviceInfo, partsIndex, stripOf, type PlacedElement } from './devices';
import { cableInfos, cableSection } from './cables';
import { computeNetlist, type Net, type NetPin } from './netlist';
import { bundleTaps, bundleCable, bundleConductorList } from './bundles';
import { columnOf } from './types';
import { connectorData, connectorRows, allConnectors, pinCount, pinNames } from './connectors';
import { connectorType, connectorShortName, GENDER_NAMES } from './connectorTypes';
import { devicePanels } from './network';

export type DrawingKind = 'cable' | 'connector' | 'system';

/** Luogo di un elemento: quello scritto nel dispositivo o quello del quadro a cui appartiene */
function placeCode(project: Project, el: PlacedElement, panels: Map<string, { code: string }>, loc: Map<string, string | undefined>): string {
  const tag = el.sym.role === 'terminal' || el.sym.role === 'pin' ? stripOf(el.inst.tag) : el.inst.tag;
  const own = el.inst.loc ?? loc.get(tag);
  if (own) return own;
  const pageCode = project.panels?.find(p => p.id === el.page.panelId)?.code;
  return panels.get(tag)?.code ?? pageCode ?? '';
}

function locationIndex(project: Project, library: Part[]) {
  const parts = partsIndex(project, library);
  const loc = new Map<string, string | undefined>();
  for (const d of buildDevices(project).values()) loc.set(d.tag, deviceInfo(d.elements, d.main, parts).loc);
  return { panels: devicePanels(project), loc };
}

// ---------------------------------------------------------------------------
// Disegno del cablaggio di un cavo

export interface CableSheetRow {
  name: string;
  wireNo: string;
  /** Estremità sul lato A e sul lato B (sigle dei punti, es. "-X1:3") */
  a: string;
  b: string;
  loc: string;
  problem?: string;
  /** Conduttore di scorta (filo segnato «di scorta»): senza numero filo, evidenziato */
  spare?: boolean;
}

export interface CableSheet {
  tag: string;
  type: string;
  section: string;
  length?: number;
  description?: string;
  shield?: boolean;
  pairs?: boolean;
  /** Luoghi delle due estremità (codici senza +) e i punti collegati su ciascun lato */
  sideA: { code: string; refs: string[] };
  sideB: { code: string; refs: string[] };
  rows: CableSheetRow[];
  spare: string[];
  /** Bus fili usato come cavo (tag = nome del bus, senza trattino) */
  bus?: boolean;
}

/**
 * Dati del disegno del cavo: le due estremità sono i due luoghi più frequenti tra i punti collegati
 * ai suoi conduttori (con un luogo solo, il lato B è quello scritto nel campo «a» del cavo)
 */
export function cableSheet(project: Project, tag: string, library: Part[] = [], nets?: { wireNet: Map<string, Net> }): CableSheet | undefined {
  const info = cableInfos(project, nets).find(i => i.cable.tag === tag);
  if (!info) return undefined;
  const c = info.cable;
  // Capi del conduttore: dove arriva il filo da una parte e dall'altra del cavo (il pin o il morsetto
  // a cui il cablatore lo collega), non tutti i punti del potenziale (un +24 V ne ha decine)
  const ctx = landingCtx(project);
  const pinsOf = info.conductors.map(k => {
    const pg = project.pages.find(x => x.id === k.pageId);
    const ends = pg && k.net ? landing(ctx, pg, k.net, { wire: k.wire }) : [];
    return ends.length ? ends : (k.net?.pins ?? []).slice(0, 2);
  });
  const { sideA, sideB, rows } = splitSides(project, library, info.conductors.map((k, i) => ({
    name: k.name, wireNo: k.net?.wireNo ?? '', loc: k.loc, ...(k.problem ? { problem: k.problem } : {}), ...(k.net?.spare ? { spare: true } : {}), pins: pinsOf[i],
  })), c.conductors);
  return {
    tag: c.tag, type: c.type ?? '', section: cableSection(c), length: c.length, description: c.description, shield: c.shield, pairs: c.pairs,
    sideA, sideB, rows, spare: info.spare,
  };
}

/**
 * Lati A e B del disegno: i due luoghi più frequenti tra i punti collegati ai conduttori (con un luogo
 * solo, il primo punto di ogni conduttore è il lato A e gli altri il lato B); righe nell'ordine del cavo
 */
function splitSides(project: Project, library: Part[], list: { name: string; wireNo: string; loc: string; problem?: string; spare?: boolean; pins: NetPin[] }[], order: string[]) {
  const idx = locationIndex(project, library);
  const count = new Map<string, number>();
  const pinsOf = list.map(r => r.pins.map(p => ({ ref: `-${p.ref}`, code: placeCode(project, p.el, idx.panels, idx.loc) })));
  for (const l of pinsOf) for (const p of l) count.set(p.code, (count.get(p.code) ?? 0) + 1);
  const codes = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const ca = codes[0] ?? '', cb = codes[1] ?? '';
  const pos = new Map(order.map((n, k) => [n, k]));
  const rows: CableSheetRow[] = list.map((r, i) => {
    const l = pinsOf[i];
    const a = cb ? l.filter(p => p.code === ca) : l.slice(0, 1);
    const b = cb ? l.filter(p => p.code !== ca) : l.slice(1);
    return { name: r.name, wireNo: r.wireNo, a: a.map(p => p.ref).join(', '), b: b.map(p => p.ref).join(', '), loc: r.loc, ...(r.problem ? { problem: r.problem } : {}), ...(r.spare ? { spare: true } : {}) };
  }).sort((x, y) => (pos.get(x.name) ?? 1e6) - (pos.get(y.name) ?? 1e6));
  const refsOf = (side: 'a' | 'b') => [...new Set(rows.flatMap(r => r[side].split(', ').filter(Boolean).map(s => s.slice(0, s.indexOf(':') > 0 ? s.indexOf(':') : undefined))))];
  return { sideA: { code: ca, refs: refsOf('a') }, sideB: { code: cb, refs: refsOf('b') }, rows };
}

/** Prefisso dell'elemento di una pagina di cablaggio che rappresenta un bus fili e non un cavo */
export const BUS_ITEM = 'bus:';

/** Bus fili con un articolo cavo (conduttori numerati o colorati) e senza un cavo del progetto con lo stesso nome */
export function cableBundles(project: Project, library: Part[] = []): string[] {
  const parts = partsIndex(project, library);
  const { groupOf, names } = bundleTaps(project);
  const out = new Set<string>();
  for (const pg of project.pages) for (const e of pg.elements) {
    if (e.kind !== 'wire' || e.bundle === undefined) continue;
    const g = groupOf.get(e.id), name = g ? names.get(g) : undefined;
    if (!g || !name || bundleCable(project, name)) continue;
    if (bundleConductorList(project, g, name, parts)?.length) out.add(name);
  }
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Disegno del cablaggio di un bus fili usato come cavo: conduttori dell'articolo, fili che entrano e che escono */
export function bundleSheet(project: Project, name: string, library: Part[] = [], nl = computeNetlist(project)): CableSheet | undefined {
  const parts = partsIndex(project, library);
  const { taps, groupOf, names } = bundleTaps(project);
  const group = [...new Set(groupOf.values())].find(g => names.get(g) === name);
  if (!group) return undefined;
  const list = bundleConductorList(project, group, name, parts) ?? [];
  const seg = project.pages.flatMap(pg => pg.elements).find(e => e.kind === 'wire' && e.bundlePart && groupOf.get(e.id) === group);
  const part = seg?.kind === 'wire' ? parts.get(seg.bundlePart!) : undefined;
  const ctx = landingCtx(project);
  const mine = taps.filter(t => t.group === group && t.name);
  const used = [...new Set(mine.map(t => t.name!))];
  const rows = used.map(n => {
    const ts = mine.filter(t => t.name === n);
    const pins: NetPin[] = [];
    const locs: string[] = [];
    let wireNo = '';
    for (const t of ts) {
      const pg = project.pages.find(x => x.id === t.pageId);
      const net = nl.wireNet.get(t.wire.id);
      if (!pg || !net) continue;
      wireNo ||= net.wireNo ?? '';
      locs.push(`${pg.name}.${columnOf(t.at.x)}`);
      for (const p of landing(ctx, pg, net, { wire: t.wire })) if (!pins.includes(p)) pins.push(p);
    }
    const problem = !list.includes(n) ? `il cavo non ha il conduttore ${n}` : ts.length < 2 ? 'entra ma non esce' : undefined;
    return { name: n, wireNo, loc: locs.join(', '), pins, ...(problem ? { problem } : {}) };
  });
  const { sideA, sideB, rows: out } = splitSides(project, library, rows, list);
  return {
    tag: name, bus: true, type: part ? part.typeNr || part.descr1 || part.partNr : '', section: part?.cable?.cross ? `${list.length}x${part.cable.cross}` : '',
    shield: part?.cable?.shield, sideA, sideB, rows: out, spare: list.filter(n => !used.includes(n)),
  };
}

// ---------------------------------------------------------------------------
// Piedinatura di un connettore

export interface ConnectorSheet {
  conn: string;
  description?: string;
  /** Pin totali (dati del connettore o articolo), almeno quelli usati */
  pins: number;
  /** Forma del disegno: SUB-D per 9, 15, 25, 37 e 50 pin, altrimenti rettangolare a due file */
  shape: 'subd' | 'rect' | 'rj45';
  rows: { no: string; a: string; b: string; wires: string }[];
  /** Nomi dei pin sulla faccia, nell'ordine (1…n, PE per i connettori del catalogo) */
  names: string[];
  /** Tipo del catalogo, genere e codici degli inserti, se indicati */
  typeText?: string;
}

const SUBD = [9, 15, 25, 37, 50];

export function connectorSheet(project: Project, conn: string, library: Part[] = [], nets?: Net[]): ConnectorSheet {
  const rows = connectorRows(project, conn, nets).map(r => ({ no: r.no, a: r.sideA, b: r.sideB, wires: r.wires }));
  const maxNo = Math.max(0, ...rows.map(r => parseInt(r.no, 10)).filter(n => !isNaN(n)));
  const pins = Math.max(pinCount(project, conn, library) ?? 0, maxNo, rows.length);
  const d = connectorData(project, conn), t = connectorType(d.type);
  const own = pinNames(project, conn, library);
  const names = own.length >= pins ? own : Array.from({ length: pins }, (_, i) => String(i + 1));
  const typeText = t ? [connectorShortName(t), d.gender ? GENDER_NAMES[d.gender] : '', `${t.male} / ${t.female}`, d.housing ?? (t.housing ? (t.shape ? t.housing : `custodia ${t.housing}`) : '')].filter(Boolean).join(' · ') : undefined;
  // Faccia: quella del tipo (i contatti in più, come lo schermo, non sono sulla faccia)
  const facePins = t ? t.poles + (t.pe ? 1 : 0) : pins;
  const shape = t ? t.shape ?? 'rect' : SUBD.includes(pins) ? 'subd' : 'rect';
  return { conn, description: d.description, pins: facePins, shape, rows, names, ...(typeText ? { typeText } : {}) };
}

/** Posizione dei pin sulla faccia: SUB-D con la fila lunga sopra (pin 1 a sinistra), rettangolare a due file */
export function pinLayout(shape: ConnectorSheet['shape'], pins: number): { no: number; row: number; col: number; rows: number; cols: number }[] {
  const top = Math.ceil(pins / 2), rows = 2;
  return Array.from({ length: pins }, (_, i) => {
    const no = i + 1;
    if (shape === 'subd') return no <= top ? { no, row: 0, col: (no - 1) * 2, rows, cols: top * 2 - 1 } : { no, row: 1, col: (no - top - 1) * 2 + 1, rows, cols: top * 2 - 1 };
    // RJ45: una sola fila di contatti, 1 a sinistra guardando la presa con la linguetta in basso
    if (shape === 'rj45') return { no, row: 0, col: i, rows: 1, cols: pins };
    return no <= top ? { no, row: 0, col: no - 1, rows, cols: top } : { no, row: 1, col: no - top - 1, rows, cols: top };
  });
}

// ---------------------------------------------------------------------------
// Schema d'insieme

export interface SystemNode {
  /** Codice del luogo senza «+»; per un dispositivo da solo la sua sigla con il trattino */
  code: string;
  name?: string;
  kind?: string;
  /** Nodo di un solo dispositivo (fuori dai quadri, senza luogo indicato) */
  device?: boolean;
  /** Dispositivi del luogo collegati dai cavi, con la foto dell'articolo se c'è */
  devices: { tag: string; description?: string; picture?: string }[];
}
export interface SystemEdge { tag: string; text: string; a: string; b: string }
export interface SystemSheet { nodes: SystemNode[]; edges: SystemEdge[]; hub?: string }

export function systemSheet(project: Project, library: Part[] = [], nets?: { wireNet: Map<string, Net> }): SystemSheet {
  const idx = locationIndex(project, library);
  const parts = partsIndex(project, library);
  const devices = buildDevices(project);
  const nodes = new Map<string, SystemNode>();
  const node = (code: string) => {
    let n = nodes.get(code);
    if (!n) {
      const p = project.panels?.find(x => x.code === code);
      nodes.set(code, n = { code, name: p?.name, kind: p?.kind, devices: [], ...(code.startsWith('-') ? { device: true } : {}) });
    }
    return n;
  };
  const edges: SystemEdge[] = [];
  for (const i of cableInfos(project, nets)) {
    const byCode = new Map<string, Set<string>>();
    for (const k of i.conductors) {
      for (const p of k.net?.pins ?? []) {
        if (p.el.sym.role === 'potential' || p.el.sym.role === 'link') continue;
        const code = placeCode(project, p.el, idx.panels, idx.loc);
        const tag = p.el.sym.role === 'terminal' || p.el.sym.role === 'pin' ? stripOf(p.el.inst.tag) : p.el.inst.tag;
        const set = byCode.get(code) ?? new Set<string>();
        set.add(tag);
        byCode.set(code, set);
      }
    }
    // Cavo tutto nello stesso luogo (es. dal quadro al motore senza luogo indicato): il dispositivo
    // all'altro capo diventa un nodo a sé, come nello schema d'insieme dei disegni tradizionali
    if (byCode.size === 1) {
      const [code, tags] = [...byCode.entries()][0];
      const far = [...tags].filter(t => !devices.get(t)?.elements.every(e => e.sym.role === 'terminal' || e.sym.role === 'pin'));
      const near = [...tags].filter(t => !far.includes(t));
      if (far.length && near.length) {
        byCode.set(code, new Set(near));
        for (const t of far) byCode.set(`-${t}`, new Set([t]));
      }
    }
    const codes = [...byCode.keys()];
    for (const code of codes) {
      const n = node(code);
      for (const tag of byCode.get(code)!) {
        if (n.devices.some(d => d.tag === tag)) continue;
        const d = devices.get(tag);
        const info = d ? deviceInfo(d.elements, d.main, parts) : undefined;
        n.devices.push({ tag, ...(info?.description ? { description: info.description } : {}), ...(info?.part?.picture ? { picture: info.part.picture } : {}) });
      }
    }
    const c = i.cable;
    const text = [c.type, cableSection(c), c.length !== undefined ? `${String(c.length).replace('.', ',')} m` : ''].filter(Boolean).join(' · ');
    if (codes.length >= 2) for (let k = 1; k < codes.length; k++) edges.push({ tag: c.tag, text, a: codes[0], b: codes[k] });
  }
  // Il luogo con più cavi sta in alto al centro (di solito il quadro elettrico)
  const deg = new Map<string, number>();
  for (const e of edges) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); }
  const hub = [...deg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const n of nodes.values()) n.devices.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  return { nodes: [...nodes.values()].sort((a, b) => (a.code === hub ? -1 : b.code === hub ? 1 : a.code.localeCompare(b.code, undefined, { numeric: true }))), edges, ...(hub !== undefined ? { hub } : {}) };
}

// ---------------------------------------------------------------------------
// Pagine

const TITLES: Record<DrawingKind, (k: string) => string> = {
  cable: k => (k.startsWith(BUS_ITEM) ? `Cablaggio bus fili ${k.slice(BUS_ITEM.length)}` : `Cablaggio cavo -${k}`),
  connector: k => `Connettore -${k}`,
  system: () => 'Schema d\'insieme',
};

/** Elementi rappresentati: sigle dei cavi, dei connettori, o la sola pagina d'insieme */
export function drawingItems(p: Project, kind: DrawingKind, library: Part[] = []): string[] {
  if (kind === 'cable') return [...(p.cables ?? []).map(c => c.tag).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), ...cableBundles(p, library).map(n => BUS_ITEM + n)];
  if (kind === 'connector') return allConnectors(p);
  return (p.cables ?? []).length ? [''] : [];
}

/** Crea le pagine che mancano (una per cavo, connettore o una d'insieme) e toglie quelle che non servono più */
export function syncDrawingPages(p: Project, kind: DrawingKind, library: Part[] = []): { added: number; removed: number } {
  const need = drawingItems(p, kind, library);
  const before = p.pages.length;
  p.pages = p.pages.filter(pg => pg.type !== kind || need.includes(pg.item ?? ''));
  if (!p.pages.length) p.pages.push({ id: uid('p'), name: '1', title: 'Schema', type: 'multiline', elements: [] });
  const removed = before - p.pages.length;
  let added = 0;
  for (const k of need) {
    const title = TITLES[kind](k);
    const ex = p.pages.find(pg => pg.type === kind && (pg.item ?? '') === k);
    if (ex) { ex.title = title; continue; }
    const nums = p.pages.map(x => parseInt(x.name, 10)).filter(n => !isNaN(n));
    const page: Page = { id: uid('p'), name: String((nums.length ? Math.max(...nums) : 0) + 1), title, type: kind, ...(k ? { item: k } : {}), elements: [] };
    const prev = p.pages.findLastIndex(pg => pg.type === kind);
    if (prev >= 0) p.pages.splice(prev + 1, 0, page); else p.pages.push(page);
    added++;
  }
  return { added, removed };
}

/** Dati della pagina disegnata (per derive) */
export type DrawingData =
  | { kind: 'cable'; data?: CableSheet }
  | { kind: 'connector'; data: ConnectorSheet }
  | { kind: 'system'; data: SystemSheet };

export function drawingData(project: Project, page: Page, library: Part[] = [], nl = computeNetlist(project)): DrawingData | undefined {
  if (page.type === 'cable') return { kind: 'cable', data: page.item?.startsWith(BUS_ITEM) ? bundleSheet(project, page.item.slice(BUS_ITEM.length), library, nl) : cableSheet(project, page.item ?? '', library, nl) };
  if (page.type === 'connector') return { kind: 'connector', data: connectorSheet(project, page.item ?? '', library, nl.nets) };
  if (page.type === 'system') return { kind: 'system', data: systemSheet(project, library, nl) };
  return undefined;
}
