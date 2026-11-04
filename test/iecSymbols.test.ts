// Simboli base IEC 60617 con lettere IEC 81346-2: griglia, identificativi, numerazione EN 50005
import { describe, it, expect } from 'vitest';
import { BUILTIN_SYMBOLS } from '../src/model/symbols';
import { emptyProject } from '../src/model/project';
import { effectivePinLabels } from '../src/model/devices';
import type { SymbolInstance } from '../src/model/types';

const inst = (id: string, symbolId: string, x: number, tag: string): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, x, y: 40, rot: 0, tag, pinLabels: {}, autoPins: true });

describe('simboli base', () => {
  it('identificativi unici e punti di connessione sulla griglia di 4 mm', () => {
    const ids = BUILTIN_SYMBOLS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Il contatto in scambio storico ha i contatti fissi a ±6 mm: cambiarlo staccherebbe i fili dei progetti esistenti
    for (const s of BUILTIN_SYMBOLS.filter(x => x.id !== 'co' && !x.hidden)) for (const p of s.pins) expect([s.id, Math.abs(p.x % 4), Math.abs(p.y % 4)]).toEqual([s.id, 0, 0]);
  });
  it('contatti temporizzati 5-6 / 7-8 e contatti del relè termico 95-96 / 97-98', () => {
    const p = emptyProject();
    p.pages[0].elements.push(inst('k', 'timer_on', 40, '1K1'), inst('a', 'no', 60, '1K1'), inst('b', 'no_ton', 80, '1K1'), inst('c', 'nc_toff', 100, '1K1'),
      inst('f', 'overload3', 120, '1F1'), inst('g', 'ol_nc', 160, '1F1'));
    const l = effectivePinLabels(p);
    expect(l.get('a')).toEqual({ 1: '13', 2: '14' });
    expect(l.get('b')).toEqual({ 1: '27', 2: '28' });
    expect(l.get('c')).toEqual({ 1: '35', 2: '36' });
    expect(l.get('g')).toEqual({ 1: '95', 2: '96' });
  });
});
