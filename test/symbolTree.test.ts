import { describe, it, expect } from 'vitest';
import { symbolTree, countOf, categoriesOf } from '../src/model/symbolTree';
import type { SymbolDef } from '../src/model/types';

const sym = (id: string, category: string) => ({ id, name: id, letter: '', role: 'single', category, prims: [], pins: [] }) as unknown as SymbolDef;

describe('albero dei simboli dalle cartelle', () => {
  it('le sottocartelle diventano sottogruppi', () => {
    const t = symbolTree([sym('a', 'Relè / Contattori'), sym('b', 'Relè'), sym('c', 'Motori'), sym('d', 'Relè / Contattori / Ausiliari')]);
    expect(t.map(n => n.name)).toEqual(['Motori', 'Relè']);
    const rele = t[1];
    expect(rele.items.map(x => x.id)).toEqual(['b']);
    expect(rele.children[0].path).toBe('Relè / Contattori');
    expect(rele.children[0].children[0].items[0].id).toBe('d');
    expect(countOf(rele)).toBe(3);
    expect(categoriesOf(rele)).toEqual(['Relè', 'Relè / Contattori', 'Relè / Contattori / Ausiliari']);
  });
});
