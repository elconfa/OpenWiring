// Dati utente da un'installazione all'altra: niente perso, unione con i dati presenti
import { describe, it, expect } from 'vitest';
import { makeUserData, parseUserData, mergeUserData, userDataConflicts } from '../src/model/userData';
import type { Part } from '../src/model/types';

const part = (partNr: string, extra: Partial<Part> = {}): Part => ({ partNr, functionTemplates: [], attrs: {}, ...extra });
const empty = { library: [], symbols: [], macros: [], templates: [], titleBlocks: [], favorites: [] };

describe('dati utente', () => {
  it('il file conserva tutto (simbolo, immagine, prezzo, proprietà utente, dati CSV)', () => {
    const p = part('DEMO.CT-09', { symbolId: 'user:ct', picture: 'data:image/png;base64,AAA', price: 12.5, productGroup: 'Contattori', attrs: { 'Ditta.Fornitore': 'Rossi', 'Datasheet': 'https://x' } });
    const text = JSON.stringify(makeUserData({ ...empty, library: [p], favorites: ['coil'] }));
    const r = parseUserData(text);
    expect(r.error).toBeUndefined();
    expect(r.data!.library[0]).toEqual(p);
    expect(r.data!.favorites).toEqual(['coil']);
  });

  it('rifiuta file che non sono dati utente', () => {
    expect(parseUserData('{"format":"altro"}').error).toBeTruthy();
    expect(parseUserData('non json').error).toBeTruthy();
    expect(parseUserData(JSON.stringify({ ...makeUserData(empty), version: 2 })).error).toContain('più recente');
  });

  it('unisce: aggiunge i nuovi, per quelli diversi tiene i propri o quelli del file', () => {
    const cur = { ...empty, library: [part('A', { descr1: 'mio' }), part('B')], favorites: ['coil'] };
    const add = { ...empty, library: [part('A', { descr1: 'del file' }), part('B'), part('C')], favorites: ['no', 'coil'] };
    expect(userDataConflicts(cur, add)).toBe(1);
    const keep = mergeUserData(cur, add, false);
    expect(keep.result.library.find(p => p.partNr === 'A')?.descr1).toBe('mio');
    expect(keep.result.library.map(p => p.partNr).sort()).toEqual(['A', 'B', 'C']);
    expect(keep.counts.library).toEqual({ added: 1, replaced: 0, kept: 1, same: 1 });
    expect(keep.result.favorites).toEqual(['coil', 'no']);
    const over = mergeUserData(cur, add, true);
    expect(over.result.library.find(p => p.partNr === 'A')?.descr1).toBe('del file');
    expect(over.counts.library.replaced).toBe(1);
  });

  it('applyUserData mette i dati nello store', async () => {
    const { useStore } = await import('../src/model/store');
    useStore.getState().applyUserData({ ...empty, library: [part('Z'), part('A')], favorites: ['coil'] });
    expect(useStore.getState().library.map(p => p.partNr)).toEqual(['A', 'Z']);
    expect(useStore.getState().favorites).toEqual(['coil']);
  });
});
