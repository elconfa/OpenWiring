// Modulo PLC: tipi di scheda, indirizzamento, canali disegnati nello schema, lista di
// assegnazione I/O, pagine panoramiche, import/export delle variabili (TIA Portal, CODESYS).
import type { Project, PlcCard, IoKind, PlcAddressFormat, SymbolInstance, Part, Page } from './types';
import { columnOf } from './types';
import { allPlaced, locationOf, partsIndex, buildDevices, deviceInfo, type PlacedElement, type Device, type DeviceInfo } from './devices';
import { computeNetlist } from './netlist';
import { settingsOf } from './numbering';
import { uid } from './geometry';

export interface PlcCardType {
  id: string;
  name: string;
  channels: Partial<Record<IoKind, number>>;
  /** Master IO-Link: numero di porte */
  iolink?: number;
}

/** Schede generiche. Le CPU compatte riproducono la dotazione tipica (es. S7-1214C). */
export const PLC_CARD_TYPES: PlcCardType[] = [
  { id: 'cpu-14di-10do-2ai', name: 'CPU compatta 14 DI / 10 DO / 2 AI', channels: { DI: 14, DO: 10, AI: 2 } },
  { id: 'cpu-8di-6do', name: 'CPU compatta 8 DI / 6 DO', channels: { DI: 8, DO: 6 } },
  { id: 'di8', name: 'Ingressi digitali 8 DI', channels: { DI: 8 } },
  { id: 'di16', name: 'Ingressi digitali 16 DI', channels: { DI: 16 } },
  { id: 'do8', name: 'Uscite digitali 8 DO', channels: { DO: 8 } },
  { id: 'do16', name: 'Uscite digitali 16 DO', channels: { DO: 16 } },
  { id: 'fdi8', name: 'Ingressi safety 8 DI', channels: { DI: 8 } },
  { id: 'fdo8', name: 'Uscite safety 8 DO', channels: { DO: 8 } },
  { id: 'di8-do8', name: 'Ingressi/uscite digitali 8 DI / 8 DO', channels: { DI: 8, DO: 8 } },
  { id: 'di16-do16', name: 'Ingressi/uscite digitali 16 DI / 16 DO', channels: { DI: 16, DO: 16 } },
  { id: 'ai4', name: 'Ingressi analogici 4 AI', channels: { AI: 4 } },
  { id: 'ai8', name: 'Ingressi analogici 8 AI', channels: { AI: 8 } },
  { id: 'ao2', name: 'Uscite analogiche 2 AO', channels: { AO: 2 } },
  { id: 'ao4', name: 'Uscite analogiche 4 AO', channels: { AO: 4 } },
  { id: 'iol4', name: 'Master IO-Link 4 porte', channels: {}, iolink: 4 },
  { id: 'iol8', name: 'Master IO-Link 8 porte', channels: {}, iolink: 8 },
  // Interfaccia di rete, accoppiatore di bus, modulo di comunicazione: nessun indirizzo di I/O
  { id: 'bus', name: 'Scheda bus (senza I/O)', channels: {} },
];

/** Tipi di stazione (CPU locale o periferia decentrata) */
export const STATION_KINDS = ['CPU locale', 'Profinet', 'EtherCAT', 'Profibus DP', 'EtherNet/IP', 'Modbus TCP'];

/** Scheda proposta quando serve un canale e non ce n'è uno libero */
const DEFAULT_CARD_FOR: Record<IoKind, string> = { DI: 'di16', DO: 'do16', AI: 'ai4', AO: 'ao2' };
export const IO_KINDS: IoKind[] = ['DI', 'DO', 'AI', 'AO'];
const DIGITAL = (k: IoKind) => k === 'DI' || k === 'DO';
const INPUT = (k: IoKind) => k === 'DI' || k === 'AI';

/** Tipo della scheda: quello generico o quello ricavato dall'articolo */
export function cardType(c: PlcCard): PlcCardType {
  if (c.custom) return { id: 'custom', name: c.custom.name, channels: c.custom.channels, iolink: c.iolink?.length };
  return PLC_CARD_TYPES.find(t => t.id === c.typeId) ?? PLC_CARD_TYPES[0];
}

export const FORMAT_LABELS: Record<PlcAddressFormat, string> = {
  'siemens-en': 'Siemens TIA (I / Q)',
  'siemens-de': 'Siemens tedesco (E / A)',
  'iec': 'IEC 61131 / CODESYS (%IX / %QX)',
  'twincat': 'Beckhoff TwinCAT (AT %I* / %Q*, collegati nel progetto I/O)',
  'omron': 'Omron CJ/CP (CIO 0.00 / 100.00)',
};

const isOmron = (f: PlcAddressFormat) => f === 'omron';
/** Bit per unità di indirizzo digitale: byte (8) o parola Omron (16) */
const unitBits = (f: PlcAddressFormat) => (isOmron(f) ? 16 : 8);
/** Passo degli analogici: 2 byte per canale, oppure 1 parola Omron */
const analogStep = (f: PlcAddressFormat) => (isOmron(f) ? 1 : 2);
/**
 * IEC/CODESYS: digitali e analogici dello stesso verso stanno nella stessa area, come nella memoria
 * del PLC (%IX2.0 è nel byte 2, %IW1 occupa i byte 2 e 3), quindi si danno gli indirizzi uno dopo
 * l'altro. Siemens tiene gli analogici da 64, Omron ha un'area per ogni tipo.
 */
const sharedArea = (f: PlcAddressFormat) => f === 'iec' || f === 'twincat';
/** IEC con indirizzo scritto (CODESYS) o collegato nel progetto I/O (TwinCAT: %I*, %Q*) */
const isIec = sharedArea;

