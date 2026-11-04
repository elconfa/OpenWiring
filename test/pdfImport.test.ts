import { describe, it, expect } from 'vitest';
import type { RawPage, RawSeg, RawText } from '../src/io/pdfRead';
import { joinGlyphs } from '../src/io/pdfRead';
import { pdfToProject, sheetInfo } from '../src/io/pdfSchematic';
import { computeNetlist } from '../src/model/netlist';
import type { SymbolInstance, Wire } from '../src/model/types';

let path = 0;
const L = (x1: number, y1: number, x2: number, y2: number, color = '#000000'): RawSeg => ({ x1, y1, x2, y2, color, path: ++path });
const T = (s: string, x: number, y: number, size = 3.5, rot = 0): RawText => ({ s, x, y, size, w: s.length * size * 0.55, rot });
const circle = (cx: number, cy: number, r: number): RawSeg[] => Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2, b = ((i + 1) / 12) * Math.PI * 2;
  return { x1: cx + r * Math.cos(a), y1: cy + r * Math.sin(a), x2: cx + r * Math.cos(b), y2: cy + r * Math.sin(b), color: '#000000', path: path + 1 };
});

/** Foglio come quelli di SEE Electrical: cornice, cartiglio, fili, un componente, un morsetto e un rimando */
function sheet(no: string, title: string, total = '5'): RawPage {
  path = 0;
  const segs: RawSeg[] = [
    // Cornice e cartiglio
    L(10, 10, 10, 287), L(410, 10, 410, 287), L(10, 287, 410, 287), L(10, 257, 410, 257),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => L(10 + 40 * i, 14, 50 + 40 * i, 14)),
    // Filo L1 orizzontale con rimando a destra (freccia) e derivazione verticale verso il componente
    L(40, 33, 152, 33), L(152, 33, 380, 33), L(380, 33, 377.7, 31.8), L(380, 33, 377.7, 34.2),
    L(152, 33, 152, 81),
    // Componente: corpo rettangolare con un codolo sopra e uno sotto
    L(152, 81, 152, 84), L(148, 84, 156, 84), L(156, 84, 156, 92), L(156, 92, 148, 92), L(148, 92, 148, 84), L(152, 92, 152, 97),
    // Filo verso il morsetto e dal morsetto in giù (blu)
    L(152, 97, 152, 121, '#0000ff'), L(152, 121, 152, 122), ...circle(152, 123, 1), L(152, 124, 152, 125), L(152, 125, 152, 161, '#0000ff'),
    // Tratto-punto del PE: trattini verdi
    L(40, 57, 43, 57, '#00ff00'), L(44, 57, 44.3, 57, '#00ff00'), L(45.3, 57, 48.3, 57, '#00ff00'), L(49.3, 57, 49.6, 57, '#00ff00'), L(50.6, 57, 56, 57, '#00ff00'),
  ];
  const texts: RawText[] = [
    T('TITOLO:', 262, 276.5), T(`Q1.1 ${title}`, 286, 276.5), T('PROGETTO:', 262, 260.5), T('DP999', 286, 260.5),
    T('CLIENTE:', 262, 271.5), T('Cliente prova', 286, 271.5), T('FOGLIO', 387, 261.5), T(no, 404, 262.6, 6.9),
    T('DI', 387, 269.5), T(total, 401, 270.7, 6.9),
    T('L1-1.1', 200, 32.4, 2.5), T('11.0', 381.5, 34, 3.5), T('-10K1', 132, 89, 4.1),
    T('A1', 153, 83, 2.5, -90), T('A2', 153, 99.5, 2.5, -90),
    T('X1.1.2-1', 150, 133, 3.5, -90),
  ];
  return { w: 420, h: 297, segs, texts };
}

describe('import di schemi da PDF', () => {
  it('legge il cartiglio di SEE Electrical', () => {
    const i = sheetInfo(sheet('10', 'Ingresso linea'))!;
    expect(i).toMatchObject({ sheet: '10', title: 'Q1.1 Ingresso linea', project: 'DP999', customer: 'Cliente prova', total: '5' });
  });
  it('ricostruisce fili, componente, morsetto e rimando', () => {
    const { project, report } = pdfToProject([sheet('10', 'Ingresso linea')]);
    expect(report.imported).toBe(1);
    const pg = project.pages[0];
    expect(pg.name).toBe('10');
    expect(pg.title).toBe('Ingresso linea');
    expect(project.panels?.[0].code).toBe('Q1.1');
    expect(project.info.name).toBe('DP999');
    const syms = pg.elements.filter((e): e is SymbolInstance => e.kind === 'symbol');
    const wires = pg.elements.filter((e): e is Wire => e.kind === 'wire');
    // Fili sulla griglia di 4 mm, colori dal disegno, PE unito in un solo tratto tratteggiato
    for (const w of wires) for (const p of w.points) { expect(Math.abs(p.x % 4)).toBe(0); expect(Math.abs(p.y % 4)).toBe(0); }
    expect(wires.filter(w => w.color === 'BU')).toHaveLength(2);
    expect(wires.filter(w => w.color === 'GNYE')).toHaveLength(1);
    // Il nome scritto sul filo diventa il numero filo e il nome del rimando
    expect(wires.some(w => w.number === 'L1-1.1')).toBe(true);
    const link = syms.find(s => s.symbolId === 'link');
    expect(link?.tag).toBe('L1-1.1');
    expect(link?.rot).toBe(270);
    // Componente con sigla e due morsetti con i loro nomi
    const k = syms.find(s => s.tag === '10K1')!;
    expect(k).toBeDefined();
    const def = project.customSymbols.find(s => s.id === k.symbolId)!;
    expect(def.pins).toHaveLength(2);
    expect(def.letter).toBe('K');
    expect(Object.values(k.pinLabels).sort()).toEqual(['A1', 'A2']);
    // Morsetto di morsettiera: X1.1.2:1, il numero filo lo attraversa
    const x = syms.find(s => s.tag === 'X1.1.2:1')!;
    expect(project.customSymbols.find(s => s.id === x.symbolId)?.role).toBe('terminal');
    const nets = computeNetlist(project).nets;
    const kNet = nets.find(n => n.pins.some(p => p.ref === '10K1:A1'));
    expect(kNet?.wireNo).toBe('L1-1.1');
    const blue = nets.filter(n => n.wires.some(w => w.wire.color === 'BU'));
    expect(new Set(blue.map(n => n.wireNo)).size).toBe(1);
  });
  it('salta le pagine di lista (altra serie di fogli) e unifica i simboli uguali', () => {
    const { project, report } = pdfToProject([sheet('10', 'A'), sheet('11', 'B'), sheet('3', 'Morsettiera X1', '27')]);
    expect(report.imported).toBe(2);
    expect(report.skipped).toEqual([3]);
    const ids = project.pages.map(pg => pg.elements.find((e): e is SymbolInstance => e.kind === 'symbol' && e.tag === '10K1')?.symbolId);
    expect(ids[0]).toBe(ids[1]);
  });
  it('unisce le lettere posizionate una per una senza spazi spuri', () => {
    const g = (u: string, x: number) => ({ u, x, y: 100, dx: 1, dy: 0, size: 10, adv: 6 });
    // "Ingr esso": tra "r" ed "e" c'è solo uno scarto di crenatura; lo spazio vero è un carattere
    const t = joinGlyphs([g('I', 0), g('n', 3), g('g', 9), g('r', 15), g('e', 20.5), g('s', 26), g('s', 31), g('o', 36), g(' ', 42), g('l', 45), g('i', 48)]);
    expect(t.map(x => x.s)).toEqual(['Ingresso li']);
  });
});
