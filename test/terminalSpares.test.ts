// Riserve con numero e articolo, articoli morsetto, eliminazione di un articolo usato nel progetto
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { Part, SymbolInstance } from '../src/model/types';
import { addSpares, stripRows, terminalConnections, freeTerminalNo } from '../src/model/terminals';
import { bomReport } from '../src/model/reports';
import { checkProject } from '../src/model/checks';
import { dropPartRefs } from '../src/model/store';

const T = (tag: string, x: number, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id: `${tag}-${x}`, symbolId: 'terminal', x, y: 40, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const part = (partNr: string, levels?: number): Part => ({ partNr, manufacturer: 'W', orderNr: partNr, functionTemplates: [], attrs: {}, ...(levels ? { terminal: { levels } } : {}) });

describe('morsetti di riserva', () => {
  it('riempiono i buchi della numerazione, poi vanno in coda', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:1', 40), T('X1:2', 48), T('X1:5', 56)];
    expect(freeTerminalNo(p, 'X1')).toBe('3');
    expect(addSpares(p, 'X1', 3)).toEqual(['3', '4', '6']);
    expect(stripRows(p, 'X1').map(r => `${r.no}${r.spare ? 'R' : ''}`)).toEqual(['1', '2', '3R', '4R', '5', '6R']);
  });
  it('numero scelto e articolo; il morsetto disegnato prende il posto della riserva', () => {
    const p = emptyProject();
    p.parts.push(part('W.ZDU', 1), part('W.PE', 1));
    p.pages[0].elements = [T('X1:1', 40), T('X1:2', 48)];
    p.terminalStrips = { X1: { partNr: 'W.ZDU', jumpers: [], spares: [], separators: [] } };
    expect(addSpares(p, 'X1', 2, '10', 'W.PE')).toEqual(['10', '11']);
    expect(addSpares(p, 'X1', 1, '10')).toEqual([]);
    const c = terminalConnections(p, 'X1');
    expect(c.find(x => x.row.no === '10')?.partNr).toBe('W.PE');
    expect(c.find(x => x.row.no === '11')?.partNr).toBe('W.PE');
    // Disegnato il morsetto 10: non è più una riserva e tiene l'articolo della riserva
    p.pages[0].elements.push(T('X1:10', 64));
    const r10 = stripRows(p, 'X1').find(r => r.no === '10')!;
    expect(r10.spare).toBe(false);
    expect(terminalConnections(p, 'X1').find(x => x.row.no === '10')?.partNr).toBe('W.PE');
    expect(bomReport(p).rows.find(r => r[2] === 'W.PE')?.[1]).toBe('2');
  });
  it('piano di riserva: il morsetto a un piano diventa nA', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:1', 40)];
    expect(addSpares(p, 'X1', 1, '1B')).toEqual(['1B']);
    expect(stripRows(p, 'X1').map(r => r.no)).toEqual(['1A', '1B']);
  });
});

describe('articoli dei morsetti', () => {
  it('avvisa se sono disegnati più piani di quelli dell\'articolo', () => {
    const p = emptyProject();
    p.parts.push(part('W.ZDU', 1));
    p.pages[0].elements = [T('X1:1A', 40, { partNr: 'W.ZDU' }), T('X1:1B', 48, { partNr: 'W.ZDU' })];
    expect(checkProject(p).some(i => i.msg.includes('2 piani'))).toBe(true);
  });
  it('eliminando un articolo dal progetto spariscono anche i riferimenti', () => {
    const p = emptyProject();
    p.parts.push(part('W.ZDU'));
    p.pages[0].elements = [T('X1:1', 40, { partNr: 'W.ZDU', extraParts: [{ partNr: 'W.ZDU', qty: 2 }, { partNr: 'ALTRO' }] })];
    p.terminalStrips = { X1: { partNr: 'W.ZDU', endPlatePartNr: 'W.ZDU', jumpers: [{ id: 'j', kind: 'fixed', terminals: ['1', '2'], partNr: 'W.ZDU' }], spares: ['2'], spareParts: { 2: 'W.ZDU' }, separators: [] } };
    const { parts: _p, ...rest } = p;
    dropPartRefs(rest, 'W.ZDU');
    expect(JSON.stringify(rest)).not.toContain('W.ZDU');
    expect((p.pages[0].elements[0] as SymbolInstance).extraParts).toEqual([{ partNr: 'ALTRO' }]);
    expect(p.terminalStrips.X1.jumpers[0].terminals).toEqual(['1', '2']);
  });
});
