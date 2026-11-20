// Catalogo dei connettori industriali rettangolari: serie ILME più usate negli impianti, con il numero
// di contatti (più il PE), la corrente, il tipo di contatto, i codici degli inserti maschio e femmina e la
// misura della custodia adatta. I codici e le custodie sono indicativi: vanno confermati sul catalogo
// ILME prima dell'ordine (il costruttore ha varianti a vite, a molla, a crimpare, con custodie diverse).
import type { ConnectorData } from './types';
import { tn } from '../i18n/ui';

export interface ConnectorType {
  id: string;
  maker: string;
  series: string;
  /** Contatti di potenza o segnale, senza il PE */
  poles: number;
  pe: boolean;
  amps: number;
  contact: string;
  /** Codici degli inserti maschio e femmina */
  male: string;
  female: string;
  /** Misura della custodia (es. "44.27"); vuota per i connettori di segnale (RJ45, SUB-D) */
  housing: string;
  /** Contatti in più dopo quelli numerati (es. "SH" per lo schermo) */
  extra?: string[];
  /** Forma della faccia nella piedinatura (assente = rettangolare a due file; circ = M8, M12) */
  shape?: 'subd' | 'rj45' | 'circ';
  /** Nomi dei contatti sulla faccia, se non sono 1…n (es. M12 a 3 poli: 1, 3, 4; codifica L: 1…4 e FE) */
  names?: string[];
  /** Connettori circolari: posti sulla corona (es. 4 anche per il 3 poli, che non ha il 2) e contatto centrale (l'ultimo) */
  ring?: number;
  center?: boolean;
  /** Colore del conduttore e segnale tipici di ogni contatto, nell'ordine dei nomi (es. "BN · +24 V") */
  info?: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const serie = (series: string, sizes: [number, string][], amps: number, contact: string, code: (g: 'M' | 'F', n: string) => string): ConnectorType[] =>
  sizes.map(([n, housing]) => ({
    id: `ilme-${series.toLowerCase()}-${pad(n)}`, maker: 'ILME', series, poles: n, pe: true, amps, contact,
    male: code('M', pad(n)), female: code('F', pad(n)), housing,
  }));

/**
 * Contatti tipici dei connettori circolari: colori dei cavi standard (IEC 60947-5-2, DIN 47100) e segnali.
 * Indicativi: la piedinatura va confermata sulla scheda tecnica del costruttore.
 */
const CIRC_PINS: Record<string, { names?: string[]; ring?: number; center?: boolean; info: string[] }> = {
  'A3': { names: ['1', '3', '4'], ring: 4, info: ['BN · +24 V', 'BU · 0 V', 'BK · segnale'] },
  'A4': { info: ['BN · +24 V', 'WH · segnale 2', 'BU · 0 V', 'BK · segnale'] },
  'A5': { center: true, info: ['BN · +24 V', 'WH · segnale 2', 'BU · 0 V', 'BK · segnale', 'GY'] },
  'A8': { center: true, info: ['WH', 'BN', 'GN', 'YE', 'GY', 'PK', 'BU', 'RD'] },
  'A12': { center: true, info: ['BN', 'BU', 'WH', 'GN', 'PK', 'YE', 'BK', 'GY', 'RD', 'VT', 'GYPK', 'RDBU'] },
  'B5': { center: true, info: ['VP +5 V', 'GN · A', 'DGND', 'RD · B', 'SH'] },
  'D4': { info: ['YE · TD+', 'WH · RD+', 'OG · TD−', 'BU · RD−'] },
  'X8': { info: ['WHOG · D1+', 'OG · D1−', 'WHGN · D2+', 'GN · D2−', 'WHBN · D4+', 'BN · D4−', 'WHBU · D3−', 'BU · D3+'] },
  'L5': { names: ['1', '2', '3', '4', 'FE'], center: true, info: ['BN · +24 V US', 'WH · 0 V UA', 'BU · 0 V US', 'BK · +24 V UA', 'GNYE · FE'] },
};

function circ(size: 'M8' | 'M12', coding: string, poles: number[], amps: number[], contact: string): ConnectorType[] {
  return poles.map((n, i) => {
    const pins = CIRC_PINS[`${coding}${n}`] ?? { info: [] };
    const series = `${size} ${coding} ${n} poli`;
    return {
      id: `${size.toLowerCase()}-${coding.toLowerCase()}-${n}`, maker: size, series, poles: n, pe: false, amps: amps[i], contact,
      male: `${series} maschio`, female: `${series} femmina`, housing: '', shape: 'circ' as const, ...pins,
    };
  });
}

export const CONNECTOR_TYPES: ConnectorType[] = [
  ...serie('CK', [[3, '21.21'], [4, '21.21'], [6, '32.13'], [8, '32.13'], [12, '44.27']], 10, tn('a vite'), (g, n) => `CK${g} ${n}`),
  ...serie('CNE', [[6, '44.27'], [10, '57.27'], [16, '77.27'], [24, '104.27']], 16, tn('a vite'), (g, n) => `CNE${g} ${n} T`),
  ...serie('CSE', [[6, '44.27'], [10, '57.27'], [16, '77.27'], [24, '104.27']], 16, tn('a vite (morsetti a gabbia)'), (g, n) => `CSE${g} ${n}`),
  ...serie('CQE', [[10, '44.27'], [18, '57.27'], [32, '77.27'], [46, '104.27']], 16, tn('a crimpare'), (g, n) => `CQE${g} ${n}`),
  ...serie('CDD', [[24, '44.27'], [42, '57.27'], [72, '77.27'], [108, '104.27']], 10, tn('a crimpare'), (g, n) => `CDD${g} ${n}`),
  // Connettori di segnale: Ethernet e seriali
  { id: 'rj45', maker: 'RJ45', series: '8P8C', poles: 8, pe: false, amps: 1.5, contact: tn('Ethernet, T568A/B'), male: 'spina RJ45', female: 'presa RJ45', housing: '', shape: 'rj45' },
  { id: 'rj45-sh', maker: 'RJ45', series: '8P8C schermato', poles: 8, pe: false, amps: 1.5, contact: tn('Ethernet, T568A/B'), male: 'spina RJ45 schermata', female: 'presa RJ45 schermata', housing: '', shape: 'rj45', extra: ['SH'] },
  ...([9, 15, 25] as const).map(n => ({
    id: `db${n}`, maker: 'SUB-D', series: `DB${n}`, poles: n, pe: false, amps: 5, contact: tn('a saldare o a crimpare'),
    male: `DB${n} maschio`, female: `DB${n} femmina`, housing: `Guscio DB${n}`, shape: 'subd' as const, extra: ['SH'],
  })),
  // Connettori circolari M8 e M12 (IEC 61076-2-101/104/109/111): codifica A sensori e attuatori, B
  // Profibus, D Ethernet 100 Mbit (Profinet, EtherCAT), X Ethernet fino a 10 Gbit, L potenza (Profinet)
  ...circ('M8', 'A', [3, 4, 8], [4, 4, 1.5], tn('sensori e attuatori')),
  ...circ('M12', 'A', [3, 4, 5, 8, 12], [4, 4, 4, 2, 1.5], tn('sensori e attuatori')),
  ...circ('M12', 'B', [5], [4], tn('Profibus DP')),
  ...circ('M12', 'D', [4], [4], tn('Ethernet 100 Mbit (Profinet, EtherCAT)')),
  ...circ('M12', 'X', [8], [0.5], tn('Ethernet fino a 10 Gbit')),
  ...circ('M12', 'L', [5], [16], tn('potenza 24 V (Profinet), 4 + FE')),
];

/** Articolo connettore senza tipo del catalogo (custodia, frutto, connettore di un costruttore qualsiasi) */
export const GENERIC_CONNECTOR = 'generic';
/** Articolo segnato come connettore (con o senza tipo del catalogo): si propone tra gli articoli aggiuntivi dei cavi */
export const isConnectorPart = (p: { connectorType?: string }) => !!p.connectorType;

export const connectorType = (id?: string) => (id ? CONNECTOR_TYPES.find(t => t.id === id) : undefined);

/** Nome breve: "ILME CNE 16 (16+PE)" */
export const connectorTypeName = (t: ConnectorType) => (t.shape === 'circ' ? t.series : t.shape ? `${t.series === '8P8C' || t.series.startsWith('8P8C') ? `RJ45 ${t.series}` : t.series}` : `${t.maker} ${t.series} ${t.poles} (${t.poles}${t.pe ? '+PE' : ''})`);

/** Nome corto per il riquadro sullo schema: "ILME CNE 16+PE", "RJ45", "DB9" */
export const connectorShortName = (t: ConnectorType) => (t.shape === 'circ' ? `${t.maker} ${t.series.split(' ')[1]} ${t.poles}p` : t.shape === 'rj45' ? `RJ45${t.extra?.length ? ' SH' : ''}` : t.shape === 'subd' ? t.series : `${t.maker} ${t.series} ${t.poles}${t.pe ? '+PE' : ''}`);

/** Nomi dei contatti nell'ordine: 1…n e PE */
export const typePinNames = (t: ConnectorType) => [...(t.names ?? Array.from({ length: t.poles }, (_, i) => String(i + 1))), ...(t.pe ? ['PE'] : []), ...(t.extra ?? [])];

/** Gruppo nell'elenco dei tipi: «ILME CNE», «Segnale (RJ45, SUB-D)», «M12 codifica D»… */
export const connectorGroup = (t: ConnectorType, tr: (s: string) => string = s => s) =>
  (t.shape === 'circ' ? `${t.maker} ${tr(tn('codifica'))} ${t.series.split(' ')[1]}` : t.shape ? tr(tn('Segnale (RJ45, SUB-D)')) : `${t.maker} ${t.series}`);

/**
 * Posizione dei contatti sulla faccia di un connettore circolare (vista lato contatti, chiave in alto):
 * corona in senso orario dal contatto 1 in alto a destra, l'ultimo al centro se c'è; coordinate da −1 a 1
 */
export function circLayout(t: ConnectorType): { name: string; x: number; y: number }[] {
  const names = typePinNames(t).slice(0, t.poles);
  const onRing = names.slice(0, t.center ? -1 : undefined);
  const ring = t.ring ?? onRing.length;
  const at = (k: number) => { const a = -Math.PI / 2 + Math.PI / ring + (2 * Math.PI * k) / ring; return { x: Math.cos(a) * 0.62, y: Math.sin(a) * 0.62 }; };
  // Contatti numerati (1, 3, 4 del 3 poli) al posto del loro numero sulla corona
  const out = onRing.map((name, i) => { const n = parseInt(name, 10); return { name, ...at(t.ring && !isNaN(n) ? n - 1 : i) }; });
  if (t.center) out.push({ name: names[names.length - 1], x: 0, y: 0 });
  return out;
}

/** Genere: maschio (spina), femmina (presa) o la coppia */
export type ConnectorGender = NonNullable<ConnectorData['gender']>;
export const GENDER_NAMES: Record<ConnectorGender, string> = { M: tn('maschio'), F: tn('femmina'), MF: tn('maschio + femmina') };

/** Simbolo dei pin per il genere del connettore */
export const genderSymbol = (g?: ConnectorGender) => (g === 'M' ? 'conn_male' : g === 'F' ? 'conn_female' : 'conn_pair');
