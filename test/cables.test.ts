import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { emptyProject } from '../src/model/store';
import type { Wire, Pt, CableLine } from '../src/model/types';
import { uid } from '../src/model/geometry';
import { cableInfos, defaultConductors, cableSection, newCable, crossedWires, conductorEnds, copyCableProps, pasteCableProps } from '../src/model/cables';
import { cableReport, cableConnectionReport, connectionReport, bomReport, purchaseReport } from '../src/model/reports';
import { checkProject } from '../src/model/checks';
import { derive } from '../src/model/derive';

const W = (...pts: [number, number][]): Wire => ({ kind: 'wire', id: uid('w'), points: pts.map(([x, y]): Pt => ({ x, y })) });
const L = (cableId: string, a: [number, number], b: [number, number]): CableLine => ({ kind: 'cable', id: uid('k'), cableId, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] });

describe('cavi', () => {
  it('conduttori standard', () => {
    expect(defaultConductors(5)).toEqual(['BN', 'BK', 'GY', 'BU', 'GNYE']);
    expect(defaultConductors(3)).toEqual(['BN', 'BU', 'GNYE']);
    expect(defaultConductors(7)).toEqual(['1', '2', '3', '4', '5', '6', 'GNYE']);
    expect(defaultConductors(4, false)).toEqual(['1', '2', '3', '4']);
    expect(cableSection({ id: '', tag: '', conductors: defaultConductors(5), cross: '2,5', assign: {} })).toBe('5G2,5');
  });
  it('il cavo del motore nell\'esempio assegna i conduttori ai fili attraversati', () => {
    const p = exampleProject();
    const [ci] = cableInfos(p);
    expect(ci.conductors.map(k => k.name)).toEqual(['BN', 'BK', 'GY', 'GNYE']);
    expect(conductorEnds(ci.conductors[0])).toEqual(['-X1:1', '-1M1:U1']);
    expect(ci.spare).toEqual([]);
    const lista = cableReport(p);
    expect(lista.rows[0].slice(0, 6)).toEqual(['-1W1', 'FG16OR16', '4G1,5', '4/4', '', '15']);
    const coll = cableConnectionReport(p);
    expect(coll.rows.map(r => r[1])).toEqual(['BN', 'BK', 'GY', 'GNYE']);
    expect(connectionReport(p).rows.some(r => r[9] === '-1W1:GNYE')).toBe(true);
    expect(checkProject(p).filter(i => i.kind === 'Cavi')).toEqual([]);
    const marks = derive(p).pages.get(p.pages[0].id)!.cableMarks!;
    expect([...marks.values()][0].label).toBe('-1W1');
  });
  it('il PE prende il giallo-verde, i manuali hanno la precedenza, i conduttori esauriti sono segnalati', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    const pe = W([40, 20], [40, 80]); pe.color = 'GNYE';
    pg.elements = [pe, W([48, 20], [48, 80]), W([56, 20], [56, 80]), W([64, 20], [64, 80])];
    const line = L('c1', [30, 50], [70, 50]);
    expect(crossedWires(pg, line).map(x => x.at.x)).toEqual([40, 48, 56, 64]);
    p.cables = [{ id: 'c1', tag: '1W1', conductors: ['1', '2', 'GNYE'], assign: { [(pg.elements[3] as Wire).id]: '1' } }];
    pg.elements.push(line);
    const names = cableInfos(p)[0].conductors.map(k => `${(k.wire.points[0].x)}:${k.name}${k.problem ? '!' : ''}`);
    expect(names).toEqual(['64:1', '40:GNYE', '48:2', '56:?!']);
    expect(checkProject(p).some(i => i.msg.includes('conduttori del cavo esauriti'))).toBe(true);
  });
  it('più conduttori dello stesso cavo sullo stesso potenziale restano distinti', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    // Due fili uniti in alto: stesso potenziale, due conduttori in parallelo
    const a = W([40, 20], [40, 80]), b = W([48, 20], [48, 80]);
    pg.elements = [a, b, W([40, 20], [48, 20]), W([56, 20], [56, 80])];
    p.cables = [{ id: 'c1', tag: '1W1', conductors: ['BN', 'BK', 'GY', 'GNYE'], assign: {} }];
    pg.elements.push(L('c1', [30, 50], [70, 50]));
    let ci = cableInfos(p)[0];
    expect(ci.conductors.map(k => k.name)).toEqual(['BN', 'BK', 'GY']);
    expect(ci.conductors[0].net!.id).toBe(ci.conductors[1].net!.id);
    // La seconda linea dello stesso cavo riprende gli stessi conduttori, nell'ordine
    pg.elements.push(L('c1', [30, 70], [70, 70]));
    ci = cableInfos(p)[0];
    expect(ci.conductors.map(k => k.name)).toEqual(['BN', 'BK', 'GY']);
    expect(ci.marks.filter(m => m.lineId !== ci.conductors[0].lineId).map(m => m.name)).toEqual(['BN', 'BK', 'GY']);
  });
  it('connettore integrato: il filo dal morsetto n prende il conduttore n', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    // Dispositivo con tre morsetti numerati 3, 1, 2 da sinistra a destra
    p.customSymbols = [{ id: 'user:dev', name: 'Dev', category: 'Prova', letter: 'S', role: 'single', prims: [], pins: [
      { id: 'a', x: 0, y: 0, dir: 'down', label: '3' }, { id: 'b', x: 8, y: 0, dir: 'down', label: '1' }, { id: 'c', x: 16, y: 0, dir: 'down', label: '2' }] }];
    pg.elements = [{ kind: 'symbol', id: 's1', symbolId: 'user:dev', x: 40, y: 20, rot: 0, tag: 'S1', pinLabels: {}, autoPins: true },
      W([40, 20], [40, 80]), W([48, 20], [48, 40]), W([48, 40], [48, 80]), W([56, 20], [56, 80]), L('c1', [30, 50], [70, 50])];
    p.cables = [{ id: 'c1', tag: '1W1', conductors: ['WH', 'BN', 'GN', 'YE'], assign: {}, pinsOf: 'S1' }];
    expect(cableInfos(p)[0].conductors.map(k => `${k.at.x}:${k.name}`)).toEqual(['40:GN', '48:WH', '56:BN']);
    expect(cableInfos(p)[0].spare).toEqual(['YE']);
    // Il conduttore scelto a mano resta
    p.cables[0].assign = { [(pg.elements[1] as Wire).id]: 'YE' };
    expect(cableInfos(p)[0].conductors.map(k => `${k.at.x}:${k.name}`)).toEqual(['40:YE', '48:WH', '56:BN']);
    // Non si copia con le proprietà del cavo
    expect(copyCableProps(p, 'c1')!.props).not.toHaveProperty('pinsOf');
  });
  it('copia e incolla delle proprietà del cavo, con i conduttori scelti a mano', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    const a = [W([40, 20], [40, 80]), W([48, 20], [48, 80])], b = [W([140, 20], [140, 80]), W([148, 20], [148, 80])];
    pg.elements = [...a, ...b, L('c1', [30, 50], [60, 50]), L('c2', [130, 50], [160, 50])];
    p.cables = [
      { id: 'c1', tag: '1W1', type: 'FG16OR16', cross: '2,5', length: 12, conductors: ['BN', 'BU', 'GNYE'], assign: { [a[0].id]: 'BU' } },
      { id: 'c2', tag: '2W1', conductors: ['1', '2'], assign: {} },
    ];
    const clip = copyCableProps(p, 'c1')!;
    pasteCableProps(p, 'c2', clip);
    const c2 = p.cables[1];
    expect(c2).toMatchObject({ id: 'c2', tag: '2W1', type: 'FG16OR16', cross: '2,5', length: 12, conductors: ['BN', 'BU', 'GNYE'] });
    expect(c2.assign).toEqual({ [b[0].id]: 'BU' });
    expect(cableInfos(p)[1].conductors.map(k => k.name)).toEqual(['BU', 'BN']);
  });
  it('un cavo nuovo propone i conduttori dai fili attraversati e aggiunge il giallo-verde', () => {
    const p = emptyProject();
    p.pages[0].elements = [W([40, 20], [40, 80]), W([48, 20], [48, 80]), W([56, 20], [56, 80])];
    const c = newCable(p, p.pages[0], { points: [{ x: 30, y: 50 }, { x: 70, y: 50 }] });
    expect(c.tag).toBe('1W1');
    expect(c.conductors).toEqual(['BN', 'BK', 'GY', 'GNYE']);
  });
  it('in distinta la quantità è la lunghezza', () => {
    const p = exampleProject();
    p.parts.push({ partNr: 'LAPP 0011001', typeNr: 'FG16OR16 4G1,5', functionTemplates: [], attrs: {} });
    p.cables![0].partNr = 'LAPP 0011001';
    expect(bomReport(p).rows.find(r => r[2] === 'LAPP 0011001')?.[1]).toBe('15');
  });
  it('i cavi confezionati si ordinano a pezzi', () => {
    const p = exampleProject();
    p.parts.push({ partNr: 'M12-5M', typeNr: 'M12 5 m', functionTemplates: [], attrs: {}, cable: { marking: 'colors', conductors: ['BN', 'WH', 'BU', 'BK'], pieces: true } });
    p.cables![0].partNr = 'M12-5M';
    expect(bomReport(p).rows.find(r => r[2] === 'M12-5M')?.[1]).toBe('1');
    expect(purchaseReport(p).rows.find(r => r[6] === 'M12-5M')?.slice(0, 2)).toEqual(['1', 'pz']);
    // Scelta sul cavo: a metri anche se l'articolo è a pezzi
    p.cables![0].pieces = false;
    expect(purchaseReport(p).rows.find(r => r[6] === 'M12-5M')?.slice(0, 2)).toEqual(['15', 'm']);
    // Senza articolo: per tipo e lunghezza
    delete p.cables![0].partNr; p.cables![0].pieces = true;
    expect(purchaseReport(p).rows.find(r => r[4].includes('confezionato'))?.slice(0, 2)).toEqual(['1', 'pz']);
  });
});
