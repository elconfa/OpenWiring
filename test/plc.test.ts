import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { exampleProject } from '../src/model/example';
import {
  channelAddress, ioAssignments, tiaTagRows, codesysGvl, newCard, reassignAddresses, allocateChannel,
  plcProblems, sanitizeSymbol, channelsOf, addressOverlaps,
} from '../src/model/plc';
import { bomReport } from '../src/model/reports';
import { writeXlsx } from '../src/io/xlsx';

const card = { id: 'c', tag: '1A1', typeId: 'cpu-14di-10do-2ai', station: 'PLC1', start: { DI: 0, DO: 0, AI: 64 } };

describe('indirizzi PLC', () => {
  it('formati Siemens inglese, tedesco e IEC', () => {
    expect(channelAddress(card, 'DI9', 'siemens-en')).toBe('I1.1');
    expect(channelAddress(card, 'DO3', 'siemens-en')).toBe('Q0.3');
    expect(channelAddress(card, 'AI1', 'siemens-en')).toBe('IW66');
    expect(channelAddress(card, 'DI9', 'siemens-de')).toBe('E1.1');
    expect(channelAddress(card, 'DO3', 'siemens-de')).toBe('A0.3');
    expect(channelAddress(card, 'AI0', 'siemens-de')).toBe('EW64');
    expect(channelAddress(card, 'DI9', 'iec')).toBe('%IX1.1');
    expect(channelAddress(card, 'DO3', 'iec')).toBe('%QX0.3');
    expect(channelAddress({ ...card, start: { AI: 0 } }, 'AI1', 'iec')).toBe('%IW1');
    expect(channelsOf(card).length).toBe(26);
  });
  it('le schede nuove prendono gli indirizzi liberi senza spostare le altre', () => {
    const p = exampleProject();
    const di = newCard(p, 'di16', 'A2');
    expect(di.start).toEqual({ DI: 2 });          // la CPU occupa I0.0–I1.5
    p.plc.cards.push(di);
    const ai = newCard(p, 'ai4', 'A3');
    expect(ai.start).toEqual({ AI: 68 });          // dopo IW64, IW66
    p.plc.cards.push(ai);
    expect(p.plc.cards[0].start).toEqual({ DI: 0, DO: 0, AI: 64 });
    // Riassegnazione in ordine di elenco
    p.plc.cards.reverse();
    reassignAddresses(p);
    expect(p.plc.cards.map(c => c.start)).toEqual([{ AI: 64 }, { DI: 0 }, { DI: 2, DO: 0, AI: 72 }]);
  });
  it('nuovo punto I/O: primo canale libero, poi una scheda nuova', () => {
    const p = exampleProject();
    const a = allocateChannel(p, 'DI', () => 'X');
    expect([a.card.tag, a.channel, a.created]).toEqual(['3A1', 'DI2', false]);
    const ao = allocateChannel(p, 'AO', l => `3${l}2`);
    expect([ao.card.tag, ao.card.typeId, ao.channel, ao.created]).toEqual(['3A2', 'ao2', 'AO0', true]);
  });
});