/** Formato degli indirizzi di una stazione: il suo, altrimenti quello del progetto */
export function stationFormat(project: Project, station: string): PlcAddressFormat {
  return project.plc.stations?.find(s => s.name === station)?.format ?? settingsOf(project).plcAddressFormat;
}
export const cardFormat = (project: Project, card: PlcCard) => stationFormat(project, card.station);
const analogFirst = (project: Project, station: string) => sharedArea(stationFormat(project, station)) && project.plc.stations?.find(s => s.name === station)?.areaOrder === 'analog-first';
/** Area di indirizzi in cui si assegna un tipo di canale */
const areaOf = (f: PlcAddressFormat, k: IoKind) => (sharedArea(f) ? (INPUT(k) ? 'I' : 'Q') : `${INPUT(k) ? 'I' : 'Q'}|${DIGITAL(k) ? 'd' : 'a'}`);
/** Nell'area comune un analogico parte da un byte pari (una parola intera) */
const aligned = (f: PlcAddressFormat, k: IoKind, s: number) => (sharedArea(f) && !DIGITAL(k) ? s + (s % 2) : s);
/** La scheda occupa indirizzi di quel tipo (canali o dati di processo IO-Link) */
const usesKind = (c: PlcCard, k: IoKind) => !!cardType(c).channels[k] || (!!c.iolink?.length && DIGITAL(k));

/** Indirizzo da cui partono le aree, per formato e tipo di canale */
function areaBase(f: PlcAddressFormat, k: IoKind): number {
  if (isOmron(f)) return { DI: 0, DO: 100, AI: 2000, AO: 2100 }[k];
  if (DIGITAL(k)) return 0;
  return isIec(f) ? 0 : 64;
}

/** Canali di una scheda, es. ["DI0", "DI1", …, "DO0", …] */
export function channelsOf(card: PlcCard): { id: string; kind: IoKind; index: number }[] {
  const out: { id: string; kind: IoKind; index: number }[] = [];
  const t = cardType(card);
  for (const k of IO_KINDS) for (let i = 0; i < (t.channels[k] ?? 0); i++) out.push({ id: `${k}${i}`, kind: k, index: i });
  return out;
}

export function parseChannel(ch: string | undefined): { kind: IoKind; index: number } | undefined {
  const m = /^(DI|DO|AI|AO)(\d+)$/.exec(ch ?? '');
  return m ? { kind: m[1] as IoKind, index: parseInt(m[2], 10) } : undefined;
}

/** Morsetto della scheda per un canale (dall'articolo), altrimenti il nome del canale */
export const terminalOf = (card: PlcCard, channel: string) => card.custom?.terminals?.[channel] ?? channel;

/** Indirizzo di un canale nel formato indicato, es. I0.3, %QX1.2, IW66, 100.05 */
export function channelAddress(card: PlcCard, channel: string, format: PlcAddressFormat): string {
  const ch = parseChannel(channel);
  if (!ch) return '';
  // TwinCAT: la variabile non ha un indirizzo fisso, si collega al canale nel progetto I/O
  if (format === 'twincat') return INPUT(ch.kind) ? '%I*' : '%Q*';
  const start = card.start[ch.kind] ?? 0;
  const de = format === 'siemens-de';
  if (DIGITAL(ch.kind)) {
    const bits = unitBits(format);
    const unit = start + Math.floor(ch.index / bits), bit = ch.index % bits;
    if (isOmron(format)) return `${unit}.${String(bit).padStart(2, '0')}`;
    const letter = ch.kind === 'DI' ? (format === 'iec' ? '%IX' : de ? 'E' : 'I') : (format === 'iec' ? '%QX' : de ? 'A' : 'Q');
    return `${letter}${unit}.${bit}`;
  }
  const addr = start + ch.index * analogStep(format);
  if (isOmron(format)) return `${addr}`;
  if (format === 'iec') return `${ch.kind === 'AI' ? '%IW' : '%QW'}${addr / 2}`;
  return `${ch.kind === 'AI' ? (de ? 'EW' : 'IW') : (de ? 'AW' : 'QW')}${addr}`;
}

/**
 * Nome del canale per i fili e il confronto: l'indirizzo, oppure con TwinCAT (indirizzo %I* uguale per
 * tutti) la sigla della scheda e il canale, es. 400A1.DI3
 */
export function channelName(card: PlcCard, channel: string, format: PlcAddressFormat): string {
  return format === 'twincat' ? `${card.tag}.${channel}` : channelAddress(card, channel, format);
}

/** Unità di indirizzo occupate da una scheda per un tipo di canale */
function span(card: PlcCard, k: IoKind, f: PlcAddressFormat): number {
  // Master IO-Link: occupa i byte dei dati di processo nelle aree digitali
  if (card.iolink?.length && (k === 'DI' || k === 'DO')) {
    const bytes = card.iolink.reduce((a, p) => a + (k === 'DI' ? p.inBytes : p.outBytes), 0);
    return isOmron(f) ? Math.ceil(bytes / 2) : bytes;
  }
  const n = cardType(card).channels[k] ?? 0;
  return DIGITAL(k) ? Math.ceil(n / unitBits(f)) : n * analogStep(f);
}

/** Primo indirizzo libero di una stazione per un tipo di canale (own: la scheda nuova, con i tipi già assegnati) */
function nextFree(project: Project, station: string, k: IoKind, own?: PlcCard): number {
  const f = stationFormat(project, station);
  let next = areaBase(f, k);
  // Ingressi e uscite hanno aree separate: un DI non occupa gli indirizzi dei DO
  for (const c of project.plc.cards) {
    if (c.station !== station) continue;
    for (const kk of IO_KINDS) if (areaOf(f, kk) === areaOf(f, k) && usesKind(c, kk)) next = Math.max(next, (c.start[kk] ?? 0) + span(c, kk, f));
  }
  for (const kk of IO_KINDS) if (own?.start[kk] !== undefined && areaOf(f, kk) === areaOf(f, k)) next = Math.max(next, own.start[kk]! + span(own, kk, f));
  return aligned(f, k, next);
}

/** Assegna gli indirizzi iniziali liberi della stazione a una scheda nuova */
export function assignStart(project: Project, card: PlcCard) {
  card.start = {};
  for (const k of IO_KINDS) if (usesKind(card, k)) card.start[k] = nextFree(project, card.station, k, card);
}

