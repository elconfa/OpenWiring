// Ripartitori e morsettiere di distribuzione: uscite con sezione massima, più fili per uscita, liste
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { parseOuts, distSlots, distSymbol } from '../src/model/distributors';
import { distributorReport, distributorWiringReport } from '../src/model/reports';
import { checkProject } from '../src/model/checks';

describe('ripartitori', () => {
  it('uscite scritte come per i cavi', () => {
    expect(parseOuts('3,5; 4,5; 4.5; -; 6')).toEqual(['3,5', '4,5', '4,5', '', '6']);
    expect(parseOuts('3x4,5 2x6')).toEqual(['4,5', '4,5', '4,5', '6', '6']);
  });

  it('fili fisici per uscita (anche diramati), somma delle sezioni, numero filo, liste e controllo', async () => {
    const { useStore } = await import('../src/model/store');
    const { computeNetlist } = await import('../src/model/netlist');
    const st = useStore.getState;
    const p0 = emptyProject();
    p0.settings.autoConnect = false;
    st().loadProject(p0);
    const id = st().addDistributor('bar');
    const tag = st().project.distributors![0].tag;
    st().updateDistributor(id, { groups: [{ name: 'L1', inMax: '35', outs: ['4', '6', '10'] }] });
    st().placeDistGroup(id);
    const t = st().tool;
    expect(t).toMatchObject({ kind: 'place', tag });
    if (t.kind === 'place') st().placeSymbol(t.symbolId, { x: 100, y: 40 }, 0, undefined, t.tag);
    expect(st().tool.kind).toBe('select');
    // Teleruttori in fondo ai fili (A1 in alto)
    for (const x of [60, 80, 120, 140, 160, 180]) st().placeSymbol('coil', { x, y: 120 }, 0);
    // Uscita 1 (x 100): due fili che partono dallo stesso punto, 2,5 + 2,5 = 5 su 4 ammessi
    st().addWire([{ x: 100, y: 52 }, { x: 100, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 120 }]);
    st().addWire([{ x: 100, y: 52 }, { x: 100, y: 64 }, { x: 80, y: 64 }, { x: 80, y: 120 }]);
    // Uscita 3 (x 116): un filo che scende e si dirama a T verso tre teleruttori, 3 × 2,5 = 7,5 su 10
    st().addWire([{ x: 116, y: 52 }, { x: 116, y: 80 }, { x: 160, y: 80 }]);
    for (const x of [120, 140, 160]) st().addWire([{ x, y: 80 }, { x, y: 120 }]);
    const pg = st().project.pages[0];
    st().setWireProps(pg.elements.filter(e => e.kind === 'wire').map(e => e.id), { cross: '2,5' });
    const slots = distSlots(st().project);
    expect(slots.map(s => [s.name, s.wires.length, s.total, s.status])).toEqual([
      ['L1 (ingresso)', 0, 0, 'libera'], ['L1.1', 2, 5, 'superata'], ['L1.2', 0, 0, 'libera'], ['L1.3', 3, 7.5, 'ok'],
    ]);
    expect(slots[3].wires.map(w => w.to)).toEqual(['-1K3:A1', '-1K4:A1', '-1K5:A1']);
    // Il numero filo passa dal ripartitore: le uscite hanno il numero dell'ingresso
    const nl = computeNetlist(st().project);
    const nos = new Set(pg.elements.filter(e => e.kind === 'wire').map(e => nl.wireNet.get(e.id)?.wireNo));
    expect(nos.size).toBe(1);
    expect(distributorReport(st().project).rows).toHaveLength(4);
    expect(distributorWiringReport(st().project).rows.map(r => r[0])).toEqual([`-${tag}:L1.1`, `-${tag}:L1.1`, `-${tag}:L1.3`, `-${tag}:L1.3`, `-${tag}:L1.3`]);
    expect(checkProject(st().project).some(c => c.msg.includes('L1.1') && c.level === 'error')).toBe(true);
    // I due fili che partono dallo stesso foro non sono «sovrapposti»
    expect(checkProject(st().project).some(c => c.msg.startsWith('Fili sovrapposti'))).toBe(false);
    // Tolto il gruppo, sparisce anche dallo schema
    st().updateDistributor(id, { groups: [{ name: 'L2', outs: ['4'] }, { name: 'L3', outs: ['4'] }] });
    expect(st().project.pages[0].elements.filter(e => e.kind === 'symbol' && e.symbolId.startsWith('dist:'))).toHaveLength(1);
  });

  it('poli uno sotto l\'altro: nessun collegamento automatico tra uscite e ingresso', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    const id = st().addDistributor('bar');
    st().placeDistGroup(id);
    for (const y of [40, 64]) { const t = st().tool; if (t.kind === 'place') st().placeSymbol(t.symbolId, { x: 100, y }, 0, undefined, t.tag); }
    expect(st().project.pages[0].elements.filter(e => e.kind === 'wire')).toHaveLength(0);
  });

  it('morsettiera di distribuzione: morsetti con il ponte', () => {
    const s = distSymbol({ id: 'x', tag: 'X50', kind: 'terminals', groups: [{ name: '1', outs: ['2,5', '2,5', '2,5', '2,5'] }] }, 0);
    expect(s.pins.map(p => p.label)).toEqual(['1', '1.1', '1.2', '1.3', '1.4']);
    expect(s.prims.filter(p => p.t === 'circle')).toHaveLength(4);
  });
});
