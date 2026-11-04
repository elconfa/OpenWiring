import { describe, it, expect } from 'vitest';
import { reportColumns, sortedTable, columnOrder, sheetRanges, REPORT_X } from '../src/model/reportStyle';
import type { Table } from '../src/model/reports';

const t: Table = { title: 'Lista', columns: ['A', 'B', 'C'], rows: [['10', 'x', 'p'], ['9', 'y', 'q'], ['100', 'z', 'r']], goto: [{ 0: '1' }, { 0: '2' }, { 0: '3' }] };
const total = REPORT_X.x1 - REPORT_X.x0;

describe('impaginazione delle liste', () => {
  it('di serie: tutte le colonne, tutta la larghezza', () => {
    const c = reportColumns(t, {});
    expect(c.map(x => x.key)).toEqual(['A', 'B', 'C']);
    expect(c.reduce((a, x) => a + x.w, 0)).toBeCloseTo(total);
  });
  it('ordine, nascoste, larghezza fissa e intestazione', () => {
    const s = { order: ['C', 'A'], columns: { B: { hidden: true }, C: { width: 50, label: 'Cc', align: 'end' as const } } };
    expect(columnOrder(s, t.columns)).toEqual(['C', 'A', 'B']);
    const c = reportColumns(t, s);
    expect(c.map(x => x.key)).toEqual(['C', 'A']);
    expect(c[0]).toMatchObject({ w: 50, label: 'Cc', align: 'end', x: REPORT_X.x0 });
    expect(c[1].w).toBeCloseTo(total - 50);
    // Larghezze fisse oltre lo spazio: ridotte in proporzione
    const big = reportColumns(t, { columns: { A: { width: 300 }, B: { width: 300 }, C: { width: 300 } } });
    expect(big.reduce((a, x) => a + x.w, 0)).toBeCloseTo(total);
  });
  it('colonne con lo stesso nome restano distinte', () => {
    const d: Table = { title: 'L', columns: ['Da', 'Pag.', 'A', 'Pag.'], rows: [['a', '1', 'b', '2']] };
    expect(reportColumns(d, {}).map(c => c.key)).toEqual(['Da', 'Pag.', 'A', 'Pag.#2']);
    expect(reportColumns(d, { columns: { 'Pag.#2': { hidden: true } } }).map(c => c.label)).toEqual(['Da', 'Pag.', 'A']);
  });
  it('ordinamento numerico, con i collegamenti', () => {
    const s = sortedTable(t, { sort: { key: 'A' } });
    expect(s.rows.map(r => r[0])).toEqual(['9', '10', '100']);
    expect(s.goto!.map(g => g[0])).toEqual(['2', '1', '3']);
    expect(sortedTable(t, { sort: { key: 'A', desc: true } }).rows[0][0]).toBe('100');
  });
  it('nuova pagina quando cambia la morsettiera', () => {
    const rows = [...Array.from({ length: 45 }, (_, i) => ['X1', String(i + 1)]), ['X2', '1'], ['X2', '2']];
    const m: Table = { title: 'Lista morsetti', columns: ['Morsettiera', 'Morsetto'], rows, breakKey: 'Morsettiera' };
    expect(sheetRanges(m, {})).toEqual([{ first: 0, n: 40 }, { first: 40, n: 5 }, { first: 45, n: 2 }]);
    // Senza interruzione: pagine piene
    expect(sheetRanges(m, { breakKey: '' })).toEqual([{ first: 0, n: 40 }, { first: 40, n: 7 }]);
    expect(sheetRanges({ ...m, rows: [] }, {})).toEqual([]);
  });
});
