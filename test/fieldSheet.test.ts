// Collegamenti morsettiera → campo (punto 173): morsetti, cavi con i conduttori e dispositivi in campo
import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { fieldItems, fieldSheet } from '../src/model/fieldSheet';
import { syncDrawingPages, drawingData } from '../src/model/drawings';

describe('collegamenti in campo', () => {
  it('esempio: dalla -X1 il cavo -1W1 al motore, con conduttori, morsetti e pin', () => {
    const p = exampleProject();
    const items = fieldItems(p);
    expect(items).toContain('X1');
    const f = fieldSheet(p, 'X1')!;
    const w1 = f.cables.find(c => c.tag === '1W1')!;
    expect(w1.cols.map(k => k.cond)).toEqual(['BN', 'BK', 'GY', 'GNYE']);
    expect(w1.cols.map(k => k.term)).toEqual(['1', '2', '3', '4']);
    expect(w1.cols.every(k => k.dev === '1M1')).toBe(true);
    expect(f.devices['1M1'].description).not.toBe('');
    // Pagine generate e dati per il disegno
    const r = syncDrawingPages(p, 'field');
    expect(r.added).toBe(items.length);
    const pg = p.pages.find(x => x.type === 'field' && x.item === 'X1')!;
    expect(pg.title).toBe('Collegamenti in campo -X1');
    const d = drawingData(p, pg);
    expect(d?.kind).toBe('field');
  });
});
