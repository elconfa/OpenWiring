// Scelte della finestra «Inserisci gruppo PLC», prima di posare il gruppo sullo schema: scheda (una
// del progetto o una nuova, con tipo, stazione, rack e slot), canali e, per le prese M12, nome della
// prima presa, canale A e canale B, numeri dei pin e sigle dei comuni.
// Le proposte sono quelle che il programma sceglierebbe da solo; tutto si cambia prima di posare.
import type { Page, PlcCard, Project } from './types';
import { cardType, newCard, PLC_CARD_TYPES, stationNames } from './plc';
import { firstFreeChannel, sliceIdFor, termsOf } from './plcGroup';
import { defaultSocketChannels, socketCardFits, type PlcSocketCfg } from './plcSocket';
import { getSymbol } from './geometry';
import { nextTagFor } from './numbering';
import { PLC_SOCKET_COMMONS } from './symbols';
import { tx } from '../i18n/ui';

export interface PlcNewCard { tag: string; typeId: string; station: string; rack?: number; slot?: number }

export interface PlcInsertCfg {
  /** Scheda del progetto (sigla senza trattino); vuota con newCard */
  tag: string;
  /** Scheda nuova da creare inserendo il gruppo */
  newCard?: PlcNewCard;
  io: 'DI' | 'DO';
  /** Canali del gruppo o prese */
  count: number;
  /** Primo canale (gruppo) o canale A della prima presa */
  first: number;
  /** Gruppo: morsetti per canale */
  terms?: 1 | 2;
  /** Prese M12 */
  socket?: {
    name: string;
    /** Canale B della prima presa */
    second: number;
    /** Sigle dei comuni per pin: 1, 5, 3 */
    commons: Record<string, string>;
    /** Numeri dei pin per id: A 4, B 2, comuni 1, 5, 3 */
    pinNos: Record<string, string>;
  };
}

/** Il simbolo è un gruppo PLC che si inserisce con la finestra (gruppo I/O o prese M12) */
export function isPlcGroupSymbol(project: Project, symbolId: string): boolean {
  const s = getSymbol(symbolId, project);
  return !!s?.plcGroup && (s.io === 'DI' || s.io === 'DO');
}

/** Tipi di scheda adatti (con canali del tipo del gruppo) */
export const cardTypesFor = (io: 'DI' | 'DO') => PLC_CARD_TYPES.filter(t => (t.channels[io] ?? 0) > 0);

/** Schede del progetto adatte al gruppo */
export const cardsFor = (project: Project, io: 'DI' | 'DO'): PlcCard[] => project.plc.cards.filter(c => (cardType(c).channels[io] ?? 0) > 0);

/** Scheda nuova proposta: sigla libera, tipo di serie, la prima stazione */
export function proposeNewCard(project: Project, io: 'DI' | 'DO', page: Page | undefined, x: number): PlcNewCard {
  const typeId = io === 'DI' ? 'di16' : 'do16';
  const station = stationNames(project)[0] ?? 'PLC1';
  const tag = page ? nextTagFor(project, 'A', page, x, project.plc.cards.map(c => c.tag)) : 'A1';
  const c = newCard(project, typeId, tag, station);
  return { tag, typeId, station, rack: c.rack, slot: c.slot };
}

/** Canali proposti per la scheda scelta (primi liberi; per le prese il canale B 8 dopo) */
export function proposeChannels(project: Project, card: PlcCard, cfg: Pick<PlcInsertCfg, 'io' | 'count' | 'socket'>, fresh: boolean): { first: number; second?: number; count: number } {
  const max = cardType(card).channels[cfg.io] ?? 0;
  if (cfg.socket) {
    const d = defaultSocketChannels(project, card, cfg.io, cfg.count, fresh);
    return { first: d.first, second: d.second, count: cfg.count };
  }
  const first = fresh ? 0 : firstFreeChannel(project, card, cfg.io, cfg.count);
  return { first, count: Math.max(1, Math.min(cfg.count, max - first)) };
}

