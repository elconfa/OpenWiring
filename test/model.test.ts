import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { computeNetlist } from '../src/model/netlist';
import { crossReferences, effectivePinLabels, allPlaced } from '../src/model/devices';
import { bomReport, terminalReport, connectionReport, deviceReport } from '../src/model/reports';
import { nextTagFor, formatPattern, patternRegex, renumberDevices } from '../src/model/numbering';
import { pageToDxf } from '../src/io/dxf';
import { moveElements } from '../src/model/store';

type P = ReturnType<typeof exampleProject>;
const byTag = (p: P, tag: string, sym?: string) =>
  allPlaced(p).filter(e => e.inst.tag === tag && (!sym || e.sym.id === sym));

describe('schema di esempio', () => {
  const p = exampleProject();
  const nl = computeNetlist(p);
  const netOf = (ref: string) => nl.nets.find(n => n.pins.some(x => x.ref === ref));

  it('collega i potenziali con le giunzioni a T', () => {
    expect(netOf('1Q1:1')?.name).toBe('L1');
    expect(netOf('1Q1:3')?.name).toBe('L2');
    expect(netOf('1Q1:5')?.name).toBe('L3');
    expect(netOf('1F1:1')?.name).toBe('L1');
    expect(netOf('1F1:3')?.name).toBe('N');
    expect(netOf('1T1:N')?.pins.map(x => x.ref)).toContain('1F1:4');
    expect(netOf('1M1:PE')?.pins.map(x => x.ref)).toContain('X1:4');
  });
  it('i fili che si incrociano senza giunzione non sono collegati', () => {
    expect(netOf('1Q1:5')?.pins.some(x => x.ref === '1T1:N')).toBe(false);
  });
  it('i rimandi uniscono le pagine', () => {
    const plus = netOf('1T1:+');
    expect(plus?.name).toBe('+24V');
    expect(plus?.pins.map(x => x.ref)).toEqual(expect.arrayContaining(['2S1:11', '2K1:23', '2K1:31']));
    expect(netOf('2K1:A2')?.pins.map(x => x.ref)).toContain('1T1:-');
  });
  it('autoritenuta: contatto 13 di -2K1 in parallelo al pulsante -2S2', () => {
    expect(netOf('2S2:13')?.pins.map(x => x.ref)).toContain('2K1:13');
    expect(netOf('2S2:14')?.pins.map(x => x.ref)).toEqual(expect.arrayContaining(['2K1:14', '2K1:A1']));
  });
  it('numera i contatti ausiliari e calcola i riferimenti incrociati', () => {
    const labels = effectivePinLabels(p);
    const contacts = byTag(p, '2K1').filter(e => e.sym.role === 'aux' && e.sym.contact !== 'power');
    expect(contacts.map(c => Object.values(labels.get(c.inst.id)!).join('-'))).toEqual(['13-14', '23-24', '31-32']);
    const xr = crossReferences(p);
    const coil = byTag(p, '2K1', 'coil')[0];
    expect(xr.get(coil.inst.id)?.contacts?.map(c => c.location)).toEqual(['1.3', '2.2', '2.4', '2.5']);
    expect(xr.get(contacts[0].inst.id)?.mainLocation).toBe('2.2');
  });
  it('liste di progetto', () => {
    const t = terminalReport(p);
    expect(t.rows.map(r => r[0] + ':' + r[1])).toEqual(['X1:1', 'X1:2', 'X1:3', 'X1:4']);
    expect(t.rows[0][4]).toBe('-2K1:2');
    expect(t.rows[0][6]).toBe('-1M1:U1');
    expect(t.rows[3][5]).toBe('PE');
    expect(deviceReport(p).rows.map(r => r[0])).toEqual([...['-1F1', '-1M1', '-1Q1', '-1T1', '-2K1', '-2P1', '-2P2', '-2S1', '-2S2', '-3A1', '-3B1', '-3M1', '-3S1', '-5A1'].map(t => `+Q1${t}`), '+Q2-5A2', '+Q2-5R1', '+Q2-5U1']);
    expect(connectionReport(p).rows.length).toBeGreaterThan(15);
  });
  it('numeri filo per pagina nel formato pagina.nn', () => {
    // Prima colonna con fili non di potenziale: tra -1Q1 e -1K1, poi verso X1 e il motore
    expect(netOf('1Q1:2')?.wireNo).toBe('1.01');
    expect(netOf('2K1:1')?.wireNo).toBe('1.01');
    expect(netOf('2K1:2')?.wireNo).toBe('1.02');
    // Il numero filo attraversa il morsetto X1:1 senza cambiare
    expect(netOf('X1:1')?.pins.length && netOf('1M1:U1')?.wireNo).toBe('1.02');
    // I potenziali con nome tengono il nome
    expect(netOf('1Q1:1')?.wireNo).toBe('L1');
    // Il conduttore +24V nasce a pagina 1 e mantiene lo stesso numero a pagina 2
    expect(netOf('2S1:11')?.wireNo).toBe(netOf('1T1:+')?.wireNo);
    // …che è il nome del rimando
    expect(netOf('2S1:11')?.wireNo).toBe('+24V');
    expect(netOf('2S1:12')?.wireNo).toBe('2.01');
    const sl = new Set(p.pages.filter(pg => pg.type === 'singleline').map(pg => pg.id));
    const numbered = nl.nets.filter(n => n.wires.length && !n.named && !n.wires.every(w => w.wire.bus || sl.has(w.pageId)));
    // Un numero per gruppo (i conduttori uniti da un morsetto condividono il numero)
    const numbers = [...new Map(numbered.map(n => [n.group, n.wireNo])).values()];
    // I collegamenti di rete non hanno numero filo
    expect(nl.nets.filter(n => n.wires.some(w => w.wire.bus)).every(n => n.wireNo === '')).toBe(true);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
  it('il numero filo cambia dopo un morsetto se lo si sceglie', () => {
    const q = structuredClone(p);
    const x1 = q.pages.flatMap(pg => pg.elements).find(e => e.kind === 'symbol' && e.tag === 'X1:1');
    if (x1?.kind === 'symbol') x1.wirePass = false;
    const nets = computeNetlist(q).nets;
    const of = (r: string) => nets.find(n => n.pins.some(x => x.ref === r));
    expect(of('2K1:2')?.wireNo).toBe('1.02');
    expect(of('1M1:U1')?.wireNo).not.toBe('1.02');
  });
  it('numero filo manuale', () => {
    const q = structuredClone(p);
    const net = computeNetlist(q).nets.find(n => n.pins.some(x => x.ref === '2S1:12'))!;
    const w = q.pages[1].elements.find(e => e.id === net.wires[0].wire.id)!;
    if (w.kind === 'wire') w.number = 'EM-1';
    expect(computeNetlist(q).nets.find(n => n.pins.some(x => x.ref === '2S2:13'))?.wireNo).toBe('EM-1');
  });
  it('export DXF', () => {
    const dxf = pageToDxf(p, p.pages[0]);
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('NUMERI_FILO');
    expect(dxf.trim().endsWith('EOF')).toBe(true);
  });
  it('spostando un simbolo i fili collegati seguono', () => {
    const q = structuredClone(p);
    const pg = q.pages[1];
    const lamp = pg.elements.find(e => e.kind === 'symbol' && e.tag === '2P1')!;
    moveElements(q, pg, new Set([lamp.id]), 8, 0);
    const n = computeNetlist(q).nets.find(x => x.pins.some(y => y.ref === '2P1:X1'));
    expect(n?.pins.map(x => x.ref)).toContain('2K1:24');
  });
});

describe('numerazione', () => {
  it('modelli', () => {
    expect(formatPattern('{pagina}{lettera}{n}', { pagina: '2', colonna: 3, lettera: 'K', n: 1 })).toBe('2K1');
    expect(formatPattern('{pagina}.{n:2}', { pagina: '200', colonna: 3, lettera: '', n: 1 })).toBe('200.01');
    expect(patternRegex('{pagina}{lettera}{n}', { pagina: '2', lettera: 'K' }).exec('2K12')?.[1]).toBe('12');
    expect(patternRegex('{pagina}{lettera}{n}', { pagina: '2', lettera: 'K' }).test('20K1')).toBe(false);
  });
  it('prossima sigla per pagina o per progetto', () => {
    const p = exampleProject();
    expect(nextTagFor(p, 'K', p.pages[1], 100)).toBe('2K2');
    expect(nextTagFor(p, 'K', p.pages[0], 100)).toBe('1K1');
    p.settings.tagScope = 'project';
    expect(nextTagFor(p, 'S', p.pages[0], 100)).toBe('1S3');
    p.settings.tagFormat = '{lettera}{n}';
    renumberDevices(p);
    expect(allPlaced(p).filter(e => e.sym.letter === 'K' && e.sym.role === 'main').map(e => e.inst.tag)).toEqual(['K1']);
    expect(allPlaced(p).filter(e => e.sym.id === 'no').every(e => e.inst.tag === 'K1')).toBe(true);
  });
});

describe('numerazione fili bloccata', () => {
  it('un filo nuovo non fa scalare i numeri esistenti', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    const p1 = st().project.pages[0];
    st().setPage(p1.id);
    const numbers = () => new Map(computeNetlist(st().project).nets.flatMap(n => n.pins.map(x => [x.ref, n.wireNo] as const)));
    const before = numbers();
    expect(before.get('1Q1:2')).toBe('1.01');
    // Nuovo conduttore a sinistra di tutto: in modalità live diventerebbe 1.01
    st().placeSymbol('lamp', { x: 40, y: 100 }, 0);
    st().placeSymbol('lamp', { x: 40, y: 140 }, 0);
    st().addElements([{ kind: 'wire', id: 'wnew', points: [{ x: 40, y: 116 }, { x: 40, y: 140 }] }]);
    const after = numbers();
    for (const [ref, no] of before) expect(after.get(ref)).toBe(no);
    const maxBefore = Math.max(...[...before.values()].filter(v => /^1\.\d\d$/.test(v)).map(v => parseInt(v.slice(2), 10)));
    expect(after.get('1P1:X2')).toBe(`1.${String(maxBefore + 1).padStart(2, '0')}`);
    // Rinumera: si ricomincia da capo in ordine di colonna
    st().renumberWires();
    expect(numbers().get('1P1:X2')).toBe('1.01');
    expect(numbers().get('1Q1:2')).toBe('1.02');
  });
  it('unire due conduttori numerati tiene un solo numero', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    st().setPage(st().project.pages[1].id);
    const no = (ref: string) => computeNetlist(st().project).nets.find(n => n.pins.some(x => x.ref === ref))!.wireNo;
    const a = no('2P1:X1');
    // Collego -2P1:X1 con -2P2:X1 (y = 120)
    st().addElements([{ kind: 'wire', id: 'wj', points: [{ x: 140, y: 104 }, { x: 180, y: 104 }] }]);
    expect(no('2P2:X1')).toBe(a);
    const wires = st().project.pages[1].elements.filter(e => e.kind === 'wire' && e.number === a);
    expect(wires.length).toBe(1);
  });
});