describe('lista I/O ed export', () => {
  const p = exampleProject();
  it('lista di assegnazione con dispositivo collegato e commento', () => {
    const used = ioAssignments(p, [], false);
    expect(used.map(r => [r.address, r.symbol, r.connected, r.comment])).toEqual([
      ['I0.0', 'Avvio_Automatico', '-3S1:14', 'Avvio ciclo automatico'],
      ['I0.1', 'Livello_Minimo', '-3B1:14', 'Livello minimo vasca'],
      ['Q0.0', 'Valvola_Scarico', '-3M1:1', 'Elettrovalvola di scarico'],
    ]);
    expect(ioAssignments(p).length).toBe(26);
    expect(ioAssignments(p).find(r => r.channel === 'DI0')?.location).toBe('3.2');
    expect(plcProblems(p)).toEqual([]);
  });
  it('tabella variabili TIA Portal (Excel)', () => {
    const rows = tiaTagRows(p);
    expect(rows[0].slice(0, 5)).toEqual(['Name', 'Path', 'Data Type', 'Logical Address', 'Comment']);
    expect(rows[1].slice(0, 4)).toEqual(['Avvio_Automatico', 'OpenWiring', 'Bool', '%I0.0']);
    const q = structuredClone(p);
    q.settings.plcAddressFormat = 'siemens-de';
    expect(tiaTagRows(q)[3][3]).toBe('%A0.0');
    const files = unzipSync(writeXlsx([{ name: 'PLC Tags', rows }]));
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="PLC Tags"');
    expect(strFromU8(files['xl/sharedStrings.xml'])).toContain('Avvio_Automatico');
  });
  it('lista variabili globali CODESYS', () => {
    const q = structuredClone(p);
    q.settings.plcAddressFormat = 'iec';
    const gvl = codesysGvl(q);
    expect(gvl).toContain('Avvio_Automatico AT %IX0.0 : BOOL; (* Avvio ciclo automatico - -3S1:14 *)');
    expect(gvl).toContain('Valvola_Scarico AT %QX0.0 : BOOL;');
    expect(gvl.startsWith('VAR_GLOBAL')).toBe(true);
  });
  it('controlli: canale doppio e nomi doppi', () => {
    const q = structuredClone(p);
    for (const e of q.pages[2].elements) if (e.kind === 'symbol' && e.plcChannel === 'DI1') { e.plcChannel = 'DI0'; e.plcSymbol = 'Avvio_Automatico'; }
    const probs = plcProblems(q);
    expect(probs.some(x => x.includes('usato due volte'))).toBe(true);
  });
  it('cambio formato: analogici da 64 in Siemens, dopo i digitali nella stessa area in IEC', async () => {
    const { useStore } = await import('../src/model/store');
    useStore.getState().loadProject(exampleProject());
    useStore.getState().updateSettings({ plcAddressFormat: 'iec' });
    const c = useStore.getState().project.plc.cards[0];
    // La CPU ha 14 DI (byte 0 e 1): %IW0 sarebbe sopra %IX0.0, gli analogici partono dal byte 2
    expect(c.start).toEqual({ DI: 0, DO: 0, AI: 2 });
    expect(channelAddress(c, 'AI0', 'iec')).toBe('%IW1');
    useStore.getState().updateSettings({ plcAddressFormat: 'siemens-de' });
    expect(channelAddress(useStore.getState().project.plc.cards[0], 'AI0', 'siemens-de')).toBe('EW64');
    useStore.getState().updateSettings({ plcAddressFormat: 'siemens-en' });
    expect(channelAddress(useStore.getState().project.plc.cards[0], 'AI0', 'siemens-en')).toBe('IW64');
  });
  it('IEC: digitali e analogici in fila nella stessa area, analogici a parola intera', () => {
    const p = exampleProject();
    p.settings.plcAddressFormat = 'iec';
    reassignAddresses(p);
    const di = newCard(p, 'di8', 'A2');
    expect(di.start).toEqual({ DI: 6 });           // dopo i 2 byte di DI e i 4 dei 2 AI della CPU
    p.plc.cards.push(di);
    const ai = newCard(p, 'ai4', 'A3');
    expect(ai.start).toEqual({ AI: 8 });           // byte 7 è dispari: si parte dall'8
    expect(channelAddress(ai, 'AI0', 'iec')).toBe('%IW4');
    p.plc.cards.push(ai);
    expect(addressOverlaps(p)).toEqual([]);
  });
  it('controllo degli indirizzi sovrapposti, anche tra digitali e analogici', () => {
    const p = exampleProject();
    p.settings.plcAddressFormat = 'iec';
    // Come nei progetti IEC fatti prima della correzione: DI e AI della CPU dal byte 0
    const cpu = p.plc.cards[0];
    cpu.start = { DI: 0, DO: 0, AI: 0 };
    expect(addressOverlaps(p)).toEqual([`Stazione ${cpu.station}: indirizzi sovrapposti tra -${cpu.tag} (DI %IB0…%IB1) e -${cpu.tag} (AI %IB0…%IB3): «Riassegna indirizzi» nella vista PLC li rimette in fila`]);
    p.plc.cards.push({ ...newCard(p, 'ai4', 'A3'), start: { AI: 0 } });
    expect(addressOverlaps(p)).toHaveLength(2);
    expect(addressOverlaps(p)[1]).toContain('-A3 (AI %IB0…%IB7)');
    reassignAddresses(p);
    expect(addressOverlaps(p)).toEqual([]);
    // Siemens: un DI dal byte 64 finisce sugli analogici
    p.settings.plcAddressFormat = 'siemens-en';
    reassignAddresses(p);
    expect(addressOverlaps(p)).toEqual([]);
    p.plc.cards.push({ ...newCard(p, 'di16', 'A4'), start: { DI: 64 } });
    expect(addressOverlaps(p)).toHaveLength(1);
    expect(addressOverlaps(p)[0]).toContain('-A4 (DI IB64…IB65)');
  });
  it('riassegnando, i master IO-Link tengono i loro byte', () => {
    const p = exampleProject();
    p.plc.cards.push(newCard(p, 'iol4', 'A5'));
    reassignAddresses(p);
    expect(p.plc.cards[1].start).toEqual({ DI: 2, DO: 2 });
    expect(addressOverlaps(p)).toEqual([]);
  });
  it('nomi simbolici validi', () => {
    expect(sanitizeSymbol('Velocità pompa 1')).toBe('Velocita_pompa_1');
    expect(sanitizeSymbol('3A1 DI0')).toBe('_3A1_DI0');
    expect(ioAssignments(p).find(r => r.channel === 'DI5')?.symbol).toBe('DI5_3A1');
  });
  it('la scheda compare in distinta se ha un codice di ordinazione', () => {
    const q = structuredClone(p);
    q.plc.cards[0].orderNr = 'CPU-1214';
    expect(bomReport(q).rows.some(r => r[6] === 'CPU-1214' && r[7] === '-3A1')).toBe(true);
  });
});

