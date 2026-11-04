import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Wire } from '../src/model/types';
import { exampleProject } from '../src/model/example';
import { pagesToText, importPagesText, symbolCatalog } from '../src/model/textFormat';
import { connectionReport, deviceReport } from '../src/model/reports';
import { checkProject } from '../src/model/checks';

const conns = (p: ReturnType<typeof exampleProject>) => connectionReport(p).rows.map(r => `${r[1]} ${r[3]} ${r[5]}`).sort();

describe('formato testo delle pagine', () => {
  it('esporta e reimporta senza perdere collegamenti, sigle e dati', () => {
    const p = exampleProject();
    const txt = pagesToText(p);
    expect(txt).toContain('pagina 2 "Circuito di comando" tipo=schema luogo=Q1');
    expect(txt).toMatch(/simbolo coil -2K1 @60,140 descr="Contattore pompa" dati="Bobina 24 V DC"/);
    expect(txt).toMatch(/filo 60,88 60,140 .*# -2S2:14 → -2K1:A1 · n\. 2\.02/);
    expect(txt).toContain('filo 28,24 400,24   # L1 → fine barra · L1');
    const q = exampleProject();
    const r = importPagesText(q, txt);
    expect(r.errors).toEqual([]);
    expect(r.replaced).toEqual(['1', '2', '3', '5', '6']);
    expect(conns(q)).toEqual(conns(p));
    expect(deviceReport(q).rows).toEqual(deviceReport(p).rows);
    expect(pagesToText(q)).toBe(txt);
  });
  it('pagina nuova scritta per sigle: collegamenti a L e sigle automatiche', () => {
    const p = exampleProject();
    // Le barre della pagina 3 proseguono nella pagina nuova (una partenza per ogni arrivo)
    const out = (tag: string, y: number) => ({ kind: 'symbol' as const, id: `out${y}`, symbolId: 'link', x: 400, y, rot: 270 as const, tag, pinLabels: {}, autoPins: true });
    p.pages[2].elements.push(out('+24V', 24), out('0V', 232));
    const r = importPagesText(p, `
pagina 7 "Ventilazione quadro"
  simbolo link_in +24V @28,24 rot=90
  filo 28,24 400,24
  simbolo link_in 0V @28,232 rot=90
  filo 28,232 400,232
  simbolo pb_no -? @100,60 descr="Marcia ventilatore"
  simbolo coil -7K1 @140,140 descr="Contattore ventilatore"
  collega -7S1:13 100,24
  collega -7S1:14 -7K1:A1
  collega -7K1:A2 140,232
`);
    expect(r.errors).toEqual([]);
    expect(r.added).toEqual(['7']);
    const pg = p.pages.find(x => x.name === '7')!;
    const wires = pg.elements.filter(e => e.kind === 'wire');
    expect(wires.map(w => w.kind === 'wire' && w.points.map(x => `${x.x},${x.y}`).join(' '))).toContain('100,76 100,140 140,140');
    expect(conns(p)).toContain('7.01 -7S1:14 -7K1:A1');
    const issues = checkProject(p).filter(i => i.pageId === pg.id);
    expect(issues).toEqual([]);
  });
  it('errori con il numero di riga; il progetto non cambia', () => {
    const p = exampleProject();
    const before = JSON.stringify(p);
    const r = importPagesText(p, 'pagina 2 "Circuito"\n  simbolo nonesiste -K9 @10,10\n  collega -2K1:A9 -2S1:13\n  filo 10,10');
    expect(r.errors.map(e => e.line)).toEqual([2, 4]);
    const r2 = importPagesText(p, 'pagina 2 "Circuito"\n  simbolo coil -2K1 @60,140\n  collega -2K1:A9 60,100');
    expect(r2.errors[0]).toMatchObject({ line: 3, msg: '-2K1:A9: punto di connessione inesistente; -2K1 ha A1, A2' });
    expect(JSON.stringify(p)).toBe(before);
  });
  it('catalogo dei simboli con i punti di connessione', () => {
    const c = symbolCatalog(exampleProject());
    expect(c).toContain('#   coil · Bobina relè/contattore · K · principale (bobina) · A1 (0,0↑) A2 (0,16↓)');
  });
});

describe('progetto intero da testo', () => {
  it('crea intestazione, luoghi, cavi e schede PLC da un progetto vuoto', async () => {
    const { emptyProject } = await import('../src/model/project');
    const p = emptyProject();
    const r = importPagesText(p, `
progetto nome="Impianto lavaggio" cliente="Rossi Srl" disegno=SE-0042
luogo +QE "Quadro elettrico" tipo="Quadro elettrico"
luogo +BM "Bordo macchina" tipo="Bordo macchina"
cavo -1W1 tipo=FG16OR16 sezione=2,5 conduttori="BN BK GY GNYE" lunghezza=12
scheda -3A1 tipo=cpu-8di-6do stazione=PLC1 descr="CPU"
scheda -3A2 tipo=custom nome="ET200SP 16DI" canali="DI=16"
pagina 3 "Ingressi" luogo=QE
  simbolo link_in +24V @28,24 rot=90
  filo 28,24 400,24
  simbolo link_in 0V @28,232 rot=90
  filo 28,232 400,232
  simbolo pb_no -3S1 @60,40 descr="Start" luogo=BM
  simbolo plc_di -3A2 @60,80 canale=DI0 variabile=Start
  collega -3S1:13 60,24
  collega -3S1:14 -3A2:DI0
  collega -3A2:DI0 60,232
`);
    expect(r.errors).toEqual([]);
    expect(p.info).toMatchObject({ name: 'Impianto lavaggio', customer: 'Rossi Srl', drawingNr: 'SE-0042' });
    expect(p.panels!.map(x => `${x.code} ${x.name}`)).toEqual(['QE Quadro elettrico', 'BM Bordo macchina']);
    expect(p.cables![0]).toMatchObject({ tag: '1W1', cross: '2,5', conductors: ['BN', 'BK', 'GY', 'GNYE'], length: 12 });
    expect(p.plc.cards.map(c => `${c.tag} ${c.typeId} ${JSON.stringify(c.start)}`)).toEqual(['3A1 cpu-8di-6do {"DI":0,"DO":0}', '3A2 custom {"DI":1}']);
    const issues = checkProject(p).filter(i => i.level === 'error');
    expect(issues).toEqual([]);
    const txt = pagesToText(p);
    expect(txt).toContain('scheda -3A2 tipo=custom nome="ET200SP 16DI" canali="DI=16" stazione=PLC1');
    expect(txt).toContain('luogo +BM "Bordo macchina" tipo="Bordo macchina"');
  });
});

describe('simboli definiti nel testo', () => {
  it('scatola con morsetti, usata e riesportata', () => {
    const p = exampleProject();
    const r = importPagesText(p, `
simbolodef vfd3 "Inverter" lettera=U pin="L1:0,0 L2:8,0 L3:16,0 U:0,32 V:8,32 W:16,32"
pagina 8 "Inverter nastro"
  simbolo potential L1 @28,24
  filo 28,24 400,24
  simbolo vfd3 -8U1 @100,60 descr="Inverter nastro"
  collega -8U1:L1 100,24
  simbolo motor3 -8M1 @108,140
  collega -8U1:U -8M1:U1
  collega -8U1:V -8M1:V1
  collega -8U1:W -8M1:W1
`);
    expect(r.errors).toEqual([]);
    const sd = p.customSymbols.find(s => s.id === 'vfd3')!;
    expect(sd.pins.map(x => `${x.label}${x.dir}`)).toEqual(['L1up', 'L2up', 'L3up', 'Udown', 'Vdown', 'Wdown']);
    expect(connectionReport(p).rows.map(r => `${r[3]} ${r[5]}`)).toContain('-8U1:U -8M1:U1');
    expect(pagesToText(p)).toContain('simbolodef vfd3 "Inverter" lettera=U pin=');
    expect(symbolCatalog(p)).toContain('vfd3 · Inverter · U');
  });
});

describe('attributi con la virgola', () => {
  it('"sezione=2,5" su un filo non diventa un punto', () => {
    const p = emptyProject();
    const r = importPagesText(p, 'pagina 9 "Prova"\n  filo 60,24 60,72 sezione=2,5\n  collega 100,24 100,72 sezione=1,5');
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    const wires = p.pages.find(x => x.name === '9')!.elements.filter(e => e.kind === 'wire') as Wire[];
    expect(wires[0].points).toEqual([{ x: 60, y: 24 }, { x: 60, y: 72 }]);
    expect(wires[0].cross).toBe('2,5');
  });
});