/** Primo slot libero di una stazione (rack 0); lo slot 1 è della CPU */
export function nextSlot(project: Project, station: string): number {
  const used = project.plc.cards.filter(c => c.station === station && (c.rack ?? 0) === 0).map(c => c.slot ?? 0);
  return used.length ? Math.max(...used) + 1 : 1;
}

/** Crea una scheda con gli indirizzi iniziali liberi della stazione (non la aggiunge al progetto) */
export function newCard(project: Project, typeId: string, tag: string, station = 'PLC1'): PlcCard {
  const t = PLC_CARD_TYPES.find(x => x.id === typeId) ?? PLC_CARD_TYPES[0];
  const card: PlcCard = { id: uid('c'), tag, typeId: t.id, station, start: {}, rack: 0, slot: nextSlot(project, station) };
  // Master IO-Link: 4 byte in ingresso e 4 in uscita per porta, modificabili
  if (t.iolink) card.iolink = Array.from({ length: t.iolink }, (_, i) => ({ port: i + 1, inBytes: 4, outBytes: 4 }));
  assignStart(project, card);
  return card;
}

/** Scheda ricavata da un articolo (EDZ/XML) con il numero di canali indicato */
export function cardFromPart(project: Project, part: Part, channels: Partial<Record<IoKind, number>>, tag: string, station = 'PLC1'): PlcCard {
  const det = detectPartChannels(part);
  const terminals: Record<string, string> = {};
  for (const k of IO_KINDS) {
    det.terminals[k].slice(0, channels[k] ?? 0).forEach((t, i) => { if (t) terminals[`${k}${i}`] = t; });
  }
  const card: PlcCard = {
    id: uid('c'), tag, typeId: 'custom', station, start: {},
    custom: { name: part.typeNr || part.partNr, channels, terminals },
    description: part.descr1, partNr: part.partNr, manufacturer: part.manufacturer, orderNr: part.orderNr,
  };
  assignStart(project, card);
  return card;
}

/**
 * Riconosce i canali I/O dal modello funzione di un articolo. Ogni funzione con la parola
 * ingresso/uscita (anche in inglese e tedesco) e analogico/digitale conta come un canale;
 * il suo primo punto di connessione diventa il morsetto.
 */
export function detectPartChannels(part: Part): { channels: Partial<Record<IoKind, number>>; terminals: Record<IoKind, string[]> } {
  const terminals: Record<IoKind, string[]> = { DI: [], DO: [], AI: [], AO: [] };
  for (const ft of part.functionTemplates) {
    const text = `${ft.description} ${ft.category ?? ''}`.toLowerCase();
    const analog = /analog|analogic/.test(text) || /\ba[iqo]\d*\b/.test(text);
    const out = /\b(output|ausgang|uscit|d[oq]\d*|a[oq]\d*)\b|uscita|ausgang/.test(text);
    const inp = /\b(input|eingang|ingress|di\d*|ai\d*)\b|ingresso|eingang/.test(text);
    if (!out && !inp) continue;
    const kind: IoKind = analog ? (out ? 'AO' : 'AI') : (out ? 'DO' : 'DI');
    terminals[kind].push(ft.connections[0] ?? '');
  }
  const channels: Partial<Record<IoKind, number>> = {};
  for (const k of IO_KINDS) if (terminals[k].length) channels[k] = terminals[k].length;
  return { channels, terminals };
}

/**
 * Ricalcola da capo gli indirizzi delle schede, in ordine di elenco, per stazione (only: solo le
 * stazioni indicate). Con «prima gli analogici» gli analogici di tutte le schede vengono prima dei digitali
 */
export function reassignAddresses(project: Project, only?: (station: string) => boolean) {
  const next = new Map<string, number>();
  const cards = project.plc.cards.filter(c => !only || only(c.station));
  for (const c of cards) c.start = {};
  const passes: IoKind[][] = [['AI', 'AO'], ['DI', 'DO']];
  for (const c of cards) if (!analogFirst(project, c.station)) assignKinds(c, cardFormat(project, c), IO_KINDS, next);
  for (const pass of passes) for (const c of cards) if (analogFirst(project, c.station)) assignKinds(c, cardFormat(project, c), pass, next);
}

function assignKinds(c: PlcCard, f: PlcAddressFormat, kinds: IoKind[], next: Map<string, number>) {
  for (const k of kinds) {
    if (!usesKind(c, k)) continue;
    // Ingressi e uscite separati; Siemens e Omron separano anche digitali e analogici, IEC no
    const key = `${c.station}|${areaOf(f, k)}`;
    const s = aligned(f, k, next.get(key) ?? areaBase(f, k));
    c.start[k] = s;
    next.set(key, s + span(c, k, f));
  }
}

/**
 * Cambio di formato: tra i due Siemens non cambia niente; da o verso Omron cambiano le unità
 * (parole) e da o verso IEC cambia la disposizione delle aree, quindi gli indirizzi vengono riassegnati.
 */
export function adaptAddressFormat(project: Project, from: PlcAddressFormat, to: PlcAddressFormat, only?: (station: string) => boolean): 'reassign' | 'none' {
  if (!needsReassign(from, to)) return 'none';
  // Cambia il formato del progetto: solo le stazioni senza un formato proprio
  reassignAddresses(project, only ?? (st => !project.plc.stations?.find(s => s.name === st)?.format));
  return 'reassign';
}

/**
 * Stazioni con «prima gli analogici» (WAGO) dove una scheda aggiunta ha rotto l'ordine (un analogico
 * dopo un digitale dello stesso verso): gli indirizzi della stazione vengono rifatti, come fa il nodo
 * quando si aggiunge un modulo. Restituisce le stazioni riassegnate
 */
export function keepAnalogFirst(project: Project): string[] {
  const out: string[] = [];
  for (const s of project.plc.stations ?? []) {
    if (!analogFirst(project, s.name)) continue;
    const cards = project.plc.cards.filter(c => c.station === s.name);
    const broken = ([['AI', 'DI'], ['AO', 'DO']] as const).some(([a, d]) => {
      const lastAnalog = Math.max(-1, ...cards.filter(c => usesKind(c, a) && c.start[a] !== undefined).map(c => c.start[a]!));
      return cards.some(c => usesKind(c, d) && c.start[d] !== undefined && c.start[d]! < lastAnalog);
    });
    if (broken) { reassignAddresses(project, st => st === s.name); out.push(s.name); }
  }
  return out;
}

