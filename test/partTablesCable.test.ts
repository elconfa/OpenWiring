// Tabella materiali del dispositivo in campo: anche il cavo collegato (attraverso i pin dei connettori)
// e i connettori che fanno parte del cavo; scritta del riquadro del connettore; targhette dei conduttori
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Pt, SymbolInstance, Wire, CableLine, Part } from '../src/model/types';
import { getSymbol, pinsWorld } from '../src/model/geometry';
import { partTables } from '../src/model/partTables';
import { connectorFrames } from '../src/model/connectors';
import { wireMarkers } from '../src/model/labels';
import { derive } from '../src/model/derive';

const S = (id: string, symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (id: string, ...pts: Pt[]): Wire => ({ kind: 'wire', id, points: pts });
const part = (partNr: string, manufacturer: string, orderNr: string): Part => ({ partNr, manufacturer, orderNr, functionTemplates: [], attrs: {} });

/** Sensore B1 → pin del connettore X2:1 → cavo W1 → morsetto X1:1 */
function project() {
  const p = emptyProject();
  p.parts.push(part('SENS', 'OMRON', 'E3Z-R86'), part('CAB', 'IFM', 'EVC407'), part('M12', 'IFM', 'E11504'), part('PG', 'Lapp', 'SKINTOP'));
  const pg = p.pages[0];
  const b1 = S('b1', 'coil', 40, 20, 'B1', { partNr: 'SENS', show: { parts: true } });
  const x2 = S('x2', 'conn_male', 40, 60, 'X2:1', { partNr: 'M12' });
  const x1 = S('x1', 'terminal', 40, 140, 'X1:1');
  const bot = pinsWorld(b1, getSymbol('coil')!).sort((a, b) => b.y - a.y)[0];
  const x2p = pinsWorld(x2, getSymbol('conn_male')!).sort((a, b) => a.y - b.y);
  const x1p = pinsWorld(x1, getSymbol('terminal')!).sort((a, b) => a.y - b.y)[0];
  const w1 = W('w1', { x: bot.x, y: bot.y }, { x: x2p[0].x, y: x2p[0].y });
  const w2 = W('w2', { x: x2p[1].x, y: x2p[1].y }, { x: x1p.x, y: x1p.y });
  const line: CableLine = { kind: 'cable', id: 'l1', cableId: 'c1', points: [{ x: 30, y: 100 }, { x: 50, y: 100 }] };
  pg.elements = [b1, x2, x1, w1, w2, line];
  p.cables = [{ id: 'c1', tag: 'W1', conductors: ['1', '2', '3', '4'], assign: {}, partNr: 'CAB', length: 5, extraParts: [{ partNr: 'PG', qty: 2 }] }];
  return p;
}
const rows = (p: ReturnType<typeof project>) => partTables(p).get(p.pages[0].id)!.find(t => t.instId === 'b1')!.rows.map(r => [r.qty, r.manufacturer, r.code]);

describe('tabella materiali con il cavo', () => {
  it('il sensore ha anche il cavo collegato (oltre il connettore) con i suoi articoli aggiuntivi', () => {
    const p = project();
    expect(rows(p)).toEqual([['1', 'OMRON', 'E3Z-R86'], ['5 m', 'IFM', 'EVC407'], ['2', 'Lapp', 'SKINTOP']]);
  });
  it('connettore che fa parte del cavo: il suo articolo va nella tabella del sensore, niente sigla sullo schema', () => {
    const p = project();
    p.connectors = { X2: { ofCable: true } };
    expect(rows(p)).toEqual([['1', 'OMRON', 'E3Z-R86'], ['5 m', 'IFM', 'EVC407'], ['2', 'Lapp', 'SKINTOP'], ['1', 'IFM', 'E11504']]);
    const f = connectorFrames(p, p.pages[0]);
    expect(f[0].label).toBe('');
    expect(derive(p).pages.get(p.pages[0].id)!.stripLabel.has('x2')).toBe(false);
  });
  it('scritta del riquadro: sigla sul riquadro e non sul pin, spostabile per pagina, nascondibile', () => {
    const p = project();
    let f = connectorFrames(p, p.pages[0])[0];
    expect(f.label).toBe('-X2');
    expect(derive(p).pages.get(p.pages[0].id)!.stripLabel.has('x2')).toBe(false);
    const at0 = f.labelAt;
    p.connectors = { X2: { labelOffsets: { [p.pages[0].id]: { x: 5, y: -2 } } } };
    f = connectorFrames(p, p.pages[0])[0];
    expect(f.labelAt).toEqual({ x: at0.x + 5, y: at0.y - 2 });
    p.connectors = { X2: { hideLabel: true } };
    expect(connectorFrames(p, p.pages[0])[0].label).toBe('');
    // Senza riquadro la sigla torna sul pin
    p.connectors = { X2: { frame: false } };
    expect(derive(p).pages.get(p.pages[0].id)!.stripLabel.has('x2')).toBe(true);
  });
  it('targhette: il conduttore del cavo le ha solo con il numero filo visibile', () => {
    const p = project();
    const count = () => wireMarkers(p).reduce((a, r) => a + r.qty, 0);
    const visible = count();
    (p.pages[0].elements.find(e => e.id === 'w2') as Wire).show = { number: false };
    expect(count()).toBeLessThan(visible);
  });
});

describe('commento del canale PLC oltre i connettori', () => {
  it('il canale prende la descrizione del sensore anche attraverso spina e presa', async () => {
    const { ioAssignments } = await import('../src/model/plc');
    const p = emptyProject();
    p.plc.cards = [{ id: 'c1', tag: 'A1', typeId: 'custom', station: 'PLC1', start: { DI: 0, DO: 0 }, custom: { name: '8 DI', channels: { DI: 8 } } }];
    const pg = p.pages[0];
    const b1 = S('b1', 'coil', 40, 20, 'B1', { description: 'Fotocellula ingresso' });
    const x2 = S('x2', 'conn_male', 40, 60, 'X2:1');
    const di = S('di', 'plc_di', 40, 140, 'A1', { plcChannel: 'DI0' });
    const bot = pinsWorld(b1, getSymbol('coil')!).sort((a, b) => b.y - a.y)[0];
    const x2p = pinsWorld(x2, getSymbol('conn_male')!).sort((a, b) => a.y - b.y);
    const dip = pinsWorld(di, getSymbol('plc_di')!)[0];
    pg.elements = [b1, x2, di, W('w1', { x: bot.x, y: bot.y }, { x: x2p[0].x, y: x2p[0].y }), W('w2', { x: x2p[1].x, y: x2p[1].y }, { x: dip.x, y: dip.y })];
    const r = ioAssignments(p).find(x => x.channel === 'DI0')!;
    expect(r.comment).toBe('Fotocellula ingresso');
    expect(r.connected).toBe('-X2:1');
  });
});

describe('connettori che fanno parte del cavo', () => {
  it('estremità del cavo; fuori dalla lista connettori, nella lista cavi', async () => {
    const { cableEnds, cableEndsText } = await import('../src/model/cableEnds');
    const { connectorReport, cableReport } = await import('../src/model/reports');
    const p = project();
    p.connectors = { X2: { type: 'm12-a-4', gender: 'M' } };
    expect(connectorReport(p).rows.map(r => r[0])).toContain('-X2');
    p.connectors.X2.ofCable = true;
    const e = cableEnds(p).get('c1')!;
    expect(e.fieldTags).toEqual(['B1']);
    expect(e.conns).toEqual([{ conn: 'X2', type: 'M12 A 4p M', towards: [expect.stringMatching(/^-B1:/)], side: 'A' }]);
    expect(cableEndsText(e)).toBe('A: M12 A 4p M → -B1');
    expect(connectorReport(p).rows.map(r => r[0])).not.toContain('-X2');
    const lc = cableReport(p);
    expect(lc.rows[0][lc.columns.indexOf('Estremità')]).toBe('A: M12 A 4p M → -B1');
  });
  it('spuntato «fa parte del cavo» il connettore prende la sigla dal cavo', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(project());
    st().setConnectorOfCable('X2', true);
    const pins = st().project.pages[0].elements.filter(e => e.kind === 'symbol' && e.symbolId === 'conn_male') as SymbolInstance[];
    expect(pins.map(e => e.tag)).toEqual(['W1-A:1']);
    expect(st().project.connectors?.['W1-A']?.ofCable).toBe(true);
    expect(st().project.connectors?.X2).toBeUndefined();
  });
});

