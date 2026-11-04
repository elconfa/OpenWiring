// Simbolo incollato o duplicato sopra un filo: il filo si interrompe sui pin come all'inserimento
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { SymbolInstance, Wire } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  st().loadProject(emptyProject());
  return st;
}

describe('incolla sopra un filo', () => {
  it('il morsetto incollato sul filo lo taglia in due fili collegati ai pin', async () => {
    const st = await store();
    const page = () => st().project.pages.find(p => p.id === st().pageId)!;
    const t = st().placeSymbol('terminal', { x: 40, y: 40 }, 0)!;
    st().setSelection([t.id]);
    st().copySelection();
    // Dove finisce la copia incollata nel punto scelto
    st().paste({ x: 120, y: 80 });
    const pasted = page().elements.find(e => e.kind === 'symbol' && e.id !== t.id) as SymbolInstance;
    const { x, y } = pasted;
    st().undo();
    // Filo verticale che passa dove andrà il morsetto, poi incolla nello stesso punto
    st().addWire([{ x, y: y - 40 }, { x, y: y + 40 }]);
    st().paste({ x: 120, y: 80 });
    const wires = page().elements.filter((e): e is Wire => e.kind === 'wire');
    expect(wires).toHaveLength(2);
    // Nessun filo passa più sotto il morsetto
    expect(wires.every(w => w.points.every(q => q.y <= y || q.y >= y + 1))).toBe(true);
  });
});