/** Il cambio di formato sposta gli indirizzi? (unità diverse con Omron, aree diverse tra IEC e Siemens) */
export const needsReassign = (from: PlcAddressFormat, to: PlcAddressFormat) => from !== to && (isOmron(from) || isOmron(to) || sharedArea(from) !== sharedArea(to));

export const cardByTag = (project: Project, tag: string) => project.plc.cards.find(c => c.tag === tag);

/** Canali di una scheda già usati nello schema */
export function usedChannels(project: Project, tag: string, exceptInstId?: string): Set<string> {
  const used = new Set<string>();
  for (const e of allPlaced(project)) {
    if (e.sym.role === 'plc' && e.inst.tag === tag && e.inst.id !== exceptInstId && e.inst.plcChannel) used.add(e.inst.plcChannel);
  }
  return used;
}

/**
 * Scheda e canale per un nuovo punto I/O: il primo canale libero del tipo richiesto
 * (preferendo l'ultima scheda usata); se non ce ne sono, viene creata una scheda nuova.
 */
export function allocateChannel(project: Project, kind: IoKind, newTag: (letter: string) => string):
  { card: PlcCard; channel: string; created: boolean } {
  const cards = project.plc.cards.filter(c => (cardType(c).channels[kind] ?? 0) > 0);
  for (const card of cards) {
    const used = usedChannels(project, card.tag);
    const free = channelsOf(card).find(ch => ch.kind === kind && !used.has(ch.id));
    if (free) return { card, channel: free.id, created: false };
  }
  // Nessuna scheda: la prima è una CPU compatta; poi moduli di espansione del tipo richiesto
  const typeId = project.plc.cards.length === 0 && kind !== 'AO' ? 'cpu-14di-10do-2ai' : DEFAULT_CARD_FOR[kind];
  const station = stationNames(project)[0] ?? 'PLC1';
  const card = newCard(project, typeId, newTag('A'), station);
  return { card, channel: `${kind}0`, created: true };
}

/** Nome simbolico valido per TIA/CODESYS: lettere, cifre e "_" e non inizia con una cifra */
export function sanitizeSymbol(s: string): string {
  let out = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (/^\d/.test(out)) out = `_${out}`;
  return out;
}

/** Nome simbolico generato quando non è stato scritto, es. "DI2_3A1" */
export const defaultSymbol = (tag: string, channel: string) => sanitizeSymbol(`${channel}_${tag}`);

export interface IoRow {
  card: PlcCard;
  channel: string;
  kind: IoKind;
  address: string;
  /** Morsetto della scheda (dall'articolo) o nome del canale */
  terminal: string;
  /** Nome simbolico effettivo (quello scritto, importato o generato) */
  symbol: string;
  symbolIsDefault: boolean;
  comment: string;
  /** Commento scritto o importato (senza il valore predefinito) */
  ownComment: string;
  /** Dispositivi collegati al canale, es. "-2S2:14" */
  connected: string;
  location: string;
  inst?: SymbolInstance;
}

/**
 * Lista di assegnazione: tutti i canali di tutte le schede, usati o liberi.
 * Nome e commento: quelli del punto I/O, poi quelli della scheda (es. importati);
 * il commento predefinito è la descrizione del dispositivo collegato.
 */
export function ioAssignments(project: Project, library: Part[] = [], includeFree = true): IoRow[] {
  const nl = computeNetlist(project);
  const pinNet = new Map<string, typeof nl.nets[number]>();
  for (const n of nl.nets) for (const p of n.pins) pinNet.set(`${p.el.inst.id}|${p.pinId}`, n);
  const placed = new Map<string, PlacedElement>();
  for (const e of allPlaced(project)) if (e.sym.role === 'plc' && e.inst.plcChannel) placed.set(`${e.inst.tag}|${e.inst.plcChannel}`, e);
  const parts = partsIndex(project, library);
  const rows: IoRow[] = [];
  for (const card of project.plc.cards) {
    for (const ch of channelsOf(card)) {
      const el = placed.get(`${card.tag}|${ch.id}`);
      const named = card.io?.[ch.id];
      if (!el && !includeFree && !named?.symbol) continue;
      let connected = '';
      const ownComment = el?.inst.plcComment || named?.comment || '';
      let comment = ownComment;
      if (el) {
        const others = el.sym.pins.flatMap(p => pinNet.get(`${el.inst.id}|${p.id}`)?.pins ?? []).filter(p => p.el.inst.id !== el.inst.id);
        connected = [...new Set(others.map(p => `-${p.ref}`))].join(', ');
        if (!comment) {
          // Descrizione del primo dispositivo collegato (es. "Marcia pompa")
          const dev = others.find(p => p.el.inst.description || p.el.inst.partNr);
          comment = dev?.el.inst.description ?? (dev?.el.inst.partNr ? parts.get(dev.el.inst.partNr)?.descr1 ?? '' : '');
        }
      }
      const own = el?.inst.plcSymbol?.trim() || named?.symbol?.trim();
      rows.push({
        card, channel: ch.id, kind: ch.kind,
        address: channelAddress(card, ch.id, cardFormat(project, card)),
        terminal: terminalOf(card, ch.id),
        symbol: own || defaultSymbol(card.tag, ch.id),
        symbolIsDefault: !own,
        comment, ownComment, connected,
        location: el ? locationOf(el) : '',
        inst: el?.inst,
      });
    }
  }
  return rows;
}

