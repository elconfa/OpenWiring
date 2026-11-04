// Liste di un solo quadro: righe dei quadri scelti, in stampa, PDF e nella vista Liste
import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { emptyProject } from '../src/model/project';
import { projectReports } from '../src/model/reports';
import { scopeTables, panelResolver, panelOfStripName, keptPanels, scopeLocations, devicesPerLocation } from '../src/model/panelScope';
import { printPlan } from '../src/io/printPlan';
import type { Project } from '../src/model/types';

const rowsOf = (tables: { title: string; rows: string[][] }[], title: string) => tables.find(t => t.title === title)!.rows;

describe('liste per quadro', () => {
  it('morsettiera: il quadro dal nome (X1.2.21 → Q1.2)', () => {
    const p: Project = emptyProject();
    p.panels = [{ id: 'a', code: 'Q1.1', name: 'Master' }, { id: 'b', code: 'Q1.2', name: 'Slave' }, { id: 'c', code: 'Q1', name: 'Generale' }] as Project['panels'];
    expect(panelOfStripName(p, 'X1.2.21')?.id).toBe('b');
    expect(panelOfStripName(p, 'X1.1')?.id).toBe('a');
    expect(panelOfStripName(p, 'X1.3')?.id).toBe('c');
    const r = panelResolver(p);
    expect(r('+Q1.2-K1')).toBe('b');
    expect(r('+Q1.1 Master')).toBe('a');
    expect(r('-K9')).toBe('');
  });

  it('ogni lista tiene le righe del suo quadro, la distinta ricalcola le quantità', () => {
    const p = exampleProject();
    const all = projectReports(p);
    const [q1, q2] = p.panels!.map(x => scopeTables(p, [], all, new Set([x.id])));
    const n = (t: typeof all, title: string) => rowsOf(t, title).length;
    // I dispositivi stanno in un solo quadro: le due liste insieme danno tutta la lista
    expect(n(q1, 'Lista dispositivi') + n(q2, 'Lista dispositivi')).toBe(n(all, 'Lista dispositivi'));
    expect(n(q2, 'Lista dispositivi')).toBeGreaterThan(0);
    expect(n(q1, 'Lista morsetti')).toBe(n(all, 'Lista morsetti'));
    expect(n(q2, 'Lista morsetti')).toBe(0);
    // Le liste che non si dividono restano intere
    expect(n(q2, 'Legenda simboli')).toBe(n(all, 'Legenda simboli'));
  });

  it('stampa senza un quadro: niente fogli di lista vuoti', () => {
    const p = exampleProject();
    const slave = p.panels![1].id;
    expect(keptPanels(p, [slave])?.has(slave)).toBe(false);
    expect(keptPanels(p, [])).toBeUndefined();
    const plan = printPlan(p, [], { pages: 'all', index: false, mono: false, skipPanels: [p.panels![0].id, ''] });
    const reports = plan.pages.filter(pg => pg.type === 'report');
    for (const pg of reports) expect(plan.derived.pages.get(pg.id)!.reportSheet!.table.rows.length).toBeGreaterThan(0);
  });

  it('anche i luoghi scritti sui dispositivi (+BM) si scelgono e riducono le liste', () => {
    const p = exampleProject();
    const syms = p.pages.flatMap(pg => pg.elements).filter(e => e.kind === 'symbol' && e.tag && /^\d*K\d/.test(e.tag));
    const sym = syms[0] as { tag: string; loc?: string };
    for (const e of syms) if ((e as { tag: string }).tag === sym.tag) (e as { loc?: string }).loc = 'BM';
    const locs = scopeLocations(p);
    expect(locs.map(x => x.id)).toContain('+BM');
    expect(devicesPerLocation(p).get('+BM')).toBe(1);
    const all = projectReports(p);
    const bm = scopeTables(p, [], all, new Set(['+BM']));
    expect(rowsOf(bm, 'Lista dispositivi').map(r => r.join(' ')).join('\n')).toContain(sym.tag);
    expect(rowsOf(bm, 'Lista dispositivi').length).toBeLessThan(rowsOf(all, 'Lista dispositivi').length);
    const without = scopeTables(p, [], all, keptPanels(p, ['+BM'])!);
    expect(rowsOf(without, 'Lista dispositivi').some(r => r.includes(sym.tag) || r.some(c => c.endsWith(`-${sym.tag}`)))).toBe(false);
  });
});
