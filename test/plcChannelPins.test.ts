import { describe, expect, it } from 'vitest';
import { useStore } from '../src/model/store';
import { exampleProject } from '../src/model/example';
import { ioAssignments } from '../src/model/plc';
import { plcIoReport } from '../src/model/reports';
import { buildPlcGroup } from '../src/model/plcGroup';

describe('pin della scheda PLC', () => {
  it('scritti nella vista PLC: si vedono nella Lista I/O e nei gruppi dello schema', () => {
    const p = exampleProject();
    useStore.getState().loadProject(p);
    const card = useStore.getState().project.plc.cards[0];
    useStore.getState().setChannelPins(card.id, 'DI0', ['3', '4']);
    const pr = useStore.getState().project;
    const row = ioAssignments(pr).find(r => r.card.id === card.id && r.channel === 'DI0')!;
    expect(row.pins).toEqual(['3', '4']);
    const t = plcIoReport(pr);
    const r = t.rows.find(x => x[1] === 'DI0')!;
    expect([r[2], r[3]]).toEqual(['3', '4']);
    // Vuoti: tolti dal canale
    useStore.getState().setChannelPins(card.id, 'DI0', ['', '']);
    expect(useStore.getState().project.plc.cards[0].io?.DI0?.pins).toBeUndefined();
  });
  it('scritti nel gruppo I/O dello schema o nella vista PLC: è lo stesso dato', () => {
    const p = exampleProject();
    const card = p.plc.cards[0];
    buildPlcGroup(p, p.pages[0], 'g1', { tag: card.tag, kind: 'DI', first: 5, count: 2, terms: 2, unused: [] }, { at: { x: 200, y: 200 }, rot: 0 });
    useStore.getState().loadProject(p);
    useStore.getState().setChannelPins(card.id, 'DI5', ['11', '12']);
    const pr = useStore.getState().project;
    const ch = pr.pages[0].elements.find(e => e.kind === 'symbol' && e.plcChannel === 'DI5');
    expect(ch && ch.kind === 'symbol' ? Object.values(ch.pinLabels) : []).toEqual(['11', '12']);
    expect(ioAssignments(pr).find(r => r.channel === 'DI5')!.pins).toEqual(['11', '12']);
    // Un gruppo rifatto prende i pin del canale
    useStore.getState().commit(q => { buildPlcGroup(q, q.pages[0], 'g1', { tag: card.tag, kind: 'DI', first: 5, count: 2, terms: 1, unused: [] }); });
    const again = useStore.getState().project.pages[0].elements.find(e => e.kind === 'symbol' && e.plcChannel === 'DI5');
    expect(again && again.kind === 'symbol' ? again.pinLabels : {}).toEqual({ 1: '11' });
  });
});
