// Tabella «Stato revisione fogli» (punto 176): sotto ogni foglio l'ultima revisione che l'ha cambiato
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { freezeRevision } from '../src/model/revisions';
import { revGridCells, revGridDrawing, revGridBox } from '../src/model/revisionGrid';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import type { BlockItem, Project } from '../src/model/types';
import { FRAME } from '../src/model/types';

function project(): Project {
  const p = emptyProject();
  const base = p.pages[0];
  p.pages = [
    { ...structuredClone(base), id: 'c', name: '0', title: 'Copertina', type: 'cover', elements: [] },
    ...['1', '2', '3', '5'].map(n => ({ ...structuredClone(base), id: `p${n}`, name: n, title: `Pagina ${n}`, elements: [] })),
  ];
  return p;
}

describe('stato revisione fogli', () => {
  it('prima emissione vuota, indice dei fogli cambiati, # per i fogli saltati e in fondo alla riga', () => {
    const p = project();
    freezeRevision(p, { index: 'A', date: '2026-11-01', author: '', description: 'Prima emissione' });
    p.pages[2].title = 'Pagina 2 cambiata';
    freezeRevision(p, { index: 'B', date: '2026-11-10', author: '', description: '' });
    p.pages[4].title = 'Pagina 5 cambiata';
    freezeRevision(p, { index: 'C', date: '2026-11-20', author: '', description: '' });
    const cells = revGridCells(p, 8);
    expect(cells.map(c => `${c.sheet}:${c.rev}`)).toEqual(['1:', '2:B', '3:', '4:#', '5:C', '6:#', '7:#', '8:#']);
    const b: BlockItem = { kind: 'block', id: 'b', x: 100, y: 20, block: 'revgrid', cols: 8 };
    const d = revGridDrawing(p, b);
    expect(d.texts[0].s).toBe('Stato revisione fogli');
    expect(d.texts.filter(t => t.s === '#').length).toBe(4);
    const box = revGridBox(p, b);
    expect(box.x1 - box.x0).toBe(10 + 8 * 6);
  });

  it('senza revisioni tutte le caselle vuote; inserita in alto a destra; nel testo delle pagine «blocco revisioni»', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(project());
    expect(revGridCells(st().project).every(c => c.rev === '' || c.rev === '#')).toBe(true);
    // La copertina non va nel testo delle pagine: la tabella si prova su una pagina dello schema
    st().setPage('p1');
    st().insertBlock('revgrid');
    const blk = st().project.pages[1].elements.find(e => e.kind === 'block') as BlockItem;
    expect(revGridBox(st().project, blk).x1).toBeCloseTo(FRAME.right - 4, 5);
    st().updateElement(blk.id, { cols: 10 });
    const txt = pagesToText(st().project);
    expect(txt).toMatch(/blocco revisioni @[\d.,]+ colonne=10/);
    const p2 = structuredClone(st().project);
    p2.pages[1].elements = [];
    const r = importPagesText(p2, txt);
    expect(r.errors ?? []).toEqual([]);
    expect(p2.pages[1].elements.find(e => e.kind === 'block')).toMatchObject({ block: 'revgrid', cols: 10 });
  });
});
