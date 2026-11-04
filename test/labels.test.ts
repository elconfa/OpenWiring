import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { makeLabels, labelRows, rowsToCsv, DEFAULT_LABEL_OPTIONS } from '../src/model/labels';
import { ensureStrip } from '../src/model/terminals';

describe('etichette', () => {
  const p = exampleProject();
  ensureStrip(p, 'X1').spares.push('5');
  it('morsetti con la sigla della morsettiera a inizio fila e le riserve', () => {
    const l = makeLabels(p, 'terminals', DEFAULT_LABEL_OPTIONS);
    expect(l.map(x => x.lines[0])).toEqual(['-X1', '1', '2', '3', '4', '5']);
    const full = makeLabels(p, 'terminals', { ...DEFAULT_LABEL_OPTIONS, terminalText: 'full', stripHeader: false, spares: false });
    expect(full.map(x => x.lines[0])).toEqual(['X1:1', 'X1:2', 'X1:3', 'X1:4']);
  });
  it('fili: due etichette per filo, con la destinazione dell\'altra estremità', () => {
    const l = makeLabels(p, 'wires', { ...DEFAULT_LABEL_OPTIONS, wireText: 'destination' });
    // Il numero 1.02 attraversa il morsetto X1:1: due conduttori (contattore→morsetto, morsetto→motore)
    const w = l.filter(x => x.lines[0] === '1.02');
    expect(w.map(x => x.lines[1]).sort()).toEqual(['-1M1:U1', '-2K1:2', '-X1:1', '-X1:1']);
    const one = makeLabels(p, 'wires', { ...DEFAULT_LABEL_OPTIONS, bothEnds: false });
    expect(one.filter(x => x.lines[0] === '1.02')).toHaveLength(2);
  });
  it('dispositivi e cavi', () => {
    expect(makeLabels(p, 'devices', DEFAULT_LABEL_OPTIONS).map(x => x.lines[0])).toContain('-2K1');
    const c = makeLabels(p, 'cables', DEFAULT_LABEL_OPTIONS);
    expect(c.filter(x => x.group === '-1W1')).toHaveLength(2);
    expect(c[0].lines).toEqual(['-1W1', 'FG16OR16 4G1,5', '→ -X1']);
    // Cavi di rete: due etichette con la porta dell'altra estremità
    expect(c.filter(x => x.group === '-5W1').map(x => x.lines)).toEqual([['-5W1', 'Profinet', '→ -5A1:P1'], ['-5W1', 'Profinet', '→ -3A1:X1 P1']]);
  });
  it('fogli per M-Print PRO e GeniusPRO', () => {
    const l = makeLabels(p, 'terminals', DEFAULT_LABEL_OPTIONS);
    expect(labelRows(l, 'mprint')[0]).toEqual(['Project', 'Text 1']);
    expect(labelRows(l, 'mprint')[2]).toEqual(['-X1', '1']);
    expect(labelRows(l, 'genius')[0]).toEqual(['Riga 1', 'Gruppo']);
    expect(rowsToCsv(labelRows(l, 'genius')).split('\r\n')[1]).toBe('-X1;-X1');
  });
});
