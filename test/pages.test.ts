// Numeri di pagina con lettera (12A) e ordine delle pagine dal numero
import { describe, it, expect } from 'vitest';
import { comparePageNames, parsePageNo, placeByNumber, sortByNumber, nextIntermediate } from '../src/model/pages';
import { emptyProject } from '../src/model/project';
import { letterOfTag } from '../src/model/numbering';
import type { Page } from '../src/model/types';

const pg = (name: string): Page => ({ id: `p${name}`, name, title: '', type: 'multiline', elements: [] });

describe('numeri di pagina', () => {
  it('12 < 12A < 12B < 13; i nomi non numerici non si confrontano', () => {
    expect(parsePageNo('12a')).toEqual({ n: 12, suffix: 'A' });
    expect(['13', '12B', '12', '12A', '2'].sort(comparePageNames)).toEqual(['2', '12', '12A', '12B', '13']);
    expect(comparePageNames('Indice', '3')).toBe(0);
    expect(comparePageNames('12Z', '12AA')).toBeLessThan(0);
  });
  it('la pagina rinumerata va al suo posto; copertina e indice restano', () => {
    const pages = [pg('Copertina'), pg('1'), pg('2'), pg('3'), pg('12')];
    pages[4].name = '2A';
    expect(placeByNumber(pages, 'p12').map(p => p.name)).toEqual(['Copertina', '1', '2', '2A', '3']);
    pages[4].name = '0';
    expect(placeByNumber(pages, 'p12').map(p => p.name)).toEqual(['Copertina', '0', '1', '2', '3']);
    expect(sortByNumber([pg('Copertina'), pg('3'), pg('1'), pg('Indice'), pg('2')]).map(p => p.name)).toEqual(['Copertina', '1', '2', 'Indice', '3']);
  });
  it('pagina intermedia: dopo 12 → 12A, poi 12B', () => {
    const p = emptyProject();
    p.pages = [pg('12'), pg('12A'), pg('13')];
    expect(nextIntermediate(p, '12')).toBe('12B');
    expect(nextIntermediate(p, '13')).toBe('13A');
  });
  it('la lettera della sigla non prende la lettera della pagina', () => {
    expect(letterOfTag('12AK1', '12A')).toBe('K');
    expect(letterOfTag('12AK1')).toBe('AK');
  });
});

describe('pagine nel progetto', () => {
  async function store() {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p = emptyProject();
    st().loadProject(p);
    return st;
  }
  it('+ Pagina in mezzo crea la pagina con la lettera, in fondo il numero dopo il più alto', async () => {
    const st = await store();
    const first = st().project.pages[0].id;
    st().addPage(first);
    st().addPage(st().project.pages[1].id);
    expect(st().project.pages.map(p => p.name)).toEqual(['1', '2', '3']);
    st().addPage(first);
    expect(st().project.pages.map(p => p.name)).toEqual(['1', '1A', '2', '3']);
  });
  it('cambiando il numero la pagina si sposta', async () => {
    const st = await store();
    st().addPage(st().project.pages[0].id);
    st().addPage(st().project.pages[1].id);
    st().updatePage(st().project.pages[2].id, { name: '1A' });
    expect(st().project.pages.map(p => p.name)).toEqual(['1', '1A', '2']);
  });
});

describe('pagine aggiunte in revisione', () => {
  it('12-B e 12.B2 sono numeri: vanno dopo 12 e 12A e prima di 13', () => {
    expect(parsePageNo('12-b')).toEqual({ n: 12, suffix: '-B' });
    expect(['13', '12-B2', '12', '12A', '12-B'].sort(comparePageNames)).toEqual(['12', '12A', '12-B', '12-B2', '13']);
    expect(parsePageNo('12-')).toBeUndefined();
  });
  it('durante una revisione, in mezzo si propone il numero con l\'indice; si può scegliere il numero', async () => {
    const { useStore } = await import('../src/model/store');
    const { exampleProject } = await import('../src/model/example');
    const { proposePageName } = await import('../src/model/pages');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    const p1 = st().project.pages.find(p => p.name === '1')!;
    // Senza revisione: lettera
    expect(proposePageName(st().project, p1.id)).toBe('1A');
    await st().releaseRevision({ index: 'A', date: '2026-10-26', author: '', description: '' });
    st().openRevision();
    expect(proposePageName(st().project, p1.id)).toBe('1-B');
    st().addPage(p1.id);
    expect(proposePageName(st().project, p1.id)).toBe('1-B2');
    // Numero scelto a mano: va al suo posto
    st().addPage(p1.id, '2-B');
    const names = st().project.pages.map(p => p.name);
    expect(names.indexOf('2-B')).toBe(names.indexOf('2') + 1);
    // Con la lettera scelta nelle impostazioni
    st().updateSettings({ revisionPageNo: 'letter' });
    expect(proposePageName(st().project, p1.id)).toBe('1A');
  });
});
