// Connettori circolari M8 e M12 nel catalogo, tipo preso dall'articolo, articoli aggiuntivi dei cavi
// (anche di rete) in distinta, fili normali tra porte bus che diventano collegamenti di rete
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { PinDef, SymbolDef, SymbolInstance, Wire } from '../src/model/types';
import { CONNECTOR_TYPES, circLayout, connectorGroup, connectorShortName, connectorType, typePinNames } from '../src/model/connectorTypes';
import { connectorTypeOf, nextPin, pinCount, pinNames } from '../src/model/connectors';
import { connectorSheet } from '../src/model/drawings';
import { bomReport } from '../src/model/reports';
import { busCableRows, endsOnBusPins } from '../src/model/network';
import { pagesToText, importPagesText } from '../src/model/textFormat';

const S = (id: string, symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });

describe('catalogo M8 e M12', () => {
  it('codifiche A, B, D, X, L e M8', () => {
    const ids = CONNECTOR_TYPES.filter(t => t.shape === 'circ').map(t => t.id);
    expect(ids).toEqual(['m8-a-3', 'm8-a-4', 'm8-a-8', 'm12-a-3', 'm12-a-4', 'm12-a-5', 'm12-a-8', 'm12-a-12', 'm12-b-5', 'm12-d-4', 'm12-x-8', 'm12-l-5']);
    expect(typePinNames(connectorType('m12-a-3')!)).toEqual(['1', '3', '4']);
    expect(typePinNames(connectorType('m12-l-5')!)).toEqual(['1', '2', '3', '4', 'FE']);
    expect(connectorType('m12-d-4')!.info).toEqual(['YE · TD+', 'WH · RD+', 'OG · TD−', 'BU · RD−']);
    expect(connectorShortName(connectorType('m12-d-4')!)).toBe('M12 D 4p');
    expect(connectorGroup(connectorType('m12-x-8')!)).toBe('M12 codifica X');
    for (const t of CONNECTOR_TYPES.filter(x => x.shape === 'circ')) expect(t.info?.length, t.id).toBe(typePinNames(t).length);
  });
  it('faccia: il 3 poli lascia vuoto il posto del 2, il 5 poli ha il contatto centrale', () => {
    const three = circLayout(connectorType('m12-a-3')!);
    const four = circLayout(connectorType('m12-a-4')!);
    expect(three.map(p => p.name)).toEqual(['1', '3', '4']);
    expect(three[1]).toEqual({ ...four[2], name: '3' });
    const five = circLayout(connectorType('m12-a-5')!);
    expect(five[4]).toEqual({ name: '5', x: 0, y: 0 });
    expect(circLayout(connectorType('m12-l-5')!)[4].name).toBe('FE');
  });
});

describe('tipo del connettore dall\'articolo', () => {
  const p = emptyProject();
  p.parts.push({ partNr: 'M12D-F', typeNr: 'Presa M12 D', functionTemplates: [], attrs: {}, connectorType: 'm12-d-4' });
  p.pages[0].elements = [S('a', 'conn_female', 40, 80, 'X5:1', { partNr: 'M12D-F' }), S('b', 'conn_female', 48, 80, 'X5:2')];
  it('numero e nomi dei pin, prossimo pin, piedinatura con i colori', () => {
    expect(connectorTypeOf(p, 'X5')?.id).toBe('m12-d-4');
    expect(pinCount(p, 'X5')).toBe(4);
    expect(pinNames(p, 'X5')).toEqual(['1', '2', '3', '4']);
    expect(nextPin(p, 'X5')).toBe('X5:3');
    const sheet = connectorSheet(p, 'X5');
    expect(sheet.shape).toBe('circ');
    expect(sheet.circ).toHaveLength(4);
    expect(sheet.rows.map(r => r.info)).toEqual(['YE · TD+', 'WH · RD+']);
  });
  it('il tipo scelto nella vista Connettori vale più di quello dell\'articolo', () => {
    const q = structuredClone(p);
    q.connectors = { X5: { type: 'm12-a-5' } };
    expect(connectorTypeOf(q, 'X5')?.id).toBe('m12-a-5');
    expect(pinCount(q, 'X5')).toBe(5);
  });
});

/** Nodo con una porta bus in alto (0,0) */
const node = (id: string): SymbolDef => ({ id, name: id, category: 'x', letter: 'A', role: 'single', prims: [], pins: [{ id: 'P1', x: 0, y: 0, dir: 'up', label: 'P1', medium: 'bus' } as PinDef] });

