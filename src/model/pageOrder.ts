// Pagine generate (indice, legenda, liste, morsettiere, panoramiche PLC, cavi, connettori, schema
// d'insieme): hanno una numerazione propria con un prefisso (IND.1, MOR.3, LST.2…) che non entra in
// conflitto con i numeri delle pagine di progetto, e stanno in blocchi nell'ordine scelto nelle
// impostazioni (es. indice e legenda prima dello schema, le liste dopo, nell'ordine preferito).
import type { Page, Project } from './types';
import { INDEX_TITLE, LEGEND_TITLE } from './reports';
import { scopeLocations } from './panelScope';
import { tn } from '../i18n/ui';

/** Gruppo di pagine generate: 'index', 'legend', 'plc', 'strip', 'cable', 'connector', 'system' o 'report:<titolo>' */
export type PageGroup = string;
/** Posto delle pagine di progetto (schemi, note, layout…) nell'ordine */
export const SCHEMA_GROUP = '@schema';

const fixedNames = (): Record<string, string> => ({
  [SCHEMA_GROUP]: tn('Pagine di progetto'), index: INDEX_TITLE, legend: LEGEND_TITLE, plc: tn('Panoramiche PLC'),
  strip: tn('Schemi delle morsettiere'), cable: tn('Disegni dei cavi'), connector: tn('Piedinature dei connettori'), system: tn('Schema d\'insieme'),
});
export const DEFAULT_PREFIXES: Record<string, string> = {
  index: 'IND.', legend: 'LEG.', plc: 'PLC.', strip: 'MOR.', cable: 'CAV.', connector: 'CON.', system: 'SIS.', report: 'LST.',
};
/** Ordine di serie: indice e legenda prima delle pagine di progetto, il resto dopo */
const DEFAULT_ORDER = ['index', 'legend', SCHEMA_GROUP, 'plc', 'strip', 'cable', 'connector', 'system'];
const BEFORE_SCHEMA = new Set(['index', 'legend']);

/** Gruppo della pagina, o undefined per le pagine di progetto e la copertina */
export function pageGroup(pg: Page): PageGroup | undefined {
  if (pg.type === 'report') return pg.report === INDEX_TITLE ? 'index' : pg.report === LEGEND_TITLE ? 'legend' : `report:${pg.report ?? ''}`;
  if (pg.type === 'strip' || pg.type === 'cable' || pg.type === 'connector' || pg.type === 'system') return pg.type;
  if (pg.type === 'plc' && pg.cardId) return 'plc';
  return undefined;
}

export const isGenerated = (pg: Page) => pageGroup(pg) !== undefined;

/** Nome da mostrare per un gruppo (da tradurre con tx) */
export const groupName = (g: PageGroup) => fixedNames()[g] ?? g.replace(/^report:/, '');

/** Prefisso del gruppo: quello scelto o quello di serie (le liste hanno in comune LST.) */
export function groupPrefix(p: Project, g: PageGroup): string {
  const own = p.settings.pageArrangement?.prefixes ?? {};
  if (own[g] !== undefined && own[g].trim()) return own[g];
  if (g.startsWith('report:')) return own.report?.trim() ? own.report : DEFAULT_PREFIXES.report;
  return DEFAULT_PREFIXES[g] ?? 'LST.';
}

/** Ordine dei gruppi presenti nel progetto (con il posto delle pagine di progetto) */
export function groupOrder(p: Project): PageGroup[] {
  const present: PageGroup[] = [];
  for (const pg of p.pages) { const g = pageGroup(pg); if (g && !present.includes(g)) present.push(g); }
  const order = [...new Set(p.settings.pageArrangement?.order ?? [])].filter(g => g === SCHEMA_GROUP || present.includes(g));
  if (!order.includes(SCHEMA_GROUP)) {
    const k = order.findIndex(g => !BEFORE_SCHEMA.has(g));
    order.splice(k < 0 ? order.length : k, 0, SCHEMA_GROUP);
  }
  // I gruppi nuovi vanno al loro posto di serie: indice e legenda prima del progetto, gli altri in coda
  const rank = (g: PageGroup) => { const i = DEFAULT_ORDER.indexOf(g); return i < 0 ? DEFAULT_ORDER.length : i; };
  for (const g of [...present].sort((a, b) => rank(a) - rank(b))) {
    if (order.includes(g)) continue;
    if (BEFORE_SCHEMA.has(g)) order.splice(order.indexOf(SCHEMA_GROUP), 0, g);
    else order.push(g);
  }
  return order;
}

/**
 * Mette le pagine in ordine: copertina, poi i blocchi nell'ordine scelto (le pagine di progetto
 * restano nel loro ordine; con settings.reportBlocksAt le liste di un quadro vengono subito dopo
 * le sue pagine) e dà alle pagine generate il nome con il prefisso del gruppo e il numero
 * progressivo (contato per prefisso, nell'ordine finale). true se qualcosa è cambiato.
 */
