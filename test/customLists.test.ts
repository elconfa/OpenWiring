import { describe, it, expect } from 'vitest';
import { customListTable } from '../src/model/customLists';
import { exampleProject } from '../src/model/example';
import { projectReports } from '../src/model/reports';

const base = [{ title: 'Fili', columns: ['Filo', 'Da', 'A', 'Sezione'], rows: [['1', '-K1:13', '-X1:1', '1,5'], ['2', '-K1:14', '-X1:2', '0,75'], ['10', '-K2:13', '-X1:3', '1,5']], goto: [{ 1: '2' }, { 1: '2' }, { 1: '3' }] }];

describe('liste personalizzate', () => {
  it('colonne scelte, nomi, filtro e ordinamento', () => {
    const t = customListTable(base, { id: 'a', title: 'Fili 1,5', source: 'Fili', columns: [{ field: 'Da', label: 'Partenza' }, { field: 'Filo' }], filters: [{ field: 'Sezione', op: 'equals', value: '1,5' }], sort: { field: 'Filo', desc: true } })!;
    expect(t.columns).toEqual(['Partenza', 'Filo']);
    expect(t.rows).toEqual([['-K2:13', '10'], ['-K1:13', '1']]);
    // Il collegamento alla pagina segue la colonna
    expect(t.goto?.[0]).toEqual({ 0: '3' });
  });
  it('raggruppa e conta', () => {
    const t = customListTable(base, { id: 'b', title: 'Sezioni', source: 'Fili', columns: [{ field: 'Sezione' }], groupCount: true })!;
    expect(t.rows).toEqual([['1,5', '2'], ['0,75', '1']]);
    expect(t.columns).toEqual(['Sezione', 'Quantità']);
  });
  it('entra nelle liste del progetto', () => {
    const p = exampleProject();
    const src = projectReports(p)[4];
    p.settings = { ...p.settings, customLists: [{ id: 'c', title: 'Mia lista', source: src.title, columns: [{ field: src.columns[0] }] }] };
    const t = projectReports(p).find(x => x.title === 'Mia lista');
    expect(t?.rows.length).toBe(src.rows.length);
    expect(customListTable(base, { id: 'd', title: 'x', source: 'manca', columns: [] })).toBeUndefined();
  });
});
