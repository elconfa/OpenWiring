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
  /** Forma della faccia nella piedinatura (assente = rettangolare a due file) */
  shape?: 'subd' | 'rj45';
}

const pad = (n: number) => String(n).padStart(2, '0');
const serie = (series: string, sizes: [number, string][], amps: number, contact: string, code: (g: 'M' | 'F', n: string) => string): ConnectorType[] =>
  sizes.map(([n, housing]) => ({
    id: `ilme-${series.toLowerCase()}-${pad(n)}`, maker: 'ILME', series, poles: n, pe: true, amps, contact,
    male: code('M', pad(n)), female: code('F', pad(n)), housing,
  }));

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
];

export const connectorType = (id?: string) => (id ? CONNECTOR_TYPES.find(t => t.id === id) : undefined);

/** Nome breve: "ILME CNE 16 (16+PE)" */
export const connectorTypeName = (t: ConnectorType) => (t.shape ? `${t.series === '8P8C' || t.series.startsWith('8P8C') ? `RJ45 ${t.series}` : t.series}` : `${t.maker} ${t.series} ${t.poles} (${t.poles}${t.pe ? '+PE' : ''})`);

/** Nome corto per il riquadro sullo schema: "ILME CNE 16+PE", "RJ45", "DB9" */
export const connectorShortName = (t: ConnectorType) => (t.shape === 'rj45' ? `RJ45${t.extra?.length ? ' SH' : ''}` : t.shape === 'subd' ? t.series : `${t.maker} ${t.series} ${t.poles}${t.pe ? '+PE' : ''}`);

/** Nomi dei contatti nell'ordine: 1…n e PE */
export const typePinNames = (t: ConnectorType) => [...Array.from({ length: t.poles }, (_, i) => String(i + 1)), ...(t.pe ? ['PE'] : []), ...(t.extra ?? [])];

/** Genere: maschio (spina), femmina (presa) o la coppia */
export type ConnectorGender = NonNullable<ConnectorData['gender']>;
export const GENDER_NAMES: Record<ConnectorGender, string> = { M: tn('maschio'), F: tn('femmina'), MF: tn('maschio + femmina') };

/** Simbolo dei pin per il genere del connettore */
export const genderSymbol = (g?: ConnectorGender) => (g === 'M' ? 'conn_male' : g === 'F' ? 'conn_female' : 'conn_pair');
