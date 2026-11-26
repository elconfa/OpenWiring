// Riquadro a celle fisse dei canali PLC: indirizzo, morsetti, variabile, commento, scheda con il foglio,
// stazione, rack e slot; le celle restano anche vuote
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { groupMembers } from '../src/model/plcGroup';
import { derive } from '../src/model/derive';
import { plcCells, plcCellTexts } from '../src/model/plcCells';
import { getSymbol } from '../src/model/geometry';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.plc.cards = [];
  st().loadProject(p);
  return st;
}

describe('riquadro a celle del canale PLC', () => {
  it('scheda, stazione, rack e slot nelle loro celle; i nomi dei campi anche con le celle vuote', async () => {
    const st = await store();
    const first = st().placeSymbol('plc_grp_di1', { x: 40, y: 40 }, 0)!;
    const gid = first.plcGroup!.id;
    const card = st().project.plc.cards[0];
    const m = groupMembers(st().project.pages[0], gid);
    const texts = () => derive(st().project).pages.get(st().project.pages[0].id)!.plcCells!.get(m[2].id)!;
    const caps = texts().filter(t => t.caption).map(t => t.s);
    expect(caps).toEqual(['Indirizzo', 'Morsetti', 'Variabile', 'Commento', 'Scheda', 'Stazione', 'Rack', 'Slot']);
    const vals = () => texts().filter(t => !t.caption).map(t => t.s);
    expect(vals()).toContain('I0.2');
    expect(vals()).toContain(`-${card.tag}`);
    st().updatePlcCard(card.id, { rack: 0, slot: 3 });
    expect(vals()).toEqual(expect.arrayContaining(['0', '3']));
    // L'indirizzo è in grassetto
    expect(texts().find(t => t.s === 'I0.2')!.bold).toBe(true);
  });

  it('il commento va su due righe, poi rimpicciolisce e finisce con «…»', () => {
    const box = { x: -4, y: 4, w: 40, h: 38 };
    const short = plcCellTexts(box, { comment: 'Porta 1 lato operatore chiusa e bloccata' }).filter(t => !t.caption);
    expect(short.length).toBe(2);
    const long = plcCellTexts(box, { comment: 'uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici' }).filter(t => !t.caption);
    expect(long.length).toBe(2);
    expect(long[1].s.endsWith('…')).toBe(true);
    expect(long[0].size).toBeLessThan(2.8);
  });

  it('gruppo alto 38 mm con 4 righe di celle; i morsetti non si spostano', () => {
    const s = getSymbol('plc_ch_di1')!;
    expect(s.plcCells).toMatchObject({ x: -4, y: 4, w: 40, h: 38 });
    expect(new Set(plcCells(s.plcCells!).map(c => c.y)).size).toBe(4);
    expect(s.pins[0]).toMatchObject({ x: 0, y: 0 });
    // Uscite: il riquadro cresce verso l'alto, i morsetti restano a y 18
    expect(getSymbol('plc_ch_do2')!.pins.map(p => [p.x, p.y])).toEqual([[0, 18], [16, 18]]);
    expect(getSymbol('plc_ch_do2')!.plcCells).toMatchObject({ y: -24, h: 38 });
  });

  it('presa M12: le due metà sono larghe 40 mm, i pin restano a 0, 20, 32, 44, 64', () => {
    const a = getSymbol('plc_m12_a_di_up')!, b = getSymbol('plc_m12_b_di_up')!;
    expect(a.plcCells).toMatchObject({ x: -8, w: 40, small: true });
    expect(b.plcCells).toMatchObject({ x: 32, w: 40, small: true });
    expect(a.pins[0].x).toBe(0);
    expect(b.pins[0].x).toBe(64);
    expect(getSymbol('plc_m12_body_up')!.pins.map(p => p.x)).toEqual([20, 32, 44]);
  });
});

describe('reimposta i numeri dei pin', () => {
  it('presa M12 e gruppo I/O tornano ai pin automatici', async () => {
    const st = await store();
    const f = st().placeSymbol('plc_grp_m12_up', { x: 40, y: 60 }, 0)!;
    const gid = f.plcGroup!.id;
    st().updatePlcSocket(gid, { name: 'X10' });
    const pg = () => st().project.pages[0];
    const body = () => pg().elements.find(e => e.kind === 'symbol' && e.plcGroup?.id === gid && e.plcGroup.socket === 'body' && e.plcGroup.index === 0) as any;
    const chA = () => pg().elements.find(e => e.kind === 'symbol' && e.plcGroup?.id === gid && e.plcGroup.socket === 'a' && e.plcGroup.index === 0) as any;
    st().updateInstance(body().id, { pinLabels: { ...body().pinLabels, 1: 'L+' } });
    st().setChannelPins(st().project.plc.cards[0].id, chA().plcChannel, ['99']);
    expect(body().pinLabels[1]).toBe('L+');
    st().resetPlcPins([gid]);
    expect(body().pinLabels).toEqual({ 1: 'X10.1', 5: 'X10.5', 3: 'X10.3' });
    expect(chA().pinLabels).toEqual({ 4: 'X10.4' });
    expect(st().project.plc.cards[0].io?.[chA().plcChannel]?.pins).toEqual(['X10.4']);
    // Gruppo I/O a 2 morsetti: in sequenza
    const g = st().placeSymbol('plc_grp_di2', { x: 40, y: 160 }, 0)!;
    const m0 = () => pg().elements.find(e => e.kind === 'symbol' && e.plcGroup?.id === g.plcGroup!.id && e.plcGroup.index === 0) as any;
    const cardOf = st().project.plc.cards.find(c => c.tag === m0().tag)!;
    const auto = { ...m0().pinLabels };
    st().setChannelPins(cardOf.id, m0().plcChannel, ['A', 'B']);
    expect(m0().pinLabels).toEqual({ 1: 'A', 2: 'B' });
    st().resetPlcPins([g.plcGroup!.id]);
    expect(m0().pinLabels).toEqual(auto);
  });
});
