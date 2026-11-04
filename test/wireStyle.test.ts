// Tipo di linea e spessore dei fili: tratteggio, formato testo ed export DXF
import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { wireDash, type Wire } from '../src/model/types';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { pageToDxf } from '../src/io/dxf';

describe('tipo di linea e spessore dei fili', () => {
  it('tratteggio proporzionato allo spessore', () => {
    expect(wireDash(undefined, 0.35)).toEqual({ cap: 'butt' });
    expect(wireDash('dash', 0.35).dash).toBe('3 1.5');
    expect(wireDash('dash', 0.7).dash).toBe('6 3');
    expect(wireDash('dot', 0.35)).toEqual({ dash: '0.01 1.2', cap: 'round' });
  });
  it('si conservano nel formato testo e finiscono nel DXF', () => {
    const p = exampleProject();
    const w = p.pages[1].elements.find((e): e is Wire => e.kind === 'wire')!;
    w.lineType = 'dashdot'; w.width = 0.7;
    const txt = pagesToText(p, { pageIds: [p.pages[1].id] });
    expect(txt).toContain('linea=dashdot spessore=0.7');
    const q = exampleProject();
    importPagesText(q, txt);
    const back = q.pages.find(pg => pg.name === '2')!.elements.find((e): e is Wire => e.kind === 'wire' && e.lineType === 'dashdot');
    expect(back?.width).toBe(0.7);
    const dxf = pageToDxf(p, p.pages[1]);
    expect(dxf).toContain('DASHDOT');
    expect(dxf).toMatch(/POLYLINE\r\n8\r\nFILI\r\n6\r\nDASHDOT/);
  });
});

describe('tipo di linea e spessore nella grafica dei simboli', () => {
  it('tratti corti per i simboli; il vecchio tratteggio vale come tratteggiata', async () => {
    const { primLineType } = await import('../src/model/types');
    expect(wireDash('dash', 0.35, true).dash).toBe('1.2 0.8');
    expect(wireDash('dashdot', 0.35, true).dash).toBe('1.6 0.6 0.01 0.6');
    expect(primLineType({ t: 'line', x1: 0, y1: 0, x2: 1, y2: 0, dash: true })).toBe('dash');
    expect(primLineType({ t: 'circle', cx: 0, cy: 0, r: 1, lt: 'dot', lw: 0.7 })).toBe('dot');
  });
});
