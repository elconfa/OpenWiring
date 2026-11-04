// Modelli: pagine di liste dentro il progetto, copertina, progetto base riutilizzabile.
import type { Project, Page, Part } from './types';
import { uid } from './geometry';
import { INDEX_TITLE, type Table } from './reports';
import { reportStyleOf, sheetRanges } from './reportStyle';
import { blockKey, blockLabel, reportBlocks } from './panelScope';

/** Righe per foglio nelle pagine di lista */
export const REPORT_ROWS = 40;

/** Pagine di lista che mancano o avanzano rispetto alle liste scelte */
export function reportPagesOutdated(p: Project, tables: Table[], library: Part[] = []): boolean {
  const need = new Set(neededSheets(p, tables, library).flatMap(b => Array.from({ length: b.sheets }, (_, i) => `${blockKey(b.title, b.panel)}|${i}`)));
  const have = new Set(p.pages.filter(pg => pg.type === 'report').map(pg => `${blockKey(pg.report ?? '', pg.reportPanel)}|${pg.reportSheet ?? 0}`));
  return need.size !== have.size || [...need].some(k => !have.has(k));
}

/** Fogli che servono per ogni blocco (lista intera o lista di un luogo) delle liste scelte come pagine */
export function neededSheets(p: Project, tables: Table[], library: Part[] = []): { title: string; panel?: string; sheets: number }[] {
  const chosen = p.settings.reportPages;
  return reportBlocks(p, library, tables.filter(t => !chosen || chosen.includes(t.title)))
    .filter(b => b.table.rows.length)
    .map(b => ({ title: b.title, panel: b.panel, sheets: sheetRanges(b.table, reportStyleOf(p, b.title)).length }));
}

const nextName = (p: Project) => {
  const nums = p.pages.map(x => parseInt(x.name, 10)).filter(n => !isNaN(n));
  return String((nums.length ? Math.max(...nums) : 0) + 1);
};

/**
 * Pagine di lista nel progetto (come i report di EPLAN): una o più pagine per ogni lista non vuota
 * (per le liste divise per quadro, per ogni luogo con righe), in coda; quelle di liste sparite o
 * vuote vengono tolte. Con `only` solo le liste indicate. La descrizione è automatica («Distinta
 * materiali +Q1.1 (2/3)») finché l'utente non la cambia.
 */
export function syncReportPages(p: Project, tables: Table[], only?: string[], library: Part[] = []): { added: number; removed: number } {
  // Con only si toccano solo le pagine di quelle liste
  const mine = (title?: string) => !only || (title !== undefined && only.includes(title));
  const blocks = neededSheets(p, tables, library).filter(b => mine(b.title));
  const need = new Map(blocks.map(b => [blockKey(b.title, b.panel), b.sheets]));
  const before = p.pages.length;
  p.pages = p.pages.filter(pg => pg.type !== 'report' || !mine(pg.report) || (pg.report !== undefined && (pg.reportSheet ?? 0) < (need.get(blockKey(pg.report, pg.reportPanel)) ?? 0)));
  const removed = before - p.pages.length;
  const panels = new Set((p.panels ?? []).map(x => x.id));
  let added = 0;
  for (const { title, panel, sheets } of blocks) {
    const where = panel === undefined ? '' : ` ${blockLabel(p, panel)}`;
    // Le pagine di un quadro definito appartengono al quadro (cartiglio, albero, stampa per quadro)
    const panelId = panel && panels.has(panel) ? panel : undefined;
    for (let i = 0; i < sheets; i++) {
      const t = `${title}${where}${sheets > 1 ? ` (${i + 1}/${sheets})` : ''}`;
      const ex = p.pages.find(pg => pg.type === 'report' && pg.report === title && pg.reportPanel === panel && (pg.reportSheet ?? 0) === i);
      if (ex) {
        if (ex.autoTitle === undefined || ex.title === ex.autoTitle) ex.title = t;
        ex.autoTitle = t;
        if (panel !== undefined) { if (panelId) ex.panelId = panelId; else delete ex.panelId; }
        continue;
      }
      const page: Page = {
        id: uid('p'), name: nextName(p), title: t, autoTitle: t, type: 'report', report: title, reportSheet: i, elements: [],
        ...(panel !== undefined ? { reportPanel: panel } : {}), ...(panelId ? { panelId } : {}),
      };
      const prev = p.pages.findLastIndex(pg => pg.type === 'report' && pg.report === title);
      // L'indice va in testa, dopo la copertina
      const front = title === INDEX_TITLE ? p.pages.findLastIndex(pg => pg.type === 'cover') + 1 : -1;
      if (prev >= 0) p.pages.splice(prev + 1, 0, page); else if (front >= 0) p.pages.splice(front, 0, page); else p.pages.push(page);
      added++;
    }
  }
  return { added, removed };
}

/** Copertina in testa al progetto (una sola) */
export function addCoverPage(p: Project): Page {
  const ex = p.pages.find(pg => pg.type === 'cover');
  if (ex) return ex;
  const page: Page = { id: uid('p'), name: '0', title: 'Copertina', type: 'cover', elements: [] };
  p.pages.unshift(page);
  return page;
}

/** Modello di progetto: impostazioni, cartiglio, luoghi e pagine di base, senza schemi */
export interface ProjectTemplate { id: string; name: string; project: Project }

export function makeTemplate(p: Project, name: string): ProjectTemplate {
  const t = structuredClone(p);
  t.info = { ...t.info, name: 'Nuovo progetto', description: '', customer: '', drawingNr: '', revision: '0', date: '' };
  // Restano copertina e una pagina vuota per ogni luogo; via schemi, PLC, cavi, revisioni
  const keep = t.pages.filter(pg => pg.type === 'cover').map(pg => ({ ...pg, elements: [] }));
  const panels = t.panels ?? [];
  const firsts = panels.length
    ? panels.map(pn => ({ id: uid('p'), name: '', title: `Schema ${pn.name || pn.code}`, type: 'multiline' as const, elements: [], panelId: pn.id }))
    : [{ id: uid('p'), name: '', title: 'Schema', type: 'multiline' as const, elements: [] }];
  t.pages = [...keep, ...firsts];
  t.pages.forEach((pg, i) => { if (pg.type !== 'cover') pg.name = String(i + (keep.length ? 0 : 1)); });
  t.plc = { cards: [] };
  t.cables = [];
  t.revisions = [];
  t.customSymbols = [];
  t.connectors = {};
  t.parts = [];
  return { id: uid('t'), name, project: t };
}

/** Nuovo progetto da un modello (con la data di oggi) */
export function projectFromTemplate(t: ProjectTemplate): Project {
  const p = structuredClone(t.project);
  p.info.date = new Date().toISOString().slice(0, 10);
  const map = new Map<string, string>();
  for (const pg of p.pages) { const id = uid('p'); map.set(pg.id, id); pg.id = id; }
  return p;
}
