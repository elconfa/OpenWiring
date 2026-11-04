// Reti e bus di campo: protocolli, quadri (sezioni del progetto), nodi con porte,
// collegamenti tra dispositivi e tra quadri, liste e controlli.
import { tx } from '../i18n/ui';
import { nextProjectPageNo } from './pageOrder';
import type { Project, Panel, Page, Zone, Wire, IpNetwork, SymbolInstance, Part, Pt, PlcStation } from './types';
import { columnOf } from './types';
import { allPlaced, locationOf, effectivePinLabels, buildDevices, deviceInfo, partsIndex, type PlacedElement } from './devices';
import { computeNetlist, type Net } from './netlist';
import { uid, pinsWorld } from './geometry';
import { linkPartners } from './links';
import { nextTagFor } from './numbering';

export interface Protocol { name: string; color: string; /** Più nodi sullo stesso tratto (bus multipunto) */ multidrop?: boolean }

/** Protocolli con il colore di disegno (colori tipici delle guaine dove esiste una convenzione) */
export const PROTOCOLS: Protocol[] = [
  { name: 'Profinet', color: '#1a7f37' },
  { name: 'EtherCAT', color: '#0fa3a3' },
  { name: 'Modbus TCP', color: '#0969da' },
  { name: 'Modbus RTU', color: '#e8730c', multidrop: true },
  { name: 'Profibus DP', color: '#8250df', multidrop: true },
  { name: 'EtherNet/IP', color: '#0a2f8c' },
  { name: 'CANopen', color: '#b08800', multidrop: true },
  { name: 'IO-Link', color: '#8b4a1c' },
  { name: 'RS485', color: '#e85aad', multidrop: true },
  { name: 'Ethernet', color: '#57606a' },
  // Cavo speciale di un articolo (es. il cavo del programming pad di un robot con il suo connettore):
  // un collegamento senza i singoli fili, con sigla, tipo, lunghezza e articolo come gli altri bus
  { name: 'Generico', color: '#6e7781' },
];

/** Bus generico: per i cavi speciali o propri di un articolo */
export const GENERIC_BUS = 'Generico';
/** Nome del protocollo da mostrare (il bus generico è tradotto) */
export const protocolLabel = (name: string) => (name === GENERIC_BUS ? tx('Generico (cavo speciale)') : name);

export const protocolOf = (name?: string): Protocol | undefined =>
  name ? PROTOCOLS.find(p => p.name.toLowerCase() === name.toLowerCase()) ?? { name, color: '#57606a' } : undefined;

/** Etichetta di un quadro, es. "+Q2 Slave 1" */
/** Luoghi che contengono il luogo, dal più esterno (senza cicli) */
export function panelAncestors(p: Panel, panels: Panel[]): Panel[] {
  const out: Panel[] = [];
  const seen = new Set([p.id]);
  for (let q = panels.find(x => x.id === p.parentId); q && !seen.has(q.id); q = panels.find(x => x.id === q!.parentId)) { out.unshift(q); seen.add(q.id); }
  return out;
}

/** Luoghi nell'ordine dell'albero: ogni luogo seguito dai suoi sottoquadri */
export function orderedPanels(panels: Panel[]): Panel[] {
  const out: Panel[] = [];
  const add = (p: Panel) => { if (out.includes(p)) return; out.push(p); panels.filter(c => c.parentId === p.id).forEach(add); };
  panels.filter(p => !p.parentId || !panels.some(q => q.id === p.parentId) || panelAncestors(p, panels).length === 0).forEach(add);
  panels.forEach(add);
  return out;
}

/** «+QE  Quadro elettrico»; con i luoghi del progetto anche quelli che lo contengono: «+QE › +P1  Pulsantiera» */
export const panelLabel = (p: Panel, panels?: Panel[]) => `${panels ? panelAncestors(p, panels).map(a => `+${a.code} › `).join('') : ''}+${p.code}${p.name ? `  ${p.name}` : ''}`;

export function newPanel(project: Project, name?: string): Panel {
  const used = new Set((project.panels ?? []).map(p => p.code));
  let n = 1;
  while (used.has(`Q${n}`)) n++;
  return { id: uid('q'), code: `Q${n}`, name: name ?? (n === 1 ? 'Quadro master' : `Slave ${n - 1}`), kind: 'Quadro elettrico' };
}

/** Problemi dei luoghi: codici doppi, luoghi scritti sui dispositivi ma non definiti, nodi fuori dal proprio riquadro */
export function locationProblems(project: Project): NetIssue[] {
  const out: NetIssue[] = [];
  const panels = project.panels ?? [];
  if (!panels.length) return out;
  const codes = new Map<string, number>();
  for (const p of panels) codes.set(p.code, (codes.get(p.code) ?? 0) + 1);
  for (const [c, n] of codes) if (n > 1) out.push({ msg: `Codice di luogo +${c} usato da ${n} luoghi`, pageId: '', elementId: '', loc: '' });
  const reported = new Set<string>();
  for (const d of buildDevices(project).values()) {
    const loc = d.elements.map(e => e.inst.loc).find(Boolean);
    if (loc && !panels.some(p => p.code === loc) && !reported.has(loc)) {
      reported.add(loc);
      out.push({ msg: `-${d.tag}: luogo +${loc} non definito tra i luoghi del progetto`, pageId: d.elements[0].page.id, elementId: d.elements[0].inst.id, loc: locationOf(d.elements[0]) });
    }
    for (const e of d.elements) {
      if (e.sym.role !== 'netnode' || !loc) continue;
      const zone = e.page.elements.find((z): z is Zone => z.kind === 'zone' && inside(z, e.inst.x, e.inst.y));
      const zp = zone && panels.find(p => p.id === zone.panelId);
      if (zp && zp.code !== loc) out.push({ msg: `-${d.tag}: luogo +${loc} ma disegnato nel riquadro +${zp.code}`, pageId: e.page.id, elementId: e.inst.id, loc: locationOf(e) });
    }
  }
  return out;
}

