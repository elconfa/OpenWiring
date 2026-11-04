// Schede PLC dai componenti dello schema, dispositivo → articolo, morsettiere a mano, ordinamento tabelle
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { Part, SymbolInstance } from '../src/model/types';
import { unlinkedPlcDevices, cardChannelMismatch, stationNames } from '../src/model/plc';
import { bomReport } from '../src/model/reports';
import { partsIndex } from '../src/model/devices';
import { sortRows, compareValues } from '../src/ui/grid';

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

const cpu: Part = {
  partNr: 'DEMO.CPU16', typeNr: 'CPU 16DI/8DO', descr1: 'CPU compatta', attrs: {}, functionTemplates: [
    ...Array.from({ length: 16 }, (_, i) => ({ pos: i + 1, description: 'Digital input', connections: [`I${i}`] })),
    ...Array.from({ length: 8 }, (_, i) => ({ pos: 17 + i, description: 'Digital output', connections: [`Q${i}`] })),
  ],
};

describe('schede PLC dai componenti dello schema', () => {
  it('una CPU inserita da un articolo diventa una scheda con la sua sigla e i canali dell\'articolo', async () => {
    const st = await store();
    st().addPartsToLibrary([cpu], 'test');
    const a = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    st().updateElement(a.id, { tag: 'A5' });
    st().assignPart([a.id], 'DEMO.CPU16');
    const list = unlinkedPlcDevices(st().project, st().library);
    expect(list.map(u => u.tag)).toEqual(['A5']);
    expect(list[0].channels).toEqual({ DI: 16, DO: 8 });
    st().addPlcCardFromPart('DEMO.CPU16', list[0].channels, 'A5', 'Stazione2');
    const card = st().project.plc.cards.find(c => c.tag === 'A5')!;
    expect(card.station).toBe('Stazione2');
    expect(unlinkedPlcDevices(st().project, st().library)).toEqual([]);
  });

  it('i punti I/O con una sigla senza scheda si collegano a una scheda esistente', async () => {
    const st = await store();
    const card = st().addPlcCard('di8', 'PLC1', 'A1');
    const di = st().placeSymbol('plc_di', { x: 40, y: 40 }, 0)!;
    expect(inst(st, di.id).tag).toBe('A1');
    st().updateElement(di.id, { tag: 'A9' });
    expect(unlinkedPlcDevices(st().project).map(u => u.tag)).toEqual(['A9']);
    st().linkToPlcCard('A9', card.tag);
    expect(inst(st, di.id).tag).toBe('A1');
    expect(unlinkedPlcDevices(st().project)).toEqual([]);
  });

  it('i componenti normali non vengono proposti', async () => {
    const st = await store();
    st().placeSymbol('coil', { x: 40, y: 40 }, 0);
    expect(unlinkedPlcDevices(st().project)).toEqual([]);
  });
});

describe('dispositivo → articolo', () => {
  it('crea l\'articolo con i dati del dispositivo e la descrizione, e apre la vista Articoli', async () => {
    const st = await store();
    const k = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    st().updateDevice(k.id, { description: 'Contattore pompa', manufacturer: 'DEMO', typeNr: 'CT-09', orderNr: 'CT09', techData: '24 V DC' });
    st().deviceToPart(k.id, 'DEM.CT-09');
    const part = st().library.find(p => p.partNr === 'DEM.CT-09')!;
    expect(part).toMatchObject({ manufacturer: 'DEMO', typeNr: 'CT-09', orderNr: 'CT09', descr2: '24 V DC', descr1: 'Contattore pompa' });
    expect(inst(st, k.id).partNr).toBe('DEM.CT-09');
    expect(inst(st, k.id).description).toBe('Contattore pompa');
    expect(st().view).toBe('parts');
    st().undo();
    expect(inst(st, k.id).partNr).toBeUndefined();
    expect(inst(st, k.id).manufacturer).toBe('DEMO');
  });
});

