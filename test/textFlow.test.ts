// Testi che vanno a capo da soli in un riquadro (canali dei gruppi I/O PLC)
import { describe, it, expect } from 'vitest';
import { wrapWords, flowLines } from '../src/model/textFlow';
import { getSymbol } from '../src/model/geometry';

describe('testi a capo nel riquadro', () => {
  it('a parole intere; le parole troppo lunghe si spezzano', () => {
    expect(wrapWords('Pulsante di avvio ciclo automatico', 12)).toEqual(['Pulsante di', 'avvio ciclo', 'automatico']);
    expect(wrapWords('Fotocellula_ingresso_nastro', 10)).toEqual(['Fotocellul', 'a_ingresso', '_nastro']);
  });
  it('i testi vanno uno sotto l\'altro; quello che non entra finisce con …', () => {
    const box = { x: 0, y: 0, w: 15, h: 8 };
    const l = flowLines(box, ['I0.0', '', 'Pulsante di avvio ciclo automatico'], 2.5);
    // Riquadro alto 8 mm: due righe da 2,5 mm (passo 3,25), la seconda tagliata
    expect(l.map(x => x.index)).toEqual([0, 2]);
    expect(l[1].y - l[0].y).toBeCloseTo(3.25);
    expect(l[1].s.endsWith('…')).toBe(true);
  });
});