/** Nuova pagina di schema di rete */
export function newNetworkPage(project: Project): Page {
  return { id: uid('p'), name: nextProjectPageNo(project), title: 'Schema di rete', type: 'network', elements: [] };
}

const inside = (z: Zone, x: number, y: number) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

/**
 * Luogo di un elemento: il luogo (+) scritto sul dispositivo; altrimenti il riquadro che lo
 * contiene nello schema di rete; altrimenti il luogo della pagina.
 */
export function panelOfElement(project: Project, el: PlacedElement, devLoc?: Map<string, string>): Panel | undefined {
  const panels = project.panels ?? [];
  if (!panels.length) return undefined;
  const loc = devLoc?.get(el.inst.tag) ?? el.inst.loc;
  if (loc) { const p = panels.find(q => q.code === loc); if (p) return p; }
  const zone = el.page.elements.find((z): z is Zone => z.kind === 'zone' && inside(z, el.inst.x, el.inst.y));
  if (zone) return panels.find(p => p.id === zone.panelId);
  return panels.find(p => p.id === el.page.panelId);
}

/** Luogo (+) dichiarato per ogni dispositivo */
function deviceLocs(project: Project): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of buildDevices(project).values()) {
    const loc = d.elements.map(e => e.inst.loc).find(Boolean);
    if (loc) m.set(d.tag, loc);
  }
  return m;
}

/** Luogo di ogni dispositivo: scritto sul dispositivo, poi dal suo nodo di rete, poi dalla pagina dell'elemento principale */
export function devicePanels(project: Project): Map<string, Panel> {
  const out = new Map<string, Panel>();
  if (!project.panels?.length) return out;
  const locs = deviceLocs(project);
  for (const d of buildDevices(project).values()) {
    const node = d.elements.find(e => e.sym.role === 'netnode');
    const p = panelOfElement(project, node ?? d.main ?? d.elements[0], locs);
    if (p) out.set(d.tag, p);
  }
  return out;
}

export interface NetPort { el: PlacedElement; port: string; panel?: Panel }
export interface NetLink {
  protocol: string;
  a: NetPort;
  b: NetPort;
  /** Collegamento tra quadri diversi */
  crossPanel: boolean;
  pageId: string;
  loc: string;
  wire?: Wire;
}

/** Protocollo di un conduttore: quello dei suoi fili di bus */
export const busOf = (n: Net) => n.wires.find(w => w.wire.bus)?.wire.bus;

/**
 * Collegamenti di rete: per ogni tratto di bus, i punti di connessione in ordine di posizione
 * vengono concatenati (come la lista connessioni: in un bus multipunto si va di nodo in nodo).
 */
