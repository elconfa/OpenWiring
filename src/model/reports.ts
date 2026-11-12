// Liste di progetto: distinta materiali, lista dispositivi, morsetti, connessioni.
import { SEQ_MODE_NAMES } from './wiringOrder';
import type { Project, Part, SymbolDef, Cable, Jumper } from './types';
import { buildDevices, deviceInfo, designation, partsIndex, locationOf, allPlaced as placedSymbols, type DeviceInfo } from './devices';
import { terminalBomItems, terminalConnections, allStrips, stripData, stripAccessories } from './terminals';
import { cableInfos, cableSection, conductorEnds, cableByPiece } from './cables';
import { wireList, ferrule, layoutBomItems, ductFill, type DuctFill } from './layout';
import { networkLinks, networkNodes, devicePanels, busCableRows, portText, ipPlan, netmask, networkAddressRows } from './network';
import { connectorRows, allConnectors, pinCount } from './connectors';
import { connectorType } from './connectorTypes';
import { distSlots, slotRow, SLOT_COLUMNS } from './distributors';
import { computeNetlist, connections, withNetlistCache } from './netlist';
import { pageRevision } from './revisions';
import { documentsReport } from './partDocs';
import { thermalReport, cableCalcReport } from './calculations';
import { cardOrderInfo, ioAssignments } from './plc';
import { pageOfLocation } from './devices';

import { customListTable } from './customLists';
import { bundleTaps, bundleConductors, bundleConductorList } from './bundles';
import { columnOf } from './types';

export interface Table {
  title: string;
  columns: string[];
  rows: string[][];
  /** Collegamenti del PDF: per ogni riga, colonna → pagina di destinazione (nome pagina) */
  goto?: Record<number, string | undefined>[];
  /** Per ogni riga, simbolo disegnato nella prima colonna (legenda dei simboli) */
  symbols?: (SymbolDef | undefined)[];
  /** Altezza delle righe nelle pagine di lista (mm; assente = 5) */
  rowH?: number;
  /** Colonna che fa cambiare pagina quando cambia il suo valore (es. la morsettiera) */
  breakKey?: string;
  /** Per ogni riga, il filo del collegamento (vista Liste: tasto destro ▸ ordine dei collegamenti) */
  wires?: (string | undefined)[];
}

/** Altezza delle righe in mm e righe per foglio delle pagine di lista (40 righe da 5 mm) */
export const REPORT_AREA_H = 200;
export const sheetRows = (t: Pick<Table, 'rowH'>) => Math.floor(REPORT_AREA_H / (t.rowH ?? 5));

export const LEGEND_TITLE = 'Legenda simboli';

/**
 * Legenda dei simboli usati negli schemi (come nelle pagine «Legenda simboli» di EPLAN e degli
 * schemi tradizionali): un simbolo per riga, disegnato, con la descrizione, la lettera di sigla
 * (IEC 81346-2) e quante volte è usato. Ordinata per categoria della libreria.
 */
export function legendReport(project: Project): Table {
  const used = new Map<string, { sym: SymbolDef; n: number }>();
  for (const el of placedSymbols(project)) {
    if (el.sym.hidden || !['multiline', 'singleline', 'network'].includes(el.page.type)) continue;
    const u = used.get(el.sym.id);
    if (u) u.n++; else used.set(el.sym.id, { sym: el.sym, n: 1 });
  }
  const list = [...used.values()].sort((a, b) => a.sym.category.localeCompare(b.sym.category) || a.sym.name.localeCompare(b.sym.name));
  return {
    title: LEGEND_TITLE, columns: ['Simbolo', 'Descrizione', 'Lettera', 'Categoria', 'Usato'], rowH: 16,
    rows: list.map(u => ['', u.sym.description ? `${u.sym.name} – ${u.sym.description}` : u.sym.name, u.sym.letter, u.sym.category, String(u.n)]),
    symbols: list.map(u => u.sym),
  };
}

export const partIndex = partsIndex;

/**
 * Distinta materiali. Si raggruppa per codice articolo; i dispositivi senza articolo ma con
 * codice di ordinazione vengono raggruppati per costruttore + codice di ordinazione.
 */
