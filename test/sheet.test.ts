import { describe, it, expect, afterEach } from 'vitest';
import { applySheet, sheetOf, columnOf, rowOf, lookOf, FRAME, PAGE_W, PAGE_H, COLUMNS, TITLE_TOP } from '../src/model/types';
import { titleBlockPlace, BUILTIN_TITLE_BLOCKS } from '../src/model/titleBlocks';
import { exampleProject } from '../src/model/example';
import { locationOf, allPlaced } from '../src/model/devices';

afterEach(() => applySheet(undefined));

describe('formato del foglio', () => {
  it('di serie A3 orizzontale con 10 colonne come prima', () => {
    applySheet(undefined);
    expect([PAGE_W, PAGE_H, COLUMNS, TITLE_TOP]).toEqual([420, 297, 10, 257]);
    expect(FRAME).toEqual({ left: 20, top: 10, right: 410, bottom: 252 });
    expect(rowOf(100)).toBe('');
    const tb = titleBlockPlace(BUILTIN_TITLE_BLOCKS[0]);
    expect(tb.scale).toBe(1);
    expect(tb.x).toBe(20);
  });

  it('A4 verticale: misure, colonne, righe e cartiglio rimpicciolito', () => {
    applySheet({ sheet: { size: 'A4', portrait: true, columns: 6, rows: 4 } });
    expect([PAGE_W, PAGE_H]).toEqual([210, 297]);
    expect(FRAME.right).toBe(200);
    expect(columnOf(21)).toBe(1);
    expect(columnOf(199)).toBe(6);
    expect(rowOf(FRAME.top + 1)).toBe('A');
    expect(rowOf(FRAME.bottom - 1)).toBe('D');
    const tb = titleBlockPlace(BUILTIN_TITLE_BLOCKS[0]);
    expect(tb.scale).toBeCloseTo(180 / 390);
    expect(tb.x + tb.w).toBeCloseTo(FRAME.right);
  });

  it('riferimenti con la riga solo se il foglio ha righe', () => {
    const p = exampleProject();
    const el = allPlaced(p)[0];
    applySheet({ sheet: { rows: 6, xrefRows: true } });
    expect(locationOf(el)).toMatch(/\.\d+[A-F]$/);
    expect(sheetOf({ sheet: { xrefRows: true } }).xrefRows).toBe(false);
  });

  it('aspetto: valori predefiniti e scelti', () => {
    expect(lookOf(undefined).w.symbol).toBe(0.35);
    expect(lookOf({ look: { widths: { wire: 0.5 }, font: 'serif' } }).w.wire).toBe(0.5);
    expect(lookOf({ look: { font: 'serif' } }).font).toBe('serif');
  });
});
