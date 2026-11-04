// Aspetto delle linee dei cavi (come in EPLAN): rappresentazione principale con tipo e sezione, le
// altre linee dello stesso cavo con la sola sigla; dimensioni, colori, trattino sui fili, posizione dei
// testi e schermo disegnato come un'asola tratteggiata (due semicerchi uniti da due linee).
import type { CableCondDir, CableLabelPos, CableLine, CableLineShow, CableStyle, Project, Pt } from './types';
import { tn } from '../i18n/ui';

export const CABLE_STYLE_DEFAULTS = {
  lineWidth: 0.3, tagSize: 2.6, textSize: 1.9, condSize: 2, ticks: false, labelPos: 'before' as CableLabelPos, condDir: 'h' as CableCondDir,
  main: { tag: true, type: true, section: true, description: false, conductors: true } as Required<CableLineShow>,
  other: { tag: true, type: false, section: false, description: false, conductors: true } as Required<CableLineShow>,
};

export const CABLE_LABEL_POS: [CableLabelPos, string][] = [
  ['before', tn('prima dell\'inizio della linea')], ['after', tn('dopo la fine della linea')],
  ['aboveStart', tn('sopra, all\'inizio')], ['aboveEnd', tn('sopra, alla fine')],
  ['belowStart', tn('sotto, all\'inizio')], ['belowEnd', tn('sotto, alla fine')],
];

export const CABLE_SHOW_KEYS: [keyof CableLineShow, string][] = [
  ['tag', tn('Sigla')], ['type', tn('Tipo')], ['section', tn('Sezione')], ['description', tn('Descrizione')], ['conductors', tn('Nomi dei conduttori')],
];

export const CABLE_COND_DIR: [CableCondDir, string][] = [['h', tn('orizzontali')], ['v', tn('verticali')]];

export type ResolvedCableStyle = Omit<typeof CABLE_STYLE_DEFAULTS, 'main' | 'other'> & Pick<CableStyle, 'lineColor' | 'tagColor' | 'textColor' | 'condColor' | 'shieldColor' | 'shieldHeight' | 'shieldMargin'> & { main: Required<CableLineShow>; other: Required<CableLineShow> };

export function cableStyleOf(p: Pick<Project, 'settings'>): ResolvedCableStyle {
  const s = p.settings?.cableStyle ?? {};
  const D = CABLE_STYLE_DEFAULTS;
  return {
    ...D, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)),
    main: { ...D.main, ...s.main }, other: { ...D.other, ...s.other },
  } as ResolvedCableStyle;
}

/** Testi da mostrare su una linea: quelli scelti sulla linea, altrimenti quelli dello stile per la principale o le altre */
export function lineShow(style: ResolvedCableStyle, line: Pick<CableLine, 'show'>, main: boolean): Required<CableLineShow> {
  return { ...(main ? style.main : style.other), ...Object.fromEntries(Object.entries(line.show ?? {}).filter(([, v]) => v !== undefined)) };
}

/** Raggio dell'asola dello schermo e distanza delle estremità dal primo e dall'ultimo conduttore */
export const SHIELD = { r: 2.2, margin: 4.5, lead: 2.3 };

export type ShieldDims = typeof SHIELD;

/**
 * Misure dell'asola di una linea: l'altezza scelta sulla linea, poi quella dello stile; di serie cresce
 * con i nomi dei conduttori orizzontali, che stanno dentro l'asola. Le estremità restano fuori dai semicerchi.
 */
export function shieldDims(style: Pick<ResolvedCableStyle, 'shieldHeight' | 'shieldMargin' | 'condSize' | 'condDir'>, line?: Pick<CableLine, 'shieldHeight' | 'condDir'>): ShieldDims {
  const h = line?.shieldHeight ?? style.shieldHeight;
  const vertical = (line?.condDir ?? style.condDir) === 'v';
  const r = h ? Math.max(0.5, h / 2) : Math.max(SHIELD.r, vertical ? 0 : style.condSize * 0.8 + 0.6);
  return { r, margin: Math.max(style.shieldMargin ?? SHIELD.margin, r + 0.5), lead: SHIELD.lead };
}

export interface ShieldGeometry {
  horiz: boolean;
  /** Raggio dei semicerchi */
  r: number;
  /** Estremi dell'asola lungo la linea e posizione della linea (y se orizzontale, x se verticale) */
  lo: number; hi: number; base: number;
  /** Punto lungo/perpendicolare → punto del foglio */
  P: (u: number, v: number) => Pt;
  /** Collegamento dello schermo: dall'asola al punto di connessione (dove si attacca un filo verso il PE) */
  lead?: { from: Pt; to: Pt };
}

/** Asola dello schermo attorno agli incroci dei conduttori e punto di connessione dello schermo */
export function shieldGeometry(line: Pick<CableLine, 'points' | 'shieldGround'>, crossings: Pt[], dims: ShieldDims = SHIELD): ShieldGeometry | undefined {
  const [a, b] = line.points;
  const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const along = (p: Pt) => (horiz ? p.x : p.y);
  const pts = crossings.map(along);
  if (!pts.length) return undefined;
  const lo = Math.min(...pts) - dims.margin, hi = Math.max(...pts) + dims.margin, base = horiz ? a.y : a.x;
  const P = (u: number, v: number): Pt => (horiz ? { x: u, y: base + v } : { x: base + v, y: u });
  const g = line.shieldGround ?? 'end';
  // Il collegamento esce dal semicerchio, dalla parte opposta ai testi dei conduttori (sotto o a destra)
  const u = g === 'start' ? lo + dims.r : hi - dims.r;
  const lead = g === 'none' ? undefined : { from: P(u, dims.r), to: P(u, dims.r + dims.lead) };
  return { horiz, r: dims.r, lo, hi, base, P, lead };
}