export function arrangePages(p: Project): boolean {
  const before = p.pages.map(pg => `${pg.id}|${pg.name}`).join(',');
  const covers = p.pages.filter(pg => pg.type === 'cover');
  const project = p.pages.filter(pg => pg.type !== 'cover' && !isGenerated(pg));
  const order = groupOrder(p);
  const byItem = itemOrder(p);
  // Liste di un quadro dopo le pagine del quadro (i luoghi senza pagine restano nel gruppo della lista)
  const atPanel = new Map<string, Page[]>();
  if (p.settings.reportBlocksAt === 'panel') {
    const own = new Set(project.map(pg => pg.panelId).filter(Boolean));
    for (const pg of p.pages) if (pg.type === 'report' && pg.reportPanel && own.has(pg.reportPanel)) atPanel.set(pg.reportPanel, [...(atPanel.get(pg.reportPanel) ?? []), pg]);
  }
  const placed = new Set([...atPanel.values()].flat());
  const rank = (pg: Page) => order.indexOf(pageGroup(pg)!);
  const out: Page[] = [...covers];
  for (const g of order) {
    if (g !== SCHEMA_GROUP) { out.push(...p.pages.filter(x => pageGroup(x) === g && !placed.has(x)).sort(byItem)); continue; }
    project.forEach((pg, i) => {
      out.push(pg);
      const mine = pg.panelId ? atPanel.get(pg.panelId) : undefined;
      if (mine && !project.slice(i + 1).some(x => x.panelId === pg.panelId)) out.push(...mine.sort((a, b) => rank(a) - rank(b) || byItem(a, b)));
    });
  }
  const count = new Map<string, number>();
  for (const pg of out) {
    const g = pageGroup(pg);
    if (!g) continue;
    const prefix = groupPrefix(p, g);
    const n = (count.get(prefix) ?? 0) + 1;
    count.set(prefix, n);
    pg.name = `${prefix}${n}`;
  }
  p.pages = out;
  return out.map(pg => `${pg.id}|${pg.name}`).join(',') !== before;
}

const natural = (a = '', b = '') => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
/**
 * Ordine delle pagine dentro un gruppo: morsettiere, cavi e connettori in ordine di sigla
 * (X1, X1.1.2, X2, X10) e di foglio; le liste prima intere, poi per quadro nell'ordine dei luoghi
 * (senza quadro in fondo), e per foglio; le altre (panoramiche PLC) restano come sono.
 */
function itemOrder(p: Project): (a: Page, b: Page) => number {
  const places = scopeLocations(p).map(x => x.id);
  const place = (pg: Page) => (pg.reportPanel === undefined ? -1 : pg.reportPanel === '' ? places.length : places.indexOf(pg.reportPanel));
  return (a, b) => {
    if (a.type === 'strip' && b.type === 'strip') return natural(a.strip, b.strip) || (a.stripSheet ?? 0) - (b.stripSheet ?? 0);
    if ((a.type === 'cable' || a.type === 'connector') && a.type === b.type) return natural(a.item, b.item);
    if (a.type === 'report' && b.type === 'report' && a.report === b.report) return place(a) - place(b) || (a.reportSheet ?? 0) - (b.reportSheet ?? 0);
    return 0;
  };
}

/** Sposta un gruppo di un posto nell'ordine (delta -1 prima, +1 dopo) */
export function moveGroup(p: Project, g: PageGroup, delta: number): PageGroup[] {
  const order = groupOrder(p);
  const i = order.indexOf(g), j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  [order[i], order[j]] = [order[j], order[i]];
  return order;
}

/** Numero più alto tra le pagine di progetto attuali */
export function maxProjectPageNo(p: Project): number {
  const nums = p.pages.filter(pg => !isGenerated(pg) && pg.type !== 'cover').map(x => parseInt(x.name, 10)).filter(n => !isNaN(n));
  return nums.length ? Math.max(...nums) : 0;
}

/**
 * Numero della prossima pagina di progetto: dopo il più alto usato dalle pagine di progetto. Dopo
 * il primo rilascio vale il più alto mai usato (registro pageNoMax): i numeri delle pagine tolte
 * non si riusano e i buchi restano, così i riferimenti alle pagine emesse non cambiano significato.
 */
export function nextProjectPageNo(p: Project): string {
  const used = p.revisions?.length ? Math.max(maxProjectPageNo(p), p.pageNoMax ?? 0) : maxProjectPageNo(p);
  return String(used + 1);
}

/** Aggiorna il registro dei numeri usati (solo per i progetti con revisioni) */
export function registerPageNumbers(p: Project): void {
  if (!p.revisions?.length) return;
  const m = Math.max(maxProjectPageNo(p), p.pageNoMax ?? 0);
  if (m && m !== p.pageNoMax) p.pageNoMax = m;
}

/**
 * Rinumerazione esplicita delle pagine di progetto nell'ordine attuale (da start, a passo step):
 * l'unico modo di chiudere i buchi; il registro riparte dal numero più alto nuovo. Restituisce
 * le coppie vecchio → nuovo numero cambiate.
 */
export function renumberPages(p: Project, start = 1, step = 1): [string, string][] {
  const out: [string, string][] = [];
  const own = p.pages.filter(pg => pg.type !== 'cover' && !isGenerated(pg));
  own.forEach((pg, k) => {
    const name = String(start + k * step);
    if (pg.name !== name) out.push([pg.name, name]);
    pg.name = name;
  });
  if (p.revisions?.length) p.pageNoMax = maxProjectPageNo(p);
  return out;
}
