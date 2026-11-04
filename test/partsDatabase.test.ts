// Libreria articoli come database: i codici nuovi diventano articoli con i dati del dispositivo
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { extraPartsText, parseExtraParts } from '../src/model/devices';
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

describe('database articoli', () => {
  it('un codice nuovo diventa un articolo con i dati scritti sul dispositivo', async () => {
    const st = await store();
    const k = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    st().updateDevice(k.id, { manufacturer: 'Siemens', typeNr: '3RT2015-1BB41', orderNr: '3RT20151BB41', techData: '24 VDC', description: 'Marcia pompa' });
    st().assignPart([k.id], 'SIE.3RT2015-1BB41');
    const part = st().library.find(p => p.partNr === 'SIE.3RT2015-1BB41')!;
    expect(part).toMatchObject({ manufacturer: 'Siemens', typeNr: '3RT2015-1BB41', orderNr: '3RT20151BB41', descr2: '24 VDC' });
    expect(st().project.parts.some(p => p.partNr === part.partNr)).toBe(true);
    // Il dispositivo ora li prende dall'articolo; la descrizione (funzione) resta sua
    const k2 = inst(st, k.id);
    expect(k2.partNr).toBe(part.partNr);
    expect(k2.manufacturer).toBeUndefined();
    expect(k2.description).toBe('Marcia pompa');
    // Un solo passo di annullamento
    st().undo();
    expect(inst(st, k.id).partNr).toBeUndefined();
    expect(inst(st, k.id).manufacturer).toBe('Siemens');
  });

  it('nel progetto successivo il codice porta con sé i dati', async () => {
    const st = await store();
    const k = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    st().updateDevice(k.id, { manufacturer: 'ABB', typeNr: 'AF09' });
    st().assignPart([k.id], 'ABB.AF09');
    // Progetto nuovo, stessa libreria
    st().loadProject(emptyProject());
    const q = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    st().assignPart([q.id], 'ABB.AF09');
    expect(st().project.parts.find(p => p.partNr === 'ABB.AF09')).toMatchObject({ manufacturer: 'ABB', typeNr: 'AF09' });
  });

  it('descrizione e costruttore di un articolo aggiuntivo nuovo vanno in libreria', async () => {
    const st = await store();
    const q = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    st().setExtraParts(q.id, [{ partNr: '1SCA108', descr: 'Manopola rossa', manufacturer: 'ABB', qty: 2 }]);
    expect(st().library.find(p => p.partNr === '1SCA108')).toMatchObject({ descr1: 'Manopola rossa', manufacturer: 'ABB' });
    expect(inst(st, q.id).extraParts).toEqual([{ partNr: '1SCA108', qty: 2 }]);
    st().savePart('1SCA108', { manufacturer: undefined });
    expect(st().library.find(p => p.partNr === '1SCA108')!.manufacturer).toBeUndefined();
    expect(st().project.parts.find(p => p.partNr === '1SCA108')!.manufacturer).toBeUndefined();
  });

  it('articoli aggiuntivi come testo (elenco dispositivi ed Excel)', () => {
    const list = parseExtraParts('3KD9-1 ×2; 8UC7;ABC x3; D-X *4');
    expect(list).toEqual([{ partNr: '3KD9-1', qty: 2 }, { partNr: '8UC7' }, { partNr: 'ABC', qty: 3 }, { partNr: 'D-X', qty: 4 }]);
    expect(extraPartsText(list)).toBe('3KD9-1 ×2; 8UC7; ABC ×3; D-X ×4');
  });

  it('il contatto inserito non prende la sigla dell\'ultima bobina', async () => {
    const st = await store();
    const k = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    const c = st().placeSymbol('no', { x: 80, y: 40 }, 0)!;
    expect(c.tag).not.toBe(k.tag);
    // Scegliendo la bobina diventano un dispositivo solo
    st().mergeIntoDevice(c.id, k.tag);
    expect(inst(st, c.id).tag).toBe(k.tag);
  });
});
