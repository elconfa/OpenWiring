// Taglia e incolla = spostare: filo, morsetto e rimando incollati in un'altra pagina restano gli stessi
// (rimando collegato, numero del morsetto, numero filo); copia e incolla dà un morsetto nuovo
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { Project, SymbolInstance, Wire } from '../src/model/types';
import { linkPartners } from '../src/model/links';
import { copyElements, pasteElements } from '../src/model/clipboard';
import { freeTerminalNumbers } from '../src/model/terminals';
import { wireLabelGap, labelSide, labelNear } from '../src/model/wireLabels';

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

describe('copia di un morsetto: numeri liberi', () => {
  const T = (id: string, tag: string, x: number): SymbolInstance => ({ kind: 'symbol', id, symbolId: 'terminal', tag, x, y: 100, rot: 0, pinLabels: {} } as SymbolInstance);
  it('un numero con solo l\'altro piano disegnato e le riserve restano liberi; le riserve sono segnate', () => {
    const p = emptyProject();
    p.pages = [{ id: 'a', name: '1', title: '', type: 'multiline', elements: [
      T('t1', 'X1:1A', 20), T('t2', 'X1:2A', 40), T('t3', 'X1:2B', 60), T('t4', 'X1:4B', 80), T('t5', 'X1:5A', 100), T('copy', 'X1:1A', 120),
    ] }];
    p.terminalStrips = { X1: { jumpers: [], spares: ['3A', '4A'], separators: [] } };
    const r = freeTerminalNumbers(p, 'X1', ['A'], ['copy'], 4);
    // 1, 2, 5 hanno il piano A disegnato; 4 ha solo il B (e la riserva 4A); 3 è una riserva
    expect(r.free).toEqual([3, 4, 6, 7]);
    expect([...r.spare].sort()).toEqual([3, 4]);
    // Copia con due piani: serve un numero libero su entrambi
    expect(freeTerminalNumbers(p, 'X1', ['A', 'B'], ['copy'], 2).free).toEqual([3, 6]);
  });
});

describe('sigla del bus fili', () => {
  it('più lontana dal bus di metà del suo spessore, sopra e sotto, anche spostata a mano', () => {
    expect(wireLabelGap({}, 1.2)).toBe(0);
    expect(wireLabelGap({ bundle: 'W1' }, 1.2)).toBe(1);
    expect(wireLabelGap({ bundle: 'W1', width: 2 }, 1.2)).toBe(1.4);
    expect(labelSide(false, 50, 100, -1, 1.8, 1).y).toBe(98.2);
    expect(labelSide(false, 50, 100, 1, 1.8, 1).y).toBe(103.3);
    expect(labelNear([{ x: 0, y: 100 }, { x: 100, y: 100 }], { x: 50, y: 97 }, 1.8, 1)?.y).toBe(98.2);
  });
});
