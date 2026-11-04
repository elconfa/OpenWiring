// Testi verticali nell'editor dei simboli, numeri filo allineati, testi formattati
import { describe, it, expect } from 'vitest';
import { rotateItems, turnRot } from '../src/model/symbolEdit';
import { alignWireLabels, labelsOnLine, type WireLabelPos } from '../src/model/wireLabels';
import { parseInline, layoutRich, lineText, plainText } from '../src/model/textRich';
import { textLines } from '../src/model/textFlow';
import { emptyProject } from '../src/model/project';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import type { SymbolDef } from '../src/model/types';

describe('testi verticali nell\'editor dei simboli', () => {
  it('R gira il testo sul suo punto: orizzontale, dall\'alto, capovolto, dal basso', () => {
    expect([undefined, 90, 180, -90].map(turnRot)).toEqual([90, 180, -90, undefined]);
    const sym: SymbolDef = { id: 'x', name: 'x', category: 'x', letter: 'X', role: 'single', pins: [],
      prims: [{ t: 'text', x: 3, y: 5, s: 'ABC' }], fields: [{ f: 'description', x: 7, y: 9 }] };
    const a = rotateItems(sym, [{ kind: 'prim', i: 0 }], 4);
    expect(a.prims[0]).toMatchObject({ x: 3, y: 5, rot: 90 });
    const b = rotateItems(sym, [{ kind: 'field', i: 0 }], 4);
    expect(b.fields![0]).toMatchObject({ x: 7, y: 9, rot: 90 });
  });
});

describe('numeri filo allineati', () => {
  const v = (id: string, x: number) => ({ id, points: [{ x, y: 20 }, { x, y: 120 }] });
  const wires = [v('a', 40), v('b', 60), v('c', 80)];
  const cur = new Map<string, WireLabelPos[]>([
    ['a', [{ x: 39.3, y: 50, vertical: true }]], ['b', [{ x: 59.3, y: 70, vertical: true }]], ['c', [{ x: 82.1, y: 90, vertical: true }]],
  ]);
  it('fili verticali: stessa altezza in alto, in basso o come il primo; lato a scelta', () => {
    const top = alignWireLabels(wires, cur, 'top');
    expect([...top.values()].map(l => l[0].y)).toEqual([50, 50, 50]);
    // Il lato non cambia
    expect(top.get('c')![0].x).toBeGreaterThan(80);
    expect([...alignWireLabels(wires, cur, 'bottom').values()].map(l => l[0].y)).toEqual([90, 90, 90]);
    expect([...alignWireLabels(wires, cur, 'row').values()].map(l => l[0].y)).toEqual([50, 50, 50]);
    // A sinistra: tutti i numeri a sinistra del loro filo, alla stessa altezza di prima
    const left = alignWireLabels(wires, cur, 'left');
    expect(left.get('c')![0]).toMatchObject({ y: 90 });
    expect(left.get('c')![0].x).toBeLessThan(80);
  });
  it('linea tracciata attraverso i fili: i numeri vanno all\'incrocio, dal loro lato', () => {
    const r = labelsOnLine(wires, cur, { x: 30, y: 100 }, { x: 70, y: 101 });
    // Solo a e b sono attraversati; la linea è resa orizzontale a y 100
    expect([...r.keys()]).toEqual(['a', 'b']);
    expect(r.get('a')![0]).toMatchObject({ y: 100, vertical: true });
    expect(r.get('a')![0].x).toBeLessThan(40);
  });
});

describe('testi formattati', () => {
  it('grassetto, corsivo e sottolineato', () => {
    expect(parseInline('a **b** *c* __d__')).toEqual([{ s: 'a ' }, { s: 'b', b: true }, { s: ' ' }, { s: 'c', i: true }, { s: ' ' }, { s: 'd', u: true }]);
    expect(plainText('**Nota**: *leggere*')).toBe('Nota: leggere');
  });
  it('a capo a mano, elenchi puntati e numerati con il rientro', () => {
    const l = layoutRich({ text: 'Avvertenze:\n- prima voce molto lunga che va a capo\n2. seconda', size: 2.5, w: 30 });
    // 30 mm con testo da 2,5 mm: 20 caratteri per riga
    expect(l.map(lineText)).toEqual(['Avvertenze:', '• prima voce molto', '  lunga che va a', '  capo', '2. seconda']);
    expect(textLines({ text: '**A**\nB', size: 3 })).toEqual(['A', 'B']);
  });
  it('gli a capo passano dal formato testo', () => {
    const p = emptyProject();
    p.pages[0].elements.push({ kind: 'text', id: 't', x: 10, y: 10, text: 'Riga 1\n- voce "x"', size: 3 });
    const q = emptyProject();
    importPagesText(q, pagesToText(p));
    expect(q.pages[0].elements.find(e => e.kind === 'text')).toMatchObject({ text: 'Riga 1\n- voce "x"' });
  });
});
