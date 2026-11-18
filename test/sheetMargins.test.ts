import { describe, expect, it, afterEach } from 'vitest';
import { applySheet, duplexShift, FRAME, TITLE_TOP, type Project } from '../src/model/types';
import { sheetRows } from '../src/model/reports';

const settings = (sheet: object) => ({ settings: { sheet } }) as unknown as Project;

describe('margini del foglio', () => {
  afterEach(() => applySheet(undefined));
  it('di serie: cartiglio a 5 mm dal bordo e 40 righe di lista da 5 mm', () => {
    applySheet(undefined);
    expect(TITLE_TOP).toBe(257);
    expect(FRAME.bottom).toBe(252);
    expect(sheetRows({ rowH: 5 })).toBe(40);
  });
  it('margine in alto e in basso più grandi: le liste hanno meno righe e non arrivano al cartiglio', () => {
    applySheet(settings({ top: 30, bottom: 15 }).settings);
    expect(TITLE_TOP).toBe(297 - 15 - 35);
    const rows = sheetRows({ rowH: 5 });
    expect(FRAME.top + 14 + 5 + rows * 5).toBeLessThanOrEqual(FRAME.bottom);
    expect(rows).toBeLessThan(40);
  });
  it('fronte/retro: solo le pagine pari si spostano, di destro meno sinistro', () => {
    const p = settings({ left: 25, right: 10, duplex: true });
    expect(duplexShift(p, 1)).toBeUndefined();
    expect(duplexShift(p, 2)).toBe('translate(-15 0)');
    expect(duplexShift(settings({ left: 25, right: 10 }), 2)).toBeUndefined();
  });
});
