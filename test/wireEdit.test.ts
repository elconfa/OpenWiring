import { describe, it, expect } from 'vitest';
import type { Pt, Wire } from '../src/model/types';
import { normalizeWire, dragWirePoint, dragWireSegment, moveWithWires, landOnWire, splitWiresAtSymbols } from '../src/model/wireEdit';
import { emptyProject } from '../src/model/project';
import type { SymbolInstance } from '../src/model/types';
import { exampleProject } from '../src/model/example';
import { computeNetlist } from '../src/model/netlist';

const nets = (p: ReturnType<typeof exampleProject>) => computeNetlist(p).nets.map(n => `${n.wireNo}: ${n.pins.map(x => x.ref).sort().join(' ')}`).sort();

const P = (...a: [number, number][]): Pt[] => a.map(([x, y]) => ({ x, y }));
const s = (pts: Pt[]) => pts.map(p => `${p.x},${p.y}`).join(' ');
const ortho = (pts: Pt[]) => pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);

describe('modifica dei fili', () => {
  it('normalizza punti doppi, allineati e ritorni su sé stessi', () => {
    expect(s(normalizeWire(P([0, 0], [0, 10], [0, 10], [0, 20], [0, 16], [8, 16])))).toBe('0,0 0,16 8,16');
  });
  it('allunga e accorcia un filo trascinando un estremo', () => {
    expect(s(dragWirePoint(P([60, 40], [60, 80]), 1, { x: 60, y: 100 }))).toBe('60,40 60,100');
    expect(s(dragWirePoint(P([60, 40], [60, 80]), 1, { x: 80, y: 100 }))).toBe('60,40 60,100 80,100');
    expect(s(dragWirePoint(P([60, 40], [60, 80], [100, 80]), 0, { x: 64, y: 40 }))).toBe('64,40 64,80 100,80');
  });
  it('sposta un tratto in perpendicolare tenendo fermi gli estremi', () => {
    expect(s(dragWireSegment(P([60, 40], [60, 80], [100, 80], [100, 120]), 1, { x: 7, y: 12 }))).toBe('60,40 60,92 100,92 100,120');
    expect(s(dragWireSegment(P([20, 50], [100, 50]), 0, { x: 0, y: -8 }))).toBe('20,50 20,42 100,42 100,50');
  });
  it('spostando un componente in diagonale i fili restano ortogonali e collegati', () => {
    const p = exampleProject();
    const pg = p.pages[1];
    const before = nets(p);
    const lamp = pg.elements.find(e => e.kind === 'symbol' && e.tag === '2P1')!;
    moveWithWires(p, pg, new Set([lamp.id]), 12, 8);
    for (const w of pg.elements.filter((e): e is Wire => e.kind === 'wire')) expect(ortho(w.points), s(w.points)).toBe(true);
    expect(nets(p)).toEqual(before);
  });
  it('un filo tra due componenti spostati insieme si sposta tutto', () => {
    const p = exampleProject();
    const pg = p.pages[1];
    const ids = pg.elements.filter(e => e.kind === 'symbol' && (e.tag === '2S1' || e.tag === '2S2')).map(e => e.id);
    moveWithWires(p, pg, new Set(ids), 40, 0);
    const w = pg.elements.find(e => e.kind === 'wire' && e.points[0].y === 56 && e.points[1]?.y === 72) as Wire;
    expect(s(w.points)).toBe('100,56 100,72');
  });
  it('il filo che arriva su un filo esistente termina dritto, non dove si clicca', () => {
    const p = exampleProject();
    const pg = p.pages[1];
    expect(landOnWire(pg, { x: 220, y: 120 }, { x: 226, y: 233 }, 2)).toEqual({ x: 220, y: 232 });
    expect(landOnWire(pg, { x: 220, y: 120 }, { x: 226, y: 200 }, 2)).toBeUndefined();
  });
  it('un contatto inserito su un filo lo interrompe tra i suoi pin', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    const w: Wire = { kind: 'wire', id: 'w1', points: P([100, 20], [100, 100], [140, 100]), number: '1.01', color: 'BU' };
    const k: SymbolInstance = { kind: 'symbol', id: 'k1', symbolId: 'no', x: 100, y: 40, rot: 0, tag: '1K1', pinLabels: {}, autoPins: true };
    pg.elements.push(w, k);
    expect(splitWiresAtSymbols(p, pg, new Set(['k1']))).toBe(1);
    const ws = pg.elements.filter((e): e is Wire => e.kind === 'wire');
    expect(ws.map(x => s(x.points))).toEqual(['100,20 100,40', '100,56 100,100 140,100']);
    expect(ws[1].color).toBe('BU');
    expect(ws[1].number).toBeUndefined();
    const pins = computeNetlist(p).nets.map(n => n.pins.map(x => x.ref).sort().join(' ')).filter(Boolean);
    expect(pins).toHaveLength(2);
  });
  it('non tocca i fili che non passano per due pin né i ponticelli tra i pin', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    const k: SymbolInstance = { kind: 'symbol', id: 'k1', symbolId: 'no', x: 100, y: 40, rot: 0, tag: '1K1', pinLabels: {}, autoPins: true };
    pg.elements.push(
      { kind: 'wire', id: 'a', points: P([100, 40], [100, 56]) },
      { kind: 'wire', id: 'b', points: P([60, 48], [140, 48]) },
      { kind: 'wire', id: 'c', points: P([100, 56], [100, 80]) },
      k,
    );
    expect(splitWiresAtSymbols(p, pg, new Set(['k1']))).toBe(0);
    expect(pg.elements.filter(e => e.kind === 'wire')).toHaveLength(3);
  });
});
