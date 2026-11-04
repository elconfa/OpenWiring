import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { Project, SymbolDef, SymbolInstance } from '../src/model/types';
import { compareWithLibrary, applySymbolChoices, symbolPrint, isDeletedSymbol, deletedCategory, originalCategory, duplicateGroups, mergeSymbols } from '../src/model/symbolSync';

const sym = (id: string, x = 0, extra: Partial<SymbolDef> = {}): SymbolDef => ({
  id, name: `S ${id}`, category: 'Miei / Bobine', letter: 'K', role: 'single',
  prims: [{ t: 'line', x1: x, y1: 0, x2: x, y2: 8 }], pins: [{ id: '1', x: 0, y: 0, dir: 'up' }, { id: '2', x: 0, y: 8, dir: 'down' }], ...extra,
} as SymbolDef);

function projectWith(symbols: SymbolDef[]): Project {
  const p = emptyProject();
  p.customSymbols = structuredClone(symbols);
  const pg = p.pages[0];
  symbols.forEach((s, i) => pg.elements.push({ kind: 'symbol', id: `e${i}`, symbolId: s.id, x: i * 20, y: 0, rot: 0, tag: `K${i}`, pinLabels: {} } as SymbolInstance));
  return p;
}

describe('una sola libreria dei simboli', () => {
  it('l\'impronta non dipende da nome, cartella e ordine delle chiavi', () => {
    const a = sym('a');
    const b = { ...JSON.parse(JSON.stringify({ pins: a.pins, prims: a.prims, role: a.role, letter: a.letter })), id: 'b', name: 'Altro', category: 'X' } as SymbolDef;
    expect(symbolPrint(a)).toBe(symbolPrint(b));
    expect(symbolPrint(a)).not.toBe(symbolPrint(sym('a', 4)));
  });

  it('trova i simboli diversi e quelli solo nel progetto', () => {
    const p = projectWith([sym('a', 0), sym('b', 0), sym('c', 0), sym('bb:X', 0)]);
    const lib = [sym('a', 4), sym('b', 0)];
    const d = compareWithLibrary(p, lib);
    expect(d.map(x => `${x.kind}:${x.project.id}`)).toEqual(['changed:a', 'onlyProject:c']);
    expect(d[0].kind === 'changed' && d[0].pinsChanged).toBe(false);
    // Punti di connessione spostati: si avvisa
    const moved = sym('a', 0, { pins: [{ id: '1', x: 0, y: 0, dir: 'up' }, { id: '2', x: 0, y: 12, dir: 'down' }] } as Partial<SymbolDef>);
    const d2 = compareWithLibrary(p, [moved]);
    expect(d2[0].kind === 'changed' && d2[0].pinsChanged).toBe(true);
  });

  it('applica le scelte e ricorda quelle da non richiedere', () => {
    const p = projectWith([sym('a', 0), sym('b', 0), sym('c', 0), sym('d', 0)]);
    const lib = [sym('a', 4), sym('b', 4), sym('c', 4)];
    const d = compareWithLibrary(p, lib);
    const out = applySymbolChoices(p, d, { a: 'library', b: 'project', c: 'toLibrary', d: 'onlyProject' });
    expect(p.customSymbols.find(x => x.id === 'a')!.prims).toEqual(lib[0].prims);
    expect(p.customSymbols.find(x => x.id === 'b')!.prims).toEqual(sym('b', 0).prims);
    expect(out.map(x => x.id)).toEqual(['c']);
    expect(out[0].prims).toEqual(sym('c', 0).prims);
    // Alla prossima apertura non si chiede più nulla…
    const lib2 = [lib[0], lib[1], out[0]];
    expect(compareWithLibrary(p, lib2)).toEqual([]);
    // …finché il simbolo della libreria non cambia di nuovo
    expect(compareWithLibrary(p, [lib[0], sym('b', 8), out[0]]).map(x => x.project.id)).toEqual(['b']);
  });

  it('i simboli eliminati non si propongono e il percorso si ricorda', () => {
    expect(deletedCategory('Miei / Bobine')).toBe('Eliminare / Miei / Bobine');
    expect(isDeletedSymbol({ category: 'Eliminare / Miei' })).toBe(true);
    expect(isDeletedSymbol({ category: 'Eliminare' })).toBe(true);
    expect(isDeletedSymbol({ category: 'Eliminare bobine' })).toBe(false);
    expect(originalCategory('Eliminare / Miei / Bobine')).toBe('Miei / Bobine');
    const p = projectWith([sym('a', 0)]);
    expect(compareWithLibrary(p, [{ ...sym('a', 4), category: deletedCategory('Miei') }])).toEqual([]);
  });

  it('unifica i doppioni: i progetti passano al simbolo tenuto', () => {
    const lib = [sym('a', 0, { name: 'Bobina' }), sym('b', 0, { name: 'Bobina (2)' }), sym('c', 4, { name: 'Bobina' }), sym('d', 8, { name: 'Altro' })];
    const groups = duplicateGroups(lib);
    expect(groups.length).toBe(1);
    expect(groups[0].symbols.map(s => s.id).sort()).toEqual(['a', 'b', 'c']);
    expect(groups[0].identical).toBe(false);
    expect(duplicateGroups(lib.slice(0, 2))[0].identical).toBe(true);
    const { kept, removed } = mergeSymbols(lib[0], [lib[1]]);
    expect(kept.aliases).toEqual(['b']);
    expect(removed[0].category).toBe('Eliminare / Miei / Bobine');
    // Un progetto non aperto che usa «b» si collega da solo ad «a»
    const p = projectWith([sym('b', 0, { name: 'Bobina (2)' })]);
    const d = compareWithLibrary(p, [kept, ...removed, lib[2], lib[3]]);
    expect(d.map(x => x.kind)).toEqual(['relink']);
    applySymbolChoices(p, d, {});
    expect(p.pages[0].elements[0].kind === 'symbol' && p.pages[0].elements[0].symbolId).toBe('a');
    expect(p.customSymbols.map(s => s.id)).toEqual(['a']);
  });
});

