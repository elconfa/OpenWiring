// Lettere delle sigle IEC 81346-2:2019 (DA_FARE 86): due lettere dalla funzione del simbolo
import { describe, it, expect } from 'vitest';
import { emptyProject, useStore } from '../src/model/store';
import { code2019, deviceLetter, CODES_2019 } from '../src/model/letterCodes';
import { BUILTIN_FUNCTIONS } from '../src/model/symbolFunctions';
import type { SymbolDef, SymbolInstance } from '../src/model/types';
import { getSymbol } from '../src/model/geometry';

const S = (name: string, letter: string, extra: Partial<SymbolDef> = {}): SymbolDef =>
  ({ id: name, name, category: '', letter, role: 'main', prims: [], pins: [], ...extra });

describe('lettere IEC 81346-2:2019', () => {
  it('ogni codice è di una funzione dell\'elenco', () => {
    const ids = new Set(BUILTIN_FUNCTIONS.map(f => f.id));
    expect(Object.keys(CODES_2019).filter(k => !ids.has(k))).toEqual([]);
  });
  it('due lettere dalla funzione, altrimenti dalla lettera singola', () => {
    expect(code2019(S('Contattore', 'K', { func: 'contattore' }))).toBe('QA');
    expect(code2019(S('Pulsante NA', 'S'))).toBe('SF');
    expect(code2019(S('Pressostato', 'B'))).toBe('BP');
    expect(code2019(S('Xyz-123', 'K'))).toBe('KF');
  });
  it('di serie la lettera singola, con l\'impostazione le due lettere', () => {
    const p = emptyProject();
    const coil = getSymbol('coil', p)!;
    expect(deviceLetter(coil, p)).toBe(coil.letter);
    p.settings = { ...p.settings, letterCodes: 'iec2019' };
    expect(deviceLetter(coil, p)).toBe('KF');
  });
  it('sigla nuova e conversione delle sigle già messe', () => {
    useStore.setState({ project: emptyProject() });
    const st = useStore.getState;
    st().setPage(st().project.pages[0].id);
    const a = st().placeSymbol('coil', { x: 40, y: 40 }, 0)!;
    expect(a.tag).not.toMatch(/KF/);
    st().updateSettings({ letterCodes: 'iec2019' });
    const b = st().placeSymbol('coil', { x: 120, y: 40 }, 0)!;
    expect(b.tag).toMatch(/KF\d+$/);
    st().renumber(true);
    const tags = st().project.pages[0].elements.filter((e): e is SymbolInstance => e.kind === 'symbol').map(e => e.tag);
    expect(tags.every(t => /KF\d+$/.test(t))).toBe(true);
    st().updateSettings({ letterCodes: undefined });
    st().renumber(true);
    const back = st().project.pages[0].elements.filter((e): e is SymbolInstance => e.kind === 'symbol').map(e => e.tag);
    expect(back.some(t => /KF/.test(t))).toBe(false);
  });
});
