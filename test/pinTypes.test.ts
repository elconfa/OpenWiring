import { describe, expect, it } from 'vitest';
import { emptyProject } from '../src/model/store';
import { pinTypeProblems } from '../src/model/checks';
import type { PinDef, Project, SymbolDef } from '../src/model/types';

/** Simbolo con un punto in alto e uno in basso, del tipo indicato */
const sym = (id: string, pin: Partial<PinDef>): SymbolDef => ({
  id, name: id, category: 'x', letter: 'A', role: 'single', prims: [],
  pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '1', ...pin }, { id: '2', x: 0, y: 16, dir: 'down', label: '2', ...pin }],
});

/** Due simboli uno sotto l'altro collegati da un filo (bus o normale) tra il punto 2 del primo e il punto 1 del secondo */
function project(a: Partial<PinDef>, b: Partial<PinDef>, bus?: string): Project {
  const p = emptyProject();
  p.customSymbols.push(sym('a', a), sym('b', b));
  p.pages[0].elements.push(
    { kind: 'symbol', id: 's1', symbolId: 'a', x: 40, y: 40, rot: 0, tag: 'A1', pinLabels: {}, autoPins: true },
    { kind: 'symbol', id: 's2', symbolId: 'b', x: 40, y: 80, rot: 0, tag: 'A2', pinLabels: {}, autoPins: true },
    { kind: 'wire', id: 'w1', points: [{ x: 40, y: 56 }, { x: 40, y: 80 }], ...(bus ? { bus } : {}) },
  );
  return p;
}
const msgs = (p: Project) => pinTypeProblems(p).map(i => i.msg);

describe('tipi dei punti di connessione', () => {
  it('i punti generici dei simboli vecchi non si controllano', () => {
    expect(msgs(project({}, {}, 'Profinet'))).toEqual([]);
    expect(msgs(project({}, {}))).toEqual([]);
  });
  it('punto bus su un filo normale e punto per fili su un cavo bus', () => {
    expect(msgs(project({ medium: 'bus' }, { medium: 'wire' }))).toEqual(['-A1:2: punto per cavi bus collegato a un filo normale']);
    expect(msgs(project({ medium: 'bus' }, { medium: 'wire' }, 'Profinet'))).toEqual(['-A2:1: punto per fili collegato a un cavo bus']);
    expect(msgs(project({ medium: 'bus' }, { medium: 'bus' }, 'Profinet'))).toEqual([]);
  });
  it('due uscite collegate tra loro', () => {
    expect(msgs(project({ medium: 'wire', kind: 'out' }, { medium: 'wire', kind: 'out' }))).toEqual(['Uscite collegate tra loro sullo stesso conduttore: -A1:2, -A2:1']);
    expect(msgs(project({ medium: 'wire', kind: 'out' }, { medium: 'wire', kind: 'in' }))).toEqual([]);
  });
  it('conduttore con soli ingressi', () => {
    expect(msgs(project({ kind: 'in' }, { kind: 'in' }))).toEqual(['Conduttore con soli ingressi, nessuna uscita lo alimenta: -A1:2, -A2:1']);
    expect(msgs(project({ kind: 'in' }, {}))).toEqual([]);
  });
});