describe('dati dei dispositivi', () => {
  it('i dati valgono per bobina e contatti e prevalgono sull\'articolo', async () => {
    const { useStore } = await import('../src/model/store');
    const { deviceInfo, buildDevices, partsIndex } = await import('../src/model/devices');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    st().setPage(st().project.pages[1].id);
    const contact = st().project.pages[1].elements.find(e => e.kind === 'symbol' && e.symbolId === 'no')!;
    // Modifico dal contatto: deve valere per tutto -2K1
    st().updateDevice(contact.id, { techData: 'Bobina 230 V AC', note: 'verificare' });
    const info = () => { const d = buildDevices(st().project).get('2K1')!; return deviceInfo(d.elements, d.main, partsIndex(st().project)); };
    expect(info().techData).toBe('Bobina 230 V AC');
    expect(info().orderNr).toBe('CT0924DC');
    const withData = allPlaced(st().project).filter(e => e.inst.tag === '2K1' && e.inst.techData);
    expect(withData.length).toBe(1);
    // Articolo assegnato: fornisce i dati mancanti, quelli scritti a mano restano
    st().addPartsToLibrary([{ partNr: 'X.1', orderNr: 'ORD-1', manufacturer: 'ACME', descr1: 'Relè X', descr2: 'dal catalogo', functionTemplates: [], attrs: {} }], 'test');
    st().updateDevice(contact.id, { orderNr: undefined, manufacturer: undefined, typeNr: undefined });
    st().assignPart([contact.id], 'X.1');
    expect(info().orderNr).toBe('ORD-1');
    expect(info().manufacturer).toBe('ACME');
    expect(info().techData).toBe('Bobina 230 V AC');
    expect(info().description).toBe('Contattore pompa');
  });
  it('distinta: anche senza articolo, raggruppata per codice di ordinazione', () => {
    const p = exampleProject();
    const bom = bomReport(p);
    expect(bom.rows).toEqual([['1', '1', '', 'CT-09-24DC', 'Contattore pompa', 'DEMO', 'CT0924DC', '-2K1']]);
  });
  it('funzione e luogo nella sigla, testi sullo schema', async () => {
    const { derive } = await import('../src/model/derive');
    const p = exampleProject();
    const coil = allPlaced(p).find(e => e.inst.tag === '2K1' && e.sym.id === 'coil')!;
    coil.inst.func = 'A1'; coil.inst.loc = 'Q1';
    expect(deviceReport(p).rows.find(r => r[0].endsWith('-2K1'))?.slice(0, 5))
      .toEqual(['=A1+Q1-2K1', 'Contattore pompa', 'Bobina 24 V DC', 'DEMO', 'CT0924DC']);
    const pd = derive(p).pages.get(p.pages[1].id)!;
    expect(pd.designations.get(coil.inst.id)).toBe('=A1+Q1-2K1');
    expect(pd.deviceLines.get(coil.inst.id)).toEqual(['Contattore pompa', 'Bobina 24 V DC']);
    // I contatti mostrano la sigla completa ma non ripetono la descrizione
    const contact = allPlaced(p).find(e => e.inst.tag === '2K1' && e.sym.id === 'no')!;
    expect(pd.designations.get(contact.inst.id)).toBe('=A1+Q1-2K1');
    expect(pd.deviceLines.has(contact.inst.id)).toBe(false);
    p.settings.showDeviceTexts = false;
    expect(derive(p).pages.get(p.pages[1].id)!.deviceLines.size).toBe(0);
    coil.inst.showTexts = true;
    expect(derive(p).pages.get(p.pages[1].id)!.deviceLines.size).toBe(1);
  });
});