describe('cavi: articoli aggiuntivi e collegamenti di rete', () => {
  it('articoli aggiuntivi di un cavo e di un cavo di rete in distinta, con la sigla del cavo', () => {
    const p = emptyProject();
    p.customSymbols.push(node('nodo'));
    p.parts.push({ partNr: 'RJ45-FC', typeNr: 'RJ45 da intestare', functionTemplates: [], attrs: {} });
    p.cables = [{ id: 'c1', tag: 'W1', conductors: ['1', '2'], assign: {}, extraParts: [{ partNr: 'PG9', qty: 2, descr: 'Pressacavo' }] }];
    p.pages[0].elements = [S('n1', 'nodo', 40, 40, 'A1'), S('n2', 'nodo', 120, 40, 'A2'),
      { kind: 'wire', id: 'w1', bus: 'Profinet', points: [{ x: 40, y: 40 }, { x: 120, y: 40 }], busCable: { tag: 'W2', extraParts: [{ partNr: 'RJ45-FC', qty: 2 }] } } as Wire];
    expect(busCableRows(p)[0].extraParts).toEqual([{ partNr: 'RJ45-FC', qty: 2 }]);
    const bom = new Map(bomReport(p).rows.map(r => [r[2] || r[6], r]));
    expect(bom.get('RJ45-FC')?.[1]).toBe('2');
    expect(bom.get('RJ45-FC')?.[7]).toBe('-W2');
    expect(bom.get('PG9')?.[1]).toBe('2');
    expect(bom.get('PG9')?.[7]).toBe('-W1');
  });
  it('filo normale tra due porte bus: riconosciuto; con un capo libero no', () => {
    const p = emptyProject();
    p.customSymbols.push(node('nodo'));
    p.pages[0].elements = [S('n1', 'nodo', 40, 40, 'A1'), S('n2', 'nodo', 120, 40, 'A2'), S('k', 'coil', 200, 40, 'K1')];
    expect(endsOnBusPins(p.pages[0], [{ x: 40, y: 40 }, { x: 80, y: 40 }, { x: 120, y: 40 }], p)).toBe(true);
    expect(endsOnBusPins(p.pages[0], [{ x: 40, y: 40 }, { x: 100, y: 40 }], p)).toBe(false);
  });
  it('formato testo: articoli aggiuntivi di cavi e cavi di rete', () => {
    const p = emptyProject();
    p.cables = [{ id: 'c1', tag: 'W1', conductors: ['1', '2'], assign: {}, extraParts: [{ partNr: 'PG9', qty: 2 }] }];
    p.pages[0].elements = [{ kind: 'wire', id: 'w1', bus: 'Profinet', points: [{ x: 40, y: 40 }, { x: 120, y: 40 }], busCable: { tag: 'W2', extraParts: [{ partNr: 'RJ45-FC', qty: 2 }] } } as Wire];
    const text = pagesToText(p);
    expect(text).toContain('articoli=');
    expect(text).toContain('articolicavo=');
    const q = emptyProject();
    const r = importPagesText(q, text);
    expect(r.errors).toEqual([]);
    expect(q.cables?.[0].extraParts).toEqual([{ partNr: 'PG9', qty: 2 }]);
    const w = q.pages[0].elements.find(e => e.kind === 'wire') as Wire;
    expect(w.busCable?.extraParts).toEqual([{ partNr: 'RJ45-FC', qty: 2 }]);
  });
});

import { GENERIC_CONNECTOR, isConnectorPart } from '../src/model/connectorTypes';

describe('articoli connettore e set di articoli', () => {
  it('connettore senza tipo del catalogo: è un connettore ma non dà pin', () => {
    expect(isConnectorPart({ connectorType: GENERIC_CONNECTOR })).toBe(true);
    expect(isConnectorPart({})).toBe(false);
    expect(connectorType(GENERIC_CONNECTOR)).toBeUndefined();
  });
  it('set: in distinta i componenti con le quantità, sul cavo e sul dispositivo', () => {
    const p = emptyProject();
    p.parts.push(
      { partNr: 'M12-KIT', typeNr: 'Connettore M12 completo', functionTemplates: [], attrs: {}, connectorType: 'm12-d-4', kit: [{ partNr: 'M12-FRUTTO' }, { partNr: 'M12-CUST' }, { partNr: 'PG7', qty: 2 }, { partNr: 'M12-KIT' }] },
      { partNr: 'M12-FRUTTO', typeNr: 'Frutto maschio', functionTemplates: [], attrs: {} },
      { partNr: 'M12-CUST', typeNr: 'Custodia', functionTemplates: [], attrs: {} },
      { partNr: 'PG7', typeNr: 'Pressacavo', functionTemplates: [], attrs: {} },
    );
    p.cables = [{ id: 'c1', tag: 'W1', conductors: ['1', '2'], assign: {}, extraParts: [{ partNr: 'M12-KIT', qty: 2 }] }];
    p.pages[0].elements = [S('x', 'conn_male', 40, 80, 'X7:1', { partNr: 'M12-KIT' })];
    const bom = new Map(bomReport(p).rows.map(r => [r[2], r]));
    expect(bom.has('M12-KIT')).toBe(false);
    expect(bom.get('M12-FRUTTO')?.[1]).toBe('3');
    expect(bom.get('M12-CUST')?.[1]).toBe('3');
    expect(bom.get('PG7')?.[1]).toBe('6');
    expect(bom.get('PG7')?.[7]).toBe('-X7, -W1');
  });
});
