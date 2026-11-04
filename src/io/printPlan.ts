// Pagine e dati da stampare o esportare in PDF. Togliendo dei quadri, anche le liste (morsetti,
// dispositivi, distinta…) tengono solo le righe dei quadri rimasti e si impaginano di nuovo: i
// fogli di lista che restano vuoti non si stampano.
import type { Page, Part, Project } from '../model/types';
import { derive, type Derived } from '../model/derive';
import { projectReports, type Table } from '../model/reports';
import { keptPanels, scopeTables } from '../model/panelScope';
import { pagesFor, type PdfOptions } from './pdfOptions';

export function printPlan(project: Project, library: Part[], opts: PdfOptions, tables?: Table[]): { pages: Page[]; derived: Derived; tables: Table[] } {
  const pages = pagesFor(project, opts);
  const keep = opts.pages === 'all' ? keptPanels(project, opts.skipPanels) : undefined;
  if (!keep) return { pages, derived: derive(project, library), tables: tables ?? [] };
  const scoped = scopeTables(project, library, tables ?? projectReports(project, library), keep);
  const derived = derive(project, library, scoped);
  return {
    pages: pages.filter(pg => pg.type !== 'report' || (derived.pages.get(pg.id)?.reportSheet?.table.rows.length ?? 0) > 0),
    derived, tables: scoped,
  };
}
