import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Project, SymbolInstance, Part } from '../src/model/types';
import { uid } from '../src/model/geometry';
import {
  parseTerminalNo, compareTerminalNo, nextTerminal, nextLevel, stripRows, renumberStrip, renameStrip, addLevel,
  addJumper, removeFromJumpers, addSpares, removeSpares, ensureStrip, terminalBomItems, syncStripPages, stripSheets, allStrips,
} from '../src/model/terminals';
import { bomReport, terminalReport, connectionReport, terminalSequenceReport, manufacturerReport } from '../src/model/reports';
import { derive } from '../src/model/derive';

const T = (tag: string, x: number, y = 100, symbolId = 'terminal', extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id: uid('s'), symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });

function project(...tags: [string, number][]): Project {
  const p = emptyProject();
  p.pages[0].elements = tags.map(([t, x]) => T(t, x));
  return p;
}
const tags = (p: Project) => p.pages.flatMap(pg => pg.elements.map(e => (e.kind === 'symbol' ? e.tag : '')));

describe('numeri di morsetto', () => {
  it('separa numero e piano', () => {
    expect(parseTerminalNo('1A')).toEqual({ n: 1, base: '1', level: 'A' });
    expect(parseTerminalNo('12')).toEqual({ n: 12, base: '12', level: '' });
    expect(parseTerminalNo('PE').base).toBe('PE');
    expect(['10', '2', '1B', 'PE', '1A', '1'].sort(compareTerminalNo)).toEqual(['1', '1A', '1B', '2', '10', 'PE']);
  });
  it('morsettiere gerarchiche X1.1.2', () => {
    const p = project(['X1.1.2:1', 40], ['X1.1.2:2', 48], ['X1:5', 80]);
    expect(allStrips(p)).toEqual(['X1', 'X1.1.2']);
    expect(nextTerminal(p, 'X1.1.2')).toBe('X1.1.2:3');
    // Primo morsetto libero: X1 ha solo il 5, l'1 è libero
    expect(nextTerminal(p, 'X1')).toBe('X1:1');
    expect(nextTerminal(p, 'X9')).toBe('X9:1');
  });
  it('propone il primo morsetto libero, anche una riserva', () => {
    const p = project(['X1:1', 40], ['X1:2', 48], ['X1:4', 56]);
    expect(nextTerminal(p, 'X1')).toBe('X1:3');
    p.terminalStrips = { X1: { jumpers: [], separators: [], spares: ['3', '5'] } };
    expect(nextTerminal(p, 'X1')).toBe('X1:3');
    p.pages[0].elements.push({ ...(p.pages[0].elements[0] as SymbolInstance), id: 'n3', tag: 'X1:3' });
    expect(nextTerminal(p, 'X1')).toBe('X1:5');
    // Riserva di un piano: la propone con la lettera
    p.terminalStrips.X1.spares = ['5A', '5B'];
    expect(nextTerminal(p, 'X1')).toBe('X1:5A');
  });
  it('i piani contano come un solo morsetto', () => {
    const p = project(['X1:1A', 40], ['X1:1B', 48], ['X1:2', 56]);
    expect(nextTerminal(p, 'X1')).toBe('X1:3');
    expect(nextLevel(p, 'X1', '1')).toBe('C');
    expect(stripRows(p, 'X1').map(r => r.no)).toEqual(['1A', '1B', '2']);
  });
  it('aggiungere un piano trasforma 1 in 1A e propone 1B', () => {
    const p = project(['X1:1', 40], ['X1:2', 48]);
    ensureStrip(p, 'X1').separators.push('1');
    expect(addLevel(p, 'X1', '1')).toBe('X1:1B');
    expect(tags(p)).toEqual(['X1:1A', 'X1:2']);
    expect(p.terminalStrips!.X1.separators).toEqual(['1A']);
  });
});

describe('rinumerazione', () => {
  it('segue l\'ordine dello schema, tiene insieme i piani, lascia le riserve in coda', () => {
    const p = project(['X1:7', 40], ['X1:3A', 48], ['X1:3B', 200], ['X1:9', 56], ['X1:PE', 64]);
    ensureStrip(p, 'X1').spares.push('20');
    addJumper(p, 'X1', ['7', '9'], 'comb');
    expect(renumberStrip(p, 'X1')).toBe(5);
    expect(tags(p)).toEqual(['X1:1', 'X1:2A', 'X1:2B', 'X1:3', 'X1:PE']);
    expect(p.terminalStrips!.X1.spares).toEqual(['4']);
    expect(p.terminalStrips!.X1.jumpers[0].terminals).toEqual(['1', '3']);
  });
  it('rinomina la morsettiera con i suoi dati', () => {
    const p = project(['X1:1', 40], ['X1:2', 48], ['X2:1', 80]);
    addJumper(p, 'X1', ['1', '2'], 'fixed');
    renameStrip(p, 'X1', 'X1.1.2');
    expect(tags(p)).toEqual(['X1.1.2:1', 'X1.1.2:2', 'X2:1']);
    expect(p.terminalStrips!['X1.1.2'].jumpers).toHaveLength(1);
    expect(p.terminalStrips!.X1).toBeUndefined();
  });
});

