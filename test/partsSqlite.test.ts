// App desktop: libreria articoli nel database SQLite (electron/partsdb.cjs) e sincronizzazione con
// lo store (ui/partsDbSync.ts), con il database vero in una cartella temporanea
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Part } from '../src/model/types';
import { emptyProject } from '../src/model/project';

const require = createRequire(import.meta.url);
const { PartsDb } = require('../electron/partsdb.cjs') as { PartsDb: new (file: string) => {
  put(p: Part[]): Part[]; list(): Part[]; get(nrs: string[], pictures: boolean): Part[]; remove(nrs: string[]): number;
  search(q: string): string[]; exportTo(file: string, nrs: string[]): number; importFrom(file: string): { added: number; replaced: number; parts: Part[] };
  picture(nr: string): { mime: string } | undefined; count(): number; close(): void;
} };

const dir = mkdtempSync(join(tmpdir(), 'ecad-parts-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const part = (partNr: string, extra: Partial<Part> = {}): Part => ({
  partNr, typeNr: partNr.split('.')[1], manufacturer: 'Finder', descr1: 'Relè di interfaccia', productGroup: 'Relè',
  functionTemplates: [{ pos: 1, description: 'Bobina', connections: ['A1', 'A2'] }],
  attrs: { P_ARTICLE_DESCR1: 'it_IT@Relè;en_US@Relay', P_ARTICLE_EXTERNAL_DOCUMENT_1: 'https://example.com/scheda.pdf' }, picture: PNG, source: 'FINDER.edz', ...extra,
});

