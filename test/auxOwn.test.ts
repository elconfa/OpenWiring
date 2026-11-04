// Contatti ausiliari: descrizione propria, articolo e codici del dispositivo (dalla bobina)
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { buildDevices, deviceInfo, migrateAuxDescriptions } from '../src/model/devices';
import type { SymbolInstance } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.settings.autoConnect = false;
  st().loadProject(p);
  useStore.setState({ library: [] });
  return st;
}
type St = Awaited<ReturnType<typeof store>>;
const inst = (st: St, id: string) => st().project.pages[0].elements.find(e => e.id === id) as SymbolInstance;
const info = (st: St, tag: string) => { const d = buildDevices(st().project).get(tag)!; return deviceInfo(d.elements, d.main, new Map()); };

describe('contatti ausiliari', () => {
  it('la descrizione del contatto è sua e non cambia quella del dispositivo', async () => {
    const st = await store();
    const k = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    const c = st().placeSymbol('no', { x: 80, y: 40 }, 0)!;
    st().updateElement(c.id, { tag: k.tag });
    st().updateDevice(k.id, { description: 'Contattore pompa', orderNr: 'CT09' });
    st().updateElement(c.id, { description: 'Consenso pompa' });
    expect(info(st, k.tag).description).toBe('Contattore pompa');
    // Modificando il dispositivo dalla bobina la descrizione del contatto resta
    st().updateDevice(k.id, { description: 'Contattore pompa 1', manufacturer: 'DEMO' });
    expect(inst(st, c.id).description).toBe('Consenso pompa');
    expect(info(st, k.tag)).toMatchObject({ description: 'Contattore pompa 1', manufacturer: 'DEMO', orderNr: 'CT09' });
  });

  it('senza bobina il contatto porta i dati del dispositivo come prima', async () => {
    const st = await store();
    const a = st().placeSymbol('no', { x: 40, y: 40 }, 0)!;
    const b = st().placeSymbol('nc', { x: 80, y: 40 }, 0)!;
    st().updateElement(b.id, { tag: a.tag });
    st().updateDevice(a.id, { description: 'Finecorsa' });
    st().updateDevice(b.id, { description: 'Finecorsa porta' });
    expect(inst(st, a.id).description).toBeUndefined();
    expect(info(st, a.tag).description).toBe('Finecorsa porta');
  });

  it('nei progetti vecchi la descrizione scritta su un contatto passa alla bobina', async () => {
    const st = await store();
    const k = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    const c = st().placeSymbol('no', { x: 80, y: 40 }, 0)!;
    const p = structuredClone(st().project);
    for (const e of p.pages[0].elements) if (e.kind === 'symbol' && e.id === c.id) { e.tag = k.tag; e.description = 'Pompa'; }
    delete p.auxOwnDescription;
    migrateAuxDescriptions(p);
    const els = p.pages[0].elements as SymbolInstance[];
    expect(els.find(e => e.id === k.id)?.description).toBe('Pompa');
    expect(els.find(e => e.id === c.id)?.description).toBeUndefined();
    // Una volta sola
    for (const e of els) if (e.id === c.id) e.description = 'Consenso';
    migrateAuxDescriptions(p);
    expect(els.find(e => e.id === c.id)?.description).toBe('Consenso');
  });
});