describe('PLC fase 2 e 3', () => {
  it('formato Omron: parole da 16 bit', () => {
    const c = { ...card, start: { DI: 0, DO: 100, AI: 2000 } };
    expect(channelAddress(c, 'DI0', 'omron')).toBe('0.00');
    expect(channelAddress(c, 'DI13', 'omron')).toBe('0.13');
    expect(channelAddress(c, 'DO9', 'omron')).toBe('100.09');
    expect(channelAddress(c, 'AI1', 'omron')).toBe('2001');
  });
  it('passando a Omron gli indirizzi vengono riassegnati nelle sue aree', async () => {
    const { useStore } = await import('../src/model/store');
    useStore.getState().loadProject(exampleProject());
    useStore.getState().updateSettings({ plcAddressFormat: 'omron' });
    expect(useStore.getState().project.plc.cards[0].start).toEqual({ DI: 0, DO: 100, AI: 2000 });
  });
  it('import della tabella variabili da TIA (Excel) con canali disegnati e non', async () => {
    const { readXlsx } = await import('../src/io/xlsx');
    const { parseTagTable, applyTagImport } = await import('../src/model/plc');
    // Simula un export TIA in tedesco con un canale non ancora disegnato
    const rows = [
      ['Name', 'Path', 'Data Type', 'Logical Address', 'Comment'],
      ['Start_Auto', 'Standard', 'Bool', '%E0.0', 'Avvio da HMI'],
      ['Pressostato', 'Standard', 'Bool', '%E0.5', 'Pressione minima'],
      ['Sconosciuta', 'Standard', 'Bool', '%E9.0', ''],
    ];
    const parsed = parseTagTable(readXlsx(writeXlsx([{ name: 'PLC Tags', rows }]))[0].rows);
    expect(parsed.length).toBe(3);
    const q = exampleProject();
    const res = applyTagImport(q, parsed);
    expect(res).toEqual({ placed: 1, unplaced: 1, notFound: ['Sconosciuta (%E9.0)'] });
    const list = ioAssignments(q);
    expect(list.find(r => r.channel === 'DI0')?.symbol).toBe('Start_Auto');
    expect(list.find(r => r.channel === 'DI5')?.symbol).toBe('Pressostato');
    expect(list.find(r => r.channel === 'DI5')?.comment).toBe('Pressione minima');
    // Disegnando il canale DI5 il nome importato compare da solo
    q.pages[2].elements.push({ kind: 'symbol', id: 'nuovo', symbolId: 'plc_di', x: 300, y: 72, rot: 0, tag: '3A1', pinLabels: {}, autoPins: true, plcChannel: 'DI5' });
    expect(ioAssignments(q, [], false).find(r => r.channel === 'DI5')?.inst?.id).toBe('nuovo');
  });
  it('import GVL CODESYS', async () => {
    const { parseGvl } = await import('../src/model/plc');
    const rows = parseGvl('VAR_GLOBAL\n\tMarcia AT %IX0.1 : BOOL; (* Marcia nastro *)\n\tVel AT %QW2 : INT; // velocità\nEND_VAR');
    expect(rows).toEqual([
      { name: 'Marcia', address: '%IX0.1', comment: 'Marcia nastro' },
      { name: 'Vel', address: '%QW2', comment: 'velocità' },
    ]);
  });
  it('pagina panoramica e rimando dal punto I/O', async () => {
    const { overviewData, overviewRefs } = await import('../src/model/plc');
    const q = exampleProject();
    const ov = q.pages.find(pg => pg.type === 'plc')!;
    expect(ov.name).toBe('4');
    const data = overviewData(q).get(ov.cardId!)!;
    expect(data.rows.length).toBe(26);
    expect(data.supply).toEqual(['3.9']);
    expect(overviewRefs(q).get('3A1')).toBe('4.2');
  });
  it('scheda da articolo EDZ: canali riconosciuti dal modello funzione', async () => {
    const { detectPartChannels, cardFromPart } = await import('../src/model/plc');
    const part = {
      partNr: 'SIE.6ES7 521', typeNr: 'DI 16x24VDC', functionTemplates: [
        ...Array.from({ length: 16 }, (_, i) => ({ pos: i + 1, description: 'Digital input', connections: [String(i + 2)] })),
        { pos: 17, description: 'Alimentazione', connections: ['L+'] },
      ], attrs: {},
    };
    const det = detectPartChannels(part);
    expect(det.channels).toEqual({ DI: 16 });
    const q = exampleProject();
    const c = cardFromPart(q, part, det.channels, '3A2');
    expect(c.start).toEqual({ DI: 2 });
    expect(c.custom?.terminals?.DI0).toBe('2');
    q.plc.cards.push(c);
    expect(ioAssignments(q).find(r => r.card.tag === '3A2' && r.channel === 'DI15')?.terminal).toBe('17');
  });
});

