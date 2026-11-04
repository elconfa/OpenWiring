// Selezione di più simboli: morsettiera o connettore di tutti insieme, proprietà sullo schema per tutti
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { SymbolInstance } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.settings.autoConnect = false;
  st().loadProject(p);
  return st;
}
type St = Awaited<ReturnType<typeof store>>;
const inst = (st: St, id: string) => st().project.pages[0].elements.find(e => e.id === id) as SymbolInstance;

describe('modifica di più simboli insieme', () => {
  it('morsetti e pin di connettore cambiano morsettiera mantenendo il numero', async () => {
    const st = await store();
    const a = st().placeSymbol('terminal', { x: 40, y: 40 }, 0)!;
    const b = st().placeSymbol('terminal', { x: 60, y: 40 }, 0)!;
    const c = st().placeSymbol('conn_male', { x: 80, y: 40 }, 0)!;
    st().updateElement(a.id, { tag: 'X1:1' });
    st().updateElement(b.id, { tag: 'X1:2' });
    st().updateElement(c.id, { tag: 'XS1:3' });
    st().setStripMany([a.id, b.id, c.id], '-X5');
    expect([inst(st, a.id).tag, inst(st, b.id).tag, inst(st, c.id).tag]).toEqual(['X5:1', 'X5:2', 'X5:3']);
    // Un solo passo di annullamento
    st().undo();
    expect([inst(st, a.id).tag, inst(st, c.id).tag]).toEqual(['X1:1', 'XS1:3']);
  });

  it('una proprietà si mostra o si nasconde su tutti i simboli', async () => {
    const st = await store();
    const coil = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    const no = st().placeSymbol('no', { x: 80, y: 40 }, 0)!;
    const t = st().placeSymbol('terminal', { x: 120, y: 40 }, 0)!;
    st().updateElement(coil.id, { tag: 'K1' });
    st().updateElement(no.id, { tag: 'K1' });
    st().updateElement(t.id, { tag: 'X1:1' });
    st().setSymShowMany([coil.id, no.id, t.id], 'tag', false);
    // Bobina e contatto sono lo stesso dispositivo: la scelta sta su un solo elemento (la bobina)
    expect(inst(st, coil.id).show).toEqual({ tag: false });
    expect(inst(st, no.id).show).toBeUndefined();
    expect(inst(st, t.id).show).toEqual({ tag: false });
    st().setSymShowMany([no.id, t.id], 'tag', true);
    expect(inst(st, coil.id).show).toEqual({ tag: true });
    expect(inst(st, t.id).show).toEqual({ tag: true });
  });
});