/** Proposta iniziale della finestra per il simbolo (con la scheda indicata, se c'è) */
export function plcInsertDefaults(project: Project, symbolId: string, page: Page | undefined, x: number, presetTag?: string): PlcInsertCfg | undefined {
  const sym = getSymbol(symbolId, project);
  if (!sym?.plcGroup || (sym.io !== 'DI' && sym.io !== 'DO')) return undefined;
  const io = sym.io;
  const socket = !!sym.plcGroup.socket;
  const count = sym.plcGroup.count;
  const preset = presetTag ? project.plc.cards.find(c => c.tag === presetTag && (cardType(c).channels[io] ?? 0) > 0) : undefined;
  const card = preset ?? (socket ? cardsFor(project, io).find(c => socketCardFits(project, c, io, count)) : cardsFor(project, io).find(c => {
    const used = new Set(project.pages.flatMap(p => p.elements.flatMap(e => (e.kind === 'symbol' && e.tag === c.tag && e.plcChannel ? [e.plcChannel] : []))));
    return Array.from({ length: cardType(c).channels[io] ?? 0 }, (_, i) => `${io}${i}`).some(ch => !used.has(ch));
  }));
  const base: PlcInsertCfg = {
    tag: card?.tag ?? '', io, count, first: 0,
    ...(socket ? {} : { terms: termsOf(sym.plcGroup.slice) === 2 ? 2 : 1 }),
    ...(socket ? { socket: { name: 'X10', second: 8, commons: { ...PLC_SOCKET_COMMONS }, pinNos: { 4: '4', 2: '2', 1: '1', 5: '5', 3: '3' } } } : {}),
  };
  if (!card) {
    base.newCard = proposeNewCard(project, io, page, x);
    const ch = proposeChannels(project, newCard(project, base.newCard.typeId, base.newCard.tag), base, true);
    return { ...base, first: ch.first, count: ch.count, ...(base.socket ? { socket: { ...base.socket, second: ch.second ?? 8 } } : {}) };
  }
  const ch = proposeChannels(project, card, base, false);
  return { ...base, first: ch.first, count: ch.count, ...(base.socket ? { socket: { ...base.socket, second: ch.second ?? ch.first + 8 } } : {}) };
}

/** Scheda del gruppo: quella del progetto o quella nuova (da aggiungere al progetto) */
export function insertCard(project: Project, cfg: PlcInsertCfg): { card: PlcCard; created: boolean } | undefined {
  if (cfg.newCard) {
    const n = cfg.newCard;
    const c = newCard(project, n.typeId, n.tag.trim().replace(/^-/, ''), n.station.trim() || 'PLC1');
    if (n.rack !== undefined) c.rack = n.rack;
    if (n.slot !== undefined) c.slot = n.slot;
    return { card: c, created: true };
  }
  const card = project.plc.cards.find(c => c.tag === cfg.tag);
  return card ? { card, created: false } : undefined;
}

/** Problemi delle scelte, già tradotti (vuoto = si può inserire) */
export function plcInsertProblems(project: Project, cfg: PlcInsertCfg): string[] {
  const out: string[] = [];
  const t = cfg.newCard ? PLC_CARD_TYPES.find(x => x.id === cfg.newCard!.typeId) : undefined;
  const card = cfg.newCard ? undefined : project.plc.cards.find(c => c.tag === cfg.tag);
  if (cfg.newCard) {
    const tag = cfg.newCard.tag.trim().replace(/^-/, '');
    if (!tag) out.push(tx('Scrivi la sigla della scheda nuova'));
    else if (project.plc.cards.some(c => c.tag === tag)) out.push(tx('La scheda -{0} esiste già: sceglila dall\'elenco', tag));
  } else if (!card) out.push(tx('Scegli la scheda'));
  const max = (t ? t.channels[cfg.io] : card ? cardType(card).channels[cfg.io] : 0) ?? 0;
  if (cfg.count < 1) out.push(tx('Almeno un canale'));
  if (cfg.first + (cfg.socket ? 1 : cfg.count) > max) out.push(tx('La scheda ha {0} canali {1}: il primo canale è troppo avanti', max, cfg.io));
  if (cfg.socket) {
    if (!cfg.socket.name.trim()) out.push(tx('Scrivi il nome della prima presa'));
    if (cfg.socket.second + 1 > max) out.push(tx('Canale B oltre i {0} canali della scheda', max));
  }
  return out;
}

/** Configurazione delle prese da cfg (per buildSocketGroup) */
export function socketCfgOf(cfg: PlcInsertCfg, card: PlcCard): PlcSocketCfg {
  const s = cfg.socket!;
  const max = cardType(card).channels[cfg.io] ?? 0;
  return {
    tag: card.tag, count: cfg.count, up: cfg.io === 'DI', name: s.name.trim(), first: cfg.first, second: s.second,
    kinds: Array.from({ length: cfg.count }, (_, i) => ({ a: cfg.first + i < max ? cfg.io : null, b: s.second + i < max ? cfg.io : null })),
    commons: s.commons, pinNos: s.pinNos,
  };
}

export { sliceIdFor };
