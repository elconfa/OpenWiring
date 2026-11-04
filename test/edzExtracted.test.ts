// EDZ grandi (app desktop): l'import dai file estratti su disco, letti a gruppi, dà gli stessi
// articoli e simboli dell'import in memoria; le foto si leggono dopo, a parte
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { extractArchive, importFromFiles, importExtracted, toDataUrl } from '../src/io/edz';

describe('EDZ estratto su disco', () => {
  it('stessi articoli e simboli, foto da leggere a gruppi', async () => {
    const files = await extractArchive(new Uint8Array(fs.readFileSync(process.cwd() + '/test/fixtures/esempio.edz')), 'esempio.edz');
    const mem = importFromFiles(files, 'esempio.edz');
    const reads: string[][] = [];
    const read = async (paths: string[]) => { reads.push(paths); return files.filter(f => paths.includes(f.path)); };
    const r = await importExtracted(files.map(f => ({ path: f.path, size: f.data.length })), files.map(f => f.path), read, 'esempio.edz');
    expect(r.parts.map(p => [p.partNr, p.symbolId])).toEqual(mem.parts.map(p => [p.partNr, p.symbolId]));
    expect(r.symbols.map(s => s.id)).toEqual(mem.symbols.map(s => s.id));
    expect([r.parts.length, r.pictures.size]).toEqual([3, 1]);
    // Le foto non sono state lette: restano da aggiungere, e sono le stesse dell'import in memoria
    expect(r.parts.some(p => p.picture)).toBe(false);
    for (const p of mem.parts.filter(x => x.picture)) {
      const f = files.find(x => x.path === r.pictures.get(p.partNr))!;
      expect(toDataUrl(f)).toBe(p.picture);
    }
    expect(reads.flat().some(p => /\.(jpe?g|png)$/i.test(p))).toBe(false);
  });

  it('senza foto né simboli: solo i dati articolo, col modello funzione', async () => {
    const files = await extractArchive(new Uint8Array(fs.readFileSync(process.cwd() + '/test/fixtures/esempio.edz')), 'esempio.edz');
    const opts = { pictures: false, symbols: false };
    const mem = importFromFiles(files, 'esempio.edz', opts);
    expect(mem.parts.length).toBe(3);
    expect(mem.symbols).toEqual([]);
    expect(mem.unreadMacros).toEqual([]);
    expect(mem.parts.some(p => p.picture || p.symbolId?.startsWith('ema_'))).toBe(false);
    expect(mem.parts.some(p => p.functionTemplates.length)).toBe(true);
    const reads: string[] = [];
    const read = async (paths: string[]) => { reads.push(...paths); return files.filter(f => paths.includes(f.path)); };
    const r = await importExtracted(files.map(f => ({ path: f.path, size: f.data.length })), files.map(f => f.path), read, 'esempio.edz', undefined, opts);
    expect(r.parts.map(p => [p.partNr, p.symbolId])).toEqual(mem.parts.map(p => [p.partNr, p.symbolId]));
    expect(r.pictures.size).toBe(0);
    expect(reads.some(p => /\.em[as]$/i.test(p))).toBe(false);
  });
});
