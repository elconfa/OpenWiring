// Sostituzione del simbolo di un elemento: sigla, dati, fili e numeri filo restano
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { derive } from '../src/model/derive';
import type { SymbolInstance, Wire } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.settings.autoConnect = false;
  st().loadProject(p);
  return st;
}
type St = Awaited<ReturnType<typeof store>>;
const els = (st: St) => st().project.pages[0].elements;
const wires = (st: St) => els(st).filter((e): e is Wire => e.kind === 'wire');
const numbers = (st: St) => {
  const pd = derive(st().project, []).pages.get(st().project.pages[0].id)!;
  return wires(st).map(w => pd.wireNumbers.get(w.id));
};

describe('sostituisci simbolo', () => {
  it('contatto NA → NC: stessa sigla, dati, fili e numeri filo', async () => {
    const st = await store();
    const q = st().placeSymbol('no', { x: 40, y: 40 }, 0)!;
    st().updateElement(q.id, { tag: '2K5', description: 'Marcia pompa', pinLabels: { '1': '23', '2': '24' }, autoPins: false });
    st().addWire([{ x: 40, y: 20 }, { x: 40, y: 40 }]);
    st().addWire([{ x: 40, y: 56 }, { x: 40, y: 80 }]);
    const before = numbers(st);
    st().replaceSymbol(q.id, 'nc');
    const inst = els(st).find(e => e.id === q.id) as SymbolInstance;
    expect(inst.symbolId).toBe('nc');
    expect(inst.tag).toBe('2K5');
    expect(inst.description).toBe('Marcia pompa');
    // Designazioni scritte a mano: restano sui punti abbinati
    expect(inst.pinLabels).toEqual({ '1': '23', '2': '24' });
    expect(wires(st).map(w => w.points)).toEqual([[{ x: 40, y: 20 }, { x: 40, y: 40 }], [{ x: 40, y: 56 }, { x: 40, y: 80 }]]);
    expect(numbers(st)).toEqual(before);
    // Un passo di annullamento
    st().undo();
    expect((els(st).find(e => e.id === q.id) as SymbolInstance).symbolId).toBe('no');
  });

  it('i fili seguono i punti che cambiano posto, restando ortogonali', async () => {
    const st = await store();
    const q = st().placeSymbol('no', { x: 40, y: 40 }, 0)!;
    st().addWire([{ x: 40, y: 56 }, { x: 40, y: 80 }]);
    // Contatto in scambio: il 14 è in alto a destra (46, 40)
    st().replaceSymbol(q.id, 'co');
    const w = wires(st)[0].points;
    expect(w[0]).toEqual({ x: 46, y: 40 });
    expect(w[w.length - 1]).toEqual({ x: 40, y: 80 });
    for (let i = 0; i < w.length - 1; i++) expect(w[i].x === w[i + 1].x || w[i].y === w[i + 1].y).toBe(true);
  });
});