/** keep: solo gli elementi con queste sigle (es. i dispositivi dei quadri da stampare, vedi panelScope.ts) */
export function bomReport(project: Project, library: Part[] = [], keep?: (tag: string) => boolean): Table {
  const parts = partsIndex(project, library);
  interface Row { qty: number; tags: string[]; partNr: string; typeNr: string; descr: string; manufacturer: string; orderNr: string }
  const agg = new Map<string, Row>();
  // refs: altri riferimenti che decidono se l'elemento resta (es. le estremità di un cavo)
  const add = (info: DeviceInfo, tag: string, qty = 1, refs: string[] = []) => {
    if (keep && !keep(tag) && !refs.some(keep)) return;
    const key = info.partNr ? `P|${info.partNr}` : info.orderNr ? `O|${info.manufacturer ?? ''}|${info.orderNr}` : undefined;
    if (!key) return;
    const r = agg.get(key) ?? {
      qty: 0, tags: [], partNr: info.partNr ?? '', typeNr: info.typeNr ?? '',
      descr: info.part?.descr1 ?? info.description ?? '', manufacturer: info.manufacturer ?? '', orderNr: info.orderNr ?? '',
    };
    r.qty += qty; r.tags.push(tag); agg.set(key, r);
  };
  // Schede PLC: se nello schema c'è il dispositivo della scheda (es. la CPU con il suo articolo)
  // valgono i suoi dati e lo conta il ciclo dei dispositivi; altrimenti i dati della scheda (vista
  // PLC), non quelli dei punti I/O
  const devices = buildDevices(project);
  const cardOnly = new Set<string>();
  for (const c of project.plc.cards) {
    const o = cardOrderInfo(project, c, parts, devices);
    if (o.fromDevice) continue;
    cardOnly.add(c.tag);
    add(o.info, `-${c.tag}`);
  }
  for (const d of devices.values()) {
    if (cardOnly.has(d.tag)) continue;
    if (d.elements.every(e => e.sym.role === 'terminal')) continue;
    {
      const info = deviceInfo(d.elements, d.main, parts);
      const tag = designation(d.tag, info.func, info.loc);
      add(info, tag);
      // Articoli aggiuntivi (es. barra di prolunga e manopola del sezionatore)
      for (const x of info.extraParts ?? []) {
        if (!x.partNr) continue;
        const part = parts.get(x.partNr);
        add({ partNr: x.partNr, part, typeNr: part?.typeNr, manufacturer: part?.manufacturer ?? x.manufacturer, orderNr: part ? part.orderNr : x.partNr, description: part?.descr1 ?? x.descr }, tag, x.qty ?? 1);
      }
    }
  }
  // Morsetti: un articolo per morsetto fisico (tutti i piani insieme), riserve e accessori
  for (const it of terminalBomItems(project, library)) add(it.info, it.tag, it.qty);
  // Controparti dei connettori (spina per la presa da quadro…)
  for (const [conn, d] of Object.entries(project.connectors ?? {})) {
    if (!d.matingPartNr) continue;
    const part = parts.get(d.matingPartNr);
    add({ partNr: d.matingPartNr, part, typeNr: part?.typeNr, manufacturer: part?.manufacturer, orderNr: part?.orderNr, description: part?.descr1 }, `-${conn} (controparte)`);
  }
  // Connettori del catalogo (ILME…) senza articolo: inserto maschio e/o femmina e una custodia per lato
  for (const [conn, d] of Object.entries(project.connectors ?? {})) {
    const t = connectorType(d.type);
    if (!t || devices.get(conn)?.partNr) continue;
    const sides = d.gender === 'M' ? ['M'] : d.gender === 'F' ? ['F'] : ['M', 'F'];
    for (const g of sides) {
      const code = g === 'M' ? t.male : t.female;
      add({ typeNr: code, manufacturer: t.shape ? '' : t.maker, orderNr: code, description: t.shape ? `${t.series} ${g === 'M' ? 'maschio' : 'femmina'}, ${t.contact}` : `Inserto ${g === 'M' ? 'maschio' : 'femmina'} ${t.series} ${t.poles}${t.pe ? '+PE' : ''}, ${t.amps} A, ${t.contact}` }, `-${conn}`);
      const housing = d.housing ?? (t.housing ? (t.shape ? t.housing : `Custodia ${t.housing}`) : '');
      if (housing) add({ typeNr: housing, manufacturer: t.maker, orderNr: housing, description: `Custodia per -${conn} (${g === 'M' ? 'lato maschio' : 'lato femmina'}), da scegliere: base da parete, da pannello o volante` }, `-${conn}`);
    }
  }
  // Ripartitori e barre di terra: un articolo per ripartitore (non per gruppo disegnato)
  for (const d of project.distributors ?? []) {
    if (!d.partNr || devices.get(d.tag)?.partNr) continue;
    const part = parts.get(d.partNr);
    add({ partNr: d.partNr, part, typeNr: part?.typeNr, manufacturer: part?.manufacturer, orderNr: part?.orderNr, description: part?.descr1 ?? d.description }, `-${d.tag}`);
  }
  // Guide DIN e canaline del layout: metri
  for (const it of layoutBomItems(project)) {
    const part = parts.get(it.partNr);
    add({ partNr: it.partNr, part, typeNr: part?.typeNr, manufacturer: part?.manufacturer, orderNr: part?.orderNr, description: part?.descr1 }, it.tag, it.meters);
  }
  // Cavi: quantità in metri se la lunghezza è indicata; i cavi confezionati a pezzi
  const ends = keep ? new Map(cableInfos(project).map(i => [i.cable.id, i.conductors.flatMap(k => conductorEnds(k))])) : undefined;
  for (const c of project.cables ?? []) {
    if (!c.partNr) continue;
    const part = parts.get(c.partNr);
    add({ partNr: c.partNr, part, typeNr: part?.typeNr ?? c.type, manufacturer: part?.manufacturer, orderNr: part?.orderNr, description: part?.descr1 ?? c.description }, `-${c.tag}`, cableByPiece(c, part) ? 1 : c.length ?? 1,
      [c.from ?? '', c.to ?? '', ...(ends?.get(c.id) ?? [])]);
  }
  // Cavi di rete con articolo
  for (const r of busCableRows(project)) {
    if (!r.partNr) continue;
    const part = parts.get(r.partNr);
    add({ partNr: r.partNr, part, typeNr: part?.typeNr ?? r.type, manufacturer: part?.manufacturer, orderNr: part?.orderNr, description: part?.descr1 ?? r.type }, `-${r.tag}`, r.length ?? 1,
      [r.a ? `-${r.a.el.inst.tag}` : '', r.b ? `-${r.b.el.inst.tag}` : '']);
  }
  const rows = [...agg.values()]
    .sort((a, b) => (a.partNr || a.orderNr).localeCompare(b.partNr || b.orderNr))
    .map((r, i) => [String(i + 1), String(Math.round(r.qty * 100) / 100).replace('.', ','), r.partNr, r.typeNr, r.descr, r.manufacturer, r.orderNr, compactTags(r.tags)]);
  return { title: 'Distinta materiali', columns: ['Pos.', 'Q.tà', 'Codice articolo', 'Tipo', 'Descrizione', 'Costruttore', 'Codice ordinazione', 'Sigle'], rows };
}

