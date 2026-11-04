// Liste e pagine generate (indice, legenda, liste, morsettiere, cavi, connettori, PLC, schema
// d'insieme): quali esistono nel progetto, quante pagine hanno e quante ne servirebbero, e i
// comandi per crearle, aggiornarle ed eliminarle una alla volta o tutte insieme.
import type { Project, Page, Part } from './types';
import { uid } from './geometry';
import { projectReports, INDEX_TITLE, LEGEND_TITLE, type Table } from './reports';
import { reportStyleOf, sheetRanges } from './reportStyle';
import { syncReportPages } from './templates';
import { reportBlocks } from './panelScope';
import { allStrips, stripRows, stripRowsPer, syncStripPages } from './terminals';
import { drawingItems, syncDrawingPages } from './drawings';
import { syncOverviewPages } from './plc';
import { groupName, pageGroup, type PageGroup } from './pageOrder';

export interface ListEntry {
  /** Gruppo delle pagine ('index', 'strip', 'report:Distinta materiali'…, vedi pageOrder) */
  key: PageGroup;
  /** Titolo da mostrare (da tradurre con tx) */
  title: string;
  pages: Page[];
  /** Pagine che la lista avrebbe dopo l'aggiornamento (0 = lista vuota) */
  need: number;
  /** Finestra della grafica della pagina: impaginazione della lista o dimensioni dei testi delle morsettiere */
  style?: 'report' | 'strip' | 'cable' | 'connector' | 'system' | 'plc';
}

/** Gruppo delle pagine di una lista (indice e legenda hanno il loro) */
export const reportKey = (title: string): PageGroup => (title === INDEX_TITLE ? 'index' : title === LEGEND_TITLE ? 'legend' : `report:${title}`);
const reportTitle = (key: PageGroup) => (key === 'index' ? INDEX_TITLE : key === 'legend' ? LEGEND_TITLE : key.replace(/^report:/, ''));
const isReport = (key: PageGroup) => key === 'index' || key === 'legend' || key.startsWith('report:');

/** Tutte le liste possibili, anche quelle mai generate: prima quelle fisse, poi le liste */
export function listEntries(p: Project, library: Part[] = [], tables: Table[] = projectReports(p, library)): ListEntry[] {
  const pagesOf = (key: PageGroup) => p.pages.filter(pg => pageGroup(pg) === key);
  const per = stripRowsPer(p);
  // Fogli per lista, sommando i blocchi delle liste divise per quadro
  const sheets = new Map<string, number>();
  for (const b of reportBlocks(p, library, tables)) if (b.table.rows.length) sheets.set(b.title, (sheets.get(b.title) ?? 0) + sheetRanges(b.table, reportStyleOf(p, b.title)).length);
  const rep = (t: Table): ListEntry => ({ key: reportKey(t.title), title: t.title, pages: pagesOf(reportKey(t.title)), need: sheets.get(t.title) ?? 0, style: 'report' });
  const index = tables.find(t => t.title === INDEX_TITLE), legend = tables.find(t => t.title === LEGEND_TITLE);
  const out: ListEntry[] = [];
  if (index) out.push(rep(index));
  if (legend) out.push(rep(legend));
  out.push(
    { key: 'strip', title: groupName('strip'), pages: pagesOf('strip'), need: allStrips(p).reduce((n, s) => n + Math.max(1, Math.ceil(stripRows(p, s).length / per)), 0), style: 'strip' },
    { key: 'cable', title: groupName('cable'), pages: pagesOf('cable'), need: drawingItems(p, 'cable').length, style: 'cable' },
    { key: 'connector', title: groupName('connector'), pages: pagesOf('connector'), need: drawingItems(p, 'connector').length, style: 'connector' },
    { key: 'system', title: groupName('system'), pages: pagesOf('system'), need: drawingItems(p, 'system').length, style: 'system' },
    { key: 'plc', title: groupName('plc'), pages: pagesOf('plc'), need: p.plc.cards.length, style: 'plc' },
  );
  for (const t of tables) if (t !== index && t !== legend) out.push(rep(t));
  // Pagine di liste che non esistono più (es. lista personalizzata tolta): restano visibili per eliminarle
  for (const pg of p.pages) {
    const g = pageGroup(pg);
    if (g && !out.some(e => e.key === g)) out.push({ key: g, title: groupName(g), pages: pagesOf(g), need: 0, style: 'report' });
  }
  return out;
}

/** La lista ha pagine, ma non quante ne servono (strisce o cavi nuovi, righe in più…) */
export const outdated = (e: ListEntry) => e.pages.length > 0 && e.pages.length !== e.need;

/** Liste scelte come pagine (settings.reportPages; senza scelta valgono quelle che hanno già pagine) */
function chosenReports(p: Project): string[] {
  return p.settings.reportPages ?? [...new Set(p.pages.filter(pg => pg.type === 'report' && pg.report).map(pg => pg.report!))];
}

/** Crea o aggiorna le pagine di una lista; per le liste la segna anche tra quelle scelte come pagine */
export function updateList(p: Project, key: PageGroup, library: Part[] = []): { added: number; removed: number } {
  if (isReport(key)) {
    const title = reportTitle(key), cur = chosenReports(p);
    if (!cur.includes(title)) p.settings.reportPages = [...cur, title];
    return syncReportPages(p, projectReports(p, library), [title], library);
  }
  if (key === 'strip') return syncStripPages(p);
  if (key === 'cable' || key === 'connector' || key === 'system') return syncDrawingPages(p, key);
  if (key === 'plc') return syncOverviewPages(p);
  return { added: 0, removed: 0 };
}

/** Toglie le pagine di una lista (la lista resta, si può creare di nuovo) */
export function deleteList(p: Project, key: PageGroup): number {
  const before = p.pages.length;
  if (isReport(key)) {
    const title = reportTitle(key);
    p.settings.reportPages = chosenReports(p).filter(t => t !== title);
  }
  p.pages = p.pages.filter(pg => pageGroup(pg) !== key);
  if (!p.pages.length) p.pages.push({ id: uid('p'), name: '1', title: 'Schema', type: 'multiline', elements: [] });
  return before - p.pages.length;
}

/** Aggiorna tutte le liste che hanno già pagine (o, per le liste, quelle scelte come pagine) */
export function updateAllLists(p: Project, library: Part[] = []): { added: number; removed: number; lists: number } {
  const keys = new Set<PageGroup>(p.pages.map(pageGroup).filter((g): g is PageGroup => !!g));
  for (const t of chosenReports(p)) keys.add(reportKey(t));
  let added = 0, removed = 0;
  for (const k of keys) {
    const r = updateList(p, k, library);
    added += r.added; removed += r.removed;
  }
  return { added, removed, lists: keys.size };
}

/** Pagina generata di una lista con «Personalizza la lista»: liste, morsettiere, cavi, connettori, schema d'insieme, panoramiche PLC */
export const isListPage = (pg: Pick<Page, 'type' | 'report' | 'cardId'>) =>
  (pg.type === 'report' && !!pg.report) || pg.type === 'strip' || pg.type === 'cable' || pg.type === 'connector' || pg.type === 'system' || (pg.type === 'plc' && !!pg.cardId);
