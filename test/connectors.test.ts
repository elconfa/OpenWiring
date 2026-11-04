import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { SymbolInstance, Wire, Pt } from '../src/model/types';
import { uid } from '../src/model/geometry';
import { nextPin, connectorRows, pinCount, connectorProblems, allConnectors } from '../src/model/connectors';
import { bomReport, connectorReport, deviceReport } from '../src/model/reports';
import { renumberDevices } from '../src/model/numbering';

const S = (symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id: uid('s'), symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (...pts: [number, number][]): Wire => ({ kind: 'wire', id: uid('w'), points: pts.map(([x, y]): Pt => ({ x, y })) });

describe('connettori', () => {
  const p = emptyProject();
  p.parts.push({ partNr: 'HAN16', typeNr: 'Han 16E', functionTemplates: Array.from({ length: 16 }, (_, i) => ({ pos: i + 1, description: '', connections: [String(i + 1)] })), attrs: {} },
    { partNr: 'HAN16-M', typeNr: 'Han 16E maschio', functionTemplates: [], attrs: {} });
  p.pages[0].elements = [
    S('coil', 40, 40, '1K1'), S('conn_female', 40, 80, 'X10:1', { partNr: 'HAN16' }), S('conn_female', 48, 80, 'X10:2'), S('conn_female', 56, 80, 'X10:17'),
    W([40, 56], [40, 80]),
  ];
  p.connectors = { X10: { matingPartNr: 'HAN16-M', description: 'Connettore motore' } };
  it('numerazione, pin dall\'articolo, controlli', () => {
    expect(allConnectors(p)).toEqual(['X10']);
    expect(nextPin(p, 'X10')).toBe('X10:18');
    expect(pinCount(p, 'X10')).toBe(16);
    expect(connectorRows(p, 'X10').map(r => r.no)).toEqual(['1', '2', '17']);
    expect(connectorRows(p, 'X10')[0].sideA).toBe('-1K1:A2');
    expect(connectorProblems(p).map(x => x.msg)).toEqual(['-X10:17: il connettore ha 16 pin']);
  });
  it('il connettore è un solo dispositivo con il suo articolo e la controparte; la rinumerazione non lo tocca', () => {
    const bom = new Map(bomReport(p).rows.map(r => [r[2], r[1]]));
    expect(bom.get('HAN16')).toBe('1');
    expect(bom.get('HAN16-M')).toBe('1');
    expect(deviceReport(p).rows.map(r => r[0])).toContain('-X10');
    expect(connectorReport(p).rows[0].slice(0, 2)).toEqual(['-X10', '1']);
    const q = structuredClone(p);
    renumberDevices(q);
    expect(q.pages[0].elements.flatMap(e => (e.kind === 'symbol' ? [e.tag] : []))).toContain('X10:2');
  });
});