function compactTags(tags: string[]): string {
  const uniq = [...new Set(tags)];
  return uniq.length > 8 ? `${uniq.slice(0, 8).join(', ')} … (+${uniq.length - 8})` : uniq.join(', ');
}

export function deviceReport(project: Project, library: Part[] = []): Table {
  const parts = partsIndex(project, library);
  const devices = [...buildDevices(project).values()]
    .filter(d => !d.elements.every(e => e.sym.role === 'terminal'))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  const goto: Record<number, string | undefined>[] = [];
  const where = devicePanels(project);
  const rows = devices.map(d => {
    const info = deviceInfo(d.elements, d.main, parts);
    const first = d.main ?? d.elements[0];
    goto.push({ 0: first.page.name, 6: first.page.name });
    return [
      designation(d.tag, info.func, info.loc ?? where.get(d.tag)?.code),
      info.description || d.elements[0].sym.name,
      info.techData ?? '',
      info.manufacturer ?? '',
      info.orderNr ?? '',
      info.partNr ?? '',
      d.elements.map(e => `${e.sym.name} (${locationOf(e)})`).join('; '),
      info.note ?? '',
    ];
  });
  return {
    title: 'Lista dispositivi',
    columns: ['Sigla', 'Descrizione', 'Dati tecnici', 'Costruttore', 'Codice ordinazione', 'Articolo', 'Elementi e posizione', 'Note'],
    rows, goto,
  };
}

/** Ponticello come scritto nelle liste dei morsetti, es. "Pettine 1-2-3" */
const jumperText = (j: Jumper) => `${j.kind === 'comb' ? 'Pettine' : 'Fisso'} ${j.terminals.join('-')}`;

export function terminalReport(project: Project): Table {
  const conns = terminalConnections(project);
  const rows = conns.map(c => [
    c.row.strip, c.row.no, c.row.level, c.row.spare ? 'Riserva' : c.type,
    c.ext, c.extWire, c.int, c.intWire, c.jumper ? jumperText(c.jumper) : '', c.locations.map(l => l.loc).join(', '),
    // Morsetto a più piani: un solo articolo, scritto sul primo piano
    c.sameAs ? `= ${c.sameAs}` : c.partNr ?? '',
  ]);
  const goto = conns.map(c => ({ 9: c.locations[0] ? c.locations[0].loc.slice(0, c.locations[0].loc.lastIndexOf('.')) : undefined }));
  return {
    goto, title: 'Lista morsetti', breakKey: 'Morsettiera',
    columns: ['Morsettiera', 'Morsetto', 'Piano', 'Tipo', 'Esterno (sopra)', 'Filo est.', 'Interno (sotto)', 'Filo int.', 'Ponticello', 'Posizione', 'Articolo'],
    rows,
  };
}

export function connectionReport(project: Project): Table {
  const nl = computeNetlist(project);
  const conns = connections(nl, project);
  // Conduttore di cavo per ogni filo, es. "-1W1:BN"
  const cond = new Map<string, string>();
  for (const ci of cableInfos(project, nl)) {
    // Con più conduttori sullo stesso potenziale (in parallelo) ognuno vale solo per il suo filo
    const perNet = new Map<string, number>();
    for (const k of ci.conductors) if (k.net) perNet.set(k.net.id, (perNet.get(k.net.id) ?? 0) + 1);
    for (const k of ci.conductors) {
      const own = !k.net || (perNet.get(k.net.id) ?? 0) > 1 ? [{ wire: k.wire }] : k.net.wires;
      for (const w of own) cond.set(w.wire.id, `-${k.cable.tag}:${k.name}`);
    }
  }
  // Ponticelli tra morsetti: collegamenti senza filo, uno per ogni coppia di morsetti vicini
  for (const strip of allStrips(project)) {
    for (const j of stripData(project, strip).jumpers) {
      for (let i = 0; i < j.terminals.length - 1; i++) {
        conns.push({
          net: j.kind === 'comb' ? 'Ponticello a pettine' : 'Ponticello', wireNo: '',
          from: `-${strip}:${j.terminals[i]}`, to: `-${strip}:${j.terminals[i + 1]}`, fromLoc: '', toLoc: '',
        });
      }
    }
  }
  const rows = conns.map((c, i) =>
    [String(i + 1), c.wireNo, c.net, c.from, c.fromLoc, c.to, c.toLoc, c.cross ?? '', c.color ?? '', c.wireId ? cond.get(c.wireId) ?? '' : '',
      c.seq ? SEQ_MODE_NAMES[c.seq] : c.wireId ? 'dal potenziale' : '']);
  const goto = conns.map(c => ({ 4: c.fromLoc || undefined, 6: c.toLoc || undefined }));
  return { goto, title: 'Lista connessioni', columns: ['N.', 'N. filo', 'Rete', 'Da', 'Pag.', 'A', 'Pag.', 'Sezione', 'Colore', 'Cavo', 'Sequenza'], rows, wires: conns.map(c => c.wireId) };
}

/**
 * Lista fili per il cablaggio: un filo per riga con sezione, colore, puntali e lunghezza
 * stimata dal layout del quadro (percorso tra gli apparecchi più la riserva alle estremità).
 */
export function wireListReport(project: Project): Table {
  const list = wireList(project).filter(x => x.conn.wireNo);
  const rows = list.map((x, i) => {
    const c = x.conn;
    const f = ferrule(c.cross);
    return [String(i + 1), c.wireNo, c.from, c.to, c.cross ? `${c.cross} mm²` : '', c.color ?? '', f, f,
      x.length !== undefined ? (x.length / 1000).toFixed(2).replace('.', ',') : '', c.fromLoc || c.toLoc];
  });
  const goto = list.map(x => ({ 9: x.conn.fromLoc || x.conn.toLoc || undefined }));
  return { goto, title: 'Lista fili (cablaggio)', columns: ['N.', 'N. filo', 'Da', 'A', 'Sezione', 'Colore', 'Puntale da', 'Puntale a', 'Lunghezza (m)', 'Pag.'], rows, wires: list.map(x => x.conn.wireId) };
}

