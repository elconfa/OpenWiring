// Pin di connettore con descrizioni proprie; copia e incolla delle proprietà di un dispositivo
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { SymbolInstance } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.settings.autoConnect = false;
  st().loadProject(p);
  useStore.setState({ library: [], propClipboard: null });
  return st;
}
type St = Awaited<ReturnType<typeof store>>;
const inst = (st: St, id: string) => st().project.pages[0].elements.find(e => e.id === id) as SymbolInstance;

describe('pin di connettore', () => {
  it('la descrizione di un pin non si toglie agli altri pin', async () => {
    const st = await store();
    const a = st().placeSymbol('conn_male', { x: 40, y: 40 }, 0)!;
    const b = st().placeSymbol('conn_male', { x: 80, y: 40 }, 0)!;
    st().updateElement(a.id, { tag: 'X5:1', description: 'Fase L1' });
    st().updateElement(b.id, { tag: 'X5:2', description: 'Fase L2' });
    // L'articolo vale per tutto il connettore
    st().updateDevice(b.id, { manufacturer: 'Harting', description: 'Fase L2 nuova' });
    expect(inst(st, a.id).description).toBe('Fase L1');
    expect(inst(st, b.id).description).toBe('Fase L2 nuova');
    expect(inst(st, b.id).manufacturer).toBe('Harting');
    st().updateDevice(a.id, { manufacturer: 'Phoenix', note: 'nota 1' });
    st().updateDevice(b.id, { note: 'nota 2' });
    expect(inst(st, a.id).note).toBe('nota 1');
    expect(inst(st, a.id).manufacturer).toBe('Phoenix');
    expect(inst(st, b.id).manufacturer).toBeUndefined();
    expect(inst(st, b.id).description).toBe('Fase L2 nuova');
  });
});

describe('copia e incolla proprietà', () => {
  it('copia tutti i dati tranne la sigla, sostituendo quelli del dispositivo di arrivo', async () => {
    const st = await store();
    const k1 = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    const c1 = st().placeSymbol('no', { x: 80, y: 40 }, 0)!;
    st().updateElement(c1.id, { tag: k1.tag });
    st().updateDevice(k1.id, { description: 'Marcia pompa', orderNr: '3RT2015', userProps: { 'Ditta.Commessa': 'C12' } });
    st().updateDevice(c1.id, { techData: '24 VDC' });
    const k2 = st().placeSymbol('coil', { x: 40, y: 120 }, 0)!;
    st().updateDevice(k2.id, { note: 'vecchia nota' });
    st().copyDeviceProps(c1.id);
    st().pasteDeviceProps([k2.id]);
    const n = inst(st, k2.id);
    expect(n.tag).not.toBe(k1.tag);
    expect(n).toMatchObject({ description: 'Marcia pompa', orderNr: '3RT2015', techData: '24 VDC', userProps: { 'Ditta.Commessa': 'C12' } });
    expect(n.note).toBeUndefined();
    // L'originale resta com'era; un passo solo di annullamento
    expect(inst(st, k1.id).description).toBe('Marcia pompa');
    st().undo();
    expect(inst(st, k2.id).description).toBeUndefined();
    expect(inst(st, k2.id).note).toBe('vecchia nota');
  });
});