/** Problemi della configurazione PLC: canali doppi, nomi doppi, punti I/O senza scheda */
export function plcProblems(project: Project): string[] {
  const out: string[] = [];
  const seen = new Map<string, string>();
  for (const e of allPlaced(project)) {
    if (e.sym.role !== 'plc') continue;
    const card = cardByTag(project, e.inst.tag);
    if (!card) { out.push(`-${e.inst.tag} (${locationOf(e)}): la scheda non esiste`); continue; }
    if (!e.sym.io) continue; // alimentazione della scheda
    const ch = parseChannel(e.inst.plcChannel);
    if (!ch || !channelsOf(card).some(c => c.id === e.inst.plcChannel)) { out.push(`-${e.inst.tag} (${locationOf(e)}): canale ${e.inst.plcChannel ?? '?'} non presente sulla scheda`); continue; }
    if (ch.kind !== e.sym.io) out.push(`-${e.inst.tag}:${e.inst.plcChannel} (${locationOf(e)}): il simbolo è ${e.sym.io}, il canale è ${ch.kind}`);
    const key = `${e.inst.tag}|${e.inst.plcChannel}`;
    if (seen.has(key)) out.push(`-${e.inst.tag}:${e.inst.plcChannel} usato due volte (${seen.get(key)} e ${locationOf(e)})`);
    else seen.set(key, locationOf(e));
  }
  const names = new Map<string, number>();
  for (const r of ioAssignments(project, [], false)) names.set(r.symbol.toLowerCase(), (names.get(r.symbol.toLowerCase()) ?? 0) + 1);
  for (const [n, c] of names) if (c > 1) out.push(`Nome simbolico "${n}" usato ${c} volte`);
  return out;
}

const dataType = (k: IoKind) => (DIGITAL(k) ? 'Bool' : 'Int');

/** Export disponibili per il formato: TIA per Siemens, GVL per IEC/CODESYS e TwinCAT */
export const isTiaFormat = (f: PlcAddressFormat) => f === 'siemens-en' || f === 'siemens-de';
const usedFormats = (project: Project) => new Set(project.plc.cards.map(c => cardFormat(project, c)));
/** Il progetto ha schede da esportare in TIA Portal (stazioni con formato Siemens) */
export const canExportTia = (project: Project) => [...usedFormats(project)].some(isTiaFormat);
/** Il progetto ha schede da esportare in una GVL (stazioni IEC/CODESYS o TwinCAT) */
export const canExportGvl = (project: Project) => [...usedFormats(project)].some(isIec);

/**
 * Righe della tabella variabili TIA Portal (foglio "PLC Tags"), importabile da
 * Variabili PLC ▸ Importa. Solo i canali usati o con un nome assegnato.
 */
export function tiaTagRows(project: Project, library: Part[] = []): string[][] {
  const header = ['Name', 'Path', 'Data Type', 'Logical Address', 'Comment', 'Hmi Visible', 'Hmi Accessible', 'Hmi Writeable', 'Typeobject ID', 'Version ID'];
  const rows = ioAssignments(project, library, false).filter(r => isTiaFormat(cardFormat(project, r.card))).map(r =>
    // TIA vuole l'indirizzo con "%": %I0.0 / %E0.0 / %IW64
    [r.symbol, 'OpenWiring', dataType(r.kind), `%${r.address}`, r.comment, 'True', 'True', 'True', '', '']);
  return [header, ...rows];
}

/** Lista variabili globali CODESYS (testo da incollare in una GVL) */
export function codesysGvl(project: Project, library: Part[] = []): string {
  const lines = ['VAR_GLOBAL'];
  // Solo le stazioni IEC/CODESYS e TwinCAT (con TwinCAT «AT %I*»: il canale si collega nel progetto I/O)
  for (const r of ioAssignments(project, library, false).filter(r => isIec(cardFormat(project, r.card)))) {
    const comment = [r.comment, r.connected].filter(Boolean).join(' - ').replace(/\*\)/g, '* )');
    lines.push(`\t${r.symbol} AT ${r.address} : ${DIGITAL(r.kind) ? 'BOOL' : 'INT'};${comment ? ` (* ${comment} *)` : ''}`);
  }
  lines.push('END_VAR', '');
  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// Import della tabella variabili
// ---------------------------------------------------------------------------

export interface TagImportRow { name: string; address: string; comment?: string }

export interface TagImportResult {
  /** Canali aggiornati sui punti I/O disegnati */
  placed: number;
  /** Canali aggiornati su schede ma non ancora disegnati */
  unplaced: number;
  /** Variabili il cui indirizzo non corrisponde a nessun canale */
  notFound: string[];
}

/** Forma normalizzata di un indirizzo per il confronto: "%E0.0", "I0.0", "%IX0.0" → "I0.0" */
export function normalizeAddress(a: string): string {
  let s = a.trim().toUpperCase().replace(/^%/, '').replace(/\s+/g, '');
  s = s.replace(/^IX/, 'I').replace(/^QX/, 'Q');
  // Tedesco → inglese
  s = s.replace(/^EW/, 'IW').replace(/^AW/, 'QW').replace(/^E(?=\d)/, 'I').replace(/^A(?=\d)/, 'Q');
  return s;
}

/**
 * Applica nomi e commenti importati: la corrispondenza è per indirizzo, confrontato nel
 * formato del progetto (anche se il file usa la notazione tedesca o IEC equivalente).
 */
export function applyTagImport(project: Project, rows: TagImportRow[]): TagImportResult {
  const byAddr = new Map<string, { card: PlcCard; channel: string }>();
  for (const card of project.plc.cards) {
    const f = cardFormat(project, card);
    // TwinCAT: %I* non distingue i canali, l'import per indirizzo non vale
    if (f === 'twincat') continue;
    for (const ch of channelsOf(card)) {
      byAddr.set(normalizeAddress(channelAddress(card, ch.id, f)), { card, channel: ch.id });
      // IEC: %IW con indice di parola; accetto anche la forma Siemens in byte
      if (f === 'iec' && !DIGITAL(ch.kind)) byAddr.set(normalizeAddress(channelAddress(card, ch.id, 'siemens-en')), { card, channel: ch.id });
    }
  }
  const placed = new Map<string, SymbolInstance>();
  for (const pg of project.pages) for (const e of pg.elements) {
    if (e.kind === 'symbol' && e.plcChannel) placed.set(`${e.tag}|${e.plcChannel}`, e);
  }
  const res: TagImportResult = { placed: 0, unplaced: 0, notFound: [] };
  for (const r of rows) {
    const hit = byAddr.get(normalizeAddress(r.address));
    if (!hit) { res.notFound.push(`${r.name} (${r.address})`); continue; }
    const symbol = sanitizeSymbol(r.name);
    const inst = placed.get(`${hit.card.tag}|${hit.channel}`);
    if (inst) {
      inst.plcSymbol = symbol;
      if (r.comment) inst.plcComment = r.comment;
      res.placed++;
    } else {
      hit.card.io = { ...(hit.card.io ?? {}), [hit.channel]: { symbol, comment: r.comment || undefined } };
      res.unplaced++;
    }
  }
  return res;
}

