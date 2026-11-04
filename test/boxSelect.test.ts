// Selezione «da destra a sinistra»: i fili si prendono solo se un loro tratto tocca il riquadro
import { describe, it, expect } from 'vitest';
import { polylineTouchesBox, segmentTouchesBox } from '../src/model/geometry';

const box = { x0: 100, y0: 100, x1: 120, y1: 120 };

describe('riquadro di selezione', () => {
  it('filo a U lontano: il rettangolo che lo contiene tocca il riquadro, i tratti no', () => {
    // Scende a x 40, corre in basso a y 200, risale a x 300: il riquadro sta nel mezzo, vuoto
    const u = [{ x: 40, y: 20 }, { x: 40, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 20 }];
    expect(polylineTouchesBox(u, box)).toBe(false);
  });
  it('tratti che attraversano, che finiscono dentro o che toccano il bordo', () => {
    expect(polylineTouchesBox([{ x: 20, y: 110 }, { x: 400, y: 110 }], box)).toBe(true);
    expect(polylineTouchesBox([{ x: 110, y: 20 }, { x: 110, y: 105 }], box)).toBe(true);
    expect(segmentTouchesBox({ x: 120, y: 20 }, { x: 120, y: 300 }, box)).toBe(true);
    expect(segmentTouchesBox({ x: 121, y: 20 }, { x: 121, y: 300 }, box)).toBe(false);
    expect(segmentTouchesBox({ x: 20, y: 20 }, { x: 99, y: 99 }, box)).toBe(false);
    expect(segmentTouchesBox({ x: 90, y: 90 }, { x: 130, y: 130 }, box)).toBe(true);
  });
});

describe('riquadro di selezione nell\'editor dei simboli', () => {
  it('polilinea a U e linea obliqua lontane non si prendono da destra a sinistra', async () => {
    const { itemsInBox } = await import('../src/model/symbolEdit');
    const sym = { id: 'x', name: 'x', letter: '', role: 'single', category: '', pins: [], prims: [
      { t: 'poly', pts: [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 0 }] },
      { t: 'line', x1: 0, y1: 0, x2: 20, y2: 20 },
      { t: 'line', x1: 8, y1: 2, x2: 8, y2: 6 },
    ] } as never;
    // Riquadro vicino all'angolo in alto a destra: dentro i rettangoli di U e obliqua, lontano dai tratti
    const found = itemsInBox(sym, { x0: 14, y0: 2, x1: 18, y1: 6 }, true);
    expect(found).toEqual([]);
    expect(itemsInBox(sym, { x0: 6, y0: 3, x1: 10, y1: 4 }, true)).toEqual([{ kind: 'prim', i: 2 }]);
  });
});