/** Collegamenti di rete: protocollo, porte collegate, quadri e collegamenti tra quadri */
export function networkLinkReport(project: Project): Table {
  const links = networkLinks(project).sort((a, b) => a.protocol.localeCompare(b.protocol));
  const q = (p?: { code: string }) => (p ? `+${p.code}` : '');
  const rows = links.map((l, i) => [String(i + 1), l.protocol, `-${l.a.el.inst.tag}:${l.a.port}`, q(l.a.panel), `-${l.b.el.inst.tag}:${l.b.port}`, q(l.b.panel),
    l.wire?.busCable?.tag ? `-${l.wire.busCable.tag}` : '', l.crossPanel ? 'tra quadri' : '', l.loc]);
  const goto = links.map(l => ({ 8: l.loc.slice(0, l.loc.lastIndexOf('.')) }));
  return { goto, title: 'Collegamenti di rete', columns: ['N.', 'Protocollo', 'Da', 'Quadro', 'A', 'Quadro', 'Cavo', 'Note', 'Posizione'], rows };
}

/** Piano indirizzi IP: un indirizzo per riga con rete, maschera, gateway, dispositivo e luogo */
export function ipPlanReport(project: Project, library: Part[] = []): Table {
  const plan = ipPlan(project, library);
  const rows = plan.map(e => [e.ip, e.network ? netmask(e.network.prefix) : '', e.network?.gateway ?? '', e.network ? `${e.network.name} (${e.network.address}/${e.network.prefix})` : '',
    e.tag ? `-${e.tag}` : '', e.description, e.name, e.protocols.join(', '), e.panel ? `+${e.panel.code} ${e.panel.name}` : '', e.el ? locationOf(e.el) : '']);
  const goto = plan.map(e => ({ 9: e.el?.page.name }));
  return { goto, title: 'Piano indirizzi IP', columns: ['Indirizzo IP', 'Maschera', 'Gateway', 'Rete', 'Dispositivo', 'Descrizione', 'Nome dispositivo', 'Protocolli', 'Luogo', 'Posizione'], rows };
}

/** Indirizzi di rete: tutti i dispositivi con porte di rete, anche senza indirizzo, e le stazioni PLC */
export const NET_ADDRESS_TITLE = 'Indirizzi di rete';
export function networkAddressReport(project: Project, library: Part[] = []): Table {
  const list = networkAddressRows(project, library);
  const rows = list.map(r => [r.tag ? `-${r.tag}` : '', r.description, r.panel ? `+${r.panel.code} ${r.panel.name}` : '', r.ports.join(', '), r.protocols.join(', '),
    r.ip, r.address, r.network ? `${r.network.name} (${r.network.address}/${r.network.prefix})` : '', r.station?.name ?? '', r.el ? locationOf(r.el) : '']);
  const goto = list.map(r => ({ 9: r.el?.page.name }));
  return { goto, title: NET_ADDRESS_TITLE, columns: ['Dispositivo', 'Descrizione', 'Luogo', 'Porte', 'Protocolli', 'Indirizzo IP', 'Nome Profinet / indirizzo', 'Rete IP', 'Stazione PLC', 'Posizione'], rows };
}

/** Nodi di rete con indirizzo, protocolli e quadro */
export function networkNodeReport(project: Project): Table {
  const nodes = networkNodes(project).sort((a, b) => a.el.inst.tag.localeCompare(b.el.inst.tag, undefined, { numeric: true }));
  const rows = nodes.map(n => [`-${n.el.inst.tag}`, n.el.sym.name, n.protocols.join(', '), n.address, n.panel ? `+${n.panel.code} ${n.panel.name}` : '', locationOf(n.el)]);
  const goto = nodes.map(n => ({ 5: n.el.page.name }));
  return { goto, title: 'Nodi di rete', columns: ['Dispositivo', 'Tipo', 'Protocolli', 'Indirizzo', 'Quadro', 'Posizione'], rows };
}

/** Lista connettori: un pin per riga con le destinazioni dei due lati */
export function connectorReport(project: Project, library: Part[] = []): Table {
  const rows: string[][] = [];
  const goto: Record<number, string | undefined>[] = [];
  for (const c of allConnectors(project)) {
    const n = pinCount(project, c, library);
    const d = project.connectors?.[c];
    for (const r of connectorRows(project, c)) {
      rows.push([`-${c}`, r.no, r.type, r.sideA, r.sideB, r.wires, r.els.map(e => locationOf(e)).join(', '), n ? `${connectorRows(project, c).length}/${n}` : '', d?.description ?? '']);
      goto.push({ 6: r.els[0]?.page.name });
    }
  }
  return { goto, title: 'Lista connettori', columns: ['Connettore', 'Pin', 'Tipo', 'Lato 1', 'Lato 2', 'Fili', 'Posizione', 'Pin usati', 'Descrizione'], rows };
}