describe('ponticelli e riserve', () => {
  it('unisce i ponticelli dello stesso tipo e li toglie', () => {
    const p = project(['X1:1', 40], ['X1:2', 48], ['X1:3', 56], ['X1:4', 64]);
    addJumper(p, 'X1', ['1', '2'], 'comb');
    addJumper(p, 'X1', ['2', '3'], 'comb');
    expect(p.terminalStrips!.X1.jumpers.map(j => j.terminals)).toEqual([['1', '2', '3']]);
    removeFromJumpers(p, 'X1', ['1', '2']);
    expect(p.terminalStrips!.X1.jumpers).toEqual([]);
  });
  it('le riserve prendono i numeri successivi e si possono togliere', () => {
    const p = project(['X1:1', 40], ['X1:2A', 48], ['X1:2B', 56]);
    expect(addSpares(p, 'X1', 2)).toEqual(['3', '4']);
    expect(stripRows(p, 'X1').filter(r => r.spare).map(r => r.no)).toEqual(['3', '4']);
    removeSpares(p, 'X1', ['3']);
    expect(p.terminalStrips!.X1.spares).toEqual(['4']);
  });
});

describe('liste e distinta', () => {
  const part = (partNr: string): Part => ({ partNr, typeNr: partNr, manufacturer: 'Weidmüller', functionTemplates: [], attrs: {} });
  const p = project(['X1:1', 40], ['X1:2A', 48], ['X1:2B', 56], ['X1:3', 64]);
  p.parts.push(part('WDU 2.5'), part('WDK 2.5'), part('WAP 2.5-10'), part('WEW 35/2'), part('WQV 2.5/3'));
  for (const e of p.pages[0].elements) if (e.kind === 'symbol' && e.tag.startsWith('X1:2')) e.partNr = 'WDK 2.5';
  Object.assign(ensureStrip(p, 'X1'), { partNr: 'WDU 2.5', endPlatePartNr: 'WAP 2.5-10', endStopPartNr: 'WEW 35/2', jumperPartNr: 'WQV 2.5/3' });
  addJumper(p, 'X1', ['1', '3'], 'comb');
  addSpares(p, 'X1', 1);

  it('un morsetto a due piani è un solo articolo, riserve e accessori compresi', () => {
    const qty = new Map(bomReport(p).rows.map(r => [r[2], r[1]]));
    expect(qty.get('WDK 2.5')).toBe('1');
    expect(qty.get('WDU 2.5')).toBe('3'); // 1, 3 e la riserva 4
    expect(qty.get('WAP 2.5-10')).toBe('1');
    expect(qty.get('WEW 35/2')).toBe('2');
    expect(qty.get('WQV 2.5/3')).toBe('1');
    expect(terminalBomItems(p).find(i => i.info.partNr === 'WDK 2.5')?.tag).toBe('-X1:2A/B');
  });
  it('quantità di fermi e piastre scelte e accessori liberi, in distinta e sullo schema della morsettiera', () => {
    const q = structuredClone(p);
    q.parts.push(part('TS 35'));
    Object.assign(q.terminalStrips!.X1, { endStopQty: 4, endPlateQty: 0, accessories: [{ id: 'a1', partNr: 'TS 35', qty: 1, note: '1 m' }] });
    const qty = new Map(bomReport(q).rows.map(r => [r[2], r[1]]));
    expect(qty.get('WEW 35/2')).toBe('4');
    expect(qty.has('WAP 2.5-10')).toBe(false);
    expect(qty.get('TS 35')).toBe('1');
    syncStripPages(q);
    const sheet = stripSheets(q).get(q.pages.find(x => x.type === 'strip')!.id)!;
    expect(sheet).toMatchObject({ endStopTop: true, endStopBottom: true, endPlate: false });
    expect(sheet.accessories).toEqual(['4 × WEW 35/2', '1 × TS 35 (1 m)']);
  });
  it('lista morsetti con piano, ponticello e riserva', () => {
    const t = terminalReport(p);
    expect(t.rows.map(r => r[1])).toEqual(['1', '2A', '2B', '3', '4']);
    expect(t.rows[1][2]).toBe('A');
    expect(t.rows[0][8]).toBe('Pettine 1-3');
    expect(t.rows[4][3]).toBe('Riserva');
  });
  it('sequenza morsetti: i pezzi sulla guida in ordine di montaggio', () => {
    const q = structuredClone(p);
    Object.assign(q.terminalStrips!.X1, { separators: ['2B'], separatorPartNr: 'WTW 2.5' });
    const kind = terminalReport(p).rows[0][3];
    const t = terminalSequenceReport(q);
    expect(t.rows.map(r => [r[1], r[2], r[3], r[4], r[5]])).toEqual([
      ['1', '', '', 'Fermo terminale', 'WEW 35/2'],
      ['2', '1', '', kind, 'WDU 2.5'],
      ['3', '2', 'A/B', kind, 'WDK 2.5'],
      ['4', '', '', 'Separatore', 'WTW 2.5'],
      ['5', '3', '', kind, 'WDU 2.5'],
      ['6', '4', '', 'Riserva', 'WDU 2.5'],
      ['7', '', '', 'Piastra di chiusura', 'WAP 2.5-10'],
      ['8', '', '', 'Fermo terminale', 'WEW 35/2'],
    ]);
    expect(t.rows[1][6]).toBe('Pettine 1-3');
    expect(t.breakKey).toBe('Morsettiera');
  });
  it('elenco costruttori e fornitori con articoli e pezzi', () => {
    const q = structuredClone(p);
    q.parts.find(x => x.partNr === 'WQV 2.5/3')!.supplier = 'Rexel';
    // Lo stesso costruttore scritto in maiuscolo conta insieme, con la grafia più usata
    q.parts.find(x => x.partNr === 'WAP 2.5-10')!.manufacturer = 'WEIDMÜLLER';
    expect(manufacturerReport(q).rows).toEqual([['Weidmüller', '', '4', '7', ''], ['Weidmüller', 'Rexel', '1', '1', '']]);
  });
  it('i ponticelli compaiono nella lista connessioni', () => {
    expect(connectionReport(p).rows.some(r => r[2] === 'Ponticello a pettine' && r[3] === '-X1:1' && r[5] === '-X1:3')).toBe(true);
  });
  it('genera le pagine dello schema morsettiera con i ponticelli', () => {
    const q = structuredClone(p);
    expect(syncStripPages(q)).toEqual({ added: 1, removed: 0 });
    const pg = q.pages.find(x => x.type === 'strip')!;
    expect(pg.title).toBe('Morsettiera -X1');
    const sheet = stripSheets(q).get(pg.id)!;
    expect(sheet.rows).toHaveLength(5);
    expect(sheet.jumpers[0].rows).toEqual([0, 3]);
    expect(derive(q).pages.get(pg.id)?.stripSheet?.strip).toBe('X1');
    // Una morsettiera eliminata toglie la sua pagina
    q.pages[0].elements = [];
    delete q.terminalStrips;
    expect(syncStripPages(q).removed).toBe(1);
  });
});

