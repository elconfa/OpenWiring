// Editor dei componenti come un CAD: selezione, copia e incolla, rotazione, maniglie
import { describe, it, expect } from 'vitest';
import type { SymbolDef } from '../src/model/types';
import { copyItems, pasteClip, rotateItems, moveItems, itemsInBox, moveGrip, deleteItems, type Item } from '../src/model/symbolEdit';

// Tre contatti NA affiancati a passo 8 mm, poli 1-2, 3-4, 5-6
const contacts = (): SymbolDef => ({
  id: 'x', name: 'Contatti', category: 'Prova', letter: 'K', role: 'aux',
  prims: [0, 8, 16].flatMap(x => [
    { t: 'line' as const, x1: x, y1: 0, x2: x, y2: 5 }, { t: 'line' as const, x1: x, y1: 16, x2: x, y2: 11 }, { t: 'line' as const, x1: x, y1: 11, x2: x - 4.5, y2: 4.5 },
  ]),
  pins: [0, 8, 16].flatMap((x, k) => [
    { id: String(2 * k + 1), x, y: 0, dir: 'up' as const, label: String(2 * k + 1) },
    { id: String(2 * k + 2), x, y: 16, dir: 'down' as const, label: String(2 * k + 2) },
  ]),
});

describe('editor dei componenti', () => {
  it('dal terzo contatto copiato e incollato 8 mm più a destra nasce il quarto, con i morsetti 7 e 8', () => {
    const s = contacts();
    // Riquadro attorno al terzo contatto (x da 11 a 17)
    const third = itemsInBox(s, { x0: 11, y0: -1, x1: 17, y1: 17 }, false);
    expect(third.filter(i => i.kind === 'prim')).toHaveLength(3);
    expect(third.filter(i => i.kind === 'pin')).toHaveLength(2);
    const r = pasteClip(s, copyItems(s, third), 8, 0);
    expect(r.sym.prims).toHaveLength(12);
    const added = r.sym.pins.slice(6);
    expect(added.map(q => [q.id, q.label, q.x, q.y])).toEqual([['7', '7', 24, 0], ['8', '8', 24, 16]]);
    expect(r.items).toHaveLength(5);
  });
  it('le designazioni non numeriche e quelle libere restano', () => {
    const s: SymbolDef = { ...contacts(), pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: 'A1' }] };
    const r = pasteClip(s, { prims: [], pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: 'A1' }, { id: '2', x: 0, y: 8, dir: 'down', label: '9' }] }, 8, 0);
    expect(r.sym.pins.slice(1).map(q => q.label)).toEqual(['A1', '9']);
  });
  it('R ruota la selezione di 90° in senso orario e la direzione dei punti di connessione', () => {
    const s = contacts();
    const first: Item[] = [{ kind: 'prim', i: 0 }, { kind: 'pin', i: 0 }, { kind: 'pin', i: 1 }];
    const r = rotateItems(s, first, 4);
    // Centro (0, 8): in senso orario il punto in alto va a destra, quello in basso a sinistra
    expect(r.pins[0]).toMatchObject({ x: 8, y: 8, dir: 'right' });
    expect(r.pins[1]).toMatchObject({ x: -8, y: 8, dir: 'left' });
    // Un punto di connessione da solo cambia solo direzione
    const one = rotateItems(s, [{ kind: 'pin', i: 2 }], 4);
    expect(one.pins[2]).toMatchObject({ x: 8, y: 0, dir: 'right' });
  });
  it('le maniglie allungano una linea e ridimensionano un rettangolo tenendo fermo l\'angolo opposto', () => {
    expect(moveGrip({ t: 'line', x1: 0, y1: 0, x2: 0, y2: 5 }, 1, { x: 0, y: 8 })).toMatchObject({ x1: 0, y1: 0, x2: 0, y2: 8 });
    expect(moveGrip({ t: 'rect', x: -4, y: 4, w: 24, h: 8 }, 2, { x: 28, y: 12 })).toMatchObject({ x: -4, y: 4, w: 32, h: 8 });
  });
  it('spostamento ed eliminazione di più elementi insieme', () => {
    const s = contacts();
    const sel: Item[] = [{ kind: 'prim', i: 0 }, { kind: 'pin', i: 0 }];
    const m = moveItems(s, sel, 4, 0);
    expect(m.prims[0]).toMatchObject({ x1: 4, x2: 4 });
    expect(m.pins[0].x).toBe(4);
    expect(m.pins[1].x).toBe(0);
    const d = deleteItems(s, sel);
    expect([d.prims.length, d.pins.length]).toEqual([8, 5]);
  });
});