describe('PLC avanzato', async () => {
  const { newCard, iolinkRows, hardwareProblems, plcopenXml, nextSlot } = await import('../src/model/plc');
  const { exampleProject } = await import('../src/model/example');
  it('slot automatici, master IO-Link con indirizzi, controlli, PLCopen XML', () => {
    const p = exampleProject();
    expect(nextSlot(p, 'PLC1')).toBe(1); // la CPU dell'esempio non ha slot
    const di = newCard(p, 'di16', '3A2', 'PLC1'); p.plc.cards.push(di);
    expect(di.slot).toBe(1);
    const iol = newCard(p, 'iol4', '3A3', 'PLC1'); p.plc.cards.push(iol);
    expect(iol.slot).toBe(2);
    expect(iol.iolink).toHaveLength(4);
    iol.iolink![0].device = '3B5'; iol.iolink![0].inBytes = 2; iol.iolink![0].outBytes = 0;
    const rows = iolinkRows(p);
    // Dopo la CPU (DI byte 0-1) e la 16 DI (byte 2-3) gli ingressi IO-Link partono da IB4
    expect(rows[0]).toMatchObject({ port: 1, device: '3B5', inAddr: 'IB4…IB5', outAddr: '' });
    expect(rows[1].inAddr).toBe('IB6…IB9');
    di.slot = 2;
    expect(hardwareProblems(p)).toEqual(['Stazione PLC1: rack 0 slot 2 usato da -3A2 e -3A3']);
    p.plc.stations = [{ name: 'PLC1', ip: '192.168.0.1' }, { name: 'ET1', ip: '192.168.0.1' }];
    expect(hardwareProblems(p)[1]).toContain('Indirizzo IP "192.168.0.1"');
    const xml = plcopenXml(p);
    expect(xml).toContain('xmlns="http://www.plcopen.org/xml/tc6_0201"');
    expect(xml).toContain('<variable name="Avvio_Automatico" address="%IX0.0">');
    expect(xml).toContain('name="IOL_3A3_P1_3B5_IN" address="%IB4"');
    expect(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror')).toHaveLength(0);
  });
});

describe('blocchetti I/O con variabile', () => {
  it('indirizzo, variabile e commento nel riquadro; due morsetti P/M per canale', async () => {
    const { derive } = await import('../src/model/derive');
    const { effectivePinLabels } = await import('../src/model/devices');
    const p = exampleProject();
    const page = p.pages.find(pg => pg.elements.some(e => e.kind === 'symbol' && e.symbolId === 'plc_do'))!;
    page.elements.push(
      { kind: 'symbol', id: 'b1', symbolId: 'plc_do2_var', x: 200, y: 60, rot: 0, tag: '3A1', pinLabels: {}, autoPins: true, plcChannel: 'DO1', plcSymbol: 'Valvola_Sicurezza', plcComment: 'Elettrovalvola di sicurezza del circuito idraulico principale' },
      { kind: 'symbol', id: 'b2', symbolId: 'plc_di_var', x: 240, y: 72, rot: 0, tag: '3A1', pinLabels: {}, autoPins: true, plcChannel: 'DI5' },
    );
    const f = derive(p).pages.get(page.id)!.deviceFields;
    expect(f.get('b1')).toMatchObject({ plcAddress: 'Q0.1', plcSymbol: 'Valvola_Sicurezza' });
    // Il commento lungo si accorcia per stare nel riquadro
    expect(f.get('b1')!.plcComment).toMatch(/^Elettrovalvola di sicurez.*…$/);
    expect(f.get('b1')!.plcComment!.length).toBeLessThan(30);
    // Senza nome scritto resta quello predefinito
    expect(f.get('b2')).toMatchObject({ plcAddress: 'I0.5', plcSymbol: 'DI5_3A1' });
    expect(effectivePinLabels(p).get('b1')).toEqual({ '1': 'DO1.P', '2': 'DO1.M' });
    expect(effectivePinLabels(p).get('b2')).toEqual({ '1': 'DI5' });
  });
});