describe('libreria personale: elimina, sposta, confronto all\'apertura', () => {
  it('un simbolo eliminato va in «Eliminare» e non si inserisce finché non si sposta', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    st().addSymbolsToLibrary([sym('x1', 0, { name: 'Mio' })], '');
    st().toggleFavorite('x1');
    st().deleteLibrarySymbols(['x1']);
    expect(st().symbolLibrary.find(s => s.id === 'x1')!.category).toBe('Eliminare / Miei / Bobine');
    expect(st().favorites).not.toContain('x1');
    st().setTool({ kind: 'place', symbolId: 'x1', rot: 0 });
    expect(st().tool.kind).not.toBe('place');
    expect(st().placeSymbol('x1', { x: 40, y: 40 }, 0)).toBeUndefined();
    st().moveLibrarySymbols(['x1'], 'Miei/Nuovi');
    expect(st().symbolLibrary.find(s => s.id === 'x1')!.category).toBe('Miei / Nuovi');
    expect(st().placeSymbol('x1', { x: 40, y: 40 }, 0)).toBeDefined();
  });

  it('applica le scelte al progetto aperto e porta in libreria', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().addSymbolsToLibrary([sym('y1', 4), sym('y2', 4)], '');
    st().loadProject(projectWith([sym('y1', 0), sym('y2', 0)]));
    const d = compareWithLibrary(st().project, st().symbolLibrary);
    st().applyLibrarySync(d, { y1: 'library', y2: 'toLibrary' });
    expect(st().project.customSymbols.find(s => s.id === 'y1')!.prims).toEqual(sym('y1', 4).prims);
    expect(st().symbolLibrary.find(s => s.id === 'y2')!.prims).toEqual(sym('y2', 0).prims);
    expect(compareWithLibrary(st().project, st().symbolLibrary)).toEqual([]);
  });

  it('unifica i doppioni anche nel progetto aperto', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().addSymbolsToLibrary([sym('z1', 0, { name: 'Doppio' }), sym('z2', 0, { name: 'Doppio' })], '');
    st().loadProject(projectWith([sym('z2', 0, { name: 'Doppio' })]));
    st().unifySymbols([{ keep: 'z1', others: ['z2'] }]);
    expect(st().project.pages[0].elements.some(e => e.kind === 'symbol' && e.symbolId === 'z1')).toBe(true);
    expect(st().symbolLibrary.find(s => s.id === 'z1')!.aliases).toEqual(['z2']);
    expect(isDeletedSymbol(st().symbolLibrary.find(s => s.id === 'z2'))).toBe(true);
  });
});
