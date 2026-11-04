import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { titleBlockPrims, templateFor, fillTitleText, placeholderValues, BUILTIN_TITLE_BLOCKS } from '../src/model/titleBlocks';
import { dxfToPrims } from '../src/io/dxfImport';
import { pageToDxf } from '../src/io/dxf';

const texts = (p: ReturnType<typeof exampleProject>, i: number) =>
  titleBlockPrims(p, p.pages[i], i).prims.flatMap(q => (q.t === 'text' ? [q.s] : []));

describe('cartigli', () => {
  it('lo standard riempie i dati di progetto e pagina', () => {
    const p = exampleProject();
    const t = texts(p, 1);
    expect(t).toContain(p.info.name);
    expect(t).toContain(p.pages[1].title);
    expect(t).toContain(`= ${p.pages[1].name}`);
    expect(t).toContain(`Pag. 2/${p.pages.length}`);
  });
  it('valori di riserva e testi con segnaposto vuoti', () => {
    const p = exampleProject();
    p.info.customer = '';
    p.info.drawingNr = '';
    const v = placeholderValues(p, p.pages[0], 0);
    expect(fillTitleText(p, '{cliente|—}', v)).toBe('—');
    expect(fillTitleText(p, 'Dis. {disegno}', v)).toBe('');
    expect(fillTitleText(p, 'Sconosciuto {xyz}', v)).toBe('Sconosciuto {xyz}');
    p.titleBlock = { fields: [{ label: 'Commessa', value: 'C-123' }] };
    const v2 = placeholderValues(p, p.pages[0], 0);
    expect(fillTitleText(p, '{campo:commessa}', v2)).toBe('C-123');
    expect(fillTitleText(p, '{campo1}', v2)).toBe('Commessa: C-123');
  });
  it('modello del progetto, della pagina e tabella revisioni', () => {
    const p = exampleProject();
    p.titleBlock = { templateId: 'revisioni' };
    p.revisions = [{ id: 'r1', index: 'A', date: '2026-01-10', author: 'MC', description: 'Prima emissione', pages: [], snapshot: {} },
      { id: 'r2', index: 'B', date: '2026-03-02', author: 'MC', description: 'Aggiunta pompa', pages: [], snapshot: {} }];
    expect(templateFor(p, p.pages[0]).id).toBe('revisioni');
    const t = texts(p, 0);
    expect(t).toEqual(expect.arrayContaining(['A', 'B', 'Aggiunta pompa', 'Prima emissione']));
    p.pages[0].titleBlockId = 'compatto';
    expect(templateFor(p, p.pages[0]).id).toBe('compatto');
    expect(templateFor(p, p.pages[1]).id).toBe('revisioni');
  });
  it('il logo va nell\'area del modello solo se c\'è', () => {
    const p = exampleProject();
    expect(titleBlockPrims(p, p.pages[0], 0).logo).toBeUndefined();
    p.titleBlock = { logo: 'data:image/png;base64,AAAA' };
    expect(titleBlockPrims(p, p.pages[0], 0).logo?.w).toBeGreaterThan(0);
  });
  it('tutti i modelli inclusi stanno nell\'area del cartiglio', () => {
    for (const t of BUILTIN_TITLE_BLOCKS) for (const q of t.prims) {
      const xs = q.t === 'line' ? [q.x1, q.x2] : q.t === 'rect' ? [q.x, q.x + q.w] : q.t === 'text' ? [q.x] : [];
      const ys = q.t === 'line' ? [q.y1, q.y2] : q.t === 'rect' ? [q.y, q.y + q.h] : q.t === 'text' ? [q.y] : [];
      for (const x of xs) expect(x, t.id).toBeLessThanOrEqual(390);
      for (const y of ys) expect(y, t.id).toBeLessThanOrEqual(35);
    }
  });
  it('l\'export DXF contiene il cartiglio', () => {
    const p = exampleProject();
    const dxf = pageToDxf(p, p.pages[1]);
    expect(dxf).toContain('CARTIGLIO');
    expect(dxf).toContain(p.pages[1].title);
  });
});

const dxf = (...ents: string[][]) => ['0', 'SECTION', '2', 'ENTITIES', ...ents.flat(), '0', 'ENDSEC', '0', 'EOF'].join('\n');

describe('import DXF del cartiglio', () => {
  it('linee, testi e attributi con l\'asse y ribaltato', () => {
    const g = dxfToPrims(dxf(
      ['0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '100', '21', '0'],
      ['0', 'LINE', '8', '0', '10', '0', '20', '30', '11', '100', '21', '30'],
      ['0', 'TEXT', '8', '0', '10', '5', '20', '20', '40', '3', '1', 'Progetto'],
      ['0', 'ATTDEF', '8', '0', '10', '5', '20', '10', '40', '2.5', '1', '', '2', 'TITOLO'],
    ), 390, 35);
    expect(g.scale).toBe(1);
    expect(g.prims[0]).toEqual({ t: 'line', x1: 0, y1: 30, x2: 100, y2: 30 });
    expect(g.prims[1]).toEqual({ t: 'line', x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(g.prims[2]).toMatchObject({ t: 'text', x: 5, y: 10, s: 'Progetto', size: 3 });
    expect(g.prims[3]).toMatchObject({ t: 'text', s: '{titolo}', y: 20 });
  });
  it('blocchi inseriti e riduzione in scala se troppo grande', () => {
    const text = ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'TB', '10', '0', '20', '0',
      '0', 'LWPOLYLINE', '90', '4', '70', '1', '10', '0', '20', '0', '10', '780', '20', '0', '10', '780', '20', '70', '10', '0', '20', '70',
      '0', 'ENDBLK', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '2', 'TB', '10', '10', '20', '10', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const g = dxfToPrims(text, 390, 35);
    expect(g.scale).toBeCloseTo(0.5);
    expect(g.prims[0]).toMatchObject({ t: 'poly', closed: true });
    expect(g.width).toBeCloseTo(390);
  });
});

describe('cartigli: dati mancanti', () => {
  it('un dato di progetto non compilato non lascia il segnaposto scritto', () => {
    const p = exampleProject();
    delete p.titleBlock;
    expect(texts(p, 0).some(s => s.includes('{'))).toBe(false);
  });
});
