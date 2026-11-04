import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { SymbolInstance, Wire } from '../src/model/types';
import { uid, getSymbol, pinsWorld } from '../src/model/geometry';
import { wireMarkers, wireMarkerTable } from '../src/model/labels';

const T = (tag: string, x: number, y: number): SymbolInstance => ({ kind: 'symbol', id: uid('s'), symbolId: 'terminal', x, y, rot: 0, tag, pinLabels: {}, autoPins: true });
const W = (a: { x: number; y: number }, b: { x: number; y: number }): Wire => ({ kind: 'wire', id: uid('w'), points: [a, b] });

describe('numeri filo da stampare', () => {
  it('un\'etichetta per ogni capo su un simbolo o un morsetto', () => {
    const p = emptyProject();
    p.settings.autoConnect = false;
    const sym = getSymbol('terminal', p)!;
    const a = T('X1:1', 40, 40), b = T('X1:2', 40, 100), c = T('X1:3', 80, 100);
    const pa = pinsWorld(a, sym), pb = pinsWorld(b, sym), pc = pinsWorld(c, sym);
    const bottom = (ps: typeof pa) => ps.reduce((m, q) => (q.y > m.y ? q : m)), top = (ps: typeof pa) => ps.reduce((m, q) => (q.y < m.y ? q : m));
    // X1:1 → X1:2 e, dallo stesso punto di X1:1, un secondo filo verso X1:3: tre fili, X1:1 ha due capi
    const j = { x: bottom(pa).x, y: bottom(pa).y + 10 };
    p.pages[0].elements = [a, b, c,
      W(bottom(pa), top(pb)), W(bottom(pa), { x: top(pc).x, y: bottom(pa).y }), W({ x: top(pc).x, y: bottom(pa).y }, top(pc)),
      // Filo che finisce su un altro filo (a T): quel capo non ha etichetta
      W({ x: j.x - 20, y: j.y }, j)];
    const rows = wireMarkers(p);
    const qty = rows.reduce((s, r) => s + r.qty, 0);
    expect(qty).toBe(4);
    expect(wireMarkerTable(rows, false)[0]).toEqual(['Testo', 'Quantità', 'Sezione', 'Fogli']);
    expect(wireMarkerTable(rows, true)[0][0]).toBe('Quadro');
  });
});
