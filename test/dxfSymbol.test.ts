// Import DXF nei simboli (es. DXF dell'EPLAN Data Portal) e scala degli elementi nell'editor
import { describe, it, expect } from 'vitest';
import { dxfSymbolInfo, dxfSymbolPrims } from '../src/io/dxfImport';
import { scaleItems } from '../src/model/symbolEdit';
import type { SymbolDef } from '../src/model/types';

const dxf = (header: string[], ...ents: string[][]) => [
  ...(header.length ? ['0', 'SECTION', '2', 'HEADER', ...header, '0', 'ENDSEC'] : []),
  '0', 'SECTION', '2', 'ENTITIES', ...ents.flat(), '0', 'ENDSEC', '0', 'EOF',
].join('\n');
const line = (x1: number, y1: number, x2: number, y2: number) => ['0', 'LINE', '8', '0', '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2)];

describe('import DXF nei simboli', () => {
  it('unità del file e scala scelta; l\'origine 0,0 del disegno resta l\'origine del simbolo', () => {
    const text = dxf(['9', '$INSUNITS', '70', '5'], line(0, 0, 2, 0), line(0, 0, 0, -1));
    expect(dxfSymbolInfo(text)).toEqual({ width: 20, height: 10, units: 'cm', count: 2 });
    expect(dxfSymbolPrims(text)).toEqual([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 10 }]);
    expect(dxfSymbolPrims(text, 0.5)[0]).toEqual({ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
  });
  it('disegno lontano dall\'origine: l\'angolo in alto a sinistra va in 0,0; unità non indicata = mm', () => {
    const text = dxf([], line(1000, 500, 1030, 500), line(1000, 480, 1030, 480));
    expect(dxfSymbolInfo(text).units).toBe('');
    expect(dxfSymbolPrims(text)).toEqual([{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 0, y1: 20, x2: 30, y2: 20 }]);
  });
  it('archi nelle polilinee (bulge) ed ellissi', () => {
    // Semicerchio da (0,0) a (10,0) in senso antiorario: passa per (5,-5) nel DXF, (5,5) con y verso il basso
    const text = dxf([], ['0', 'LWPOLYLINE', '90', '2', '70', '0', '10', '0', '20', '0', '42', '1', '10', '10', '20', '0'],
      ['0', 'ELLIPSE', '10', '5', '20', '0', '11', '4', '21', '0', '40', '0.5', '41', '0', '42', String(Math.PI * 2)]);
    const [poly, ell] = dxfSymbolPrims(text);
    if (poly.t !== 'poly' || ell.t !== 'poly') throw new Error('attese polilinee');
    const ys = poly.pts.map(p => p.y);
    expect(Math.max(...ys)).toBeCloseTo(5, 1);
    expect(poly.pts[poly.pts.length - 1]).toEqual({ x: 10, y: 0 });
    expect(Math.max(...ell.pts.map(p => p.x))).toBeCloseTo(9);
    expect(Math.max(...ell.pts.map(p => p.y))).toBeCloseTo(2);
    expect(ell.closed).toBe(true);
  });
});

describe('scala nell\'editor dei simboli', () => {
  it('ingrandisce grafica e testi dal punto base; i punti di connessione restano sulla griglia', () => {
    const sym: SymbolDef = {
      id: 'x', name: 'x', category: '', letter: 'K', role: 'single',
      prims: [{ t: 'rect', x: 0, y: 0, w: 10, h: 6 }, { t: 'circle', cx: 5, cy: 3, r: 2 }, { t: 'text', x: 2, y: 2, s: 'A', size: 2 }],
      pins: [{ id: '1', x: 4, y: 0, dir: 'up', label: '1' }],
    };
    const all = [0, 1, 2].map(i => ({ kind: 'prim' as const, i })).concat([{ kind: 'pin' as const, i: 0 }] as never);
    const s = scaleItems(sym, all, 1.5, { x: 0, y: 0 }, 4);
    expect(s.prims[0]).toEqual({ t: 'rect', x: 0, y: 0, w: 15, h: 9 });
    expect(s.prims[1]).toEqual({ t: 'circle', cx: 7.5, cy: 4.5, r: 3 });
    expect(s.prims[2]).toMatchObject({ x: 3, y: 3, size: 3 });
    // 4 × 1,5 = 6 mm: torna sulla griglia di 4 mm
    expect(s.pins[0]).toMatchObject({ x: 8, y: 0 });
  });
});