describe('dispositivo in campo del cavo', () => {
  it('un conduttore su un potenziale comune (0V) non porta il cavo nella tabella di chi sta su quel potenziale', async () => {
    const { cableEnds } = await import('../src/model/cableEnds');
    const p = emptyProject();
    const pg = p.pages[0];
    // Cavo di 3 conduttori tra due morsettiere; il terzo conduttore è lo 0V, a cui è collegato anche K1
    const t = (id: string, x: number, y: number, tag: string) => S(id, 'terminal', x, y, tag);
    const a = [t('a1', 40, 40, 'X1:1'), t('a2', 48, 40, 'X1:2'), t('a3', 56, 40, 'X1:3')];
    const b = [t('b1', 40, 120, 'X2:1'), t('b2', 48, 120, 'X2:2'), t('b3', 56, 120, 'X2:3')];
    const k1 = S('k1', 'coil', 120, 140, 'K1');
    const pt = (e: SymbolInstance, low: boolean) => { const q = pinsWorld(e, getSymbol(e.symbolId)!).sort((m, n) => m.y - n.y); return low ? q[q.length - 1] : q[0]; };
    const wires = a.map((e, i) => W(`w${i}`, { x: pt(e, true).x, y: pt(e, true).y }, { x: pt(b[i], false).x, y: pt(b[i], false).y }));
    const kp = pt(k1, false), b3 = pt(b[2], true);
    wires.push(W('w0v', { x: b3.x, y: b3.y }, { x: b3.x, y: kp.y - 10 }, { x: kp.x, y: kp.y - 10 }, { x: kp.x, y: kp.y }));
    const line: CableLine = { kind: 'cable', id: 'l1', cableId: 'c1', points: [{ x: 30, y: 80 }, { x: 66, y: 80 }] };
    pg.elements = [...a, ...b, k1, ...wires, line];
    p.cables = [{ id: 'c1', tag: 'W9', conductors: ['1', '2', '3'], assign: {} }];
    expect(cableEnds(p).get('c1')!.fieldTags).toEqual([]);
  });
});

