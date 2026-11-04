// Interfacce di rete: porte dai fili di bus (anche senza nodo di rete), indirizzi, divisione, nomi Profinet
import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { netInterfaces, setNetInterface, splitNetInterface, mergeNetInterface, networkAddressRows, assignProfinetNames, profinetNameFor, profinetNameError, assignIps, ipPlan } from '../src/model/network';
import type { Project, SymbolInstance, Element } from '../src/model/types';
import { pinsWorld, getSymbol } from '../src/model/geometry';

const rows = (p: Project) => netInterfaces(p).map(i => `${i.tag} [${i.ports.map(x => x.port).join(',')}] ${i.protocols.join('+')} ip=${i.ip ?? ''} nome=${i.address ?? ''}`);

/** Un apparecchio del multifilare (senza nodo di rete) con le due porte collegate da fili di bus */
function withDrive(): Project {
  const p = exampleProject();
  const pg = p.pages[1];
  const inst: SymbolInstance = { kind: 'symbol', id: 'drv', symbolId: 'coil', x: 300, y: 200, rot: 0, tag: '9A1', pinLabels: {}, autoPins: true };
  pg.elements.push(inst);
  const [a, b] = pinsWorld(inst, getSymbol('coil')!);
  pg.elements.push({ kind: 'wire', id: 'b1', points: [{ x: a.x, y: a.y }, { x: a.x, y: a.y - 20 }], bus: 'Profinet' } as Element);
  pg.elements.push({ kind: 'wire', id: 'b2', points: [{ x: b.x, y: b.y }, { x: b.x, y: b.y + 20 }], bus: 'Modbus TCP' } as Element);
  return p;
}

describe('interfacce di rete', () => {
  it('le porte su IP sono una sola interfaccia, ogni bus non IP ha la sua', () => {
    const p = exampleProject();
    expect(rows(p)).toEqual([
      '3A1 [X1 P1] Profinet ip=192.168.0.1 nome=plc-master',
      '3A1 [X2 RS485] Modbus RTU ip= nome=',
      '5A1 [P1,P2,P3,P4,P5] Profinet ip=192.168.0.2 nome=',
      '5A2 [P1,P2] Profinet ip=192.168.0.10 nome=io-slave1',
      '5U1 [IN,OUT] Modbus RTU ip= nome=ID 1',
      '5R1 [] Modbus RTU ip= nome=',
    ]);
  });
  it('un apparecchio senza nodo di rete: le porte sono i pin toccati dai fili di bus', () => {
    const p = withDrive();
    expect(rows(p).filter(r => r.startsWith('9A1'))).toEqual(['9A1 [A1,A2] Profinet+Modbus TCP ip= nome=']);
    const r = networkAddressRows(p).find(x => x.tag === '9A1')!;
    expect(r.description).toBe('Bobina relè/contattore');
  });
  it('indirizzo di un\'interfaccia secondaria, separare e riunire le porte', () => {
    const p = exampleProject();
    const rtu = netInterfaces(p).find(i => i.tag === '3A1' && i.protocols.includes('Modbus RTU'))!;
    setNetInterface(rtu, { address: '5' });
    const el = (tag: string) => p.pages[4].elements.find(e => e.kind === 'symbol' && e.tag === tag) as SymbolInstance;
    expect(el('3A1').netIfs).toEqual([{ ports: ['X2 RS485'], address: '5' }]);
    expect(rows(p)[1]).toBe('3A1 [X2 RS485] Modbus RTU ip= nome=5');
    // 5A1: la porta P3 con un IP proprio
    splitNetInterface(netInterfaces(p).find(i => i.tag === '5A1')!, ['P3']);
    setNetInterface(netInterfaces(p).find(i => i.tag === '5A1' && i.ports.length === 1)!, { ip: '192.168.1.5' });
    expect(rows(p).filter(r => r.startsWith('5A1'))).toEqual(['5A1 [P1,P2,P4,P5] Profinet ip=192.168.0.2 nome=', '5A1 [P3]  ip=192.168.1.5 nome=']);
    expect(ipPlan(p).map(e => e.ip)).toContain('192.168.1.5');
    mergeNetInterface(netInterfaces(p).find(i => i.tag === '5A1' && i.slot.kind === 'def')!);
    expect(rows(p).filter(r => r.startsWith('5A1'))).toEqual(['5A1 [P1,P2,P3,P4,P5] Profinet ip=192.168.0.2 nome=']);
  });
  it('IP e nomi Profinet automatici; i nomi scritti restano', () => {
    const p = withDrive();
    expect(assignIps(p)).toBe(1);
    expect(netInterfaces(p).find(i => i.tag === '9A1')?.ip).toBe('192.168.0.11');
    expect(assignProfinetNames(p)).toBe(2);
    expect(netInterfaces(p).filter(i => i.protocols.includes('Profinet')).map(i => i.address)).toEqual(['q1-9a1', 'plc-master', 'q1-5a1', 'io-slave1']);
  });
  it('regole dei nomi Profinet', () => {
    expect(profinetNameFor('2A1')).toBe('pn-2a1');
    expect(profinetNameFor('A1.2', 'Q1.1')).toBe('q1-1-a1-2');
    expect(profinetNameError('io-slave1')).toBeUndefined();
    expect(profinetNameError('IO_Slave')).toMatch(/minuscole/);
    expect(profinetNameError('192.168.0.1')).toMatch(/indirizzo IP/);
    expect(profinetNameError('port-001')).toMatch(/port-xyz/);
  });
});
