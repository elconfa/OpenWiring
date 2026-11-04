import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { arrangePages, groupOrder, moveGroup, nextProjectPageNo, SCHEMA_GROUP } from '../src/model/pageOrder';
import { INDEX_TITLE, LEGEND_TITLE } from '../src/model/reports';
import type { Page, Project } from '../src/model/types';

const pg = (id: string, name: string, extra: Partial<Page> = {}): Page => ({ id, name, title: id, type: 'multiline', elements: [], ...extra });

function project(): Project {
  const p = emptyProject();
  p.pages = [
    pg('c', '0', { type: 'cover' }),
    pg('s1', '1'), pg('s2', '2'),
    pg('m1', '3', { type: 'strip', strip: 'X1' }),
    pg('b1', '4', { type: 'report', report: 'Distinta materiali' }),
    pg('i1', '5', { type: 'report', report: INDEX_TITLE }),
    pg('l1', '6', { type: 'report', report: LEGEND_TITLE }),
    pg('w1', '7', { type: 'report', report: 'Lista fili' }),
  ];
  return p;
}

describe('pagine generate: ordine e numerazione propria', () => {
  it('indice e legenda prima del progetto, il resto dopo, con i prefissi', () => {
    const p = project();
    arrangePages(p);
    expect(p.pages.map(x => `${x.id}:${x.name}`)).toEqual(['c:0', 'i1:IND.1', 'l1:LEG.1', 's1:1', 's2:2', 'm1:MOR.1', 'b1:LST.1', 'w1:LST.2']);
    // La pagina di progetto nuova segue i numeri del progetto, non quelli delle liste
    expect(nextProjectPageNo(p)).toBe('3');
    expect(arrangePages(p)).toBe(false);
  });
  it('ordine e prefissi scelti', () => {
    const p = project();
    arrangePages(p);
    p.settings.pageArrangement = { order: moveGroup(p, 'report:Lista fili', -1), prefixes: { 'report:Lista fili': 'WL-' } };
    arrangePages(p);
    expect(p.pages.map(x => x.name)).toEqual(['0', 'IND.1', 'LEG.1', '1', '2', 'MOR.1', 'WL-1', 'LST.1']);
    // La legenda dopo il progetto
    p.settings.pageArrangement = { ...p.settings.pageArrangement, order: moveGroup(p, 'legend', 1) };
    expect(groupOrder(p).slice(0, 3)).toEqual(['index', SCHEMA_GROUP, 'legend']);
    arrangePages(p);
    expect(p.pages.map(x => x.name)).toEqual(['0', 'IND.1', '1', '2', 'LEG.1', 'MOR.1', 'WL-1', 'LST.1']);
  });
});

describe('numerazione stabile delle pagine (19d)', () => {
  it('dopo il rilascio i numeri tolti non si riusano; la rinumerazione chiude i buchi', async () => {
    const { useStore } = await import('../src/model/store');
    const { exampleProject } = await import('../src/model/example');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    // Senza revisioni: tolta l'ultima pagina, il numero si riusa
    const last = () => st().project.pages.filter(p => /^\d+$/.test(p.name)).at(-1)!;
    const n = parseInt(last().name, 10);
    st().deletePage(last().id);
    expect(nextProjectPageNo(st().project)).toBe(String(n));
    st().loadProject(exampleProject());
    await st().releaseRevision({ index: 'A', date: '2026-10-26', author: '', description: '' });
    st().openRevision();
    st().deletePage(last().id);
    // Dopo il rilascio il numero della pagina tolta resta usato
    expect(nextProjectPageNo(st().project)).toBe(String(n + 1));
    st().addPage();
    expect(st().project.pages.some(p => p.name === String(n + 1))).toBe(true);
    st().renumberPages(1, 1);
    const own = st().project.pages.filter(p => /^\d+$/.test(p.name)).map(p => p.name);
    expect(own).toEqual(own.map((_, k) => String(k + 1)));
    expect(st().project.pageNoMax).toBe(own.length);
  });
});
