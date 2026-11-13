// Conduttori di scorta: il filo resta disegnato e prende il conduttore del cavo, ma non ha numero
// filo, è segnato «scorta» e i morsetti a cui arriva contano come riserva
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Project, SymbolInstance, Wire, CableLine } from '../src/model/types';
import { computeNetlist } from '../src/model/netlist';
import { derive } from '../src/model/derive';
import { terminalConnections } from '../src/model/terminals';
import { terminalReport, cableConnectionReport } from '../src/model/reports';
import { cableSheet } from '../src/model/drawings';
import { pagesToText, importPagesText } from '../src/model/textFormat';

const T = (id: string, x: number, y: number, tag: string): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId: 'terminal', x, y, rot: 0, tag, pinLabels: {}, autoPins: true });
const W = (id: string, x: number, y0: number, y1: number, extra: Partial<Wire> = {}): Wire =>
  ({ kind: 'wire', id, points: [{ x, y: y0 }, { x, y: y1 }], ...extra });

/** Due conduttori del cavo -W1 tra -X1 e -X2: il primo usato, il secondo di scorta */
function project(): Project {
  const p = emptyProject();
  p.cables = [{ id: 'c1', tag: 'W1', conductors: ['BN', 'BK', 'GY'], assign: {} }] as unknown as Project['cables'];
  p.pages[0].elements = [
    T('a1', 60, 40, 'X1:1'), W('u', 60, 48, 100), T('b1', 60, 100, 'X2:1'),
    T('a2', 80, 40, 'X1:2'), W('s', 80, 48, 100, { spare: true }), T('b2', 80, 100, 'X2:2'),
    { kind: 'cable', id: 'l1', cableId: 'c1', points: [{ x: 50, y: 70 }, { x: 90, y: 70 }] } as CableLine,
  ];
  return p;
}

describe('conduttori di scorta', () => {
  it('senza numero filo, con la scritta «scorta» sullo schema', () => {
    const p = project();
    const nl = computeNetlist(p);
    expect(nl.wireNet.get('u')!.wireNo).not.toBe('');
    expect(nl.wireNet.get('s')).toMatchObject({ wireNo: '', spare: true });
    expect(derive(p).pages.get(p.pages[0].id)!.wireNumbers.get('s')).toBe('scorta');
  });
  it('i morsetti a cui arriva contano come riserva nelle liste', () => {
    const p = project();
    const c = terminalConnections(p);
    expect(c.find(x => x.row.no === '2' && x.row.strip === 'X1')?.spareWire).toBe(true);
    expect(c.find(x => x.row.no === '1' && x.row.strip === 'X1')?.spareWire).toBeUndefined();
    const t = terminalReport(p);
    const row = t.rows.find(r => r[0] === 'X2' && r[1] === '2')!;
    expect(row[3]).toBe('Riserva');
  });
  it('nel cavo prende il conduttore ed è evidenziato', () => {
    const p = project();
    const sh = cableSheet(p, 'W1')!;
    const r = sh.rows.find(x => x.spare)!;
    expect(r).toBeDefined();
    expect(r.wireNo).toBe('');
    expect(sh.spare).toEqual(['GY']);
    expect(cableConnectionReport(p).rows.some(x => x[7] === 'scorta')).toBe(true);
  });
  it('formato testo: scorta=si', () => {
    const p = project();
    const t = pagesToText(p);
    expect(t).toMatch(/filo .*scorta=si/);
    const q = emptyProject();
    expect(importPagesText(q, t).errors).toEqual([]);
    expect(q.pages[0].elements.some(e => e.kind === 'wire' && e.spare)).toBe(true);
  });
});
