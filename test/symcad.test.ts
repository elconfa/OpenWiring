// CAD 2D dei simboli: intersezioni, aggancio, taglia, estendi, offset, specchio, misure, livelli, DXF
import { describe, it, expect } from 'vitest';
import { intersections, nearestSnap, snapPoints } from '../src/symcad/geom';
import { trimAt, extendAt, offsetPrim, measure } from '../src/symcad/edit';
import { symbolToDxf } from '../src/symcad/dxf';
import { mirrorItems } from '../src/model/symbolEdit';
import { dxfSymbolPrims } from '../src/io/dxfImport';
import { plotPrims, type Prim, type SymbolDef } from '../src/model/types';

const L = (x1: number, y1: number, x2: number, y2: number): Prim => ({ t: 'line', x1, y1, x2, y2 });

describe('intersezioni e aggancio', () => {
  it('linee, rettangoli e cerchi', () => {
    expect(intersections([L(0, 5, 10, 5), L(5, 0, 5, 10)])).toEqual([{ x: 5, y: 5 }]);
    const ps = intersections([L(-10, 0, 10, 0), { t: 'circle', cx: 0, cy: 0, r: 4 }]);
    expect(ps.map(p => p.x).sort((a, b) => a - b)).toEqual([-4, 4]);
  });
  it('estremi, punti medi, centri e intersezioni; i punti di connessione prima', () => {
    const pts = snapPoints([L(0, 0, 10, 0), { t: 'circle', cx: 20, cy: 0, r: 2 }], [{ x: 0, y: 0 }]);
    expect(nearestSnap(pts, { x: 4.8, y: 0.3 }, 1)).toMatchObject({ x: 5, y: 0, kind: 'mid' });
    expect(nearestSnap(pts, { x: 20.3, y: 0.2 }, 1)).toMatchObject({ x: 20, y: 0, kind: 'center' });
    expect(nearestSnap(pts, { x: 0.1, y: 0 }, 1)).toMatchObject({ kind: 'pin' });
    expect(nearestSnap(pts, { x: 40, y: 0 }, 1)).toBeUndefined();
  });
});

describe('taglia ed estendi', () => {
  it('taglia il pezzo di linea tra due intersezioni', () => {
    const prims = [L(0, 0, 30, 0), L(10, -5, 10, 5), L(20, -5, 20, 5)];
    const r = trimAt(prims, 0, { x: 15, y: 0 })!;
    expect(r.filter(p => p.t === 'line' && p.y1 === 0 && p.y2 === 0)).toEqual([L(0, 0, 10, 0), L(20, 0, 30, 0)]);
    // Fino all'estremo
    const r2 = trimAt(prims, 0, { x: 25, y: 0 })!;
    expect(r2[0]).toEqual(L(0, 0, 20, 0));
  });
  it('taglia un cerchio e un rettangolo', () => {
    const c = trimAt([{ t: 'circle', cx: 0, cy: 0, r: 5 }, L(-10, 0, 10, 0)], 0, { x: 0, y: -5 })!;
    // Resta la metà di sotto: da 0° a 180° (y verso il basso)
    expect(c[0]).toMatchObject({ t: 'arc', a0: 0, a1: 180 });
    const r = trimAt([{ t: 'rect', x: 0, y: 0, w: 10, h: 10 }, L(5, -5, 5, 15)], 0, { x: 7, y: 0 })!;
    // Senza il pezzo in alto a destra: una polilinea aperta da (10,0)… a (5,0)
    expect(r[0]).toMatchObject({ t: 'poly', pts: [{ x: 5, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 5, y: 0 }] });
  });
  it('estende una linea fino alla prima primitiva', () => {
    const r = extendAt([L(0, 0, 5, 0), L(12, -5, 12, 5), { t: 'circle', cx: 30, cy: 0, r: 3 }], 0, { x: 4, y: 0 })!;
    expect(r[0]).toEqual(L(0, 0, 12, 0));
    expect(extendAt([L(0, 0, 5, 0)], 0, { x: 4, y: 0 })).toBeUndefined();
  });
});

describe('offset, specchio, misure', () => {
  it('offset dal lato del clic', () => {
    expect(offsetPrim(L(0, 0, 10, 0), 2, { x: 5, y: 3 })).toEqual(L(0, 2, 10, 2));
    expect(offsetPrim({ t: 'rect', x: 0, y: 0, w: 10, h: 6 }, 1, { x: 20, y: 0 })).toEqual({ t: 'rect', x: -1, y: -1, w: 12, h: 8 });
    expect(offsetPrim({ t: 'circle', cx: 0, cy: 0, r: 5 }, 1, { x: 1, y: 0 })).toEqual({ t: 'circle', cx: 0, cy: 0, r: 4 });
    const p = offsetPrim({ t: 'poly', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }, 1, { x: 5, y: 1 });
    expect(p).toMatchObject({ pts: [{ x: 0, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 10 }] });
  });
  it('specchio: punti, archi, testi e direzione dei punti di connessione', () => {
    const sym: SymbolDef = { id: 's', name: 's', category: 'c', letter: 'K', role: 'single',
      prims: [L(0, 0, 8, 4), { t: 'arc', cx: 4, cy: 0, r: 2, a0: 0, a1: 90 }, { t: 'text', x: 1, y: 2, s: 'A', anchor: 'start' }],
      pins: [{ id: '1', x: 0, y: 0, dir: 'left', label: '' }] };
    const all = [{ kind: 'prim' as const, i: 0 }, { kind: 'prim' as const, i: 1 }, { kind: 'prim' as const, i: 2 }, { kind: 'pin' as const, i: 0 }];
    const m = mirrorItems(sym, all, 'h', 4);
    expect(m.prims[0]).toEqual(L(8, 0, 0, 4));
    expect(m.prims[1]).toMatchObject({ a0: 90, a1: 180 });
    expect(m.prims[2]).toMatchObject({ x: 7, anchor: 'end' });
    expect(m.pins[0]).toMatchObject({ x: 8, dir: 'right' });
  });
  it('misura: distanza, scarti e angolo come in un CAD', () => {
    expect(measure({ x: 0, y: 0 }, { x: 3, y: -4 })).toEqual({ d: 5, dx: 3, dy: 4, angle: 53.13 });
  });
});

describe('livelli e DXF', () => {
  it('i livelli «non stampare» non vanno sullo schema', () => {
    const s = { prims: [L(0, 0, 1, 1), { ...L(0, 0, 2, 2), layer: 'costruzione' } as Prim], layers: [{ name: 'costruzione', noPlot: true }] };
    expect(plotPrims(s)).toEqual([L(0, 0, 1, 1)]);
  });
  it('export DXF che si riapre con l\'import', () => {
    const sym: SymbolDef = { id: 's', name: 's', category: 'c', letter: 'K', role: 'single',
      prims: [L(0, 0, 10, 0), { t: 'circle', cx: 5, cy: 5, r: 2 }, { ...L(0, 0, 0, 8), layer: 'Contorno' } as Prim], pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '13' }] };
    const dxf = symbolToDxf(sym);
    expect(dxf).toContain('CONTORNO');
    expect(dxf).toContain('PUNTI_CONNESSIONE');
    const back = dxfSymbolPrims(dxf, 1);
    expect(back.some(p => p.t === 'circle' && p.r === 2)).toBe(true);
    expect(back.filter(p => p.t === 'line').length).toBeGreaterThanOrEqual(2);
  });
});