/** Lista cavi: un cavo per riga con tipo, conduttori usati/totali, lunghezza ed estremità */
export function cableReport(project: Project): Table {
  const infos = cableInfos(project).sort((a, b) => a.cable.tag.localeCompare(b.cable.tag, undefined, { numeric: true }));
  const rows = infos.map(i => {
    const c = i.cable;
    return [`-${c.tag}`, c.type ?? '', cableSection(c), `${i.conductors.length}/${c.conductors.length}`, i.spare.join(' '),
      c.length !== undefined ? String(c.length).replace('.', ',') : '', c.from ?? '', c.to ?? '', c.description ?? '',
      i.lines.map(l => l.loc).join(', '), c.partNr ?? ''];
  });
  const goto = infos.map(i => ({ 9: i.lines[0]?.loc.slice(0, i.lines[0].loc.lastIndexOf('.')) }));
  // Cavi di rete: uno per collegamento bus, con le porte alle estremità
  for (const r of busCableRows(project)) {
    rows.push([r.tag ? `-${r.tag}` : '', r.type, r.protocol, '', '', r.length !== undefined ? String(r.length).replace('.', ',') : '',
      portText(r.a), portText(r.b), `Cavo ${r.protocol}`, r.loc, r.partNr ?? '']);
    goto.push({ 9: r.page.name });
  }
  return { goto, title: 'Lista cavi', columns: ['Cavo', 'Tipo', 'Formazione', 'Usati', 'Liberi', 'Lunghezza (m)', 'Da', 'A', 'Descrizione', 'Posizione', 'Articolo'], rows };
}

export const BUNDLE_TITLE = 'Collegamenti bus fili';

/**
 * Collegamenti dei bus fili: un conduttore per riga, nell'ordine del cavo del bus (colori o numeri),
 * con i dispositivi alle due estremità (pagina di partenza e di arrivo), numero filo e pagine; i
 * conduttori liberi del cavo e quelli che entrano senza uscire sono segnati nelle note
 */
