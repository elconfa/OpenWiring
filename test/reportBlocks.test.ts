// Liste divise per quadro (blocchi di valutazione) e posto delle loro pagine
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Project, SymbolInstance } from '../src/model/types';
import { uid } from '../src/model/geometry';
import { projectReports } from '../src/model/reports';
import { syncReportPages, reportPagesOutdated } from '../src/model/templates';
import { arrangePages } from '../src/model/pageOrder';
import { derive } from '../src/model/derive';
import { listEntries } from '../src/model/lists';
import { pagesFor } from '../src/io/pdfOptions';

const T = (tag: string, x: number): SymbolInstance =>
  ({ kind: 'symbol', id: uid('s'), symbolId: 'terminal', x, y: 100, rot: 0, tag, pinLabels: {}, autoPins: true });
const LIST = 'Lista morsetti';

/** Quadri Q1 (pagina 1, morsetti X1:1 e X1:2) e Q2 (pagina 2, morsetto X2:1) */
function project(split = true): Project {
  const p = emptyProject();
  p.panels = [{ id: 'q1', code: 'Q1', name: '' }, { id: 'q2', code: 'Q2', name: '' }];
  p.pages = [
    { id: 'p1', name: '1', title: 'Q1', type: 'multiline', panelId: 'q1', elements: [T('X1:1', 40), T('X1:2', 48)] },
    { id: 'p2', name: '2', title: 'Q2', type: 'multiline', panelId: 'q2', elements: [T('X2:1', 40)] },
  ];
  p.settings.reportPages = [LIST];
  if (split) p.settings.reportBlocks = [LIST];
  return p;
}
const sync = (p: Project) => { const r = syncReportPages(p, projectReports(p)); arrangePages(p); return r; };
const lists = (p: Project) => p.pages.filter(pg => pg.type === 'report');

describe('liste divise per quadro', () => {
  it('un blocco di pagine per quadro, con le sole righe del quadro', () => {
    const p = project();
    expect(sync(p)).toEqual({ added: 2, removed: 0 });
    expect(lists(p).map(pg => [pg.title, pg.reportPanel, pg.panelId])).toEqual([[`${LIST} +Q1`, 'q1', 'q1'], [`${LIST} +Q2`, 'q2', 'q2']]);
    const d = derive(p);
    expect(lists(p).map(pg => d.pages.get(pg.id)?.reportSheet?.table.rows.map(r => r[0]))).toEqual([['X1', 'X1'], ['X2']]);
    expect(reportPagesOutdated(p, projectReports(p))).toBe(false);
    expect(listEntries(p).find(e => e.title === LIST)?.need).toBe(2);
  });
  it('dividere una lista intera toglie la sua pagina e crea i blocchi', () => {
    // La lista morsetti cambia foglio a ogni morsettiera: intera ha 2 fogli
    const p = project(false);
    expect(sync(p)).toEqual({ added: 2, removed: 0 });
    p.settings.reportBlocks = [LIST];
    expect(reportPagesOutdated(p, projectReports(p))).toBe(true);
    expect(sync(p)).toEqual({ added: 2, removed: 2 });
    p.settings.reportBlocks = [];
    expect(sync(p)).toEqual({ added: 2, removed: 2 });
    expect(lists(p).map(pg => pg.title)).toEqual([`${LIST} (1/2)`, `${LIST} (2/2)`]);
  });
  it('i blocchi stanno nel gruppo della lista o dopo le pagine del loro quadro', () => {
    const p = project();
    sync(p);
    expect(p.pages.map(pg => pg.name)).toEqual(['1', '2', 'LST.1', 'LST.2']);
    p.settings.reportBlocksAt = 'panel';
    arrangePages(p);
    expect(p.pages.map(pg => `${pg.name} ${pg.title}`)).toEqual(['1 Q1', `LST.1 ${LIST} +Q1`, '2 Q2', `LST.2 ${LIST} +Q2`]);
  });
  it('la descrizione resta automatica finché non si cambia a mano', () => {
    const p = project();
    sync(p);
    lists(p)[0].title = 'Morsetti del quadro principale';
    p.pages[0].elements.push(T('X1:3', 56));
    // Quadro rinominato e una morsettiera in più (secondo foglio): cambiano i titoli automatici, non quello scritto a mano
    p.pages[1].elements.push(T('X3:1', 56));
    p.panels!.find(x => x.id === 'q2')!.code = 'Q2.1';
    sync(p);
    expect(lists(p).map(pg => pg.title)).toEqual(['Morsetti del quadro principale', `${LIST} +Q2.1 (1/2)`, `${LIST} +Q2.1 (2/2)`]);
  });
  it('stampando senza un quadro restano fuori anche le sue liste', () => {
    const p = project();
    sync(p);
    expect(pagesFor(p, { pages: 'all', skipPanels: ['q2'] }).map(pg => pg.title)).toEqual(['Q1', `${LIST} +Q1`]);
  });
});
