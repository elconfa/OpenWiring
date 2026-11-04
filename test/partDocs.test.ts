// Schede tecniche degli articoli: elenco dei documenti e PDF allegati in fondo allo schema
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { exampleProject } from '../src/model/example';
import { documentsReport, partDocuments, DOCS_TITLE } from '../src/model/partDocs';
import { projectReports } from '../src/model/reports';
import type { Project } from '../src/model/types';

function withDocs(): Project {
  const p = exampleProject();
  // L'interruttore -1Q1 con un articolo che ha i documenti
  const used = p.pages.flatMap(pg => pg.elements).find(e => e.kind === 'symbol' && e.tag === '1Q1')! as { partNr?: string };
  const partNr = 'TEST-MS1';
  used.partNr = partNr;
  const part = { partNr, descr1: 'Salvamotore', functionTemplates: [], attrs: {} as Record<string, string> } as Project['parts'][number];
  p.parts.push(part);
  part.docs = [{ name: 'Scheda tecnica', path: '/dati/scheda.pdf' }, { name: 'Manuale', path: 'https://example.com/m.pdf' }];
  part.attrs = { ...part.attrs, 'P_ARTICLE_EXTERNAL_DOCUMENT1': 'https://example.com/edz.pdf\nScheda' };
  return p;
}

// svg2pdf serve solo per disegnare le pagine di schema (qui non ce ne sono) e vuole il browser
vi.mock('svg2pdf.js', () => ({}));

const g = globalThis as unknown as { window?: unknown };
afterEach(() => { delete g.window; });

describe('schede tecniche degli articoli', () => {
  it('documenti scelti e dei dati EPLAN; lista «Elenco documenti allegati»', () => {
    const p = withDocs();
    const part = p.parts.find(x => x.docs)!;
    expect(partDocuments(part).map(d => d.path)).toEqual(['/dati/scheda.pdf', 'https://example.com/m.pdf', 'https://example.com/edz.pdf']);
    const t = documentsReport(p);
    expect(t.rows[0]).toEqual([part.partNr, expect.any(String), 'Scheda tecnica', 'scheda.pdf', expect.any(String)]);
    expect(projectReports(p).some(x => x.title === DOCS_TITLE)).toBe(true);
  });
  it('PDF: pagina di elenco e pagine della scheda in coda; i file mancanti si segnalano', async () => {
    const sheet = await PDFDocument.create();
    sheet.addPage(); sheet.addPage();
    const bytes = await sheet.save();
    // Solo quello che serve: lettura del file (app desktop) e atob/btoa per jsPDF
    g.window = { atob, btoa, elettro: { readDoc: async (f: string) => (f === '/dati/scheda.pdf' ? bytes : undefined) } };
    const p = withDocs();
    p.parts.find(x => x.docs)!.docs!.push({ name: 'Persa', path: '/dati/persa.pdf' });
    const { exportPdf } = await import('../src/io/pdf');
    const r = await exportPdf(p, [], [], { pages: 'current', index: false, mono: false, attachDocs: true });
    expect(r.attached).toBe(1);
    expect(r.missing).toEqual(['/dati/persa.pdf']);
    // Prima pagina vuota di jsPDF + elenco + 2 pagine della scheda
    expect(r.pages).toBe(4);
  });
});