export function bundleReport(project: Project, library: Part[] = []): Table {
  const { taps, groupOf, names } = bundleTaps(project);
  const nl = computeNetlist(project);
  const parts = partsIndex(project, library);
  const pageIdx = new Map(project.pages.map((p, i) => [p.id, i]));
  const pageName = new Map(project.pages.map(p => [p.id, p.name]));
  const groups = [...new Set(groupOf.values())].map(g => ({ g, name: names.get(g) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const rows: string[][] = [];
  const goto: Record<number, string | undefined>[] = [];
  for (const { g, name } of groups) {
    const list = bundleConductorList(project, g, name, parts);
    const inBus = bundleConductors(taps, g);
    const order = (n: string) => { const i = list?.indexOf(n) ?? -1; return i < 0 ? 1e6 : i; };
    const conds = [...new Set([...(list ?? []), ...inBus.map(c => c.name)])]
      .sort((a, b) => order(a) - order(b) || a.localeCompare(b, undefined, { numeric: true }));
    const bus = name || '—';
    for (const c of conds) {
      const mine = taps.filter(t => t.group === g && t.name === c)
        .sort((a, b) => (pageIdx.get(a.pageId) ?? 0) - (pageIdx.get(b.pageId) ?? 0) || a.at.x - b.at.x);
      if (!mine.length) { rows.push([bus, c, '', '', '', '', 'libero']); goto.push({}); continue; }
      const net = nl.wireNet.get(mine[0].wire.id);
      const ends = (pageId: string) => (net?.pins ?? []).filter(p => p.el.page.id === pageId).map(p => `-${p.ref}`).join(', ');
      const first = mine[0], last = mine[mine.length - 1];
      const note = mine.length < 2 ? 'entra ma non esce' : list && !list.includes(c) ? 'conduttore non del cavo' : '';
      rows.push([bus, c, ends(first.pageId), mine.length > 1 ? ends(last.pageId) : '', net?.wireNo ?? '',
        mine.map(t => `${pageName.get(t.pageId)}.${columnOf(t.at.x)}`).join(', '), note]);
      goto.push({ 5: pageName.get(first.pageId) });
    }
  }
  return { goto, title: BUNDLE_TITLE, columns: ['Bus', 'Conduttore', 'Da', 'A', 'N. filo', 'Posizione', 'Note'], rows };
}

/** Collegamenti dei cavi: un conduttore per riga con le sue estremità */
export function cableConnectionReport(project: Project): Table {
  const rows: string[][] = [];
  const goto: Record<number, string | undefined>[] = [];
  for (const i of cableInfos(project).sort((a, b) => a.cable.tag.localeCompare(b.cable.tag, undefined, { numeric: true }))) {
    const order = new Map(i.cable.conductors.map((n, k) => [n, k]));
    for (const k of [...i.conductors].sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99))) {
      const [from, to] = conductorEnds(k);
      rows.push([`-${i.cable.tag}`, k.name, from, to, k.net?.wireNo ?? '', i.cable.cross ? `${i.cable.cross} mm²` : '', k.loc, k.problem ?? '']);
      goto.push({ 6: k.pageName });
    }
    for (const n of i.spare) { rows.push([`-${i.cable.tag}`, n, '', '', '', '', '', 'libero']); goto.push({}); }
  }
  return { goto, title: 'Collegamenti cavi', columns: ['Cavo', 'Conduttore', 'Da', 'A', 'N. filo', 'Sezione', 'Posizione', 'Note'], rows };
}

/** Lista in testo semplice: colonne allineate con gli spazi, una riga per riga della lista */
export function tableToTxt(t: Table): string {
  const all = [t.columns, ...t.rows];
  const w = t.columns.map((_, j) => Math.min(60, Math.max(...all.map(r => (r[j] ?? '').length))));
  const line = (r: string[]) => r.map((c, j) => (c ?? '').padEnd(w[j])).join('  ').trimEnd();
  return [t.title, '', line(t.columns), w.map(n => '-'.repeat(n)).join('  '), ...t.rows.map(line)].join('\r\n') + '\r\n';
}

export function tableToCsv(t: Table): string {
  const esc = (s: string) => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return '﻿' + [t.columns, ...t.rows].map(r => r.map(esc).join(';')).join('\r\n');
}

/** Lista di assegnazione I/O come tabella */
export function plcIoReport(project: Project, library: Part[] = []): Table {
  const io = ioAssignments(project, library);
  return {
    title: 'Lista I/O PLC',
    columns: ['Scheda', 'Canale', 'Indirizzo', 'Nome simbolico', 'Commento', 'Collegato a', 'Posizione'],
    rows: io.map(r => [`-${r.card.tag}`, r.channel, r.address, r.inst || !r.symbolIsDefault ? r.symbol : '', r.comment, r.connected, r.location]),
    goto: io.map(r => ({ 6: r.location ? pageOfLocation(r.location) : undefined })),
  };
}

/** Tutte le liste del progetto, nell'ordine delle schede Liste e del PDF */
const PAGE_KINDS: Record<string, string> = {
  multiline: 'Schema', singleline: 'Unifilare', network: 'Schema di rete', plc: 'Panoramica PLC', strip: 'Morsettiera',
  layout: 'Layout del quadro', report: 'Lista', cover: 'Copertina', notes: 'Note',
  cable: 'Cablaggio cavo', connector: 'Connettore', system: 'Schema d\'insieme',
};

export const INDEX_TITLE = 'Indice delle pagine';
export const PURCHASE_TITLE = 'Lista d\'acquisto';

/** Indice delle pagine del progetto (in testa, dopo la copertina, come in EPLAN) */
export function pageIndexReport(project: Project): Table {
  const panels = new Map((project.panels ?? []).map(p => [p.id, p]));
  const pages = project.pages.filter(pg => pg.type !== 'cover');
  const rows = pages.map(pg => [pg.name, pg.title, PAGE_KINDS[pg.type] ?? pg.type, pg.panelId && panels.get(pg.panelId) ? `+${panels.get(pg.panelId)!.code}` : '']);
  // Con le revisioni: l'ultima revisione che ha cambiato ogni pagina
  if (project.revisions?.length) {
    pages.forEach((pg, i) => rows[i].push(pageRevision(project, pg) ?? ''));
    return { title: INDEX_TITLE, columns: ['Pagina', 'Titolo', 'Tipo', 'Luogo', 'Rev.'], rows, goto: pages.map(pg => ({ 0: pg.name })) };
  }
  return { title: INDEX_TITLE, columns: ['Pagina', 'Titolo', 'Tipo', 'Luogo'], rows, goto: pages.map(pg => ({ 0: pg.name })) };
}

/**
 * Lista d'acquisto: gli articoli della distinta raggruppati per costruttore (un ordine per
 * fornitore), con l'unità di misura, più il filo sfuso per sezione e colore (metri stimati dal
 * layout, con il 10% di scorta) e i cavi senza articolo per tipo.
 */
/** keep: solo quello che serve a questi riferimenti (sigle, estremità dei fili e dei cavi; vedi panelScope.ts) */
export function purchaseReport(project: Project, library: Part[] = [], keep?: (ref: string) => boolean): Table {
  const bom = bomReport(project, library, keep);
  const ends = keep ? new Map(cableInfos(project).map(i => [i.cable.id, i.conductors.flatMap(k => conductorEnds(k))])) : undefined;
  const cableKept = (c: Cable) => !keep || [c.from ?? '', c.to ?? '', ...(ends?.get(c.id) ?? [])].some(keep);
  const meters = meterParts(project, partsIndex(project, library));
  const rows: string[][] = bom.rows
    .map(r => ({ qty: r[1], partNr: r[2], typeNr: r[3], descr: r[4], manufacturer: r[5], orderNr: r[6] }))
    .sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || (a.orderNr || a.partNr).localeCompare(b.orderNr || b.partNr))
    .map(r => [r.qty, meters.has(r.partNr) ? 'm' : 'pz', r.manufacturer, r.orderNr, r.typeNr, r.descr, r.partNr]);
  // Filo sfuso: per sezione e colore
  const wires = new Map<string, { n: number; mm: number; known: number }>();
  // I conduttori dei cavi e i collegamenti di rete non sono filo sfuso
  const inCable = new Set(cableInfos(project).flatMap(i => i.conductors.map(c => c.wire.id)));
  const busWires = new Set(project.pages.flatMap(pg => pg.elements.filter(e => e.kind === 'wire' && e.bus).map(e => e.id)));
  for (const w of wireList(project)) {
    const c = w.conn;
    if (!c.wireNo || (c.wireId && (inCable.has(c.wireId) || busWires.has(c.wireId)))) continue;
    if (keep && !keep(c.from) && !keep(c.to)) continue;
    const k = `${c.cross ?? ''}|${c.color ?? ''}`;
    const e = wires.get(k) ?? { n: 0, mm: 0, known: 0 };
    e.n++;
    if (w.length !== undefined) { e.mm += w.length; e.known++; }
    wires.set(k, e);
  }
  for (const [k, e] of [...wires.entries()].sort()) {
    const [cross, color] = k.split('|');
    const qty = e.known ? ((e.mm / 1000) * 1.1).toFixed(1).replace('.', ',') : '';
    rows.push([qty, 'm', '', '', `H07V-K ${cross ? `${cross} mm²` : '(sezione da definire)'}${color ? ` ${color}` : ''}`,
      `Filo unipolare per cablaggio: ${e.n} fili${e.known < e.n ? `, lunghezza ${e.known ? 'stimata solo per una parte' : 'da misurare (manca il layout)'}` : ''}`, '']);
  }
  // Cavi senza articolo: per tipo e formazione; quelli confezionati a pezzi anche per lunghezza
  const cables = new Map<string, { m: number; n: number; unknown: number; pieces: boolean }>();
  for (const c of project.cables ?? []) {
    if (c.partNr || !cableKept(c)) continue;
    const pieces = cableByPiece(c);
    const len = c.length !== undefined ? ` L=${String(c.length).replace('.', ',')} m` : '';
    const k = `${c.type ?? 'Cavo'} ${cableSection(c)}${pieces ? `${len} (confezionato)` : ''}`.trim();
    const e = cables.get(k) ?? { m: 0, n: 0, unknown: 0, pieces };
    e.n++;
    if (c.length !== undefined) e.m += c.length; else e.unknown++;
    cables.set(k, e);
  }
  for (const [k, e] of [...cables.entries()].sort()) {
    if (e.pieces) { rows.push([String(e.n), 'pz', '', '', k, `${e.n} cavi confezionati${e.unknown ? `, ${e.unknown} senza lunghezza` : ''}`, '']); continue; }
    rows.push([e.m ? String(Math.round(e.m * 10) / 10).replace('.', ',') : '', 'm', '', '', k, `${e.n} cavi${e.unknown ? `, ${e.unknown} senza lunghezza` : ''}`, '']);
  }
  return { title: PURCHASE_TITLE, columns: ['Q.tà', 'U.M.', 'Costruttore', 'Codice ordinazione', 'Tipo', 'Descrizione', 'Codice articolo'], rows };
}