describe('database degli articoli', () => {
  it('tiene attributi e foto nel database e dà all\'interfaccia articoli leggeri', () => {
    const db = new PartsDb(join(dir, 'a', 'articoli.sqlite'));
    const [lite] = db.put([part('FIN.40.52'), part('FIN.46.52', { picture: undefined })]);
    expect(lite).toMatchObject({ partNr: 'FIN.40.52', lite: true, attrs: {}, manufacturer: 'Finder' });
    expect(lite.picture).toMatch(/^ecad-foto:\/\/part\/FIN\.40\.52\?v=\d+$/);
    expect(lite.functionTemplates[0].connections).toEqual(['A1', 'A2']);
    expect(db.list().map(p => [p.partNr, !!p.picture])).toEqual([['FIN.40.52', true], ['FIN.46.52', false]]);
    // Completo: attributi e foto come data URL
    const [full] = db.get(['FIN.40.52'], true);
    expect(full.attrs.P_ARTICLE_EXTERNAL_DOCUMENT_1).toBe('https://example.com/scheda.pdf');
    expect(full.picture).toBe(PNG);
    expect(full.lite).toBeUndefined();
    // Un articolo leggero aggiunge i suoi attributi (vuoto = tolto) e lascia la foto com'è
    db.put([{ ...lite, descr2: 'Nuova', attrs: { U1: 'quadro A', P_ARTICLE_EXTERNAL_DOCUMENT_1: '' } }]);
    const [f2] = db.get(['FIN.40.52'], false);
    expect(f2.descr2).toBe('Nuova');
    expect(f2.attrs).toEqual({ P_ARTICLE_DESCR1: 'it_IT@Relè;en_US@Relay', U1: 'quadro A' });
    expect(db.picture('FIN.40.52')?.mime).toBe('image/png');
    // Ricerca a testo completo, anche negli attributi e senza accenti
    expect(db.search('rele relay').sort()).toEqual(['FIN.40.52', 'FIN.46.52']);
    expect(db.search('quadro')).toEqual(['FIN.40.52']);
    expect(db.search('46')).toEqual(['FIN.46.52']);
    // Eliminazione: anche la foto
    expect(db.remove(['FIN.40.52', 'NON.ESISTE'])).toBe(1);
    expect(db.picture('FIN.40.52')).toBeUndefined();
    expect(db.search('quadro')).toEqual([]);
    db.close();
  });

  it('esporta gli articoli scelti in un file SQLite e li reimporta su un\'altra libreria', () => {
    const a = new PartsDb(join(dir, 'b', 'articoli.sqlite'));
    a.put([part('FIN.1'), part('FIN.2'), part('SIE.3')]);
    expect(a.exportTo(join(dir, 'scambio.sqlite'), ['FIN.1', 'FIN.2'])).toBe(2);
    a.close();
    const b = new PartsDb(join(dir, 'c', 'articoli.sqlite'));
    b.put([part('FIN.2', { descr1: 'vecchia' })]);
    const r = b.importFrom(join(dir, 'scambio.sqlite'));
    expect([r.added, r.replaced]).toEqual([1, 1]);
    expect(r.parts.every(p => p.lite)).toBe(true);
    expect(b.get(['FIN.2'], true)[0]).toMatchObject({ descr1: 'Relè di interfaccia', picture: PNG });
    expect(b.count()).toBe(2);
    // Un file qualsiasi non è una libreria
    expect(() => b.importFrom(join(dir, 'b', 'articoli.sqlite-wal'))).toThrow();
    b.close();
  });

  it('nello store: import, articolo leggero, proprietà, copia completa nel progetto, migrazione', async () => {
    const db = new PartsDb(join(dir, 'd', 'articoli.sqlite'));
    const clone = <T>(x: T): T => structuredClone(x);
    (window as unknown as { elettro: unknown }).elettro = {
      openFile: async () => [], saveFile: async () => undefined,
      partsList: async () => ({ file: 'x', parts: clone(db.list()) }),
      partsPut: async (p: Part[]) => clone(db.put(clone(p))),
      partsRemove: async (n: string[]) => db.remove(n),
      partsGet: async (n: string[], pic: boolean) => clone(db.get(n, pic)),
      partsSearch: async (q: string) => db.search(q),
    };
    const { useStore } = await import('../src/model/store');
    const { startPartsDb, flushParts, withFullParts } = await import('../src/ui/partsDbSync');
    const st = useStore.getState;
    expect(await startPartsDb()).toBe(true);
    st().addPartsToLibrary([part('FIN.40.52'), part('FIN.46.52')], 'FINDER.edz');
    await flushParts();
    // In memoria solo la parte leggera, nel database tutto
    const lite = st().library.find(p => p.partNr === 'FIN.40.52')!;
    expect(lite.lite).toBe(true);
    expect(lite.attrs).toEqual({});
    expect(lite.picture).toMatch(/^ecad-foto:/);
    expect(db.get(['FIN.40.52'], false)[0].attrs.P_ARTICLE_DESCR1).toBe('it_IT@Relè;en_US@Relay');
    // Proprietà dell'utente sull'articolo leggero: si aggiunge senza perdere gli attributi
    st().setUserProp({ kind: 'part', partNr: 'FIN.40.52' }, 'U1', 'quadro A');
    await flushParts();
    expect(db.get(['FIN.40.52'], false)[0].attrs).toMatchObject({ U1: 'quadro A', P_ARTICLE_DESCR1: 'it_IT@Relè;en_US@Relay' });
    expect(st().library.find(p => p.partNr === 'FIN.40.52')!.attrs).toEqual({});
    st().setUserProp({ kind: 'part', partNr: 'FIN.40.52' }, 'U1', '');
    await flushParts();
    expect(db.get(['FIN.40.52'], false)[0].attrs.U1).toBeUndefined();
    // Nel progetto finisce la copia completa, con attributi e foto
    st().loadProject(emptyProject());
    const q = st().placeSymbol('no', { x: 40, y: 40 }, 0)!;
    st().assignPart([q.id], 'FIN.40.52');
    await flushParts(); await flushParts();
    const pp = st().project.parts.find(p => p.partNr === 'FIN.40.52')!;
    expect(pp.lite).toBeUndefined();
    expect(pp.picture).toBe(PNG);
    expect(pp.attrs.P_ARTICLE_DESCR1).toBe('it_IT@Relè;en_US@Relay');
    // Esportazioni: articoli completi
    const [full] = await withFullParts([st().library[0]], false);
    expect(full.lite).toBeUndefined();
    expect(Object.keys(full.attrs).length).toBeGreaterThan(0);
    // Eliminazione dalla libreria: anche nel database, con la foto
    st().removeParts(['FIN.46.52']);
    await flushParts();
    expect(db.list().map(p => p.partNr)).toEqual(['FIN.40.52']);
    expect(db.picture('FIN.46.52')).toBeUndefined();
    db.close();
  });
});