/** Legge una GVL CODESYS: "Nome AT %IX0.0 : BOOL; (* commento *)" oppure "// commento" */
export function parseGvl(text: string): TagImportRow[] {
  const out: TagImportRow[] = [];
  const re = /^\s*([A-Za-z_]\w*)\s+AT\s+(%[IQM][XBWD]?\d+(?:\.\d+)?)\s*:\s*[\w.]+\s*(?::=[^;]*)?;\s*(?:\(\*([\s\S]*?)\*\)|\/\/(.*))?/;
  for (const line of text.split(/\r?\n/)) {
    const m = re.exec(line);
    if (m) out.push({ name: m[1], address: m[2], comment: (m[3] ?? m[4] ?? '').trim() || undefined });
  }
  return out;
}

/** Legge una tabella (righe di celle) con intestazioni tipo Name / Logical Address / Comment */
export function parseTagTable(rows: string[][]): TagImportRow[] {
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  const find = (...names: RegExp[]) => head.findIndex(h => names.some(n => n.test(h)));
  let iName = find(/^name$/, /^nome/, /^symbol/, /^simbol/);
  let iAddr = find(/logical address/, /^address/, /^indirizzo/, /^adresse/, /^operand/);
  let iComm = find(/^comment/, /^commento/, /^kommentar/);
  let body = rows.slice(1);
  if (iName < 0 || iAddr < 0) { iName = 0; iAddr = 3; iComm = 4; body = rows; } // ordine colonne TIA
  return body
    .map(r => ({ name: (r[iName] ?? '').trim(), address: (r[iAddr] ?? '').trim(), comment: iComm >= 0 ? (r[iComm] ?? '').trim() || undefined : undefined }))
    .filter(r => r.name && /\d/.test(r.address));
}

/** Legge un CSV con separatore ; , o tabulazione (gestisce le virgolette) */
export function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  return lines.map(line => {
    const cells: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    return cells;
  });
}

// ---------------------------------------------------------------------------
// Pagine panoramiche
// ---------------------------------------------------------------------------

export interface OverviewData {
  tag: string;
  title: string;
  station: string;
  rows: IoRow[];
  /** Dove sono disegnate le alimentazioni L+/M della scheda */
  supply: string[];
}

/** Crea le pagine panoramiche mancanti (una per scheda) e toglie quelle di schede eliminate */
export function syncOverviewPages(project: Project): { added: number; removed: number } {
  const ids = new Set(project.plc.cards.map(c => c.id));
  const before = project.pages.length;
  project.pages = project.pages.filter(p => p.type !== 'plc' || (p.cardId && ids.has(p.cardId)));
  const removed = before - project.pages.length;
  let added = 0;
  for (const c of project.plc.cards) {
    if (project.pages.some(p => p.type === 'plc' && p.cardId === c.id)) continue;
    const nums = project.pages.map(x => parseInt(x.name, 10)).filter(n => !isNaN(n));
    const page: Page = {
      id: uid('p'), name: String((nums.length ? Math.max(...nums) : 0) + 1),
      title: `Panoramica PLC -${c.tag}`, type: 'plc', cardId: c.id, elements: [],
    };
    project.pages.push(page);
    added++;
  }
  return { added, removed };
}

/** Posizione della riga di un canale nella pagina panoramica */
export const OVERVIEW = { top: 40, x: 64, w: 56, rowMax: 7, bottom: 236 };
export function overviewRowHeight(n: number) {
  return Math.min(OVERVIEW.rowMax, (OVERVIEW.bottom - OVERVIEW.top) / Math.max(1, n));
}

export function overviewData(project: Project, library: Part[] = []): Map<string, OverviewData> {
  const all = ioAssignments(project, library);
  const out = new Map<string, OverviewData>();
  for (const c of project.plc.cards) {
    out.set(c.id, {
      tag: c.tag,
      title: c.custom?.name ?? cardType(c).name,
      station: c.station,
      rows: all.filter(r => r.card.id === c.id),
      supply: allPlaced(project).filter(e => e.sym.role === 'plc' && !e.sym.io && e.inst.tag === c.tag).map(e => locationOf(e)),
    });
  }
  return out;
}

