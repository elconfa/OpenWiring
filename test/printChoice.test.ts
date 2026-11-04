import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Page } from '../src/model/types';
import { COVER_GROUP, pagesFor } from '../src/io/pdfOptions';
import { SCHEMA_GROUP } from '../src/model/pageOrder';

const pg = (name: string, extra: Partial<Page> = {}): Page => ({ id: `p${name}`, name, title: name, type: 'multiline', elements: [], ...extra });

describe('scelta di cosa stampare', () => {
  const p = emptyProject();
  p.panels = [{ id: 'q1', code: 'Q1', name: '' }, { id: 'q2', code: 'Q2', name: '' }] as typeof p.panels;
  p.pages = [
    pg('0', { type: 'cover' }), pg('1', { panelId: 'q1' }), pg('2', { panelId: 'q2' }),
    pg('MOR.1', { type: 'strip', strip: 'X2.3' }), pg('LST.1', { type: 'report', report: 'Distinta materiali' }), pg('LST.2', { type: 'report', report: 'Lista morsetti' }),
  ];
  const names = (o: Parameters<typeof pagesFor>[1]) => pagesFor(p, o).map(x => x.name);
  it('quadri: tolte le pagine del quadro, anche le morsettiere del quadro', () => {
    expect(names({ pages: 'all', skipPanels: ['q2'] })).toEqual(['0', '1', 'LST.1', 'LST.2']);
    // Pagine senza quadro: la copertina, non le liste
    expect(names({ pages: 'all', skipPanels: [''] })).toEqual(['1', '2', 'MOR.1', 'LST.1', 'LST.2']);
  });
  it('liste e pagine generate scelte per gruppo; una sola pagina o un intervallo', () => {
    expect(names({ pages: 'all', skipGroups: ['report:Distinta materiali', 'strip'] })).toEqual(['0', '1', '2', 'LST.2']);
    expect(names({ pages: 'current', currentPageId: 'p2' })).toEqual(['2']);
    expect(names({ pages: '1-MOR.1' })).toEqual(['1', '2', 'MOR.1']);
  });
  it('copertina e schema si tolgono come le liste; una pagina o un intervallo scelti si stampano sempre', () => {
    expect(names({ pages: 'all', skipGroups: [SCHEMA_GROUP, COVER_GROUP] })).toEqual(['MOR.1', 'LST.1', 'LST.2']);
    expect(names({ pages: 'current', currentPageId: 'pMOR.1', skipGroups: ['strip'] })).toEqual(['MOR.1']);
    expect(names({ pages: 'MOR.1-LST.1', skipGroups: ['strip'], skipPanels: ['q2'] })).toEqual(['MOR.1', 'LST.1']);
  });
});
