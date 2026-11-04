// Cavi con marcatura a numeri o colori, tipologie (articoli cavo) e conduttori su più pagine
import { describe, it, expect } from 'vitest';
import { emptyProject, useStore } from '../src/model/store';
import type { Wire, Pt, CableLine, Part, Page } from '../src/model/types';
import { uid } from '../src/model/geometry';
import { cableInfos, conductorsFor, markingOf, remarkCable, cableFromPart, conductorColors } from '../src/model/cables';
import { partsToRows, partsFromRows } from '../src/model/partsSheet';

const W = (x: number): Wire => ({ kind: 'wire', id: uid('w'), points: [{ x, y: 20 }, { x, y: 80 }] as Pt[] });
const L = (cableId: string, x0: number, x1: number): CableLine => ({ kind: 'cable', id: uid('k'), cableId, points: [{ x: x0, y: 50 }, { x: x1, y: 50 }] });
const page = (name: string, n: number): Page => ({ id: uid('p'), name, type: 'multiline', elements: Array.from({ length: n }, (_, i) => W(40 + i * 8)) } as Page);

const COLORS_25 = ['WH', 'BN', 'GN', 'YE', 'GY', 'PK', 'BU', 'RD', 'BK', 'VT', 'GY-PK', 'RD-BU', 'WH-GN', 'BN-GN', 'WH-YE', 'YE-BN',
  'WH-GY', 'GY-BN', 'WH-PK', 'PK-BN', 'WH-BU', 'BN-BU', 'WH-RD', 'BN-RD', 'WH-BK'];

describe('tipologie e marcatura dei cavi', () => {
  it('numeri o colori, con o senza giallo-verde', () => {
    expect(conductorsFor(5, true, 'numbers')).toEqual(['1', '2', '3', '4', 'GNYE']);
    expect(conductorsFor(5, true, 'colors')).toEqual(['BN', 'BK', 'GY', 'BU', 'GNYE']);
    expect(conductorsFor(25, false, 'colors')).toEqual(COLORS_25);
    expect(conductorsFor(25, true, 'colors').slice(-2)).toEqual(['BN-RD', 'GNYE']);
    expect(markingOf({ conductors: ['1', '2', 'GNYE'] })).toBe('numbers');
    expect(markingOf({ conductors: ['BN', 'BU', 'GNYE'] })).toBe('colors');
  });
  it('cambiando marcatura i fili scelti a mano seguono la posizione del conduttore', () => {
    const c = { id: 'c', tag: 'W1', conductors: ['BN', 'BK', 'GY', 'BU', 'GNYE'], assign: { w1: 'GY', w2: 'GNYE' } };
    const r = remarkCable(c, 'numbers');
    expect(r.conductors).toEqual(['1', '2', '3', '4', 'GNYE']);
    expect(r.assign).toEqual({ w1: '3', w2: 'GNYE' });
  });
  it('colori dei riquadrini: codici IEC, nomi italiani, bicolori, numeri senza colore', () => {
    expect(conductorColors('BN')).toHaveLength(1);
    expect(conductorColors('nero')).toEqual(conductorColors('BK'));
    expect(conductorColors('WH-GN')).toHaveLength(2);
    expect(conductorColors('WHGN')).toHaveLength(2);
    expect(conductorColors('giallo-verde')).toEqual(conductorColors('GNYE'));
    expect(conductorColors('12')).toEqual([]);
  });
  it('un cavo da 25 su più pagine: 3 fili su una, 2 su un\'altra, tutti conduttori dello stesso cavo', () => {
    const p = emptyProject();
    const a = page('1', 3), b = page('2', 2);
    p.pages = [a, b];
    const part: Part = { partNr: 'LAPP 25x0,5', descr1: 'Cavo comando 25 colori', functionTemplates: [], attrs: {}, cable: { marking: 'colors', conductors: COLORS_25, cross: '0,5' } };
    p.parts = [part];
    p.cables = [{ id: 'c1', tag: 'W5', conductors: conductorsFor(4, true, 'colors'), assign: {} }];
    Object.assign(p.cables[0], cableFromPart(p.cables[0], part));
    a.elements.push(L('c1', 30, 70));
    b.elements.push(L('c1', 30, 70));
    const [ci] = cableInfos(p);
    expect(ci.cable.conductors).toHaveLength(25);
    expect(ci.cable.cross).toBe('0,5');
    expect(ci.conductors.map(k => `${k.pageName}:${k.name}`)).toEqual(['1:WH', '1:BN', '1:GN', '2:YE', '2:GY']);
    expect(ci.spare).toHaveLength(20);
    expect(ci.conductors.some(k => k.problem)).toBe(false);
  });
  it('nel pannello Cavi: tipo, marcatura e nome del conduttore su più cavi, un passo da annullare ciascuno', () => {
    const p = emptyProject();
    const a = page('1', 2);
    p.pages = [a];
    p.cables = [
      { id: 'c1', tag: 'W1', conductors: ['BN', 'BU', 'GNYE'], assign: {} },
      { id: 'c2', tag: 'W2', conductors: ['BN', 'BK', 'GY', 'BU', 'GNYE'], assign: {} },
    ];
    a.elements.push(L('c1', 30, 60));
    useStore.getState().loadProject(p);
    const st = useStore.getState;
    st().setCableMarking(['c1', 'c2'], 'numbers');
    expect(st().project.cables!.map(c => c.conductors.join(' '))).toEqual(['1 2 GNYE', '1 2 3 4 GNYE']);
    st().updateCables(['c1', 'c2'], { cross: '2,5', length: 12 });
    expect(st().project.cables!.every(c => c.cross === '2,5' && c.length === 12)).toBe(true);
    // Conduttore rinominato a mano: il filo assegnato a quel conduttore lo segue
    const wire = a.elements[0].id;
    st().assignConductor('c1', wire, '2');
    st().renameConductor('c1', 1, 'RD');
    expect(st().project.cables![0].conductors).toEqual(['1', 'RD', 'GNYE']);
    expect(st().project.cables![0].assign[wire]).toBe('RD');
    st().undo();
    expect(st().project.cables![0].conductors).toEqual(['1', '2', 'GNYE']);
  });
  it('articolo cavo in Excel: marcatura, conduttori, sezione e schermo vanno e tornano', () => {
    const part: Part = { partNr: 'C1', functionTemplates: [], attrs: {}, cable: { marking: 'colors', conductors: ['WH', 'BN', 'GNYE'], cross: '0,75', shield: true } };
    const rows = partsToRows([part]).map(r => r.map(v => (v === undefined ? '' : String(v))));
    const back = partsFromRows(rows, new Map());
    expect(back.parts[0].cable).toEqual(part.cable);
    // Conduttori svuotati: non è più un cavo
    const col = rows[0].findIndex(h => h.startsWith('Cavo: conduttori'));
    rows[1][col] = '';
    expect(partsFromRows(rows, new Map([['C1', part]])).parts[0].cable).toBeUndefined();
  });
});
