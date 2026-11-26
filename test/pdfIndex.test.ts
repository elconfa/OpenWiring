// Pagina indice del PDF: continua su più pagine (prima si fermava a metà elenco alla fine della prima)
import { describe, expect, it } from 'vitest';
import { indexLayout } from '../src/io/pdfIndex';

describe('indice del PDF', () => {
  it('poche pagine: una pagina; tante: più pagine, ogni riga una volta e dentro il foglio', () => {
    expect(indexLayout(10, 2).pages).toBe(1);
    const l = indexLayout(120, 5);
    expect(l.pages).toBeGreaterThan(2);
    expect(l.items.filter(x => x.kind === 'page').map(x => x.i)).toEqual(Array.from({ length: 120 }, (_, i) => i));
    expect(l.items.filter(x => x.kind === 'list').length).toBe(5);
    expect(Math.max(...l.items.map(x => x.y))).toBeLessThan(297 - 15);
    expect(Math.max(...l.items.map(x => x.sheet))).toBe(l.pages - 1);
  });
});
