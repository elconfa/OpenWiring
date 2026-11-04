// Fase 5: formato degli indirizzi per stazione, TwinCAT (%I*) e ordine WAGO (prima gli analogici)
import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import type { Project, PlcCard } from '../src/model/types';
import { channelAddress, channelName, cardFormat, reassignAddresses, keepAnalogFirst, ioAssignments, codesysGvl, tiaTagRows, canExportGvl, canExportTia, newCard, applyTagImport } from '../src/model/plc';
import { computeNetlist } from '../src/model/netlist';

const card = (id: string, typeId: string, station: string): PlcCard => ({ id, tag: id, typeId, station, start: {} });

/** CPU Siemens (PLC1, formato del progetto) e un nodo WAGO in CODESYS (W1): di8, ai4, do8, ao2 */
function project(): Project {
  const p = exampleProject();
  p.plc.stations = [{ name: 'PLC1', kind: 'CPU locale' }, { name: 'W1', kind: 'Modbus TCP', format: 'iec' }];
  p.plc.cards.push(card('W1DI', 'di8', 'W1'), card('W1AI', 'ai4', 'W1'), card('W1DO', 'do8', 'W1'), card('W1AO', 'ao2', 'W1'));
  reassignAddresses(p);
  return p;
}
const addr = (p: Project, tag: string, ch: string) => { const c = p.plc.cards.find(x => x.tag === tag)!; return channelAddress(c, ch, cardFormat(p, c)); };

describe('stazioni PLC con formato proprio', () => {
  it('ogni stazione con il suo formato: Siemens per la CPU, IEC per il nodo', () => {
    const p = project();
    expect(addr(p, '3A1', 'DI0')).toBe('I0.0');
    expect(addr(p, 'W1DI', 'DI0')).toBe('%IX0.0');
    // IEC: digitali e analogici nella stessa area, le schede in fila
    expect(addr(p, 'W1AI', 'AI0')).toBe('%IW1');
    expect(addr(p, 'W1DO', 'DO0')).toBe('%QX0.0');
    expect(addr(p, 'W1AO', 'AO0')).toBe('%QW1');
  });
  it('prima gli analogici (WAGO): gli analogici di tutte le schede, poi i digitali', () => {
    const p = project();
    p.plc.stations![1].areaOrder = 'analog-first';
    reassignAddresses(p, s => s === 'W1');
    expect([addr(p, 'W1AI', 'AI0'), addr(p, 'W1DI', 'DI0'), addr(p, 'W1AO', 'AO1'), addr(p, 'W1DO', 'DO0')]).toEqual(['%IW0', '%IX8.0', '%QW1', '%QX4.0']);
    // Un modulo analogico aggiunto dopo: la stazione si rifà come fa il nodo
    const ai = newCard(p, 'ai4', 'W1AI2', 'W1');
    p.plc.cards.push(ai);
    expect(keepAnalogFirst(p)).toEqual(['W1']);
    expect([addr(p, 'W1AI2', 'AI0'), addr(p, 'W1DI', 'DI0')]).toEqual(['%IW4', '%IX16.0']);
    expect(keepAnalogFirst(p)).toEqual([]);
  });
  it('TwinCAT: AT %I* e nomi dei fili da scheda e canale', () => {
    const p = project();
    p.plc.stations![1].format = 'twincat';
    expect(addr(p, 'W1DI', 'DI3')).toBe('%I*');
    expect(addr(p, 'W1DO', 'DO0')).toBe('%Q*');
    const c = p.plc.cards.find(x => x.tag === 'W1DI')!;
    expect(channelName(c, 'DI3', 'twincat')).toBe('W1DI.DI3');
    // GVL solo con le stazioni IEC/TwinCAT, TIA solo con quelle Siemens
    p.plc.cards.find(x => x.tag === 'W1DI')!.io = { DI3: { symbol: 'Pressostato' } };
    expect(codesysGvl(p)).toContain('Pressostato AT %I* : BOOL;');
    expect(codesysGvl(p)).not.toMatch(/AT I0\.0/);
    expect(tiaTagRows(p).slice(1).every(r => !r[3].includes('*'))).toBe(true);
    expect([canExportGvl(p), canExportTia(p)]).toEqual([true, true]);
    // L'import per indirizzo non vale per TwinCAT (%I* è uguale per tutti)
    expect(applyTagImport(p, [{ name: 'X', address: '%I*' }]).notFound).toEqual(['X (%I*)']);
    expect(ioAssignments(p).find(r => r.card.tag === 'W1DI')?.address).toBe('%I*');
  });
  it('i fili collegati a un canale TwinCAT prendono il nome da scheda e canale', () => {
    const p = exampleProject();
    p.settings.wirePlcNames = true;
    p.plc.stations = [{ name: 'PLC1', format: 'twincat' }];
    const names = computeNetlist(p).nets.filter(n => n.plcNamed).map(n => n.wireNo);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every(n => /^3A1\.(DI|DO|AI|AO)\d+[AB]?$/.test(n!))).toBe(true);
  });
});