describe('sezione e colore dei fili', () => {
  it('possono variare lungo lo stesso conduttore', async () => {
    const { useStore } = await import('../src/model/store');
    const { derive } = await import('../src/model/derive');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    const pg = st().project.pages[0];
    // Conduttore L1: linea principale e derivazioni verso -1Q1 e -1F1
    const net = computeNetlist(st().project).nets.find(n => n.pins.some(x => x.ref === '1Q1:1'))!;
    const toQ1 = net.wires.find(w => w.wire.points.some(p => p.x === 100 && p.y === 72))!.wire;
    const toF1 = net.wires.find(w => w.wire.points.some(p => p.x === 260 && p.y === 72))!.wire;
    st().setWireProps([toQ1.id], { cross: '6', color: 'BK' });
    st().setWireProps([toF1.id], { cross: '1,5', color: 'BK' });
    // Sulla lineetta obliqua (predefinito) e, se scelto, accanto al numero
    const ticks = derive(st().project).pages.get(pg.id)!.wireTicks!;
    expect(ticks.get(toQ1.id)).toBe('BK 6');
    expect(ticks.get(toF1.id)).toBe('BK 1,5');
    st().updateSettings({ wireDataTick: false });
    const labels = derive(st().project).pages.get(pg.id)!.wireNumbers;
    expect(labels.get(toQ1.id)).toBe('L1  6 mm² BK');
    expect(labels.get(toF1.id)).toBe('L1  1,5 mm² BK');
    // La lista connessioni usa il tratto che arriva a ciascun punto
    const conn = connectionReport(st().project).rows;
    expect(conn.find(r => r[5] === '-1Q1:1' || r[3] === '-1Q1:1')?.[7]).toBe('6');
    expect(conn.find(r => r[5] === '-1F1:1' || r[3] === '-1F1:1')?.[7]).toBe('1,5');
    // Applica a tutto il conduttore
    st().setWireProps([toQ1.id], { cross: '6', color: 'BK' }, true);
    const after = computeNetlist(st().project).nets.find(n => n.pins.some(x => x.ref === '1Q1:1'))!;
    expect(after.wires.every(w => w.wire.cross === '6')).toBe(true);
  });
  it('numero filo e dati del tratto insieme', async () => {
    const { useStore } = await import('../src/model/store');
    const { derive } = await import('../src/model/derive');
    const st = useStore.getState;
    st().loadProject(exampleProject());
    const net = computeNetlist(st().project).nets.find(n => n.pins.some(x => x.ref === '2S1:12'))!;
    st().setWireProps([net.wires[0].wire.id], { cross: '1', color: 'DBU' });
    const pd = () => derive(st().project).pages.get(st().project.pages[1].id)!;
    expect(pd().wireNumbers.get(net.wires[0].wire.id)).toBe('2.01');
    expect(pd().wireTicks!.get(net.wires[0].wire.id)).toBe('DBU 1');
    st().updateSettings({ wireDataTick: false });
    expect(pd().wireNumbers.get(net.wires[0].wire.id)).toBe('2.01  1 mm² DBU');
  });
});

describe('colore del conduttore', () => {
  it('un filo senza colore prende quello del suo conduttore, anche oltre un rimando', async () => {
    const { derive } = await import('../src/model/derive');
    const q = exampleProject();
    const p1 = q.pages[0], p2 = q.pages[1];
    // Filo che arriva al rimando +24V di pagina 1
    const w1 = p1.elements.find(e => e.kind === 'wire' && e.points.some(pt => pt.x === 300 && pt.y === 152));
    if (w1?.kind === 'wire') w1.color = 'RD';
    const rail = p2.elements.find(e => e.kind === 'wire' && e.points[0].x === 40 && e.points[0].y === 24)!;
    expect(derive(q).pages.get(p2.id)!.conductorColor?.get(rail.id)).toBe('RD');
  });
});
