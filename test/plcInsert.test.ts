// Finestra «Inserisci gruppo PLC»: proposte, scheda nuova, prese con pin e comuni scelti
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { plcInsertDefaults, plcInsertProblems } from '../src/model/plcInsert';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.plc.cards = [];
  st().loadProject(p);
  return st;
}

describe('inserisci gruppo PLC', () => {
  it('dalla libreria si apre la finestra invece di posare subito', async () => {
    const st = await store();
    st().setTool({ kind: 'place', symbolId: 'plc_grp_di1', rot: 0 });
    expect(st().plcInsert).toMatchObject({ symbolId: 'plc_grp_di1' });
    expect(st().tool.kind).toBe('select');
    // Senza schede: propone una scheda nuova
    const cfg = plcInsertDefaults(st().project, 'plc_grp_di1', st().project.pages[0], 40)!;
    expect(cfg.newCard).toMatchObject({ typeId: 'di16' });
    expect(cfg).toMatchObject({ io: 'DI', first: 0, terms: 1 });
    cfg.newCard!.tag = '700A4'; cfg.newCard!.station = 'ET1'; cfg.newCard!.rack = 0; cfg.newCard!.slot = 4;
    cfg.count = 4;
    st().finishPlcInsert(cfg);
    expect(st().tool).toMatchObject({ kind: 'place', plc: { count: 4 } });
    st().placeSymbol('plc_grp_di1', { x: 40, y: 40 }, 0, undefined, undefined, (st().tool as { plc: typeof cfg }).plc);
    const card = st().project.plc.cards.find(c => c.tag === '700A4')!;
    expect(card).toMatchObject({ station: 'ET1', rack: 0, slot: 4, typeId: 'di16' });
    const chans = st().project.pages[0].elements.filter(e => e.kind === 'symbol' && e.plcChannel).map(e => (e as { plcChannel: string }).plcChannel);
    expect(chans).toEqual(['DI0', 'DI1', 'DI2', 'DI3']);
    // Posato una volta: lo strumento torna alla selezione
    expect(st().tool.kind).toBe('select');
    // La sigla esiste già: non si può creare di nuovo
    const again = plcInsertDefaults(st().project, 'plc_grp_di1', st().project.pages[0], 40)!;
    expect(again.tag).toBe('700A4');
    expect(again.first).toBe(4);
    expect(plcInsertProblems(st().project, { ...again, tag: '', newCard: { tag: '700A4', typeId: 'di16', station: 'ET1' } })[0]).toMatch(/esiste già/);
  });

  it('dalla vista PLC con la scheda; prese con nome, canali, pin e comuni scelti', async () => {
    const st = await store();
    const { newCard } = await import('../src/model/plc');
    const c = newCard(st().project, 'di16-do16', '700A4', 'ET1');
    st().loadProject({ ...st().project, plc: { ...st().project.plc, cards: [c] } });
    st().setTool({ kind: 'place', symbolId: 'plc_grp_m12_down', rot: 0, tag: '700A4' });
    const cfg = plcInsertDefaults(st().project, 'plc_grp_m12_down', st().project.pages[0], 40, st().plcInsert!.tag)!;
    expect(cfg).toMatchObject({ tag: '700A4', io: 'DO', first: 0, count: 4, socket: { second: 8, name: 'X10' } });
    cfg.count = 2; cfg.socket!.name = 'X20'; cfg.first = 4; cfg.socket!.second = 12;
    cfg.socket!.pinNos = { ...cfg.socket!.pinNos, 4: '2', 2: '4' };
    cfg.socket!.commons = { 1: 'L+', 5: '⏚', 3: 'M' };
    st().finishPlcInsert(null);
    expect(st().plcInsert).toBeUndefined();
    const inst = st().placeSymbol('plc_grp_m12_down', { x: 40, y: 100 }, 0, undefined, undefined, cfg)!;
    const els = st().project.pages[0].elements.filter(e => e.kind === 'symbol' && e.plcGroup?.id === inst.plcGroup!.id) as any[];
    const a0 = els.find(e => e.plcGroup.socket === 'a' && e.plcGroup.index === 0);
    const b1 = els.find(e => e.plcGroup.socket === 'b' && e.plcGroup.index === 1);
    expect(a0).toMatchObject({ plcChannel: 'DO4', pinLabels: { 4: 'X20.2' } });
    expect(b1).toMatchObject({ plcChannel: 'DO13', pinLabels: { 2: 'X21.4' } });
    const body = els.find(e => e.plcGroup.socket === 'body' && e.plcGroup.index === 0);
    expect(body.plcGroup.commons).toEqual({ 1: 'L+', 3: 'M' });
    // Reimposta: tornano i numeri scelti nella finestra, non quelli di serie
    st().updateInstance(a0.id, { pinLabels: { 4: 'Z' } });
    st().resetPlcPins([inst.plcGroup!.id]);
    const a0b = st().project.pages[0].elements.find(e => e.id === a0.id) as any;
    expect(a0b.pinLabels).toEqual({ 4: 'X20.2' });
  });
});