describe('morsettiera scritta a mano', () => {
  it('nasce con i morsetti di riserva', async () => {
    const { allStrips, stripRows } = await import('../src/model/terminals');
    const st = await store();
    st().addSpares('X7', 4);
    expect(allStrips(st().project)).toContain('X7');
    expect(stripRows(st().project, 'X7').map(r => r.no)).toEqual(['1', '2', '3', '4']);
  });
});

describe('ordinamento delle tabelle', () => {
  it('numeri nel testo in ordine naturale, celle vuote in fondo, a parità resta l\'ordine', () => {
    const rows = [{ t: 'K10', n: 1 }, { t: 'K2', n: 2 }, { t: '', n: 3 }, { t: 'K2', n: 4 }];
    expect(sortRows(rows, r => r.t, 1).map(r => r.n)).toEqual([2, 4, 1, 3]);
    expect(sortRows(rows, r => r.t, -1).map(r => r.n)).toEqual([1, 2, 4, 3]);
    expect(sortRows(rows, undefined, 1)).toBe(rows);
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues('x1:2', 'X1:10')).toBeLessThan(0);
  });
});

describe('scheda PLC collegata al dispositivo', () => {
  it('in distinta valgono articolo e dati del dispositivo, non quelli del tipo generico', async () => {
    const st = await store();
    st().addPartsToLibrary([cpu], 'test');
    const a = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    st().updateElement(a.id, { tag: 'A5' });
    st().assignPart([a.id], 'DEMO.CPU16');
    st().addPlcCard('cpu-8di-6do', 'PLC1', 'A5');
    const di = st().placeSymbol('plc_di', { x: 80, y: 40 }, 0)!;
    expect(inst(st, di.id).tag).toBe('A5');
    const rows = bomReport(st().project, st().library).rows;
    expect(rows.filter(r => r[7].includes('-A5'))).toHaveLength(1);
    expect(rows.find(r => r[7].includes('-A5'))?.[2]).toBe('DEMO.CPU16');
    // La scheda generica ha 8 DI / 6 DO, l'articolo 16 DI / 8 DO: avviso
    const card = st().project.plc.cards.find(c => c.tag === 'A5')!;
    expect(cardChannelMismatch(st().project, card, partsIndex(st().project, st().library))).toContain('16 DI');
  });

  it('una scheda senza dispositivo usa i propri dati', async () => {
    const st = await store();
    const c = st().addPlcCard('di8', 'PLC1', 'A2');
    st().updatePlcCard(c.id, { description: 'Ingressi pulsantiera', orderNr: 'DI8-24' });
    const row = bomReport(st().project).rows.find(r => r[7].includes('-A2'))!;
    expect(row[4]).toBe('Ingressi pulsantiera');
    expect(row[6]).toBe('DI8-24');
  });
});

describe('stazioni PLC', () => {
  it('si creano a parte, senza doppioni, e si eliminano solo se vuote', async () => {
    const st = await store();
    expect(st().addStation({ name: 'PLC1', kind: 'CPU locale' })).toBe(true);
    expect(st().addStation({ name: 'ET200', kind: 'Profinet', ip: '192.168.0.20' })).toBe(true);
    expect(st().addStation({ name: ' ET200 ' })).toBe(false);
    expect(stationNames(st().project)).toEqual(['PLC1', 'ET200']);
    // Una scheda nuova senza stazione indicata va nella prima
    const c = st().addPlcCard('di8');
    expect(c.station).toBe('PLC1');
    st().updatePlcCard(c.id, { station: 'ET200' });
    expect(stationNames(st().project)).toEqual(['ET200', 'PLC1']);
    // Rinominare con un nome già usato non unisce le stazioni
    st().updateStation('ET200', { name: 'PLC1' });
    expect(stationNames(st().project)).toEqual(['ET200', 'PLC1']);
    expect(st().deleteStation('ET200')).toBe(false);
    expect(st().deleteStation('PLC1')).toBe(true);
    expect(stationNames(st().project)).toEqual(['ET200']);
  });
});
