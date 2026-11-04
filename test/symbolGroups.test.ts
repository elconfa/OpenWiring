// Editor dei simboli: raggruppa ed esplodi, blocca e sblocca, allineamento dei gruppi
import { describe, expect, it } from 'vitest';
import type { SymbolDef } from '../src/model/types';
import { groupItems, explodeItems, lockItems, withGroups, moveItems, deleteItems, alignItems, itemsInBox, pasteClip, copyItems, symbolAsGraphic, type Item } from '../src/model/symbolEdit';

const base = (): SymbolDef => ({
  id: 't', name: 't', category: '', letter: '', role: 'single',
  prims: [
    { t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
    { t: 'line', x1: 0, y1: 5, x2: 10, y2: 5 },
    { t: 'circle', cx: 30, cy: 20, r: 2 },
    { t: 'rect', x: 50, y: 0, w: 4, h: 4 },
  ],
  pins: [{ id: '1', x: 0, y: -10, dir: 'up', label: '1' }],
});
const P = (i: number): Item => ({ kind: 'prim', i });

describe('gruppi e blocco nell\'editor dei simboli', () => {
  it('raggruppa: un elemento del gruppo seleziona tutto il gruppo; esplodi lo scioglie', () => {
    const s = groupItems(base(), [P(0), P(1)]);
    expect(s.prims[0].g).toBeTruthy();
    expect(s.prims[0].g).toBe(s.prims[1].g);
    expect(withGroups(s, [P(0)]).map(it => (it as { i: number }).i).sort()).toEqual([0, 1]);
    const e = explodeItems(s, [P(1)]);
    expect(e.prims.some(p => p.g)).toBe(false);
  });

  it('il riquadro da sinistra a destra prende il gruppo solo se è tutto dentro', () => {
    const s = groupItems(base(), [P(0), P(2)]);
    expect(itemsInBox(s, { x0: -1, y0: -1, x1: 11, y1: 1 }, false).some(it => it.kind === 'prim' && it.i === 0)).toBe(false);
    expect(itemsInBox(s, { x0: -1, y0: -1, x1: 11, y1: 1 }, true).filter(it => it.kind === 'prim').length).toBe(2);
  });

  it('gli elementi bloccati non si spostano, non si cancellano e non si prendono con il riquadro', () => {
    const s = lockItems(base(), [P(2), { kind: 'pin', i: 0 }], true);
    const m = moveItems(s, [P(2), P(3), { kind: 'pin', i: 0 }], 5, 5);
    expect(m.prims[2]).toEqual(s.prims[2]);
    expect(m.pins[0].x).toBe(0);
    expect((m.prims[3] as { x: number }).x).toBe(55);
    expect(deleteItems(s, [P(2)]).prims).toHaveLength(4);
    expect(itemsInBox(s, { x0: -100, y0: -100, x1: 100, y1: 100 }, true).some(it => it.kind === 'prim' && it.i === 2)).toBe(false);
    const u = lockItems(s, [P(2)], false);
    expect(u.prims[2].lock).toBeUndefined();
  });

  it('allineamento: un gruppo si allinea come un elemento solo e resta com\'è', () => {
    const s = groupItems(base(), [P(0), P(1)]);
    const a = alignItems(s, [P(0), P(1), P(3)], 'top');
    // Il gruppo (y da 0 a 5) e il rettangolo (y 0) sono già in alto: il gruppo non si deforma
    expect((a.prims[1] as { y1: number }).y1 - (a.prims[0] as { y1: number }).y1).toBe(5);
    const b = alignItems(s, [P(3), P(0), P(1)], 'right');
    expect((b.prims[0] as { x2: number }).x2).toBe(54);
    expect((b.prims[1] as { x2: number }).x2).toBe(54);
  });

  it('incollando un gruppo nasce un gruppo nuovo, non bloccato; un simbolo inserito è un gruppo', () => {
    let s = groupItems(base(), [P(0), P(1)]);
    s = lockItems(s, [P(0)], true);
    const r = pasteClip(s, copyItems(s, [P(0), P(1)]), 0, 20);
    const [a, b] = [r.sym.prims[4], r.sym.prims[5]];
    expect(a.g).toBe(b.g);
    expect(a.g).not.toBe(s.prims[0].g);
    expect(a.lock).toBeUndefined();
    const ins = pasteClip(base(), symbolAsGraphic(base()), 0, 0).sym.prims.slice(4);
    expect(new Set(ins.map(p => p.g)).size).toBe(1);
    expect(ins[0].g).toBeTruthy();
  });
});