/** Riferimento dal punto I/O alla riga della pagina panoramica, es. "5.2" */
export function overviewRefs(project: Project): Map<string, string> {
  const out = new Map<string, string>();
  for (const pg of project.pages) {
    if (pg.type !== 'plc' || !pg.cardId) continue;
    const card = project.plc.cards.find(c => c.id === pg.cardId);
    if (card) out.set(card.tag, `${pg.name}.${columnOf(OVERVIEW.x)}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Configurazione hardware: stazioni, rack/slot, IO-Link
// ---------------------------------------------------------------------------

export interface IolinkRow { card: PlcCard; port: number; device: string; description: string; inBytes: number; outBytes: number; inAddr: string; outAddr: string }

/** Indirizzo di un byte nel formato del progetto, es. IB10 / EB10 / %IB10 */
function byteAddr(f: PlcAddressFormat, input: boolean, byte: number): string {
  if (isOmron(f)) return String(Math.floor(byte / 2));
  if (isIec(f)) return `${input ? '%IB' : '%QB'}${byte}`;
  if (f === 'siemens-de') return `${input ? 'EB' : 'AB'}${byte}`;
  return `${input ? 'IB' : 'QB'}${byte}`;
}

/** Porte IO-Link con gli indirizzi dei dati di processo (consecutivi dall'inizio della scheda) */
export function iolinkRows(project: Project, format?: PlcAddressFormat): IolinkRow[] {
  const out: IolinkRow[] = [];
  for (const c of project.plc.cards) {
    const f = format ?? cardFormat(project, c);
    let i = c.start.DI ?? 0, o = c.start.DO ?? 0;
    if (isOmron(f)) { i *= 2; o *= 2; }
    for (const p of c.iolink ?? []) {
      const range = (input: boolean, from: number, n: number) => (n ? (n === 1 ? byteAddr(f, input, from) : `${byteAddr(f, input, from)}…${byteAddr(f, input, from + n - 1)}`) : '');
      out.push({ card: c, port: p.port, device: p.device ?? '', description: p.description ?? '', inBytes: p.inBytes, outBytes: p.outBytes, inAddr: range(true, i, p.inBytes), outAddr: range(false, o, p.outBytes) });
      i += p.inBytes; o += p.outBytes;
    }
  }
  return out;
}

/**
 * Schede della stessa stazione con indirizzi sovrapposti. Siemens e IEC: per verso, in byte (anche
 * tra digitali e analogici: IW64 occupa i byte 64 e 65 degli ingressi); Omron: per area.
 */
export function addressOverlaps(project: Project): string[] {
  const areas = new Map<string, { c: PlcCard; k: IoKind; from: number; to: number }[]>();
  const fmtOf = new Map<string, PlcAddressFormat>();
  for (const c of project.plc.cards) for (const k of IO_KINDS) {
    const f = cardFormat(project, c);
    fmtOf.set(c.station, f);
    if (!usesKind(c, k) || c.start[k] === undefined) continue;
    const n = span(c, k, f);
    if (!n) continue;
    const key = `${c.station}|${isOmron(f) ? areaOf(f, k) : INPUT(k) ? 'I' : 'Q'}`;
    areas.set(key, [...(areas.get(key) ?? []), { c, k, from: c.start[k]!, to: c.start[k]! + n }]);
  }
  const range = (r: { c: PlcCard; k: IoKind; from: number; to: number }, f = fmtOf.get(r.c.station)!) =>
    `${r.k} ${byteAddr(f, INPUT(r.k), isOmron(f) ? r.from * 2 : r.from)}…${byteAddr(f, INPUT(r.k), isOmron(f) ? (r.to - 1) * 2 : r.to - 1)}`;
  const out: string[] = [];
  const told = new Set<string>();
  for (const list of areas.values()) {
    list.sort((a, b) => a.from - b.from);
    list.forEach((a, i) => {
      for (const b of list.slice(i + 1)) {
        if (b.from >= a.to) break;
        const key = [a.c.id, b.c.id].sort().join('|');
        if (told.has(key)) continue;
        told.add(key);
        out.push(`Stazione ${a.c.station}: indirizzi sovrapposti tra -${a.c.tag} (${range(a)}) e -${b.c.tag} (${range(b)}): «Riassegna indirizzi» nella vista PLC li rimette in fila`);
      }
    });
  }
    return out;
}

/** Controlli della configurazione: slot doppi, nomi Profinet o IP ripetuti, indirizzi sovrapposti */
export function hardwareProblems(project: Project): string[] {
  const out: string[] = [...addressOverlaps(project)];
  const seen = new Map<string, string>();
  for (const c of project.plc.cards) {
    if (c.slot === undefined) continue;
    const k = `${c.station}|${c.rack ?? 0}|${c.slot}`;
    if (seen.has(k)) out.push(`Stazione ${c.station}: rack ${c.rack ?? 0} slot ${c.slot} usato da -${seen.get(k)} e -${c.tag}`);
    else seen.set(k, c.tag);
  }
  const st = project.plc.stations ?? [];
  for (const key of ['ip', 'deviceName'] as const) {
    const m = new Map<string, string>();
    for (const s of st) {
      const v = s[key]?.trim().toLowerCase();
      if (!v) continue;
      if (m.has(v)) out.push(`${key === 'ip' ? 'Indirizzo IP' : 'Nome dispositivo'} "${s[key]}" usato dalle stazioni ${m.get(v)} e ${s.name}`);
      else m.set(v, s.name);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Export PLCopen XML (IEC 61131-10 / TC6): variabili globali con indirizzo
// ---------------------------------------------------------------------------

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Progetto PLCopen XML con una lista di variabili globali: ogni canale usato o con nome
 * e i dati di processo IO-Link (ARRAY OF BYTE). Gli indirizzi sono sempre in notazione IEC
 * (%IX, %QX, %IW, %IB…), importabile in CODESYS e negli ambienti che leggono PLCopen.
 */
export function plcopenXml(project: Project, library: Part[] = []): string {
  const now = new Date().toISOString().slice(0, 19);
  const vars: string[] = [];
  for (const r of ioAssignments(project, library, false)) {
    const type = DIGITAL(r.kind) ? '<BOOL/>' : '<INT/>';
    const comment = [r.comment, r.connected].filter(Boolean).join(' - ');
    vars.push(`          <variable name="${xmlEsc(r.symbol)}" address="${channelAddress(r.card, r.channel, cardFormat(project, r.card) === 'twincat' ? 'twincat' : 'iec')}">
            <type>${type}</type>${comment ? `
            <documentation><xhtml xmlns="http://www.w3.org/1999/xhtml">${xmlEsc(comment)}</xhtml></documentation>` : ''}
          </variable>`);
  }
  const iecRows = iolinkRows(project, 'iec');
  for (const r of iecRows) {
    const base = sanitizeSymbol(`IOL_${r.card.tag}_P${r.port}${r.device ? `_${r.device}` : ''}`);
    const arr = (n: number) => `<array><dimension lower="0" upper="${n - 1}"/><baseType><BYTE/></baseType></array>`;
    if (r.inBytes) vars.push(`          <variable name="${base}_IN" address="${r.inAddr.split('…')[0]}"><type>${arr(r.inBytes)}</type></variable>`);
    if (r.outBytes) vars.push(`          <variable name="${base}_OUT" address="${r.outAddr.split('…')[0]}"><type>${arr(r.outBytes)}</type></variable>`);
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0201">
  <fileHeader companyName="${xmlEsc(project.info.company || 'OpenWiring')}" productName="OpenWiring" productVersion="1" creationDateTime="${now}"/>
  <contentHeader name="${xmlEsc(project.info.name)}" modificationDateTime="${now}">
    <coordinateInfo><fbd><scaling x="1" y="1"/></fbd><ld><scaling x="1" y="1"/></ld><sfc><scaling x="1" y="1"/></sfc></coordinateInfo>
  </contentHeader>
  <types><dataTypes/><pous/></types>
  <instances>
    <configurations>
      <configuration name="Config">
        <resource name="Resource">
        </resource>
        <globalVars name="IO_OpenWiring">
${vars.join('\n')}
        </globalVars>
      </configuration>
    </configurations>
  </instances>
</project>
`;
}

/** Simbolo dello schema che sembra una scheda PLC ma non è ancora nell'elenco delle schede */
export interface UnlinkedPlc {
  tag: string;
  els: PlacedElement[];
  /** Articolo del dispositivo, se c'è */
  part?: Part;
  /** Canali riconosciuti dal modello funzione dell'articolo */
  channels: Partial<Record<IoKind, number>>;
}

const PLC_WORDS = /\bplc\b|\bsps\b|\bcpu\b|controllore programmabile|periferia decentrata|\bi\/o\b|et ?200|simatic|modicon/i;

/**
 * Dispositivi dello schema da collegare a una scheda PLC: punti I/O e alimentazioni con una sigla
 * che non è di nessuna scheda, e componenti (es. CPU importate da un EDZ) il cui articolo ha canali
 * di ingresso/uscita o è descritto come PLC
 */
export function unlinkedPlcDevices(project: Project, library: Part[] = []): UnlinkedPlc[] {
  const parts = partsIndex(project, library);
  const cards = new Set(project.plc.cards.map(c => c.tag));
  const byTag = new Map<string, PlacedElement[]>();
  for (const e of allPlaced(project)) {
    if (['potential', 'link', 'terminal', 'pin'].includes(e.sym.role)) continue;
    const t = e.inst.tag.trim();
    if (!t || cards.has(t)) continue;
    byTag.set(t, [...(byTag.get(t) ?? []), e]);
  }
  const out: UnlinkedPlc[] = [];
  for (const [tag, els] of byTag) {
    const partNr = els.map(e => e.inst.partNr).find(Boolean);
    const part = partNr ? parts.get(partNr) : undefined;
    const channels = part ? detectPartChannels(part).channels : {};
    const hasChannels = IO_KINDS.some(k => (channels[k] ?? 0) > 0);
    const words = [part?.descr1, part?.productGroup, part?.typeNr, ...els.map(e => `${e.sym.category} ${e.sym.name} ${e.inst.description ?? ''}`)].filter(Boolean).join(' ');
    if (els.some(e => e.sym.role === 'plc') || hasChannels || PLC_WORDS.test(words)) out.push({ tag, els, part, channels });
  }
  return out.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
}

/**
 * Dispositivo dello schema che rappresenta la scheda: stessa sigla, almeno un simbolo che non è un
 * punto I/O (es. la CPU inserita da un articolo) e un articolo o un codice d'ordinazione. I suoi
 * dati valgono per la scheda, che allora non ne tiene una copia propria. Un nodo dello schema di
 * rete senza articolo non basta: la scheda tiene i suoi dati.
 */
export function cardDevice(project: Project, card: PlcCard, devices = buildDevices(project)): Device | undefined {
  const d = devices.get(card.tag);
  return d && d.elements.some(e => e.sym.role !== 'plc') && d.elements.some(e => e.inst.partNr || e.inst.orderNr) ? d : undefined;
}

/** Dati d'ordinazione della scheda: quelli del dispositivo collegato, altrimenti quelli della scheda */
export function cardOrderInfo(project: Project, card: PlcCard, parts: Map<string, Part>, devices = buildDevices(project)): { info: DeviceInfo; fromDevice: boolean } {
  const d = cardDevice(project, card, devices);
  if (d) return { info: deviceInfo(d.elements, d.main, parts), fromDevice: true };
  const part = card.partNr ? parts.get(card.partNr) : undefined;
  return {
    fromDevice: false,
    info: { partNr: card.partNr, part, orderNr: card.orderNr ?? part?.orderNr, manufacturer: card.manufacturer ?? part?.manufacturer,
      typeNr: part?.typeNr ?? cardType(card).name, description: card.description ?? cardType(card).name } as DeviceInfo,
  };
}

/** Canali dell'articolo del dispositivo collegato diversi da quelli della scheda (per l'avviso) */
export function cardChannelMismatch(project: Project, card: PlcCard, parts: Map<string, Part>, devices = buildDevices(project)): string | undefined {
  const d = cardDevice(project, card, devices);
  const partNr = d?.elements.map(e => e.inst.partNr).find(Boolean);
  const part = partNr ? parts.get(partNr) : undefined;
  if (!part) return undefined;
  const det = detectPartChannels(part).channels;
  if (!IO_KINDS.some(k => det[k])) return undefined;
  const have = cardType(card).channels;
  if (IO_KINDS.every(k => (det[k] ?? 0) === (have[k] ?? 0))) return undefined;
  const fmt = (c: Partial<Record<IoKind, number>>) => IO_KINDS.filter(k => c[k]).map(k => `${c[k]} ${k}`).join(' / ') || '—';
  return `-${card.tag}: la scheda ha ${fmt(have)}, l'articolo ${part.partNr} ${fmt(det)}`;
}

/**
 * Stazioni del progetto: quelle delle schede (nell'ordine delle schede), poi quelle create e ancora
 * senza schede. La prima è quella proposta per le schede nuove.
 */
export function stationNames(project: Project): string[] {
  return [...new Set([...project.plc.cards.map(c => c.station), ...(project.plc.stations ?? []).map(s => s.name)])];
}