describe('connettori del cavo: solo quelli all\'estremità del cavo', () => {
  it('un connettore su un\'altra pagina raggiunto tramite un potenziale comune non è del cavo e non si rinomina', async () => {
    const { cableEnds } = await import('../src/model/cableEnds');
    const { checkProject } = await import('../src/model/checks');
    const p = project();
    // Pagina 2: un altro connettore sul potenziale 0V, che è anche sul conduttore del cavo a pagina 1
    p.pages.push({ id: 'pg2', name: '2', title: '', type: 'multiline', elements: [] });
    const pot = (id: string, at: Pt) => S(id, 'potential', at.x, at.y, '0V');
    const w2 = p.pages[0].elements.find(e => e.id === 'w2') as Wire;
    p.pages[0].elements.push(pot('pa', w2.points[1]));
    const x9 = S('x9', 'conn_male', 200, 60, 'X9:1');
    const x9p = pinsWorld(x9, getSymbol('conn_male')!).sort((a, b) => a.y - b.y);
    p.pages[1].elements = [x9, pot('pb', { x: x9p[0].x, y: x9p[0].y })];
    p.connectors = { X2: { ofCable: true }, X9: { ofCable: true } };
    expect(cableEnds(p).get('c1')!.conns.map(c => c.conn)).toEqual(['X2']);
    // X9 è segnato «del cavo» ma non tocca nessun cavo: il controllo lo dice
    const msgs = checkProject(p).filter(x => x.kind === 'Connettori').map(x => x.msg);
    expect(msgs.some(m => /-X9 fa parte di un cavo ma non è collegato/.test(m))).toBe(true);
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(p);
    st().setConnectorOfCable('X9', true);
    expect((st().project.pages[1].elements.find(e => e.id === 'x9') as SymbolInstance).tag).toBe('X9:1');
  });
  it('elimina connettore: dati e pin su tutte le pagine, i fili si ricuciono', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p = project();
    p.connectors = { X2: { description: 'spina' } };
    st().loadProject(p);
    st().deleteConnector('X2');
    const q = st().project;
    expect(q.connectors?.X2).toBeUndefined();
    expect(q.pages[0].elements.some(e => e.id === 'x2')).toBe(false);
    const { allConnectors } = await import('../src/model/connectors');
    expect(allConnectors(q)).not.toContain('X2');
  });
});

