import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { syncReportPages, addCoverPage, makeTemplate, projectFromTemplate, REPORT_ROWS } from '../src/model/templates';
import { projectReports } from '../src/model/reports';
import { derive } from '../src/model/derive';

describe('modelli, copertina e pagine di lista', () => {
  it('pagine di lista aggiornate in automatico, anche su più fogli', () => {
    const p = exampleProject();
    const r = syncReportPages(p, projectReports(p));
    const reps = p.pages.filter(pg => pg.type === 'report');
    expect(r.added).toBe(reps.length);
    const conn = reps.filter(pg => pg.report === 'Lista connessioni');
    const rows = projectReports(p).find(t => t.title === 'Lista connessioni')!.rows.length;
    expect(conn).toHaveLength(Math.ceil(rows / REPORT_ROWS));
    const d = derive(p).pages.get(conn[conn.length - 1].id)!.reportSheet!;
    expect(d.table.rows.length).toBe(rows - (conn.length - 1) * REPORT_ROWS);
    // Rifacendolo non duplica nulla
    expect(syncReportPages(p, projectReports(p))).toEqual({ added: 0, removed: 0 });
  });
  it('copertina e modello di progetto', () => {
    const p = exampleProject();
    p.titleBlock = { logo: 'data:image/png;base64,AAA', fields: [{ label: 'Commessa', value: 'C-123' }] };
    const cover = addCoverPage(p);
    expect(p.pages[0]).toBe(cover);
    expect(addCoverPage(p)).toBe(cover);
    const t = makeTemplate(p, 'Standard');
    expect(t.project.pages.map(pg => pg.type)).toEqual(['cover', 'multiline', 'multiline']);
    expect(t.project.pages.every(pg => pg.elements.length === 0)).toBe(true);
    expect(t.project.titleBlock?.fields?.[0].label).toBe('Commessa');
    expect(t.project.panels?.map(x => x.code)).toEqual(['Q1', 'Q2']);
    const n = projectFromTemplate(t);
    expect(n.pages[1].id).not.toBe(t.project.pages[1].id);
    expect(n.plc.cards).toEqual([]);
  });
});

describe('pagine automatiche', () => {
  it('indice in testa, liste scelte, lista d\'acquisto per costruttore', async () => {
    const { exampleProject } = await import('../src/model/example');
    const { projectReports, INDEX_TITLE, PURCHASE_TITLE, purchaseReport } = await import('../src/model/reports');
    const { syncReportPages, reportPagesOutdated } = await import('../src/model/templates');
    const p = exampleProject();
    p.settings.reportPages = [INDEX_TITLE, PURCHASE_TITLE];
    const tables = projectReports(p);
    expect(reportPagesOutdated(p, tables)).toBe(true);
    syncReportPages(p, tables);
    expect(reportPagesOutdated(p, projectReports(p))).toBe(false);
    const reports = p.pages.filter(pg => pg.type === 'report');
    expect(reports.map(pg => pg.report)).toEqual([INDEX_TITLE, PURCHASE_TITLE]);
    const firstNonCover = p.pages.find(pg => pg.type !== 'cover')!;
    expect(firstNonCover.report).toBe(INDEX_TITLE);
    const buy = purchaseReport(p);
    expect(buy.columns.slice(0, 3)).toEqual(['Q.tà', 'U.M.', 'Costruttore']);
    const makers = buy.rows.filter(r => r[2]).map(r => r[2]);
    expect(makers).toEqual([...makers].sort((a, b) => a.localeCompare(b)));
    expect(buy.rows.some(r => r[4].startsWith('H07V-K'))).toBe(true);
    // Togliendo tutte le liste spariscono le pagine
    p.settings.reportPages = [];
    syncReportPages(p, projectReports(p));
    expect(p.pages.some(pg => pg.type === 'report')).toBe(false);
  });
});
