// Impaginazione delle pagine di lista, scelta per ogni lista: titolo, altezze dei caratteri e delle
// righe, linee, ordinamento e colonne (ordine, visibili, intestazione, larghezza in mm, allineamento).
// Il contenuto resta calcolato dallo schema; cambia solo come viene messo sulla pagina.
import type { Project, ReportStyle } from './types';
import { REPORT_AREA_H, type Table } from './reports';
import { FRAME } from './types';

export const REPORT_DEFAULTS = {
  titleSize: 4, headSize: 2.2, textSize: 2.1, rowH: 5, headH: 5,
  lineWidth: 0.12, lineColor: '#d0d5dc', vLineColor: '#b8bfc8', headFill: '#eaeef2',
};

/** Chiave dello stile comune a tutte le pagine di lista */
export const ALL_LISTS = '*';

/** Parti dello stile comune che valgono per tutte le liste (non colonne, ordinamento, titolo) */
const COMMON_KEYS = ['titleSize', 'headSize', 'textSize', 'rowH', 'vLines', 'hLines', 'lineWidth', 'lineColor', 'headH', 'headFill', 'headColor', 'headBold', 'textColor', 'zebra', 'titleAlign', 'titleColor'] as const;
export type CommonReportKey = typeof COMMON_KEYS[number];

/** Stile comune a tutte le liste (solo le parti comuni) */
export function commonReportStyle(p: Pick<Project, 'settings'>): ReportStyle {
  const c = p.settings.reportStyles?.[ALL_LISTS] ?? {};
  return Object.fromEntries(COMMON_KEYS.filter(k => c[k] !== undefined).map(k => [k, c[k]])) as ReportStyle;
}

/** Stile scritto per la lista (senza quello comune): è quello che si modifica nella finestra */
export const ownReportStyle = (p: Pick<Project, 'settings'>, title: string): ReportStyle => p.settings.reportStyles?.[title] ?? {};

/** Stile da usare per una lista: quello comune a tutte, poi quello della lista */
export function reportStyleOf(p: Pick<Project, 'settings'>, title: string): ReportStyle {
  if (title === ALL_LISTS) return ownReportStyle(p, ALL_LISTS);
  const own = ownReportStyle(p, title), common = commonReportStyle(p);
  return Object.keys(common).length ? { ...common, ...Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined)) } : own;
}

/** Altezza dell'intestazione della tabella */
export const styledHeadH = (s: ReportStyle) => s.headH ?? REPORT_DEFAULTS.headH;

/** Altezza delle righe della lista sulle pagine (quella scelta, poi quella della lista, poi 5 mm) */
export const styledRowH = (t: Pick<Table, 'rowH'>, s: ReportStyle) => s.rowH ?? t.rowH ?? REPORT_DEFAULTS.rowH;

/** Righe nell'ordine scelto (con i collegamenti e i simboli che le seguono) */
export function sortedTable(t: Table, s: ReportStyle): Table {
  const col = s.sort ? columnKeys(t.columns).indexOf(s.sort.key) : -1;
  if (col < 0) return t;
  const idx = t.rows.map((_, i) => i);
  const cmp = (a: number, b: number) => (t.rows[a][col] ?? '').localeCompare(t.rows[b][col] ?? '', undefined, { numeric: true, sensitivity: 'base' });
  idx.sort((a, b) => (s.sort!.desc ? cmp(b, a) : cmp(a, b)) || a - b);
  return { ...t, rows: idx.map(i => t.rows[i]), goto: t.goto && idx.map(i => t.goto![i]), symbols: t.symbols && idx.map(i => t.symbols![i]) };
}

/** Colonna che fa cambiare pagina (quella scelta, poi quella della lista; "" = nessuna) */
export const breakKeyOf = (t: Pick<Table, 'breakKey'>, s: ReportStyle) => s.breakKey ?? t.breakKey ?? '';

/**
 * Fogli della lista (righe nell'ordine scelto): prima riga e numero di righe di ognuno. Un foglio
 * è pieno a sheetRows righe; con la colonna di interruzione si cambia foglio anche quando cambia
 * il suo valore (es. a ogni morsettiera nuova).
 */
export function sheetRanges(t: Table, s: ReportStyle): { first: number; n: number }[] {
  // Un'intestazione più alta di quella di serie toglie spazio alle righe
  const per = Math.max(1, Math.floor((REPORT_AREA_H - Math.max(0, styledHeadH(s) - REPORT_DEFAULTS.headH)) / styledRowH(t, s)));
  const col = columnKeys(t.columns).indexOf(breakKeyOf(t, s));
  const rows = sortedTable(t, s).rows;
  const out: { first: number; n: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = out[out.length - 1];
    if (!cur || cur.n >= per || (col >= 0 && rows[i][col] !== rows[i - 1][col])) out.push({ first: i, n: 1 });
    else cur.n++;
  }
  return out;
}

/** Nomi univoci delle colonne: il secondo «Pag.» diventa «Pag.#2» */
export function columnKeys(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map(c => { const n = (seen.get(c) ?? 0) + 1; seen.set(c, n); return n > 1 ? `${c}#${n}` : c; });
}

/** Nome da mostrare per una chiave di colonna */
export const keyName = (k: string) => k.replace(/#\d+$/, '');

/** Nomi delle colonne nell'ordine scelto (le colonne non elencate in fondo, nel loro ordine) */
export const columnOrder = (s: ReportStyle, keys: string[]) => [...new Set([...(s.order ?? []).filter(k => keys.includes(k)), ...keys])];

export interface ReportCol { i: number; key: string; label: string; x: number; w: number; align: 'start' | 'middle' | 'end' }

/** Area orizzontale della tabella sulla pagina */
export const REPORT_X = { get x0() { return FRAME.left + 4; }, get x1() { return FRAME.right - 4; } };

/**
 * Colonne visibili (keys: nomi originali delle colonne, quando quelli della tabella sono tradotti) nell'ordine scelto, con posizione e larghezza: le colonne con la larghezza
 * indicata la tengono (ridotte in proporzione se non ci stanno), le altre si dividono il resto
 * in base alla lunghezza dei testi
 */
export function reportColumns(t: Table, s: ReportStyle, keys = columnKeys(t.columns)): ReportCol[] {
  const cols = columnOrder(s, keys).map(key => ({ key, i: keys.indexOf(key), st: s.columns?.[key] })).filter(c => !c.st?.hidden);
  const total = REPORT_X.x1 - REPORT_X.x0;
  // Con i simboli disegnati la prima colonna è larga quanto basta per il disegno
  const auto = (i: number) => (i === 0 && t.symbols ? 14 : Math.min(40, Math.max(t.columns[i].length, ...t.rows.map(r => (r[i] ?? '').length), 3)));
  const fixed = cols.reduce((a, c) => a + (c.st?.width ?? 0), 0);
  const autoSum = cols.reduce((a, c) => a + (c.st?.width ? 0 : auto(c.i)), 0);
  const scale = fixed > total || (fixed && !autoSum) ? total / fixed : 1;
  const rest = Math.max(0, total - fixed * scale);
  let x = REPORT_X.x0;
  return cols.map(c => {
    const w = c.st?.width ? c.st.width * scale : autoSum ? (auto(c.i) / autoSum) * rest : 0;
    const out: ReportCol = { i: c.i, key: c.key, label: c.st?.label || t.columns[c.i], x, w, align: c.st?.align ?? 'start' };
    x += w;
    return out;
  });
}
