import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import { coverLines, coverRowsOf } from '../src/model/cover';
import { stripRowsPer } from '../src/model/terminals';

describe('copertina personalizzata', () => {
  it('righe di serie: cinque dati del progetto e i campi del cartiglio', () => {
    const p = emptyProject();
    p.info.customer = 'ACME';
    p.titleBlock = { fields: [{ label: 'Commessa', value: '1234' }] };
    const l = coverLines(p);
    expect(l.filter(x => !x.hidden).map(x => x.key)).toEqual(['customer', 'drawingNr', 'revision', 'date', 'author', 'tb:0']);
    expect(l.find(x => x.key === 'customer')!.value).toBe('ACME');
    expect(l.find(x => x.key === 'company')!.hidden).toBe(true);
  });
  it('ordine, nomi, righe libere e nascoste restano dopo il salvataggio', () => {
    const p = emptyProject();
    p.info.author = 'MC';
    let l = coverLines(p);
    l = [l[4], ...l.slice(0, 4), ...l.slice(5)];
    l[0] = { ...l[0], label: 'Progettista', custom: true };
    l[1] = { ...l[1], hidden: true };
    l.push({ key: 'free:x', label: 'Tensione', value: '400 V', hidden: false, custom: true, free: true });
    p.settings.cover = { rows: coverRowsOf(l) };
    const shown = coverLines(p).filter(x => !x.hidden);
    expect(shown[0]).toMatchObject({ key: 'author', label: 'Progettista', value: 'MC' });
    expect(shown.map(x => x.key)).not.toContain('customer');
    expect(shown[shown.length - 1]).toMatchObject({ label: 'Tensione', value: '400 V', free: true });
  });
  it('righe della morsettiera più alte: meno morsetti per foglio', () => {
    const p = emptyProject();
    expect(stripRowsPer(p)).toBe(40);
    p.settings.stripStyle = { rowH: 6 };
    expect(stripRowsPer(p)).toBe(32);
  });
});