describe('pin di un connettore nuovo', () => {
  it('senza numero di pin si continua con il pin dopo l\'ultimo, invece di fermarsi al primo', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    st().setTool({ kind: 'place', symbolId: 'conn_male', rot: 0, tag: 'X77:1' });
    st().placeSymbol('conn_male', { x: 40, y: 40 }, 0, undefined, 'X77:1');
    const t = st().tool;
    expect(t.kind === 'place' && t.tag).toBe('X77:2');
  });
});

describe('connettore appena iniziato sul cavo', () => {
  it('un solo pin collegato a un cavo di 4 conduttori: fa parte del cavo e prende la sigla dal cavo', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p = project();
    // Il cavo ha 4 conduttori disegnati; per ora uno solo arriva al connettore nuovo (pin X2:1)
    for (const x of [44, 46, 48]) p.pages[0].elements.push(W(`c${x}`, { x, y: 90 }, { x, y: 110 }));
    p.cables![0].pieces = true;
    st().loadProject(p);
    const { cableInfos } = await import('../src/model/cables');
    expect(cableInfos(st().project)[0].conductors.length).toBe(4);
    st().setConnectorOfCable('X2', true);
    expect((st().project.pages[0].elements.find(e => e.id === 'x2') as SymbolInstance).tag).toBe('W1-A:1');
  });
  it('connettore con solo 1 pin su 3 collegati sui conduttori del cavo: non è del cavo', async () => {
    const { cableEnds } = await import('../src/model/cableEnds');
    const p = project();
    const pg = p.pages[0];
    // Altri due pin di X2 collegati a fili che non sono del cavo
    for (const [i, x] of [[2, 140], [3, 170]] as const) {
      const e = S(`x2_${i}`, 'conn_male', x, 60, `X2:${i}`);
      const q = pinsWorld(e, getSymbol('conn_male')!).sort((a, b) => a.y - b.y);
      pg.elements.push(e, W(`wx${i}`, { x: q[1].x, y: q[1].y }, { x: q[1].x, y: q[1].y + 30 }));
    }
    p.connectors = { X2: { ofCable: true } };
    expect(cableEnds(p).get('c1')!.conns).toEqual([]);
  });
});

describe('connettori senza pin', () => {
  it('si eliminano i dati dei connettori che non hanno pin sullo schema', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p = project();
    p.connectors = { X2: { description: 'spina' }, '1102X1': { description: 'robot' }, '1102X2.A': { description: 'robot A' } };
    st().loadProject(p);
    st().deleteEmptyConnectors();
    expect(Object.keys(st().project.connectors ?? {})).toEqual(['X2']);
  });
});
