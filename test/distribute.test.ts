import { describe, expect, it } from 'vitest';
import { distributeDeltas, type AlignBox } from '../src/model/align';
import { distributeItems, groupItems } from '../src/model/symbolEdit';
import type { SymbolDef } from '../src/model/types';

const box = (x: number, y = 0): AlignBox => ({ x0: x - 1, x1: x + 1, y0: y - 1, y1: y + 1, ref: { x, y } });

describe('distribuisci', () => {
  it('primo e ultimo fermi, gli altri a passo uguale, in qualsiasi ordine di selezione', () => {
    const d = distributeDeltas([box(30), box(0), box(4), box(10)], 'h');
    expect(d.map(q => q.x)).toEqual([0, 0, 6, 10]);
    expect(d.every(q => q.y === 0)).toBe(true);
  });
  it('con meno di tre elementi non sposta niente', () => {
    expect(distributeDeltas([box(0), box(9)], 'v')).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  });
  it('nel simbolo un gruppo conta come un elemento solo', () => {
    const sym: SymbolDef = {
      id: 's', name: 's', category: 'x', letter: 'A', role: 'single', pins: [],
      prims: [
        { t: 'circle', cx: 0, cy: 0, r: 1 },
        { t: 'circle', cx: 4, cy: 0, r: 1 }, { t: 'circle', cx: 6, cy: 0, r: 1 },
        { t: 'circle', cx: 20, cy: 0, r: 1 },
      ],
    };
    const g = groupItems(sym, [{ kind: 'prim', i: 1 }, { kind: 'prim', i: 2 }]);
    const out = distributeItems(g, [0, 1, 2, 3].map(i => ({ kind: 'prim' as const, i })), 'h');
    const cx = out.prims.map(p => (p.t === 'circle' ? p.cx : NaN));
    // Il gruppo (centro 5) va a metà tra 0 e 20 e i suoi due cerchi restano a 2 mm l'uno dall'altro
    expect(cx).toEqual([0, 9, 11, 20]);
  });
});
