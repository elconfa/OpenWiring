import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { networkLinks, networkNodes, networkProblems, devicePanels, newPanel, protocolOf } from '../src/model/network';
import { networkLinkReport, networkNodeReport, connectionReport } from '../src/model/reports';
import { checkProject } from '../src/model/checks';
import { derive } from '../src/model/derive';
import { makeLabels, DEFAULT_LABEL_OPTIONS } from '../src/model/labels';

describe('reti e quadri', () => {
  const p = exampleProject();
  it('collegamenti di rete con porte, protocolli e quadri', () => {
    const l = networkLinks(p).map(x => `${x.protocol} -${x.a.el.inst.tag}:${x.a.port} → -${x.b.el.inst.tag}:${x.b.port} ${x.crossPanel ? 'tra quadri' : ''}`.trim());
    expect(l.sort()).toEqual([
      'Modbus RTU -3A1:X2 RS485 → -5U1:IN tra quadri',
      'Modbus RTU -5U1:OUT → -5R1:',
      'Profinet -3A1:X1 P1 → -5A1:P1',
      'Profinet -5A1:P2 → -5A2:P1 tra quadri',
    ]);
  });
  it('nodi con indirizzo e quadro; il quadro di un dispositivo viene dal nodo, dal luogo o dalla pagina', () => {
    const n = networkNodes(p);
    expect(n.find(x => x.el.inst.tag === '5A2')).toMatchObject({ address: 'io-slave1', panel: { code: 'Q2' }, protocols: ['Profinet'] });
    expect(n.find(x => x.el.inst.tag === '3A1')?.protocols.sort()).toEqual(['Modbus RTU', 'Profinet']);
    const dp = devicePanels(p);
    expect(dp.get('2K1')?.code).toBe('Q1'); // dalla sezione della pagina
    expect(dp.get('5U1')?.code).toBe('Q2'); // dal riquadro dello schema di rete
  });
  it('i bus non hanno numero filo e non entrano in connessioni ed etichette dei fili', () => {
    expect(connectionReport(p).rows.some(r => r[3].startsWith('-5A'))).toBe(false);
    expect(makeLabels(p, 'wires', DEFAULT_LABEL_OPTIONS).some(l => l.lines[0] === '')).toBe(false);
    const wn = derive(p).pages.get(p.pages[4].id)!.wireNumbers;
    expect(p.pages[4].elements.flatMap(e => (e.kind === 'wire' ? [wn.get(e.id)] : [])).sort()).toEqual(['Modbus RTU', 'Modbus RTU', 'Profinet', 'Profinet']);
  });
  it('liste e controlli', () => {
    expect(networkLinkReport(p).rows).toHaveLength(4);
    expect(networkNodeReport(p).rows.map(r => r[0])).toEqual(['-3A1', '-5A1', '-5A2', '-5U1']);
    expect(checkProject(p).filter(i => i.level === 'error')).toEqual([]);
    const q = structuredClone(p);
    for (const e of q.pages[4].elements) if (e.kind === 'symbol' && e.tag === '5A2') e.netAddress = 'ID 1';
    for (const e of q.pages[4].elements) if (e.kind === 'symbol' && e.tag === '5U1') e.netAddress = 'ID 1';
    // Reti diverse (Profinet e Modbus RTU): lo stesso indirizzo va bene, ma «ID 1» non è un nome Profinet
    expect(networkProblems(q).map(x => x.msg)).toEqual(['-5A2: nome Profinet «ID 1» non valido (solo lettere minuscole, cifre, trattini e punti)']);
    for (const e of q.pages[4].elements) if (e.kind === 'symbol' && e.tag === '5A2') e.netAddress = 'plc-master';
    expect(networkProblems(q).map(x => x.msg)).toEqual(['Profinet: indirizzo plc-master usato da -3A1 e -5A2']);
  });
  it('nuovo quadro con codice libero e protocolli', () => {
    expect(newPanel(p)).toMatchObject({ code: 'Q3', name: 'Slave 2' });
    expect(protocolOf('profinet')?.color).toBe('#1a7f37');
    expect(protocolOf('Bus personale')?.name).toBe('Bus personale');
  });
});

describe('luoghi (contenitori)', async () => {
  const { placeables } = await import('../src/model/layout');
  const { locationProblems } = await import('../src/model/network');
  it('il luogo scritto sul dispositivo vale più della pagina; layout filtrato per luogo', () => {
    const p = exampleProject();
    p.panels!.push({ id: 'q-bm', code: 'BM', name: 'Bordo macchina', kind: 'Bordo macchina' }, { id: 'q-p1', code: 'P1', name: 'Pulsantiera 2', kind: 'Pulsantiera' });
    for (const pg of p.pages) for (const e of pg.elements) {
      if (e.kind === 'symbol' && e.tag === '1M1') e.loc = 'BM';
      if (e.kind === 'symbol' && (e.tag === '2S1' || e.tag === '2S2')) e.loc = 'P1';
    }
    const dp = devicePanels(p);
    expect(dp.get('1M1')?.code).toBe('BM');
    expect(dp.get('2S1')?.code).toBe('P1');
    expect(dp.get('2K1')?.code).toBe('Q1');
    expect(networkNodeReport(p).rows.length).toBe(4);
    expect(placeables(p, [], 'q-p1').map(x => x.ref).sort()).toEqual(['2S1', '2S2']);
    expect(placeables(p, [], 'q-master').some(x => x.ref === '1M1')).toBe(false);
    expect(locationProblems(p)).toEqual([]);
    for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.tag === '5A2') e.loc = 'ZZ';
    expect(locationProblems(p).map(x => x.msg)).toEqual(['-5A2: luogo +ZZ non definito tra i luoghi del progetto', '-5A2: luogo +ZZ ma disegnato nel riquadro +Q2']);
  });
});

describe('schema unifilare', () => {
  it('rappresenta i dispositivi del multifilare senza entrare nei conduttori', async () => {
    const { computeNetlist } = await import('../src/model/netlist');
    const p = exampleProject();
    const sl = p.pages.find(pg => pg.type === 'singleline')!;
    const d = derive(p);
    const motor = sl.elements.find(e => e.kind === 'symbol' && e.tag === '1M1')!;
    // Rimando al motore nel multifilare (pagina 1)
    expect(d.pages.get(sl.id)!.xrefs.get(motor.id)?.mainLocation).toMatch(/^1\./);
    const nl = computeNetlist(p);
    expect(nl.nets.some(n => n.pins.some(x => x.el.page.id === sl.id))).toBe(false);
    expect(sl.elements.filter(e => e.kind === 'wire').every(w => !nl.wireNet.get(w.id)?.wireNo)).toBe(true);
    // Testo della linea al posto del numero filo
    expect([...d.pages.get(sl.id)!.wireNumbers.values()]).toContain('3/N/PE ~400 V 50 Hz');
    expect(checkProject(p).filter(i => i.kind === 'Unifilare')).toEqual([]);
  });
});
