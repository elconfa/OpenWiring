import { describe, it, expect } from 'vitest';
import { emptyProject, preferredSymbolId } from '../src/model/store';
import { importPagesText } from '../src/model/textFormat';
import { crossedWires } from '../src/model/cables';
import { planTerminalRow, applyTerminalRow } from '../src/model/terminalRow';
import { addSpares, nextToPlace, stripRows } from '../src/model/terminals';
import type { Project, Wire, SymbolDef } from '../src/model/types';

// Dispositivo con i pin 1…4 in basso (x 100…124, y 92) e un filo da ognuno fino a y 140
function project(): Project {
  const p = emptyProject();
  const r = importPagesText(p, `
simbolodef dev4 "Dispositivo" lettera=U pin="1:0,32 2:8,32 3:16,32 4:24,32"
pagina 1 "Prova"
  simbolo dev4 -1U1 @100,60
  filo 100,92 100,140
  filo 108,92 108,140
  filo 116,92 116,140
  filo 124,92 124,140
`);
  expect(r.errors).toEqual([]);
  return p;
}
const picksOf = (p: Project) => crossedWires(p.pages[0], { points: [{ x: 90, y: 110 }, { x: 130, y: 110 }] }).map(c => ({ wireId: c.wire.id, at: c.at }));

describe('morsetti in fila', () => {
  it('a coppie, per piano e a un piano', () => {
    const p = project(), picks = picksOf(p), pg = p.pages[0];
    expect(planTerminalRow(p, pg, picks, { strip: 'X1', levels: 2, mode: 'row' }).items.map(x => x.no)).toEqual(['1A', '1B', '2A', '2B']);
    expect(planTerminalRow(p, pg, picks, { strip: 'X1', levels: 2, mode: 'level' }).items.map(x => x.no)).toEqual(['1A', '2A', '1B', '2B']);
    expect(planTerminalRow(p, pg, picks, { strip: 'X1', levels: 1, mode: 'row', start: 5 }).items.map(x => x.no)).toEqual(['5', '6', '7', '8']);
  });
  it('secondo i pin: morsetto n = pin 2n−1 e 2n', () => {
    const p = project(), pg = p.pages[0];
    const picks = picksOf(p).reverse();
    expect(planTerminalRow(p, pg, picks, { strip: 'X1', levels: 2, mode: 'pin' }).items.map(x => x.no)).toEqual(['2B', '2A', '1B', '1A']);
  });
  it('inserisce i morsetti e interrompe i fili; i numeri già posati si saltano', () => {
    const p = project(), pg = p.pages[0];
    const picks = picksOf(p).filter((_, i) => i !== 2); // il terzo filo si salta
    const plan = planTerminalRow(p, pg, picks, { strip: 'X1', levels: 2, mode: 'row' });
    const r = applyTerminalRow(p, pg, plan.items, 'terminal', 'X1');
    expect(r.problems).toEqual([]);
    expect(r.nos).toEqual(['1A', '1B', '2A']);
    const t = pg.elements.filter(e => e.kind === 'symbol' && e.tag.startsWith('X1:'));
    expect(t.map(e => e.kind === 'symbol' && `${e.tag}@${e.x},${e.y}`)).toEqual(['X1:1A@100,108', 'X1:1B@108,108', 'X1:2A@124,108']);
    expect(pg.elements.filter((e): e is Wire => e.kind === 'wire' && e.points[0].x === 100).map(w => w.points.map(q => q.y).join('-')).sort()).toEqual(['116-140', '92-108']);
    const again = planTerminalRow(p, pg, picksOf(p), { strip: 'X1', levels: 2, mode: 'row' });
    expect(again.items[0].no).toBe('3A');
  });
});

describe('posa in sequenza', () => {
  it('dopo 1A propone 1B, poi 2A; mai un piano che non esiste', () => {
    const p = emptyProject();
    addSpares(p, 'X5', 3, undefined, undefined, 2);
    expect(nextToPlace(p, 'X5', '1A')).toBe('1B');
    expect(nextToPlace(p, 'X5', '1B')).toBe('2A');
    expect(nextToPlace(p, 'X5', '3B')).toBe('1A');
    const q = emptyProject();
    addSpares(q, 'X6', 1);
    q.terminalStrips!.X6.spares = [];
    expect(nextToPlace(q, 'X6', '3')).toBe('1');
    expect(stripRows(p, 'X5').length).toBe(6);
  });
});

describe('simbolo di base modificato', () => {
  it('si posa la copia personale', () => {
    const p = emptyProject();
    const copy = { id: 'user:abc', name: 'Morsetto', replaces: 'terminal' } as SymbolDef;
    expect(preferredSymbolId('terminal', [copy], p)).toBe('user:abc');
    expect(preferredSymbolId('terminal', [], p)).toBe('terminal');
    expect(preferredSymbolId('user:xyz', [copy], p)).toBe('user:xyz');
  });
});

describe('morsetto tolto dal filo', () => {
  it('il filo interrotto torna intero; con una giunzione resta com\'è', async () => {
    const { healWiresAtRemoved } = await import('../src/model/wireEdit');
    const p = project(), pg = p.pages[0];
    const plan = planTerminalRow(p, pg, picksOf(p), { strip: 'X1', levels: 1, mode: 'row' });
    applyTerminalRow(p, pg, plan.items, 'terminal', 'X1');
    const wires = () => pg.elements.filter((e): e is Wire => e.kind === 'wire' && e.points[0].x === 100);
    expect(wires().length).toBe(2);
    wires()[0].number = '5.01';
    // Giunzione a T sul pin di sotto del secondo morsetto: quel filo non si ricuce
    pg.elements.push({ kind: 'wire', id: 'wT', points: [{ x: 108, y: 116 }, { x: 112, y: 116 }] });
    const removed = pg.elements.filter(e => e.kind === 'symbol' && e.tag.startsWith('X1:'));
    pg.elements = pg.elements.filter(e => !removed.includes(e));
    expect(healWiresAtRemoved(p, pg, removed)).toBe(3);
    expect(wires().map(w => w.points.map(q => q.y).join('-'))).toEqual(['92-140']);
    expect(wires()[0].number).toBe('5.01');
    expect(pg.elements.filter(e => e.kind === 'wire' && e.points[0].x === 108).length).toBe(3);
  });
});