/** Articoli che si comprano a metri: guide e canaline del layout, cavi non confezionati, cavi di rete */
function meterParts(project: Project, parts: Map<string, Part>): Set<string> {
  const cableM = (project.cables ?? []).filter(c => c.partNr && !cableByPiece(c, parts.get(c.partNr))).map(c => c.partNr);
  return new Set([...layoutBomItems(project).map(i => i.partNr), ...cableM, ...busCableRows(project).map(r => r.partNr)].filter((x): x is string => !!x));
}

export const MAKERS_TITLE = 'Elenco costruttori e fornitori';

/**
 * Costruttori e fornitori degli articoli in distinta: quanti articoli diversi, quanti pezzi e quanti
 * metri per ognuno. I nomi scritti in modo diverso (Weidmuller, WEIDMULLER) contano insieme, con la
 * grafia più usata. keep come nella distinta (liste per quadro).
 */
export function manufacturerReport(project: Project, library: Part[] = [], keep?: (ref: string) => boolean): Table {
  const parts = partsIndex(project, library);
  const meters = meterParts(project, parts);
  const same = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');
  const agg = new Map<string, { makers: Map<string, number>; suppliers: Map<string, number>; n: number; pz: number; m: number }>();
  const spelling = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
  for (const r of bomReport(project, library, keep).rows) {
    const partNr = r[2], qty = parseFloat(r[1].replace(',', '.')) || 0;
    const maker = r[5].trim(), supplier = (partNr && parts.get(partNr)?.supplier?.trim()) || '';
    const key = `${same(maker)}|${same(supplier)}`;
    const e = agg.get(key) ?? { makers: new Map(), suppliers: new Map(), n: 0, pz: 0, m: 0 };
    e.makers.set(maker, (e.makers.get(maker) ?? 0) + 1);
    e.suppliers.set(supplier, (e.suppliers.get(supplier) ?? 0) + 1);
    e.n++;
    if (meters.has(partNr)) e.m += qty; else e.pz += qty;
    agg.set(key, e);
  }
  const num = (x: number) => (x ? String(Math.round(x * 100) / 100).replace('.', ',') : '');
  const rows = [...agg.values()]
    .map(e => ({ ...e, maker: spelling(e.makers), supplier: spelling(e.suppliers) }))
    // Gli articoli senza costruttore in fondo
    .sort((a, b) => Number(!a.maker) - Number(!b.maker) || a.maker.localeCompare(b.maker) || a.supplier.localeCompare(b.supplier))
    .map(e => [e.maker || '(non indicato)', e.supplier, String(e.n), num(e.pz), num(e.m)]);
  return { title: MAKERS_TITLE, columns: ['Costruttore', 'Fornitore', 'Articoli', 'Pezzi', 'Metri'], rows };
}

export const SEQUENCE_TITLE = 'Sequenza morsetti';

/**
 * Sequenza dei morsetti (lo «schema sequenza morsetti» di EPLAN): per ogni morsettiera i pezzi sulla
 * guida in ordine di montaggio, cioè fermo, morsetti (i piani di un morsetto su una riga) con i
 * separatori dopo il loro morsetto, piastra di chiusura e fermo finale. Una morsettiera per foglio.
 */
