// Morsetti di un canale PLC nelle 5 colonne della vista PLC e del file Excel: Segnale 1, Segnale 2,
// Comune 1, Comune 2, Comune 3.
// - Canale di una presa M12: Segnale 1 è il pin del canale (4 o 2); i comuni sono i pin della presa
//   +24 V (pin 1), FE (pin 5) e 0 V (pin 3), uguali per i due canali della presa; Segnale 2 non c'è.
// - Canale con 1 o 2 morsetti (es. FDI con VS, FDQ con P/M): Segnale 1 e 2, niente comuni.
// - Canale dei vecchi gruppi a 4 morsetti per canale: i morsetti 3 e 4 nelle colonne dei comuni.
import type { Project, SymbolInstance } from './types';
import { socketBodyOf } from './plcSocket';
import { PLC_SOCKET_PINS } from './symbols';
import { getSymbol } from './geometry';

export const TERM_COLS = ['Segnale 1', 'Segnale 2', 'Comune 1', 'Comune 2', 'Comune 3'] as const;
/** Pin della presa M12 dei tre comuni, nell'ordine delle colonne: +24 V, FE, 0 V */
export const SOCKET_COMMON_PINS = PLC_SOCKET_PINS.body.map(([id]) => id) as string[];
/** Nome lungo dei comuni della presa (per i suggerimenti) */
export const SOCKET_COMMON_NAMES = ['+24 V (pin 1)', 'FE (pin 5)', '0 V (pin 3)'];

export interface ChannelTerms {
  /** Valori delle 5 colonne */
  values: string[];
  /** Colonne che si possono scrivere per questo canale */
  editable: boolean[];
  /** Presa M12 del canale (i comuni si scrivono lì) */
  socket?: SymbolInstance;
}

/** Morsetti del canale nelle 5 colonne */
export function channelTerms(project: Project, row: { pins: string[]; inst?: SymbolInstance }): ChannelTerms {
  const body = socketBodyOf(project, row.inst);
  if (body) {
    return {
      values: [row.pins[0] ?? '', '', ...SOCKET_COMMON_PINS.map(id => body.pinLabels[id] ?? '')],
      editable: [true, false, true, true, true],
      socket: body,
    };
  }
  const n = row.inst ? getSymbol(row.inst.symbolId, project)?.pins.length ?? 1 : 1;
  const wide = n > 2 || row.pins.slice(2).some(Boolean);
  return {
    values: [0, 1, 2, 3, 4].map(i => row.pins[i] ?? ''),
    editable: [true, true, wide, wide, wide],
  };
}

/**
 * Applica al progetto il valore di una colonna (k = 0…4). Restituisce la nuova lista dei pin del canale
 * se cambia (da scrivere con setChannelPins), altrimenti undefined; i comuni della presa si scrivono
 * direttamente sulla presa (project è la bozza da modificare).
 */
export function termsAfter(terms: ChannelTerms, pins: string[], k: number, v: string): { pins?: string[]; common?: { body: SymbolInstance; id: string; value: string } } {
  if (!terms.editable[k]) return {};
  const value = v.trim();
  if (terms.socket && k >= 2) {
    const id = SOCKET_COMMON_PINS[k - 2];
    return value === (terms.socket.pinLabels[id] ?? '') ? {} : { common: { body: terms.socket, id, value } };
  }
  const list = [0, 1, 2, 3, 4].map(i => pins[i] ?? '');
  if (list[k] === value) return {};
  list[k] = value;
  return { pins: list };
}
