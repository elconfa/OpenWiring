// Calcoli: termico del quadro (IEC/TR 60890) e verifica dei cavi (caduta di tensione e portata)
import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { thermalResult, newThermal, cableResult, voltageDrop, altitudeFactor, partPowerLoss, thermalReport } from '../src/model/calculations';

describe('calcolo termico del quadro', () => {
  it('superficie efficace, sovratemperatura, raffreddamento, ventilatore e scaldiglia', () => {
    const p = exampleProject();
    // 800×2000×600 singolo libero: A = 1,8·2·(0,8+0,6) + 1,4·0,8·0,6 = 5,712 m²; lamiera k 5,5
    const c = { ...newThermal(''), pv: Object.fromEntries([...new Set(p.pages.flatMap(pg => pg.elements.flatMap(e => (e.kind === 'symbol' && e.tag ? [e.tag.split(':')[0]] : []))))].map(t => [t, 0])), extra: [{ name: 'Inverter', w: 500 }] };
    const r = thermalResult(p, c);
    expect(r.area).toBeCloseTo(5.712, 3);
    expect(r.pv).toBe(500);
    expect(r.dT).toBeCloseTo(500 / (5.5 * 5.712), 2);
    expect(r.tIn).toBeCloseTo(50.9, 1);
    expect(r.cooling).toBeCloseTo(500 - 5.5 * 5.712 * 5, 1);
    expect(r.fan).toBeCloseTo((3.1 * r.cooling) / 5, 1);
    expect(r.heating).toBeCloseTo(5.5 * 5.712 * 5, 1);
    // A parete in mezzo alla fila con il tetto coperto scambia meno
    expect(thermalResult(p, { ...c, install: 7 }).area).toBeLessThan(r.area);
    expect(altitudeFactor(0)).toBeCloseTo(3.1); expect(altitudeFactor(1200)).toBeCloseTo(3.6);
  });
  it('potenza dissipata dall\'articolo o dagli attributi del costruttore', () => {
    expect(partPowerLoss({ partNr: 'a', functionTemplates: [], attrs: {}, powerLoss: 7 })).toBe(7);
    expect(partPowerLoss({ partNr: 'b', functionTemplates: [], attrs: { ARTICLE_POWER_LOSS: '2,5' } })).toBe(2.5);
    expect(partPowerLoss({ partNr: 'c', functionTemplates: [], attrs: {} })).toBeUndefined();
  });
  it('lista del calcolo termico', () => {
    const p = exampleProject();
    p.calcs = { thermal: [{ ...newThermal(''), extra: [{ name: 'x', w: 100 }] }] };
    expect(thermalReport(p).rows[0][0]).toBe('Progetto');
  });
});

describe('verifica dei cavi', () => {
  it('caduta di tensione e portata (trifase 400 V, 20 A, 2,5 mm², 50 m)', () => {
    const c = { i: 20 };
    // ΔU = √3·(0,0225·50/2,5·0,9 + 0,08e-3·50·0,436)·20 ≈ 14,09 V = 3,52 %
    expect(voltageDrop(c, 2.5, 50)).toBeCloseTo(14.09, 1);
    const r = cableResult(c, '2,5', 50);
    expect(r.duPct).toBeCloseTo(3.52, 1);
    expect(r.iz).toBe(24);
    expect(r.ok).toBe(true);
    expect(r.sDrop).toBe(2.5);
    expect(r.sIz).toBe(2.5);
    // 100 m: la caduta supera il 4 %; con 4 mm² è 4,4 %, serve 6 mm²
    const far = cableResult(c, '2,5', 100);
    expect(far.ok).toBe(false);
    expect(far.sDrop).toBe(6);
    // Monofase 230 V di serie, 2 conduttori caricati
    expect(cableResult({ i: 20, phases: 1 }, '2,5', 20).iz).toBe(27);
  });
});
