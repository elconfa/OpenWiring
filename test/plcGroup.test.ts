// Gruppi I/O PLC: più canali di una scheda in un solo simbolo
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { groupConfig, groupMembers } from '../src/model/plcGroup';
import { ioAssignments } from '../src/model/plc';
import { derive } from '../src/model/derive';
import { computeNetlist } from '../src/model/netlist';
import { copyElements, pasteElements } from '../src/model/clipboard';
import type { SymbolInstance } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.plc.cards = [];
  st().loadProject(p);
  return st;
}

describe('gruppi I/O PLC', () => {
  it('inserito crea la scheda e 8 canali consecutivi con pin, indirizzi e la sigla solo sul primo', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_di1', { x: 40, y: 40 }, 0)!;
    const page = st().project.pages[0];
    const gid = first.plcGroup!.id;
    const m = groupMembers(page, gid);
    expect(m.map(e => e.plcChannel)).toEqual(['DI0', 'DI1', 'DI2', 'DI3', 'DI4', 'DI5', 'DI6', 'DI7']);
    // Un canale ogni 40 mm: tra due canali c'è posto per 10 fili
    expect(m.map(e => e.x)).toEqual([40, 80, 120, 160, 200, 240, 280, 320]);
    expect(m.map(e => e.pinLabels[1])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(m.map(e => e.show?.tag)).toEqual([true, false, false, false, false, false, false, false]);
    // Selezionando un canale si seleziona tutto il gruppo
    st().setSelection([m[3].id]);
    expect(st().selection.length).toBe(8);
    // Per il resto del programma sono punti I/O: lista I/O con indirizzi e collegamenti "-xA1:3"
    const rows = ioAssignments(st().project).filter(r => r.inst);
    expect(rows.map(r => r.address).slice(0, 2)).toEqual(['I0.0', 'I0.1']);
    const d = derive(st().project).pages.get(page.id)!;
    expect(d.deviceFields.get(m[1].id)?.plcAddress).toBe('I0.1');
    expect(d.designations.get(m[1].id)).toBe('');
  });
  it('si cambiano primo canale, numero di canali, morsetti per canale e canali nascosti', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_di1', { x: 40, y: 40 }, 0)!;
    const gid = first.plcGroup!.id;
    const page = () => st().project.pages[0];
    st().updateInstance(groupMembers(page(), gid)[2].id, { plcSymbol: 'Finecorsa' });
    st().updatePlcGroup(gid, { count: 4, terms: 2 });
    let m = groupMembers(page(), gid);
    expect(m.map(e => e.symbolId)).toEqual(['plc_ch_di2', 'plc_ch_di2', 'plc_ch_di2', 'plc_ch_di2']);
    expect(m[1].pinLabels).toEqual({ 1: '3', 2: '4' });
    // I due morsetti dello stesso canale a 16 mm l'uno dall'altro
    const { getSymbol } = await import('../src/model/geometry');
    expect(getSymbol('plc_ch_di2')!.pins.map(p => p.x)).toEqual([0, 16]);
    expect(m[2].plcSymbol).toBe('Finecorsa');
    st().updatePlcGroup(gid, { first: 4, unused: [1] });
    m = groupMembers(page(), gid);
    expect(m.map(e => e.plcChannel)).toEqual(['DI4', 'DI6', 'DI7']);
    expect(m.map(e => e.x)).toEqual([40, 120, 160]);
    expect(groupConfig(page(), gid)).toMatchObject({ first: 4, count: 4, terms: 2, unused: [1] });
    // Il collegamento al pin usa il numero del pin della scheda
    const nl = computeNetlist(st().project);
    expect(nl.nets.flatMap(n => n.pins).find(p => p.el.inst.id === m[0].id)?.ref).toMatch(/:9$/);
  });
  it('copiato e incollato diventa un gruppo nuovo sui canali liberi successivi', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_do1', { x: 40, y: 40 }, 0)!;
    const p = st().project;
    const page = p.pages[0];
    const ids = groupMembers(page, first.plcGroup!.id).slice(0, 2).map(e => e.id);
    const before = page.elements.length;
    const r = pasteElements(p, page.id, copyElements(p, page, ids), 0, 60);
    const pasted = r.ids.map(id => page.elements.find(e => e.id === id) as SymbolInstance);
    expect(page.elements.length).toBe(before + 2);
    expect(new Set(pasted.map(e => e.plcGroup!.id)).size).toBe(1);
    expect(pasted[0].plcGroup!.id).not.toBe(first.plcGroup!.id);
    expect(pasted.every(e => e.plcChannel && !ids.includes(e.id))).toBe(true);
  });
});

describe('tipi di scheda', () => {
  it('safety 8 DI/DO e scheda bus: gli indirizzi seguono le schede precedenti, la scheda bus non ne occupa', async () => {
    const { newCard, channelAddress, assignStart } = await import('../src/model/plc');
    const p = emptyProject();
    p.plc.cards = [];
    const add = (typeId: string, tag: string) => { const c = newCard(p, typeId, tag); assignStart(p, c); p.plc.cards.push(c); return c; };
    const di16 = add('di16', '1A1'), bus = add('bus', '1A2'), fdi = add('fdi8', '1A3'), fdo = add('fdo8', '1A4');
    expect(channelAddress(di16, 'DI15', 'siemens-en')).toBe('I1.7');
    expect(bus.start).toEqual({});
    expect(channelAddress(fdi, 'DI0', 'siemens-en')).toBe('I2.0');
    expect(channelAddress(fdo, 'DO7', 'siemens-en')).toBe('Q0.7');
  });
  it('cambiando il tipo la scheda prende i canali del tipo (anche se era da articolo) e gli indirizzi si ricalcolano', async () => {
    const { useStore } = await import('../src/model/store');
    const { channelsOf, cardType } = await import('../src/model/plc');
    const st = useStore.getState;
    const p = emptyProject();
    p.plc.cards = [];
    st().loadProject(p);
    const a = st().addPlcCard('di16-do16');
    const b = st().addPlcCard('di8');
    expect(st().project.plc.cards.find(c => c.id === b.id)!.start.DI).toBe(2);
    // La prima scheda era ricavata da un articolo con 16 DI / 16 DO: si sceglie «8 DI»
    st().updatePlcCard(a.id, { custom: { name: 'Articolo', channels: { DI: 16, DO: 16 } } });
    st().updatePlcCard(a.id, { typeId: 'di8' });
    const ca = st().project.plc.cards.find(c => c.id === a.id)!;
    expect(cardType(ca).channels).toEqual({ DI: 8 });
    expect(channelsOf(ca).length).toBe(8);
    expect(st().project.plc.cards.find(c => c.id === b.id)!.start.DI).toBe(1);
  });
});