describe('morsetti su fili orizzontali', () => {
  it('la sigla della morsettiera va sul primo morsetto della fila verticale', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:1', 100, 40, 'terminal', { rot: 90 }), T('X1:2', 100, 48, 'terminal', { rot: 90 }), T('X1:3', 100, 56, 'terminal', { rot: 90 })];
    const d = derive(p).pages.get(p.pages[0].id)!;
    const first = p.pages[0].elements[0].id;
    expect([...d.stripLabel]).toEqual([first]);
  });
});

describe('nuova morsettiera a più piani', () => {
  it('10 morsetti a 2 piani: 1A…10A e 1B…10B, un morsetto fisico per numero', () => {
    const p = emptyProject();
    const added = addSpares(p, 'X5', 10, undefined, undefined, 2);
    expect(added.length).toBe(20);
    expect(added.slice(0, 2)).toEqual(['1A', '2A']);
    expect(added.slice(10, 12)).toEqual(['1B', '2B']);
    expect(new Set(stripRows(p, 'X5').map(r => r.base)).size).toBe(10);
  });
  it('3 piani salta i numeri già usati', () => {
    const p = project(['X6:1', 40]);
    const added = addSpares(p, 'X6', 2, undefined, undefined, 3);
    expect(added).toEqual(['2A', '3A', '2B', '3B', '2C', '3C']);
  });
});
