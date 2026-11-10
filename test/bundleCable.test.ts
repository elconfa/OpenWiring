// Bus fili usato come cavo tra due quadri: bus «W1112S1» = cavo -W1112S1, conduttori con i colori del
// cavo, dalla pagina di partenza a quella di arrivo
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { cableInfos, partConductors, repairPartCables } from '../src/model/cables';
import { computeNetlist } from '../src/model/netlist';
import { nameTapsInOrder, conductorChoices, bundleTaps } from '../src/model/bundles';
import { bundleReport } from '../src/model/reports';
import { bundleSheet, drawingItems, syncDrawingPages, BUS_ITEM } from '../src/model/drawings';
import type { Wire, Page, SymbolInstance, Project, CableLine, Part } from '../src/model/types';

const W = (id: string, pts: [number, number][], extra: Partial<Wire> = {}): Wire => ({ kind: 'wire', id, points: pts.map(([x, y]) => ({ x, y })), ...extra });
const S = (id: string, tag: string, x: number, y: number): SymbolInstance => ({ kind: 'symbol', id, symbolId: 'coil', tag, x, y, rot: 0, pinLabels: {} } as SymbolInstance);
const L = (id: string, a: [number, number], b: [number, number]): CableLine => ({ kind: 'cable', id, cableId: 'c1', points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] });

/** Pagina 100: K1, K2 entrano nel bus; pagina 200: escono verso K3, K4 */
function project(a: [string?, string?] = [], b: [string?, string?] = [], lineA: CableLine = L('la', [90, 130], [150, 130])): Project {
  const p = emptyProject();
  const tap = (n?: string, end: 'tapEnd' | 'tapStart' = 'tapEnd') => (n ? { [end]: n } : {});
  const pa: Page = { id: 'a', name: '100', title: '', type: 'multiline', elements: [
    S('k1', 'K1', 100, 100), S('k2', 'K2', 140, 100),
    W('a1', [[100, 116], [100, 150]], tap(a[0])), W('a2', [[140, 116], [140, 150]], tap(a[1])),
    W('ba', [[80, 150], [200, 150]], { bundle: 'W1112S1' }), lineA,
  ] };
  const pb: Page = { id: 'b', name: '200', title: '', type: 'multiline', elements: [
    S('k3', 'K3', 100, 100), S('k4', 'K4', 140, 100),
    W('bb', [[80, 50], [200, 50]], { bundle: 'W1112S1' }),
    W('b1', [[100, 50], [100, 100]], tap(b[0], 'tapStart')), W('b2', [[140, 50], [140, 100]], tap(b[1], 'tapStart')),
    L('lb', [90, 70], [150, 70]),
  ] };
  p.pages = [pa, pb];
  p.cables = [{ id: 'c1', tag: 'W1112S1', conductors: ['WH', 'BN', 'GN', 'YE'], assign: {} } as never];
  return p;
}
const conds = (p: Project) => cableInfos(p, computeNetlist(p))[0].conductors.map(c => `${c.wire.id}:${c.name}${c.problem ? '!' : ''}`);

