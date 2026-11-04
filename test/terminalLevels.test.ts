// Morsetti a più piani: un solo morsetto fisico, con un solo articolo
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { Part, SymbolInstance } from '../src/model/types';
import { physicalCount, stripRows, terminalConnections } from '../src/model/terminals';
import { bomReport, terminalReport } from '../src/model/reports';
import { checkProject } from '../src/model/checks';

const part = (partNr: string): Part => ({ partNr, descr1: 'Morsetto a 2 piani', manufacturer: 'WEIDMULLER', orderNr: partNr, functionTemplates: [], attrs: {} });

describe('morsetti a più piani', () => {
  it('l\'articolo dato a un piano vale per tutto il morsetto', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    useStore.setState({ library: [part('W.ZDK'), part('W.ZDU')] });
    const a = st().placeSymbol('terminal', { x: 40, y: 40 }, 0)!;
    const b = st().placeSymbol('terminal', { x: 48, y: 40 }, 0)!;
    const c = st().placeSymbol('terminal', { x: 56, y: 40 }, 0)!;
    st().updateElement(a.id, { tag: 'X1:1A' });
    st().updateElement(b.id, { tag: 'X1:1B' });
    st().updateElement(c.id, { tag: 'X1:2' });
    st().assignPart([a.id], 'W.ZDK');
    st().updateDevice(b.id, { description: 'Comune' });
    const p = st().project;
    const els = p.pages[0].elements as SymbolInstance[];
    expect(els.filter(e => e.tag.startsWith('X1:1')).map(e => e.partNr)).toEqual(['W.ZDK', 'W.ZDK']);
    expect(els.filter(e => e.tag.startsWith('X1:1')).map(e => e.description)).toEqual(['Comune', 'Comune']);
    expect(physicalCount(stripRows(p, 'X1'))).toBe(2);
    const conns = terminalConnections(p, 'X1');
    expect(conns.map(x => x.sameAs)).toEqual([undefined, '1A', undefined]);
    expect(conns[1].partNr).toBe('W.ZDK');
    expect(terminalReport(p).rows.map(r => r[10])).toEqual(['W.ZDK', '= 1A', '']);
    const row = bomReport(p).rows.find(r => r[2] === 'W.ZDK')!;
    expect(row[1]).toBe('1');
    expect(row[7]).toBe('-X1:1A/B');
    // Il terzo morsetto, a un piano, resta da solo
    st().assignPart([c.id], 'W.ZDU');
    expect((st().project.pages[0].elements as SymbolInstance[]).map(e => e.partNr)).toEqual(['W.ZDK', 'W.ZDK', 'W.ZDU']);
  });

  it('segnala piani dello stesso morsetto con articoli diversi', () => {
    const p = emptyProject();
    const T = (tag: string, x: number, partNr: string): SymbolInstance => ({ kind: 'symbol', id: tag, symbolId: 'terminal', x, y: 40, rot: 0, tag, pinLabels: {}, autoPins: true, partNr });
    p.pages[0].elements = [T('X1:1A', 40, 'W.ZDK'), T('X1:1B', 48, 'W.ZDU')];
    expect(checkProject(p).some(i => i.msg.includes('articoli diversi'))).toBe(true);
  });
});
