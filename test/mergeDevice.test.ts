// Sigla di un dispositivo esistente data a un altro componente: unione con i rimandi
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { derive } from '../src/model/derive';
import { mergeTargets } from '../src/model/devices';
import { uid } from '../src/model/geometry';
import type { SymbolInstance } from '../src/model/types';

const S = (symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id: uid('s'), symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  const coil = S('coil', 60, 100, 'K1', { description: 'Marcia pompa', partNr: 'SIE.3RT2015' });
  const contact = S('no', 200, 100, 'K2', { description: 'Altro', note: 'nota del contatto' });
  const lamp = S('lamp', 260, 100, 'H1');
  const term = S('terminal', 300, 100, 'X1:1');
  p.pages[0].elements.push(coil, contact, lamp, term);
  st().loadProject(p);
  return { st, coil, contact, lamp, term };
}

describe('unione di componenti con la stessa sigla', () => {
  it('riconosce quando la sigla appartiene già a un altro dispositivo', async () => {
    const { st, coil, contact, term } = await store();
    const p = st().project;
    expect(mergeTargets(p, contact.id, '-K1').map(x => x.inst.id)).toEqual([coil.id]);
    expect(mergeTargets(p, contact.id, 'K9')).toEqual([]);
    expect(mergeTargets(p, coil.id, 'K1')).toEqual([]);
    // Morsetti, potenziali e rimandi non si uniscono così
    expect(mergeTargets(p, term.id, 'K1')).toEqual([]);
  });
  it('unisce il contatto alla bobina: rimandi e dati del dispositivo esistente', async () => {
    const { st, coil, contact } = await store();
    st().mergeIntoDevice(contact.id, '-K1');
    const els = st().project.pages[0].elements.filter((e): e is SymbolInstance => e.kind === 'symbol');
    const c = els.find(e => e.id === contact.id)!;
    expect(c.tag).toBe('K1');
    // La descrizione della bobina vale per tutti; la nota, che la bobina non ha, resta
    expect(c.description).toBeUndefined();
    expect(c.note).toBe('nota del contatto');
    const d = derive(st().project);
    const pg = d.pages.get(st().project.pages[0].id)!;
    expect(pg.xrefs.get(contact.id)?.mainId).toBe(coil.id);
    expect(pg.xrefs.get(coil.id)?.contacts?.map(x => x.id)).toContain(contact.id);
    // Un solo passo di annullamento
    st().undo();
    expect(st().project.pages[0].elements.find(e => e.id === contact.id)).toMatchObject({ tag: 'K2', description: 'Altro' });
  });
});