describe('bus fili come cavo', () => {
  it('la linea del cavo che incrocia anche la linea spessa del bus conta solo i fili', () => {
    const p = project(['WH', 'BN'], ['WH', 'BN'], L('la', [90, 130], [190, 160]));
    expect(conds(p)).toEqual(['a1:WH', 'a2:BN']);
  });

  it('il conduttore del cavo è quello scritto nel bus, anche fuori ordine', () => {
    const p = project(['GN', 'WH'], ['GN', 'WH']);
    expect(conds(p)).toEqual(['a1:GN', 'a2:WH']);
    expect(cableInfos(p)[0].spare).toEqual(['BN', 'YE']);
  });

  it('i conduttori proposti sono quelli del cavo', () => {
    const p = project(['BN']);
    const { taps, groupOf } = bundleTaps(p);
    const choices = conductorChoices(p, taps, groupOf.get('ba')!, 'W1112S1');
    expect(choices.map(c => c.name)).toEqual(['WH', 'BN', 'GN', 'YE']);
    expect(choices.find(c => c.name === 'BN')?.count).toBe(1);
  });

  it('nomina in ordine: in partenza i conduttori liberi, in arrivo quelli che aspettano l\'uscita', () => {
    const p = project([undefined, undefined], [undefined, undefined]);
    expect(nameTapsInOrder(p, 'ba')).toBe(2);
    expect([(p.pages[0].elements[2] as Wire).tapEnd, (p.pages[0].elements[3] as Wire).tapEnd]).toEqual(['WH', 'BN']);
    expect(nameTapsInOrder(p, 'bb')).toBe(2);
    expect([(p.pages[1].elements[3] as Wire).tapStart, (p.pages[1].elements[4] as Wire).tapStart]).toEqual(['WH', 'BN']);
    const nl = computeNetlist(p);
    expect(nl.wireNet.get('a1')?.id).toBe(nl.wireNet.get('b1')?.id);
    expect(conds(p)).toEqual(['a1:WH', 'a2:BN']);
  });

  it('bus con l\'articolo di un cavo (senza cavo nel progetto): conduttori dell\'articolo in ordine', () => {
    const p = project([undefined, undefined], [undefined, undefined]);
    p.cables = [];
    (p.pages[0].elements[4] as Wire).bundlePart = 'CAVO-3';
    const parts = new Map([['CAVO-3', { partNr: 'CAVO-3', attrs: {}, cable: { marking: 'numbers', conductors: ['1', '2', '3'] } } as never]]);
    const { taps, groupOf } = bundleTaps(p);
    expect(conductorChoices(p, taps, groupOf.get('ba')!, 'W1112S1', parts).map(c => c.name)).toEqual(['1', '2', '3']);
    expect(nameTapsInOrder(p, 'ba', parts)).toBe(2);
    expect((p.pages[0].elements[3] as Wire).tapEnd).toBe('2');
    // Sulla pagina di arrivo (bus con lo stesso nome, senza articolo) valgono gli stessi conduttori
    const t2 = bundleTaps(p);
    expect(conductorChoices(p, t2.taps, t2.groupOf.get('bb')!, 'W1112S1', parts).find(c => c.name === '1')?.count).toBe(1);
  });

  it('articolo marcato «colori» con i conduttori scritti come numeri: si propongono i colori', () => {
    const p = project([undefined, undefined], [undefined, undefined]);
    p.cables = [];
    (p.pages[0].elements[4] as Wire).bundlePart = 'B08C24100';
    const nums = Array.from({ length: 24 }, (_, i) => String(i + 1));
    const parts = new Map([['B08C24100', { partNr: 'B08C24100', attrs: {}, cable: { marking: 'colors', conductors: nums } } as never]]);
    const { taps, groupOf } = bundleTaps(p);
    const names = conductorChoices(p, taps, groupOf.get('ba')!, 'W1112S1', parts).map(c => c.name);
    expect(names.slice(0, 4)).toEqual(['WH', 'BN', 'GN', 'YE']);
    expect(names).toHaveLength(24);
    expect(partConductors({ marking: 'numbers', conductors: nums })).toEqual(nums);
    const pe = partConductors({ marking: 'colors', conductors: ['1', '2', 'GNYE'] });
    expect(pe).toHaveLength(3);
    expect(pe.some(n => /^\d+$/.test(n))).toBe(false);
    expect(pe[2]).toBe('GNYE');
  });

  it('articoli cavo salvati coi numeri ma marcati «colori»: corretti nei dati, gli altri restano uguali', () => {
    const nums = Array.from({ length: 24 }, (_, i) => String(i + 1));
    const a = { partNr: 'B08C24100', attrs: {}, functionTemplates: [], cable: { marking: 'colors' as const, conductors: nums } };
    const b = { partNr: 'N', attrs: {}, functionTemplates: [], cable: { marking: 'numbers' as const, conductors: ['1', '2'] } };
    const c = { partNr: 'K', attrs: {}, functionTemplates: [] };
    const out = repairPartCables<Part>([a, b, c])!;
    expect(out[0].cable!.conductors.slice(0, 3)).toEqual(['WH', 'BN', 'GN']);
    expect(out[1]).toBe(b);
    expect(out[2]).toBe(c);
    expect(a.cable.conductors[0]).toBe('1');
    expect(repairPartCables(out)).toBeUndefined();
  });

  it('lista «Collegamenti bus fili»: un conduttore per riga nell\'ordine del cavo, liberi e senza uscita nelle note', () => {
    const p = project(['WH', 'GN'], ['WH']);
    const t = bundleReport(p);
    expect(t.rows.map(r => [r[1], r[4] ? 'n' : '', r[5], r[6]])).toEqual([
      ['WH', 'n', '100.3, 200.3', ''], ['BN', '', '', 'libero'], ['GN', 'n', '100.4', 'entra ma non esce'], ['YE', '', '', 'libero'],
    ]);
    expect(t.rows[0].slice(0, 4)).toEqual(['W1112S1', 'WH', '-K1:A2', '-K3:A1']);
    expect(t.rows[2].slice(2, 4)).toEqual(['-K2:A2', '']);
  });

  it('bus senza cavo: 1, 2, 3…', () => {
    const p = project();
    (p.pages[0].elements[4] as Wire).bundle = 'X';
    (p.pages[1].elements[2] as Wire).bundle = 'X';
    expect(nameTapsInOrder(p, 'ba')).toBe(2);
    expect((p.pages[0].elements[3] as Wire).tapEnd).toBe('2');
  });

  it('pagina «Cablaggio bus fili» per i bus con l\'articolo di un cavo: conduttori in ordine, da e a, liberi', () => {
    const p = project(['GN', 'WH'], ['GN']);
    p.cables = [];
    (p.pages[0].elements[4] as Wire).bundlePart = 'CAVO-4';
    const lib = [{ partNr: 'CAVO-4', typeNr: 'LIYY 4x0,25', attrs: {}, functionTemplates: [], cable: { marking: 'colors', conductors: ['WH', 'BN', 'GN', 'YE'], cross: '0,25' } } as Part];
    expect(drawingItems(p, 'cable', lib)).toEqual([BUS_ITEM + 'W1112S1']);
    const sh = bundleSheet(p, 'W1112S1', lib)!;
    expect(sh.bus).toBe(true);
    expect(sh.type).toBe('LIYY 4x0,25');
    expect(sh.rows.map(r => [r.name, r.problem ?? ''])).toEqual([['WH', 'entra ma non esce'], ['GN', '']]);
    expect([sh.rows[1].a, sh.rows[1].b].sort()).toEqual(['-K1:A2', '-K3:A1']);
    expect(sh.spare).toEqual(['BN', 'YE']);
    syncDrawingPages(p, 'cable', lib);
    expect(p.pages.find(pg => pg.type === 'cable')?.title).toBe('Cablaggio bus fili W1112S1');
    // Senza articolo, o con un cavo del progetto con lo stesso nome: nessuna pagina del bus
    expect(drawingItems(p, 'cable')).toEqual([]);
    p.cables = [{ id: 'c1', tag: 'W1112S1', conductors: ['WH', 'BN'], assign: {} } as never];
    expect(drawingItems(p, 'cable', lib)).toEqual(['W1112S1']);
  });
});
