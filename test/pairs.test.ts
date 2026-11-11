// Riferimenti incrociati a coppie: il contatto ausiliario disegnato accanto ai poli (rappresentazione)
// e cablato in un'altra pagina
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Project, SymbolInstance, Wire, Pt } from '../src/model/types';
import { checkProject } from '../src/model/checks';
import { computeNetlist } from '../src/model/netlist';
import { derive } from '../src/model/derive';
import { syncPairs, newRepresentation } from '../src/model/pairs';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { getSymbol, instanceBounds } from '../src/model/geometry';

const S = (id: string, symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (...pts: [number, number][]): Wire => ({ kind: 'wire', id: `w${pts[0].join('-')}`, points: pts.map(([x, y]): Pt => ({ x, y })) });

/** -1Q1 (articolo con un NA) a pagina 1 con la rappresentazione del suo NA; il NA vero cablato a pagina 2 */
function project(): Project {
  const p = emptyProject();
  p.parts.push({ partNr: 'MS', functionTemplates: [{ pos: 1, description: 'Bobina', connections: ['A1', 'A2'] }, { pos: 2, description: '', connections: ['13', '14'] }], attrs: {} });
  const real = S('na', 'no', 100, 60, '1Q1');
  p.pages[0].elements = [S('q', 'coil', 60, 100, '1Q1', { partNr: 'MS' }), newRepresentation(real, 'rep', 80, 100, 0)];
  p.pages.push({ ...structuredClone(p.pages[0]), id: 'p2', name: '2', title: '', elements: [real, W([100, 40], [100, 60])] });
  return p;
}

describe('riferimenti a coppie', () => {
  it('la rappresentazione non conta come contatto e non si collega', () => {
    const p = project();
    const msgs = checkProject(p).map(i => i.msg);
    expect(msgs.some(m => /contatti NA/.test(m))).toBe(false);
    expect(computeNetlist(p).nets.some(n => n.pins.some(x => x.el.inst.id === 'rep'))).toBe(false);
  });
  it('i due si rimandano e la rappresentazione ha i morsetti del contatto vero', () => {
    const p = project();
    const d = derive(p);
    const x1 = d.pages.get(p.pages[0].id)!.xrefs;
    expect(x1.get('rep')?.mainLocation).toMatch(/^2\./);
    expect(x1.get('na')?.mainLocation).toMatch(/^1\./);
    expect(Object.values(d.pages.get(p.pages[0].id)!.labels.get('rep') ?? {})).toEqual(['13', '14']);
  });
  it('sigla e morsetti seguono il contatto vero; senza contatto vero è segnalata', () => {
    const p = project();
    const real = p.pages[1].elements[0] as SymbolInstance;
    real.tag = '1Q2'; real.autoPins = false; real.pinLabels = { 1: '23', 2: '24' };
    syncPairs(p);
    expect(p.pages[0].elements[1]).toMatchObject({ tag: '1Q2', autoPins: false, pinLabels: { 1: '23', 2: '24' } });
    p.pages[1].elements.shift();
    expect(checkProject(p).find(i => i.kind === 'Riferimenti a coppie')).toMatchObject({ fix: { kind: 'deleteElement', id: 'rep' } });
  });
  it('formato testo: coppia=<pagina>@x,y', () => {
    const p = project();
    const t = pagesToText(p);
    expect(t).toMatch(/simbolo no -1Q1 @80,100 .*coppia=2@100,60/);
    const q = emptyProject();
    expect(importPagesText(q, t).errors).toEqual([]);
    const rep = q.pages.flatMap(pg => pg.elements).find(e => e.kind === 'symbol' && e.pairOf) as SymbolInstance;
    const real = q.pages.flatMap(pg => pg.elements).find(e => e.id === rep.pairOf) as SymbolInstance;
    expect([real.x, real.y, real.tag]).toEqual([100, 60, '1Q1']);
    expect(rep.pairCompact).toBe(true);
  });
  it('rappresentazione ridotta: piccola, verticale a 0°, orizzontale a 90°, altezza nel testo', () => {
    const p = project();
    const rep = p.pages[0].elements[1] as SymbolInstance;
    expect(rep.pairCompact).toBe(true);
    const sym = getSymbol('no', p)!;
    const v = instanceBounds(rep, sym);
    expect(v.y1 - v.y0).toBeGreaterThan(v.x1 - v.x0);
    const h = instanceBounds({ ...rep, rot: 90 }, sym);
    expect(h.x1 - h.x0).toBeGreaterThan(h.y1 - h.y0);
    rep.pairSize = 1.5;
    const t = pagesToText(p);
    expect(t).toMatch(/coppia=2@100,60 ridotta hcoppia=1.5/);
    const q = emptyProject();
    expect(importPagesText(q, t).errors).toEqual([]);
    expect(q.pages.flatMap(pg => pg.elements).find(e => e.kind === 'symbol' && e.pairOf)).toMatchObject({ pairCompact: true, pairSize: 1.5 });
  });
});
