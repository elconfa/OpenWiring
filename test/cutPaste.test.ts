// Taglia e incolla = spostare: filo, morsetto e rimando incollati in un'altra pagina restano gli stessi
// (rimando collegato, numero del morsetto, numero filo); copia e incolla dà un morsetto nuovo
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { Project, SymbolInstance, Wire } from '../src/model/types';
import { linkPartners } from '../src/model/links';
import { copyElements, pasteElements } from '../src/model/clipboard';

const sym = (id: string, symbolId: string, tag: string, x: number, y: number, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (id: string, pts: [number, number][], extra: Partial<Wire> = {}): Wire => ({ kind: 'wire', id, points: pts.map(([x, y]) => ({ x, y })), ...extra });

function project(): Project {
  const p = emptyProject();
  p.pages[0].elements = [sym('k1', 'coil', 'K1', 40, 40), sym('out', 'link', 'R1', 40, 120, { linkTo: 'in' })];
  p.pages.push({ ...structuredClone(p.pages[0]), id: 'pg2', name: '2', title: 'Arrivo', elements: [
    sym('in', 'link_in', 'R1', 40, 40, { linkTo: 'out' }), sym('t5', 'terminal', 'X1:5A', 40, 80), W('w', [[40, 40], [40, 80]], { number: '77' }),
  ] });
  p.pages.push({ ...structuredClone(p.pages[0]), id: 'pg3', name: '3', title: 'Nuova', elements: [] });
  return p;
}
const cutTo = (p: Project, ids: string[], pageId: string) => {
  const src = p.pages[1];
  const clip = { ...copyElements(p, src, ids), cut: true };
  src.elements = src.elements.filter(e => !ids.includes(e.id));
  return pasteElements(p, pageId, clip, 100, 0);
};

describe('taglia e incolla', () => {
  it('rimando, morsetto e filo tagliati restano gli stessi nella pagina nuova', () => {
    const p = project();
    const r = cutTo(p, ['in', 't5', 'w'], 'pg3');
    expect(r.ids.sort()).toEqual(['in', 't5', 'w']);
    const els = p.pages[2].elements;
    expect(els.find(e => e.id === 't5')).toMatchObject({ tag: 'X1:5A', x: 140 });
    expect(els.find(e => e.id === 'w')).toMatchObject({ number: '77' });
    expect(linkPartners(p).get('out')?.map(e => e.inst.id)).toEqual(['in']);
  });

  it('copia e incolla: morsetto nuovo (primo libero, stesso piano), filo senza numero fisso, rimando scollegato', () => {
    const p = project();
    const clip = copyElements(p, p.pages[1], ['in', 't5', 'w']);
    const r = pasteElements(p, 'pg3', clip, 100, 0);
    const els = p.pages[2].elements.filter(e => r.ids.includes(e.id));
    expect(els.find(e => e.kind === 'symbol' && e.symbolId === 'terminal')).toMatchObject({ tag: 'X1:1A' });
    expect(els.find(e => e.kind === 'wire')).not.toHaveProperty('number');
    expect(r.ids).not.toContain('in');
  });

  it('elemento tagliato già di nuovo nel progetto (incollato due volte): id nuovo', () => {
    const p = project();
    const clip = { ...copyElements(p, p.pages[1], ['t5']), cut: true };
    const r = pasteElements(p, 'pg3', clip, 100, 0);
    expect(r.ids[0]).not.toBe('t5');
  });
});