export function terminalSequenceReport(project: Project): Table {
  const rows: string[][] = [];
  const goto: Record<number, string | undefined>[] = [];
  const byStrip = new Map<string, ReturnType<typeof terminalConnections>>();
  for (const c of terminalConnections(project)) byStrip.set(c.row.strip, [...(byStrip.get(c.row.strip) ?? []), c]);
  for (const [strip, conns] of byStrip) {
    const d = stripData(project, strip);
    const acc = stripAccessories(d);
    let pos = 0;
    const piece = (no: string, levels: string, type: string, partNr = '', jumper = '', locs: string[] = []) => {
      rows.push([strip, String(++pos), no, levels, type, partNr, jumper, locs.join(', ')]);
      goto.push({ 7: locs[0] ? locs[0].slice(0, locs[0].lastIndexOf('.')) : undefined });
    };
    const endStop = acc.find(a => a.kind === 'endStop'), endPlate = acc.find(a => a.kind === 'endPlate');
    if (endStop) piece('', '', 'Fermo terminale', endStop.partNr);
    // Piani dello stesso morsetto fisico insieme, nell'ordine della morsettiera
    const groups = new Map<string, typeof conns>();
    for (const c of conns) {
      const k = c.levels.length ? c.row.base : c.row.no;
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    for (const [no, g] of groups) {
      const first = g.find(c => !c.row.spare) ?? g[0];
      const levels = g.length > 1 ? g.map(c => c.row.level).join('/') : '';
      const jumpers = [...new Set(g.map(c => (c.jumper ? jumperText(c.jumper) : '')).filter(Boolean))].join('; ');
      piece(no, levels, first.row.spare ? 'Riserva' : first.type, first.partNr ?? '', jumpers, [...new Set(g.flatMap(c => c.locations.map(l => l.loc)))]);
      if (g.some(c => c.separator)) piece('', '', 'Separatore', d.separatorPartNr ?? '');
    }
    for (let i = 0; i < (endPlate?.qty ?? 0); i++) piece('', '', 'Piastra di chiusura', endPlate!.partNr);
    for (let i = 1; i < (endStop?.qty ?? 0); i++) piece('', '', 'Fermo terminale', endStop!.partNr);
  }
  return {
    goto, title: SEQUENCE_TITLE, breakKey: 'Morsettiera',
    columns: ['Morsettiera', 'Pos.', 'Morsetto', 'Piani', 'Tipo', 'Articolo', 'Ponticello', 'Posizione'],
    rows,
  };
}

export const DIST_TITLE = 'Occupazione ripartitori';
export const DIST_WIRING_TITLE = 'Cablaggio ripartitori (da–a)';

/** Occupazione di ingressi e uscite dei ripartitori: fili, somma delle sezioni rispetto a quella ammessa */
export function distributorReport(project: Project): Table {
  const slots = distSlots(project);
  return { title: DIST_TITLE, columns: SLOT_COLUMNS, rows: slots.map(slotRow), goto: slots.map(s => ({ 1: s.wires[0]?.loc.split('.')[0] })) };
}

/** Lista per il cablatore: un filo per riga dai ripartitori, con sezione, colore, numero e destinazione */
export function distributorWiringReport(project: Project): Table {
  const rows: string[][] = [], goto: Record<number, string | undefined>[] = [], wires: string[] = [];
  for (const s of distSlots(project)) for (const w of s.wires) {
    wires.push(w.wire.id);
    rows.push([`-${s.d.tag}:${s.k === 'in' ? s.d.groups[s.gi].name : s.name}`, w.to, w.wire.cross ? `${w.wire.cross} mm²` : '', w.wire.color ?? '', w.wireNo, s.max !== undefined ? `${String(s.max).replace('.', ',')} mm²` : '', w.loc]);
    goto.push({ 6: w.loc.split('.')[0] });
  }
  return { title: DIST_WIRING_TITLE, columns: ['Da', 'A', 'Sezione', 'Colore', 'N. filo', 'Sez. max uscita', 'Posizione'], rows, goto, wires };
}

export const DUCT_FILL_TITLE = 'Riempimento canaline';

/** Riempimento delle canaline del layout (fili che le attraversano, sezione occupata e utile) */
export function ductFillReport(fill: DuctFill[]): Table {
  return {
    title: DUCT_FILL_TITLE,
    columns: ['Pagina', 'Canalina', 'Posizione (mm)', 'Lunghezza (mm)', 'Fili', 'Sezione fili (mm²)', 'Sezione utile (mm²)', 'Riempimento (%)'],
    rows: fill.map(f => [f.pageName, f.duct.label ?? '', `${Math.round(f.duct.x)}, ${Math.round(f.duct.y)}`, String(Math.round(Math.max(f.duct.w, f.duct.h))), String(f.wires), String(f.area), String(f.capacity), String(f.percent)]),
    goto: fill.map(f => ({ 0: f.pageName })),
  };
}

export function projectReports(project: Project, library: Part[] = []): Table[] {
  return withNetlistCache(project, () => projectReportsNow(project, library));
}

function projectReportsNow(project: Project, library: Part[]): Table[] {
  const out = [pageIndexReport(project), legendReport(project), bomReport(project, library), purchaseReport(project, library), manufacturerReport(project, library), deviceReport(project, library), terminalReport(project), terminalSequenceReport(project), connectionReport(project), wireListReport(project)];
  if (allConnectors(project).length) out.push(connectorReport(project, library));
  if (project.distributors?.length) out.push(distributorReport(project), distributorWiringReport(project));
  const hasBus = project.pages.some(pg => pg.elements.some(e => e.kind === 'wire' && e.bus));
  if (project.cables?.length || hasBus) out.push(cableReport(project));
  if (project.cables?.length) out.push(cableConnectionReport(project));
  if (project.pages.some(pg => pg.elements.some(e => e.kind === 'wire' && e.bundle !== undefined))) out.push(bundleReport(project, library));
  if (hasBus) out.push(networkLinkReport(project), networkNodeReport(project));
  if (hasBus || project.plc.stations?.length) { const t = networkAddressReport(project, library); if (t.rows.length) out.push(t); }
  if (ipPlan(project).length || project.ipNetworks?.length) out.push(ipPlanReport(project, library));
  if (project.plc.cards.length) out.push(plcIoReport(project, library));
  if (project.calcs?.thermal?.length) out.push(thermalReport(project, library));
  if (Object.values(project.calcs?.cables ?? {}).some(c => c.i)) out.push(cableCalcReport(project));
  const docs = documentsReport(project, library);
  if (docs.rows.length) out.push(docs);
  const fill = ductFill(project);
  if (fill.some(f => f.wires)) out.push(ductFillReport(fill));
  // Liste personalizzate, dalle liste qui sopra
  for (const def of project.settings?.customLists ?? []) {
    const t = customListTable(out, def);
    if (t && !out.some(x => x.title === t.title)) out.push(t);
  }
  return out;
}
