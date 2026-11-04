import { describe, it, expect, vi } from 'vitest';
import { exampleProject } from '../src/model/example';
import { useStore } from '../src/model/store';

// Lo schema in PDF passa da svg2pdf (serve il browser): qui basta un segnaposto
vi.mock('../src/io/pdf', () => ({ DEFAULT_PDF_OPTIONS: {}, exportPdf: async () => ({ data: new TextEncoder().encode('%PDF-schemi'), pages: 1, links: 0 }) }));

describe('pacchetto di rilascio (19f)', () => {
  it('cartella Rilascio_B con PDF, liste, differenze, progetto, manifest e checksum', async () => {
    const { buildReleasePackage } = await import('../src/io/releasePackage');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    await st().releaseRevision({ index: 'A', date: '2026-10-26', author: 'MC', description: 'Prima' });
    st().openRevision();
    const pg = st().project.pages.find(p => p.name === '2')!;
    st().commit(q => { q.pages.find(p => p.id === pg.id)!.title = 'Comandi nuovi'; q.revisionNotes = { [`${pg.id}:@page`]: { text: 'titolo' } }; });
    await st().releaseRevision({ index: 'B', date: '2026-10-27', author: 'MC', description: 'Seconda', accepted: [{ kind: 'Fili', msg: 'Filo libero', note: 'prosegue' }] });
    const rev = st().project.revisions!.at(-1)!;
    const pkg = (await buildReleasePackage(st().project, rev.id))!;
    expect(pkg.folder).toBe('Rilascio_B');
    const names = pkg.files.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining(['Avviamento motore pompa_B_schemi.pdf', 'Avviamento motore pompa_B_distinta.csv', 'Avviamento motore pompa_B_lista_fili.csv',
      'Avviamento motore pompa_B_differenze.pdf', 'Avviamento motore pompa_B.ecad', 'manifest.json', 'Checksums.sha256']));
    const text = (n: string) => new TextDecoder().decode(pkg.files.find(f => f.name === n)!.data);
    const manifest = JSON.parse(text('manifest.json'));
    expect(manifest).toMatchObject({ revisione: 'B', precedente: 'A', data: '2026-10-27' });
    expect(manifest.file.length).toBe(pkg.files.length - 2);
    const sums = text('Checksums.sha256').trim().split('\n');
    expect(sums.length).toBe(pkg.files.length - 1);
    expect(sums.every(l => /^[0-9a-f]{64}  \S/.test(l))).toBe(true);
    // Il progetto nel pacchetto è quello rilasciato (B), in sola lettura
    expect(JSON.parse(text('Avviamento motore pompa_B.ecad')).revisionState).toBe('released');
    const diff = pkg.files.find(f => f.name.endsWith('_differenze.pdf'))!;
    expect(new TextDecoder().decode(diff.data.slice(0, 5))).toBe('%PDF-');
    if (process.env.OUT) {
      const { mkdirSync, writeFileSync } = await import('fs');
      mkdirSync(process.env.OUT, { recursive: true });
      for (const f of pkg.files) writeFileSync(`${process.env.OUT}/${f.name}`, f.data);
    }
  });
});
