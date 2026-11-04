// Fili collegati al PLC con il nome dall'indirizzo del canale (impostazione wirePlcNames)
import { describe, expect, it } from 'vitest';
import { exampleProject } from '../src/model/example';
import { computeNetlist, syncPlcLinkNames, lockWireNumbers } from '../src/model/netlist';
import type { Project, SymbolInstance, Wire } from '../src/model/types';

const withPlc = (p: Project, on = true) => { p.settings = { ...p.settings, wirePlcNames: on }; return p; };
const netOf = (p: Project, ch: string) => computeNetlist(p).nets.find(n => n.pins.some(q => q.el.inst.plcChannel === ch))!;

describe('nomi dei fili dall\'indirizzo PLC', () => {
  it('spenta: numeri normali; accesa: l\'indirizzo del canale, i potenziali restano', () => {
    const p = exampleProject();
    expect(netOf(p, 'DI0').wireNo).not.toBe('I0.0');
    withPlc(p);
    expect(netOf(p, 'DI0').wireNo).toBe('I0.0');
    expect(netOf(p, 'DO0').wireNo).toBe('Q0.0');
    expect(computeNetlist(p).nets.some(n => n.wireNo === '0V')).toBe(true);
  });

  it('canale con due morsetti: fili A e B', () => {
    const p = withPlc(exampleProject());
    const inst = p.pages.flatMap(pg => pg.elements).find((e): e is SymbolInstance => e.kind === 'symbol' && e.plcChannel === 'DI0')!;
    inst.symbolId = 'plc_di2_var';
    // Un filo dal secondo morsetto (8 mm a destra) verso il basso
    const pg = p.pages.find(x => x.elements.includes(inst))!;
    pg.elements.push({ kind: 'wire', id: 'wB', points: [{ x: inst.x + 8, y: inst.y }, { x: inst.x + 8, y: inst.y + 20 }] } as Wire);
    const nl = computeNetlist(p);
    expect(nl.wireNet.get('wB')?.wireNo).toBe('I0.0B');
    expect(netOf(p, 'DI0').wireNo === 'I0.0A' || nl.nets.some(n => n.wireNo === 'I0.0A')).toBe(true);
  });

  it('il nome PLC vince sul numero fissato; con la numerazione bloccata si fissa il nome', () => {
    const p = exampleProject();
    lockWireNumbers(p);
    withPlc(p);
    expect(netOf(p, 'DI1').wireNo).toBe('I0.1');
    lockWireNumbers(p);
    withPlc(p, false);
    expect(netOf(p, 'DI1').wireNo).toBe('I0.1');
  });

  it('i rimandi del filo prendono il nome dall\'indirizzo', () => {
    const p = withPlc(exampleProject());
    const n = netOf(p, 'DI0');
    const w = n.wires[0];
    const pg = p.pages.find(x => x.id === w.pageId)!;
    const at = w.wire.points[w.wire.points.length - 1];
    pg.elements.push({ kind: 'symbol', id: 'lk', symbolId: 'link', x: at.x, y: at.y, rot: 0, tag: 'R7', pinLabels: {} } as SymbolInstance);
    expect(netOf(p, 'DI0').wireNo).toBe('I0.0');
    expect(syncPlcLinkNames(p)).toBe(1);
    expect((pg.elements.find(e => e.id === 'lk') as SymbolInstance).tag).toBe('I0.0');
    withPlc(p, false);
    expect(syncPlcLinkNames(p)).toBe(0);
  });
});

describe('comando «Fili dall\'indirizzo PLC»', () => {
  it('fissa il nome sui fili selezionati anche con l\'impostazione spenta', async () => {
    const { useStore } = await import('../src/model/store');
    const p = exampleProject();
    useStore.setState({ project: p, past: [], future: [] });
    const n = netOf(useStore.getState().project, 'DO0');
    useStore.setState({ pageId: n.wires[0].pageId, selection: [n.wires[0].wire.id] });
    useStore.getState().wiresFromPlc();
    const after = useStore.getState().project;
    expect(netOf(after, 'DO0').wireNo).toBe('Q0.0');
    expect(after.pages.flatMap(pg => pg.elements).some(e => e.kind === 'wire' && e.number === 'Q0.0')).toBe(true);
    // Si annulla in un passo
    useStore.getState().undo();
    expect(netOf(useStore.getState().project, 'DO0').wireNo).not.toBe('Q0.0');
  });
});