export function networkLinks(project: Project, nets?: Net[]): NetLink[] {
  const nl = nets ?? computeNetlist(project).nets;
  const labels = effectivePinLabels(project);
  const locs = deviceLocs(project);
  const out: NetLink[] = [];
  for (const n of nl) {
    const proto = busOf(n);
    if (!proto) continue;
    const pins = [...n.pins].sort((a, b) => a.el.pageIndex - b.el.pageIndex || a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    const port = (i: number): NetPort => {
      const p = pins[i];
      return { el: p.el, port: labels.get(p.el.inst.id)?.[p.pinId] || p.label || '', panel: panelOfElement(project, p.el, locs) };
    };
    for (let i = 0; i < pins.length - 1; i++) {
      const a = port(i), b = port(i + 1);
      const w = n.wires.find(x => x.wire.bus)!;
      out.push({ protocol: proto, a, b, crossPanel: !!a.panel && !!b.panel && a.panel.id !== b.panel.id, pageId: w.pageId, loc: locationOf(pins[i].el), wire: w.wire });
    }
  }
  return out;
}

export interface NetNode { el: PlacedElement; panel?: Panel; address: string; protocols: string[] }

export function networkNodes(project: Project, links = networkLinks(project)): NetNode[] {
  const locs = deviceLocs(project);
  return allPlaced(project).filter(e => e.sym.role === 'netnode').map(el => ({
    el, panel: panelOfElement(project, el, locs), address: el.inst.netAddress ?? '',
    protocols: [...new Set(links.filter(l => l.a.el.inst.id === el.inst.id || l.b.el.inst.id === el.inst.id).map(l => l.protocol))],
  }));
}

// ---------------------------------------------------------------------------
// Interfacce di rete dei dispositivi: porte (pin toccati da un filo di bus, o porte dei nodi di rete)
// con un indirizzo. Di serie le porte su IP di un dispositivo (Profinet, Ethernet, Modbus TCP…) sono
// una sola interfaccia (switch integrato, un IP e un nome); ogni bus non IP (Modbus RTU, EtherCAT…)
// ha la sua. Un'interfaccia con indirizzo proprio si scrive sul dispositivo (SymbolInstance.netIfs).

export interface NetIfPort { el: PlacedElement; port: string; protocols: string[] }
/** Dove sta l'indirizzo: ip e netAddress dell'elemento, una sua interfaccia scritta, o ancora nessuna */
export type NetIfSlot = { kind: 'main' } | { kind: 'def'; index: number } | { kind: 'new' };
export interface NetInterface {
  key: string;
  /** Sigla del dispositivo (vuota per un nodo senza sigla) */
  tag: string;
  ports: NetIfPort[];
  protocols: string[];
  ip?: string;
  /** Nome Profinet, ID Modbus, indirizzo EtherCAT… */
  address?: string;
  owner: PlacedElement;
  slot: NetIfSlot;
  panel?: Panel;
}

const ipFamily = (protocols: string[]) => (protocols.some(p => IP_PROTOCOLS.includes(p)) ? 'IP' : protocols[0] ?? '');

/** Interfacce di rete di tutti i dispositivi, in ordine di pagina */
export function netInterfaces(project: Project, nets?: Net[]): NetInterface[] {
  const locs = deviceLocs(project);
  const labels = effectivePinLabels(project);
  // Gli elementi del progetto (la rete può lavorare su copie): le modifiche vanno sugli originali
  const placed = allPlaced(project);
  const real = new Map(placed.map(e => [e.inst.id, e]));
  // Porte di ogni elemento con i loro protocolli: i pin toccati da un filo di bus e le porte dei nodi di rete
  const ports = new Map<string, { el: PlacedElement; ports: Map<string, Set<string>> }>();
  const add = (pe: PlacedElement, port: string, proto?: string) => {
    const el = real.get(pe.inst.id) ?? pe;
    const e = ports.get(el.inst.id) ?? { el, ports: new Map<string, Set<string>>() };
    ports.set(el.inst.id, e);
    const set = e.ports.get(port) ?? new Set<string>();
    e.ports.set(port, set);
    if (proto) set.add(proto);
  };
  for (const el of placed) if (el.sym.role === 'netnode') for (const pin of el.sym.pins) add(el, labels.get(el.inst.id)?.[pin.id] || pin.label || '');
  for (const n of nets ?? computeNetlist(project).nets) {
    const proto = busOf(n);
    if (proto) for (const p of n.pins) add(p.el, labels.get(p.el.inst.id)?.[p.pinId] || p.label || '', proto);
  }
  // Per dispositivo (stessa sigla), nell'ordine delle pagine
  const devices = new Map<string, PlacedElement[]>();
  const order = (a: PlacedElement, b: PlacedElement) => a.pageIndex - b.pageIndex || a.inst.x - b.inst.x || a.inst.y - b.inst.y;
  for (const { el } of [...ports.values()].sort((a, b) => order(a.el, b.el))) {
    const k = el.inst.tag || `#${el.inst.id}`;
    devices.set(k, [...(devices.get(k) ?? []), el]);
  }
  const out: NetInterface[] = [];
  for (const [k, els] of devices) {
    const tag = els[0].inst.tag;
    const all: NetIfPort[] = els.flatMap(el => [...ports.get(el.inst.id)!.ports].map(([port, set]) => ({ el, port, protocols: [...set] })));
    const make = (list: NetIfPort[], owner: PlacedElement, slot: NetIfSlot, ip?: string, address?: string): NetInterface => ({
      key: `${k}|${list.map(p => p.port).join('|')}`, tag, ports: list, protocols: [...new Set(list.flatMap(p => p.protocols))],
      ip: ip || undefined, address: address || undefined, owner, slot, panel: panelOfElement(project, owner, locs),
    });
    // Interfacce scritte sul dispositivo (in elenco dopo la principale)
    const claimed = new Set<NetIfPort>();
    const own: NetInterface[] = [];
    for (const el of els) (el.inst.netIfs ?? []).forEach((d, index) => {
      const list = all.filter(p => !claimed.has(p) && d.ports.includes(p.port));
      if (!list.length) return;
      list.forEach(p => claimed.add(p));
      own.push(make(list, el, { kind: 'def', index }, d.ip, d.address));
    });
    // Le altre: una per famiglia (IP, poi ogni bus non IP); le porte senza protocollo con la principale
    const free = all.filter(p => !claimed.has(p));
    if (!free.length) { out.push(...own); continue; }
    const fams = new Map<string, NetIfPort[]>();
    for (const p of free) { const f = ipFamily(p.protocols); fams.set(f, [...(fams.get(f) ?? []), p]); }
    const main = fams.has('IP') ? 'IP' : [...fams.keys()].find(f => f) ?? '';
    if (fams.has('') && main !== '') { fams.set(main, [...fams.get(main)!, ...fams.get('')!]); fams.delete(''); }
    const ownerOf = (list: NetIfPort[]) => list[0].el;
    for (const [f, list] of fams) {
      if (f === main) {
        const owner = els.find(e => e.inst.ip || e.inst.netAddress) ?? els.find(e => e.sym.role === 'netnode') ?? ownerOf(list);
        const na = owner.inst.netAddress;
        out.push(make(list, owner, { kind: 'main' }, nodeIp(owner.inst), na && !(isIp(na) && !owner.inst.ip) ? na : undefined));
      } else out.push(make(list, ownerOf(list), { kind: 'new' }));
    }
    out.push(...own);
  }
  return out;
}

/** Scrive IP e indirizzo di un'interfaccia (dentro un commit); undefined lascia il valore, '' lo toglie */
export function setNetInterface(nif: NetInterface, patch: { ip?: string; address?: string }): void {
  const inst = nif.owner.inst;
  const clean = (v: string) => v.trim() || undefined;
  if (nif.slot.kind === 'main') {
    if (patch.ip !== undefined) { inst.ip = clean(patch.ip); if (isIp(inst.netAddress)) inst.netAddress = undefined; }
    if (patch.address !== undefined) inst.netAddress = clean(patch.address);
    return;
  }
  const defs = (inst.netIfs ??= []);
  const d = nif.slot.kind === 'def' ? defs[nif.slot.index] : (defs[defs.push({ ports: nif.ports.map(p => p.port) }) - 1]);
  if (patch.ip !== undefined) d.ip = clean(patch.ip);
  if (patch.address !== undefined) d.address = clean(patch.address);
}

/** Separa alcune porte in un'interfaccia con indirizzo proprio (dentro un commit) */
export function splitNetInterface(nif: NetInterface, ports: string[]): void {
  if (!ports.length || ports.length >= nif.ports.length) return;
  if (nif.slot.kind === 'def') {
    const d = nif.owner.inst.netIfs![nif.slot.index];
    d.ports = d.ports.filter(p => !ports.includes(p));
  }
  const owner = nif.ports.find(p => ports.includes(p.port))!.el.inst;
  (owner.netIfs ??= []).push({ ports });
}

/** Riunisce un'interfaccia scritta alle altre porte del dispositivo (dentro un commit) */
export function mergeNetInterface(nif: NetInterface): void {
  if (nif.slot.kind !== 'def') return;
  const inst = nif.owner.inst;
  inst.netIfs!.splice(nif.slot.index, 1);
  if (!inst.netIfs!.length) delete inst.netIfs;
}

/**
 * Nome Profinet valido: minuscole, cifre e trattini (etichette separate da punti), al massimo 240
 * caratteri, non nella forma di un indirizzo IP né «port-xyz». Restituisce il problema o undefined
 */
export function profinetNameError(name: string): string | undefined {
  if (!name) return undefined;
  if (name.length > 240) return 'più di 240 caratteri';
  if (!/^[a-z0-9.-]+$/.test(name)) return 'solo lettere minuscole, cifre, trattini e punti';
  if (name.split('.').some(l => !l || l.length > 63 || l.startsWith('-') || l.endsWith('-'))) return 'ogni parte tra i punti da 1 a 63 caratteri, senza trattino all\'inizio o alla fine';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return 'non può avere la forma di un indirizzo IP';
  if (/^port-\d{3}(-\d{5})?$/.test(name)) return 'non può essere «port-xyz»';
  return undefined;
}

/** Nome Profinet proposto dalla sigla (e dal luogo, se c'è): +Q1 -2A1 → q1-2a1 */
export function profinetNameFor(tag: string, panelCode?: string): string {
  const raw = [panelCode, tag].filter(Boolean).join('-').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = raw.slice(0, 63).replace(/-+$/, '');
  // Un nome che comincia con una cifra non piace a tutti gli strumenti di configurazione
  return /^\d/.test(name) ? `pn-${name}` : name || 'dispositivo';
}

/**
 * Nomi Profinet automatici per le interfacce Profinet senza nome e le stazioni Profinet senza nome
 * (dentro un commit): restituisce quanti nomi sono stati scritti. I nomi già scritti restano
 */
export function assignProfinetNames(project: Project): number {
  const ifs = netInterfaces(project);
  const used = new Set<string>([...ifs.map(i => i.address ?? ''), ...(project.plc.stations ?? []).map(s => s.deviceName ?? '')].filter(Boolean).map(s => s.toLowerCase()));
  const unique = (base: string) => { let n = base, k = 2; while (used.has(n)) n = `${base}-${k++}`; used.add(n); return n; };
  let count = 0;
  for (const nif of ifs) {
    if (nif.address || !nif.protocols.includes('Profinet')) continue;
    setNetInterface(nif, { address: unique(profinetNameFor(nif.tag || nif.owner.sym.name, nif.panel?.code)) });
    count++;
  }
  for (const st of project.plc.stations ?? []) {
    if (st.deviceName || !/profinet/i.test(st.kind ?? '') || stationInterface(project, st.name, ifs)) continue;
    st.deviceName = unique(profinetNameFor(st.name));
    count++;
  }
  return count;
}

/** Interfaccia del dispositivo che è la testa o la CPU della stazione PLC (una sua scheda ha la stessa sigla) */
export function stationInterface(project: Project, station: string, ifs: NetInterface[]): NetInterface | undefined {
  const tags = new Set(project.plc.cards.filter(c => c.station === station).map(c => c.tag));
  return ifs.find(i => i.tag && tags.has(i.tag) && i.protocols.some(p => IP_PROTOCOLS.includes(p) || p === 'Profinet'));
}

/** Riga della tabella degli indirizzi di rete: un'interfaccia di un dispositivo o una stazione PLC senza dispositivo disegnato */
export interface NetAddressRow {
  nif?: NetInterface;
  /** Stazione PLC di cui il dispositivo è la CPU o la testa (o la stazione da sola) */
  station?: PlcStation;
  tag: string;
  description: string;
  panel?: Panel;
  ports: string[];
  protocols: string[];
  ip: string;
  address: string;
  network?: IpNetwork;
  el?: PlacedElement;
  /** Problemi della riga (nome Profinet o IP non validi, IP ripetuto) */
  problems: string[];
}

/** Tutti i dispositivi con porte di rete (anche senza indirizzo) e le stazioni PLC senza dispositivo disegnato */
export function networkAddressRows(project: Project, library: Part[] = []): NetAddressRow[] {
  const parts = partsIndex(project, library);
  const devs = buildDevices(project);
  const ifs = netInterfaces(project);
  const stations = project.plc.stations ?? [];
  const rows: NetAddressRow[] = [];
  for (const n of ifs) {
    const d = devs.get(n.tag);
    const station = stations.find(s => stationInterface(project, s.name, ifs) === n);
    const ip = n.ip ?? station?.ip ?? '';
    const v = parseIp(ip);
    rows.push({ nif: n, station, tag: n.tag, description: (d ? deviceInfo(d.elements, d.main, parts).description : undefined) ?? n.owner.sym.name,
      panel: n.panel, ports: n.ports.map(p => p.port), protocols: n.protocols, ip, address: n.address ?? station?.deviceName ?? '',
      network: v !== undefined ? networkOfIp(project, v) : undefined, el: n.owner, problems: [] });
  }
  for (const s of stations) {
    if (rows.some(r => r.station === s)) continue;
    const v = parseIp(s.ip);
    rows.push({ station: s, tag: '', description: `Stazione PLC ${s.name}`, ports: [], protocols: s.kind && !/locale/i.test(s.kind) ? [s.kind] : [],
      ip: s.ip ?? '', address: s.deviceName ?? '', network: v !== undefined ? networkOfIp(project, v) : undefined, problems: [] });
  }
  const byIp = new Map<string, number>();
  for (const r of rows) if (r.ip) byIp.set(r.ip.trim(), (byIp.get(r.ip.trim()) ?? 0) + 1);
  for (const r of rows) {
    if (r.ip && !isIp(r.ip)) r.problems.push('IP non valido');
    else if (r.ip && byIp.get(r.ip.trim())! > 1) r.problems.push('IP ripetuto');
    else if (r.ip && project.ipNetworks?.length && !r.network) r.problems.push('IP fuori dalle reti');
    const pn = r.protocols.includes('Profinet') || /profinet/i.test(r.station?.kind ?? '') ? profinetNameError(r.address) : undefined;
    if (pn) r.problems.push(`nome Profinet: ${pn}`);
  }
  return rows;
}

export interface NetIssue { msg: string; pageId: string; elementId: string; loc: string }

/**
 * Controlli: indirizzi ripetuti sulla stessa rete (nodi collegati con lo stesso protocollo,
 * anche attraverso gli switch) e porte punto-punto collegate a più di un cavo.
 */
export function networkProblems(project: Project): NetIssue[] {
  const links = networkLinks(project);
  const ifs = netInterfaces(project);
  const out: NetIssue[] = [];
  // Reti: nodi raggiungibili con lo stesso protocollo
  const parent = new Map<string, string>();
  const find = (a: string): string => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a)!; return a; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const l of links) union(`${l.protocol}|${l.a.el.inst.id}`, `${l.protocol}|${l.b.el.inst.id}`);
  const seen = new Map<string, NetInterface>();
  for (const n of ifs) {
    if (!n.address) continue;
    for (const proto of n.protocols) {
      const at = n.ports.find(p => p.protocols.includes(proto))!.el;
      const key = `${find(`${proto}|${at.inst.id}`)}|${n.address.trim().toLowerCase()}`;
      const other = seen.get(key);
      if (other && other.tag !== n.tag) {
        out.push({ msg: `${proto}: indirizzo ${n.address} usato da -${other.tag} e -${n.tag}`, pageId: n.owner.page.id, elementId: n.owner.inst.id, loc: locationOf(n.owner) });
      } else seen.set(key, n);
    }
    // Nome Profinet non valido
    const bad = n.protocols.includes('Profinet') ? profinetNameError(n.address) : undefined;
    if (bad) out.push({ msg: `-${n.tag}: nome Profinet «${n.address}» non valido (${bad})`, pageId: n.owner.page.id, elementId: n.owner.inst.id, loc: locationOf(n.owner) });
  }
  // Porte Ethernet (punto-punto) con più collegamenti
  const count = new Map<string, { n: number; l: NetLink; p: NetPort }>();
  for (const l of links) {
    if (protocolOf(l.protocol)?.multidrop) continue;
    for (const p of [l.a, l.b]) {
      const k = `${p.el.inst.id}|${p.port}`;
      const c = count.get(k) ?? { n: 0, l, p };
      c.n++; count.set(k, c);
    }
  }
  for (const c of count.values()) {
    if (c.n > 1) out.push({ msg: `-${c.p.el.inst.tag} porta ${c.p.port}: ${c.n} collegamenti ${c.l.protocol} sulla stessa porta (serve uno switch)`, pageId: c.p.el.page.id, elementId: c.p.el.inst.id, loc: locationOf(c.p.el) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cavi di rete: ogni collegamento bus disegnato è un cavo (patch Profinet, cavo RS485…)

/** Tipo di cavo proposto per protocollo */
export const BUS_CABLE_TYPES: Record<string, string> = {
  Profinet: 'Profinet tipo A 2×2×AWG22, verde',
  EtherCAT: 'Ethernet Cat5e SF/UTP 4×AWG26',
  'Modbus TCP': 'Ethernet Cat5e SF/UTP 4×AWG26',
  'Modbus RTU': 'RS485 2×2×0,22 schermato',
  'Profibus DP': 'Profibus 1×2×0,64 schermato, viola',
  'EtherNet/IP': 'Ethernet Cat5e SF/UTP 4×AWG26',
  CANopen: 'CAN 2×2×0,25 schermato',
  'IO-Link': 'M12 4 poli 3×0,34 PUR',
  RS485: 'RS485 2×2×0,22 schermato',
  Ethernet: 'Ethernet Cat6 S/FTP',
};

export interface BusCableRow {
  wire: Wire;
  page: Page;
  protocol: string;
  tag: string;
  type: string;
  length?: number;
  partNr?: string;
  a?: NetPort;
  b?: NetPort;
  loc: string;
  /** Tratti disegnati del cavo (più di uno se prosegue con i rimandi su altre pagine) */
  wires: Wire[];
  /** Sigle diverse sui tratti dello stesso cavo (da correggere) */
  otherTags?: string[];
}

const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01;

/**
 * Tratti di bus che sono lo stesso cavo: quelli uniti da una coppia di rimandi (il cavo prosegue su
 * un'altra pagina, es. -300W1 dalla CPU della pagina 300 allo switch della pagina 400) o che si
 * toccano fuori dalle porte dei dispositivi. Due tratti che arrivano alla stessa porta restano due
 * cavi (bus multipunto: si va di nodo in nodo).
 */
export function busCableGroups(project: Project, nets?: Net[]): { net: Net; wires: { wire: Wire; pageId: string }[] }[] {
  const nl = nets ?? computeNetlist(project).nets;
  const placed = allPlaced(project);
  const linkAt = new Map<string, { pageId: string; p: Pt }>();
  for (const e of placed) if (e.sym.role === 'link') { const q = pinsWorld(e.inst, e.sym)[0]; if (q) linkAt.set(e.inst.id, { pageId: e.page.id, p: q }); }
  const partners = linkPartners(project, placed);
  const out: { net: Net; wires: { wire: Wire; pageId: string }[] }[] = [];
  for (const n of nl) {
    const ws = n.wires.filter(w => w.wire.bus);
    if (!ws.length) continue;
    const parent = ws.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };
    const ends = (w: { wire: Wire }) => [w.wire.points[0], w.wire.points[w.wire.points.length - 1]];
    const atPort = (pageId: string, p: Pt) => n.pins.some(q => q.el.page.id === pageId && near(q.pos, p));
    // Capi in comune fuori dalle porte (anche sul punto di un rimando)
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      if (ws[i].pageId !== ws[j].pageId) continue;
      if (ends(ws[i]).some(a => ends(ws[j]).some(b => near(a, b) && !atPort(ws[i].pageId, a)))) union(i, j);
    }
    // Rimandi abbinati: il tratto che arriva alla partenza e quello che parte dall'arrivo
    const touching = (id: string) => {
      const l = linkAt.get(id);
      return l ? ws.flatMap((w, i) => (w.pageId === l.pageId && ends(w).some(e => near(e, l.p)) ? [i] : [])) : [];
    };
    for (const id of n.linkIds ?? []) {
      const mine = touching(id);
      for (const o of partners.get(id) ?? []) for (const j of touching(o.inst.id)) for (const i of mine) union(i, j);
    }
    const groups = new Map<number, { wire: Wire; pageId: string }[]>();
    ws.forEach((w, i) => { const r = find(i); const g = groups.get(r); if (g) g.push(w); else groups.set(r, [w]); });
    for (const g of groups.values()) out.push({ net: n, wires: g });
  }
  return out;
}

/**
 * Cavi di rete: un cavo per ogni tratto di bus disegnato, o per ogni gruppo di tratti uniti dai
 * rimandi. Le estremità sono le porte toccate dai suoi capi; se un capo finisce su un altro filo si
 * usa l'ordine dei collegamenti di rete.
 */
export function busCableRows(project: Project, nets?: Net[]): BusCableRow[] {
  const nl = nets ?? computeNetlist(project).nets;
  const labels = effectivePinLabels(project);
  const locs = deviceLocs(project);
  const pages = new Map(project.pages.map(p => [p.id, p]));
  const out: BusCableRow[] = [];
  const groups = busCableGroups(project, nl);
  const perNet = new Map<Net, number>();
  for (const g of groups) perNet.set(g.net, (perNet.get(g.net) ?? 0) + 1);
  const seen = new Map<Net, number>();
  for (const { net: n, wires } of groups) {
    const proto = busOf(n);
    if (!proto) continue;
    const k = seen.get(n) ?? 0;
    seen.set(n, k + 1);
    const sorted = [...n.pins].sort((a, b) => a.el.pageIndex - b.el.pageIndex || a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    const port = (p: Net['pins'][number]): NetPort => ({ el: p.el, port: labels.get(p.el.inst.id)?.[p.pinId] || p.label || '', panel: panelOfElement(project, p.el, locs) });
    // Porte toccate dai capi dei tratti, nell'ordine delle pagine
    const touched = sorted.filter(p => wires.some(({ wire, pageId }) => p.el.page.id === pageId && [wire.points[0], wire.points[wire.points.length - 1]].some(e => near(p.pos, e))));
    let a: Net['pins'][number] | undefined = touched[0], b = touched.find(p => p !== a);
    if (perNet.get(n) === 1) { a ??= sorted[0]; b ??= sorted.find(p => p !== a) ?? sorted[1]; }
    else if (!a || !b) { a ??= sorted[k]; b ??= sorted[k + 1]; }
    // Dati del cavo: dal primo tratto che li ha (di solito quello con la sigla)
    const first = <K extends keyof NonNullable<Wire['busCable']>>(key: K) => wires.map(w => w.wire.busCable?.[key]).find(v => v !== undefined && v !== '');
    const main = wires.find(w => w.wire.busCable?.tag) ?? wires[0];
    const tags = [...new Set(wires.map(w => w.wire.busCable?.tag).filter((t): t is string => !!t))];
    const page = pages.get(main.pageId)!;
    out.push({
      wire: main.wire, page, protocol: proto, tag: tags[0] ?? '', type: first('type') ?? BUS_CABLE_TYPES[proto] ?? '',
      length: first('length') as number | undefined, partNr: first('partNr') as string | undefined,
      a: a ? port(a) : undefined, b: b && b !== a ? port(b) : undefined,
      loc: `${page.name}.${columnOf(main.wire.points[0].x)}`,
      wires: wires.map(w => w.wire), otherTags: tags.length > 1 ? tags.slice(1) : undefined,
    });
  }
  return out.sort((x, y) => x.tag.localeCompare(y.tag, undefined, { numeric: true }));
}

/**
 * Sigle di tutti i cavi del progetto (multipolari e di rete): una per cavo, anche se un cavo di rete
 * è disegnato in più tratti uniti dai rimandi
 */
export function allCableTags(project: Project, nets?: Net[]): string[] {
  const out = (project.cables ?? []).map(c => c.tag);
  const hasBus = project.pages.some(pg => pg.elements.some(e => e.kind === 'wire' && e.bus && e.busCable?.tag));
  if (!hasBus) return out;
  for (const g of busCableGroups(project, nets)) out.push(...new Set(g.wires.map(w => w.wire.busCable?.tag).filter((t): t is string => !!t)));
  return out;
}

/**
 * Assegna la sigla ai cavi di rete che non ne hanno una (es. "5W1"); un tratto che prosegue un cavo
 * con i rimandi ne prende sigla, tipo, lunghezza e articolo. Restituisce quanti.
 */
export function assignBusCableTags(project: Project, only?: Set<string>): number {
  const todo = project.pages.flatMap(pg => pg.elements.flatMap(e => (e.kind === 'wire' && e.bus && !e.busCable?.tag && (!only || only.has(e.id)) ? [{ pg, e }] : [])));
  if (!todo.length) return 0;
  // Cavi già siglati con i tratti uniti dai rimandi
  const groupOf = new Map<Wire, Wire[]>();
  for (const g of busCableGroups(project)) for (const w of g.wires) groupOf.set(w.wire, g.wires.map(x => x.wire));
  let n = 0;
  for (const { pg, e } of todo) {
    if (e.busCable?.tag) continue;
    const from = groupOf.get(e)?.find(w => w !== e && w.busCable?.tag);
    if (from) { e.busCable = { ...from.busCable, ...Object.fromEntries(Object.entries(e.busCable ?? {}).filter(([, v]) => v !== undefined)) }; n++; continue; }
    const x = Math.min(...e.points.map(p => p.x));
    e.busCable = { ...e.busCable, tag: nextTagFor(project, 'W', pg, x, allCableTags(project)) };
    n++;
  }
  return n;
}

export const portText = (p?: NetPort) => (p ? `-${p.el.inst.tag}:${p.port}` : '');

// ---------------------------------------------------------------------------
// Piano indirizzi IP

/** Protocolli che viaggiano su IP (EtherCAT e i bus seriali no) */
export const IP_PROTOCOLS = ['Profinet', 'Modbus TCP', 'EtherNet/IP', 'Ethernet'];

export function parseIp(s?: string): number | undefined {
  const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(s ?? '');
  if (!m) return undefined;
  const b = m.slice(1).map(Number);
  if (b.some(x => x > 255)) return undefined;
  return ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
}

export const formatIp = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const maskOf = (prefix: number) => (prefix <= 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
export const netmask = (prefix: number) => formatIp(maskOf(prefix));
export const isIp = (s?: string) => parseIp(s) !== undefined;

/** Indirizzo IP di un nodo: il campo IP o, nei progetti precedenti, l'indirizzo se ha la forma di un IP */
export const nodeIp = (inst: SymbolInstance) => inst.ip ?? (isIp(inst.netAddress) ? inst.netAddress : undefined);

export function inNetwork(net: IpNetwork, ip: number): boolean {
  const base = parseIp(net.address);
  if (base === undefined) return false;
  const m = maskOf(net.prefix);
  return ((ip & m) >>> 0) === ((base & m) >>> 0);
}

export const networkOfIp = (project: Project, ip: number) => (project.ipNetworks ?? []).find(n => inNetwork(n, ip));

export function newIpNetwork(project: Project): IpNetwork {
  const k = (project.ipNetworks ?? []).length;
  return { id: uid('n'), name: k ? `Rete ${k + 1}` : 'Rete macchina', address: `192.168.${k}.0`, prefix: 24, firstHost: 10 };
}

export interface IpEntry {
  ip: string;
  tag: string;
  description: string;
  /** Nome del dispositivo Profinet o indirizzo del nodo */
  name: string;
  protocols: string[];
  panel?: Panel;
  network?: IpNetwork;
  /** Nodo disegnato (assente per le sole stazioni PLC) */
  el?: PlacedElement;
  source: 'nodo' | 'stazione' | 'gateway';
}

/**
 * Piano IP: i nodi di rete con un indirizzo IP, le stazioni PLC con IP e i gateway delle reti.
 * Una stazione con lo stesso IP (o la stessa CPU) di un nodo disegnato non viene ripetuta.
 */
export function ipPlan(project: Project, library: Part[] = []): IpEntry[] {
  const parts = partsIndex(project, library);
  const devs = buildDevices(project);
  const out: IpEntry[] = [];
  for (const n of netInterfaces(project)) {
    const ip = n.ip;
    if (!ip) continue;
    const d = devs.get(n.tag);
    const info = d ? deviceInfo(d.elements, d.main, parts) : undefined;
    const v = parseIp(ip);
    out.push({
      ip, tag: n.tag, description: info?.description ?? n.owner.sym.name, name: n.address ?? '',
      protocols: n.protocols, panel: n.panel, network: v !== undefined ? networkOfIp(project, v) : undefined, el: n.owner, source: 'nodo',
    });
  }
  for (const s of project.plc.stations ?? []) {
    if (!s.ip) continue;
    const cpuTags = project.plc.cards.filter(c => c.station === s.name).map(c => c.tag);
    const same = out.find(e => e.ip.trim() === s.ip!.trim() || cpuTags.includes(e.tag));
    if (same) { if (!same.name && s.deviceName) same.name = s.deviceName; continue; }
    const v = parseIp(s.ip);
    out.push({ ip: s.ip, tag: '', description: `Stazione PLC ${s.name}${s.kind ? ` (${s.kind})` : ''}`, name: s.deviceName ?? '', protocols: s.kind ? [s.kind] : [],
      network: v !== undefined ? networkOfIp(project, v) : undefined, source: 'stazione' });
  }
  for (const n of project.ipNetworks ?? []) {
    if (n.gateway && !out.some(e => e.ip.trim() === n.gateway!.trim())) out.push({ ip: n.gateway, tag: '', description: 'Gateway', name: '', protocols: [], network: n, source: 'gateway' });
  }
  return out.sort((a, b) => (parseIp(a.ip) ?? 0) - (parseIp(b.ip) ?? 0));
}

/** Controlli del piano IP: indirizzi non validi, ripetuti, fuori dalle reti, indirizzo di rete o broadcast */
export function ipProblems(project: Project): NetIssue[] {
  const out: NetIssue[] = [];
  const plan = ipPlan(project);
  const at = (e: IpEntry) => (e.el ? { pageId: e.el.page.id, elementId: e.el.inst.id, loc: locationOf(e.el) } : { pageId: '', elementId: '', loc: '' });
  const who = (e: IpEntry) => (e.tag ? `-${e.tag}` : e.description);
  const seen = new Map<number, IpEntry>();
  const nets = project.ipNetworks ?? [];
  for (const e of plan) {
    const v = parseIp(e.ip);
    if (v === undefined) { out.push({ msg: `${who(e)}: indirizzo IP "${e.ip}" non valido`, ...at(e) }); continue; }
    const other = seen.get(v);
    if (other) out.push({ msg: `Indirizzo IP ${e.ip} usato da ${who(other)} e ${who(e)}`, ...at(e) });
    else seen.set(v, e);
    if (!nets.length) continue;
    const net = e.network;
    if (!net) { out.push({ msg: `${who(e)}: ${e.ip} fuori da tutte le reti del piano IP`, ...at(e) }); continue; }
    const m = maskOf(net.prefix);
    if (net.prefix < 31 && ((v & ~m) >>> 0 === 0 || (v | ~m) >>> 0 === v)) out.push({ msg: `${who(e)}: ${e.ip} è l'indirizzo di rete o di broadcast di ${net.address}/${net.prefix}`, ...at(e) });
    if (net.protocols?.length && e.protocols.length && !e.protocols.some(p => net.protocols!.includes(p))) out.push({ msg: `${who(e)}: protocollo ${e.protocols.join(', ')} ma la rete ${net.name} è per ${net.protocols.join(', ')}`, ...at(e) });
  }
  for (const n of nets) {
    if (parseIp(n.address) === undefined || n.prefix < 1 || n.prefix > 32) out.push({ msg: `Rete ${n.name}: indirizzo ${n.address}/${n.prefix} non valido`, pageId: '', elementId: '', loc: '' });
    const g = parseIp(n.gateway);
    if (n.gateway && (g === undefined || !inNetwork(n, g))) out.push({ msg: `Rete ${n.name}: gateway ${n.gateway} fuori dalla rete`, pageId: '', elementId: '', loc: '' });
  }
  return out;
}

/**
 * Assegna in automatico gli IP ai nodi collegati con un protocollo su IP che non ne hanno:
 * la rete è quella del protocollo (o la prima), dal primo indirizzo host libero.
 */
export function assignIps(project: Project): number {
  const nets = project.ipNetworks ?? [];
  if (!nets.length) return 0;
  const used = new Set<number>();
  for (const e of ipPlan(project)) { const v = parseIp(e.ip); if (v !== undefined) used.add(v); }
  let count = 0;
  for (const n of netInterfaces(project)) {
    if (n.ip) continue;
    const ipProtos = n.protocols.filter(p => IP_PROTOCOLS.includes(p));
    if (!ipProtos.length) continue;
    const net = nets.find(x => x.protocols?.some(p => ipProtos.includes(p))) ?? nets.find(x => !x.protocols?.length) ?? nets[0];
    const base = parseIp(net.address);
    if (base === undefined) continue;
    const m = maskOf(net.prefix);
    const size = 2 ** (32 - net.prefix);
    for (let h = Math.max(1, net.firstHost ?? 1); h < size - 1; h++) {
      const v = (((base & m) >>> 0) + h) >>> 0;
      if (used.has(v)) continue;
      used.add(v);
      setNetInterface(n, { ip: formatIp(v) });
      count++;
      break;
    }
  }
  return count;
}
