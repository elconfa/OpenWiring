import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import { exampleProject } from '../src/model/example';
import type { Project, SymbolInstance, Wire, Pt } from '../src/model/types';
import { uid } from '../src/model/geometry';
import { copyElements, pasteElements, duplicatePage } from '../src/model/clipboard';
import { search, replaceHits } from '../src/model/search';
import { checkProject, contactKind } from '../src/model/checks';
import { computeNetlist } from '../src/model/netlist';

const S = (symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id: uid('s'), symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (...pts: [number, number][]): Wire => ({ kind: 'wire', id: uid('w'), points: pts.map(([x, y]): Pt => ({ x, y })) });
const tagsOf = (p: Project, pageIdx = 0) => p.pages[pageIdx].elements.flatMap(e => (e.kind === 'symbol' ? [e.tag] : []));

describe('copia e incolla', () => {
  it('bobina e contatto copiati insieme prendono una sigla nuova e restano collegati', () => {
    const p = emptyProject();
    p.pages[0].elements = [S('coil', 60, 100, '1K1'), S('no', 100, 60, '1K1'), S('no', 140, 60, '1K9')];
    const clip = copyElements(p, p.pages[0], p.pages[0].elements.slice(0, 2).map(e => e.id).concat(p.pages[0].elements[2].id));
    pasteElements(p, p.pages[0].id, clip, 0, 120);
    // La copia della bobina è -1K10 (dopo -1K9), il contatto la segue; il contatto di -1K9 resta di -1K9
    expect(tagsOf(p).slice(3)).toEqual(['1K10', '1K10', '1K9']);
  });
  it('i piani di un morsetto restano insieme e i fili perdono il numero', () => {
    const p = emptyProject();
    const w = W([0, 0], [10, 0]); w.number = '1.01';
    p.pages[0].elements = [S('terminal', 40, 100, 'X1:1A'), S('terminal', 48, 100, 'X1:1B'), S('terminal', 56, 100, 'X1:2'), w];
    pasteElements(p, p.pages[0].id, copyElements(p, p.pages[0], p.pages[0].elements.map(e => e.id)), 0, 40);
    expect(tagsOf(p).slice(3)).toEqual(['X1:3A', 'X1:3B', 'X1:4']);
    expect((p.pages[0].elements[7] as Wire).number).toBeUndefined();
  });
  it('incollando in un altro progetto porta con sé simboli e articoli', () => {
    const a = emptyProject();
    a.customSymbols.push({ id: 'qet:x', name: 'Mio', category: 'QET', letter: 'K', role: 'single', prims: [], pins: [] });
    a.parts.push({ partNr: 'WDU 2.5', functionTemplates: [], attrs: {} });
    a.pages[0].elements = [S('qet:x', 40, 40, '1K1'), S('terminal', 80, 40, 'X1:1', { partNr: 'WDU 2.5' })];
    const clip = copyElements(a, a.pages[0], a.pages[0].elements.map(e => e.id));
    const b = emptyProject();
    pasteElements(b, b.pages[0].id, clip, 0, 0);
    expect(b.customSymbols.map(s => s.id)).toEqual(['qet:x']);
    expect(b.parts.map(x => x.partNr)).toEqual(['WDU 2.5']);
    expect(tagsOf(b)).toEqual(['1K1', 'X1:1']);
  });
  it('duplica una pagina con sigle della nuova pagina', () => {
    const p = exampleProject();
    const src = p.pages[1];
    const page = duplicatePage(p, src.id)!;
    expect(p.pages[2]).toBe(page);
    expect(page.name).toBe('7');
    expect(page.elements).toHaveLength(src.elements.length);
    expect(tagsOf(p, 2)).toContain('7K1');
    // La copia è un circuito a sé: i numeri filo sono quelli della pagina nuova
    const nl = computeNetlist(p);
    expect(page.elements.filter((e): e is Wire => e.kind === 'wire').some(w => nl.wireNet.get(w.id)?.wireNo.startsWith('7.'))).toBe(true);
  });
});

describe('duplica pagina con numero, nome e luogo scelti', () => {
  it('usa i dati scelti e il luogo della pagina di partenza come proposta', () => {
    const p = exampleProject();
    const src = p.pages[1];
    const page = duplicatePage(p, src.id, { name: '12', title: 'Comando pompa 2', panelId: undefined })!;
    expect([page.name, page.title, page.panelId]).toEqual(['12', 'Comando pompa 2', undefined]);
    expect(tagsOf(p, 2)).toContain('12K1');
    const again = duplicatePage(p, src.id)!;
    expect(again.panelId).toBe(src.panelId);
  });
});

describe('cerca e sostituisci', () => {
  const p = exampleProject();
  it('trova sigle, descrizioni e numeri filo', () => {
    const hits = search(p, 'pompa', { matchCase: false, wholeWord: false });
    expect(hits.some(h => h.field === 'description' && h.value === 'Pompa di rilancio')).toBe(true);
    expect(search(p, '2K1', { matchCase: true, wholeWord: true }).filter(h => h.field === 'tag').length).toBeGreaterThan(2);
    expect(search(p, '1.01', { matchCase: true, wholeWord: true, fields: ['wireNo'] })).toHaveLength(1);
  });
  it('sostituisce e la parola intera non tocca le sigle simili', () => {
    const q = structuredClone(p);
    q.pages[0].elements.push(S('coil', 300, 200, '2K10'));
    const o = { matchCase: true, wholeWord: true, fields: ['tag' as const] };
    const n = replaceHits(q, search(q, '2K1', o), '2K5', '2K7', o) + replaceHits(q, search(q, '2K1', o), '2K1', '2K7', o);
    expect(n).toBeGreaterThan(2);
    const tags = q.pages.flatMap(pg => pg.elements.flatMap(e => (e.kind === 'symbol' ? [e.tag] : [])));
    expect(tags).toContain('2K7');
    expect(tags).toContain('2K10');
    expect(tags).not.toContain('2K1');
  });
});

describe('controlli di progetto', () => {
  it('il progetto di esempio non ha errori', () => {
    expect(checkProject(exampleProject()).filter(i => i.level === 'error')).toEqual([]);
  });
  it('trova contatti senza bobina, rimandi aperti, fili liberi e contatti oltre l\'articolo', () => {
    const p = emptyProject();
    p.parts.push({ partNr: 'CT', functionTemplates: [
      { pos: 1, description: 'Bobina', connections: ['A1', 'A2'] }, { pos: 2, description: '', connections: ['13', '14'] },
    ], attrs: {} });
    p.pages[0].elements = [
      S('coil', 60, 100, '1K1', { partNr: 'CT' }), S('no', 100, 60, '1K1'), S('no', 120, 60, '1K1'),
      S('nc', 160, 60, '1K5'), S('link_in', 200, 60, 'R7'), S('link', 240, 60, 'R8'), W([60, 40], [60, 100]),
    ];
    const kinds = checkProject(p).map(i => `${i.kind}: ${i.msg}`);
    expect(kinds.some(k => k.includes('-1K5: contatto senza bobina'))).toBe(true);
    expect(kinds.some(k => k.includes('usati 2 contatti NA, l\'articolo CT ne ha 1'))).toBe(true);
    // Arrivo senza partenza e partenza senza arrivo: in attesa del corrispondente (avviso)
    expect(kinds.some(k => k.includes('Rimando "R7": arrivo in attesa della partenza'))).toBe(true);
    expect(checkProject(p).find(i => i.kind === 'Rimandi' && i.msg.includes('"R8"'))).toMatchObject({ level: 'warn' });
    expect(kinds.some(k => k.includes('Filo con un estremo libero in (60, 40)'))).toBe(true);
  });
  it('riconosce il tipo di contatto dal modello funzione', () => {
    expect(contactKind({ pos: 1, description: '', connections: ['13', '14'] })).toBe('NO');
    expect(contactKind({ pos: 1, description: '', connections: ['21', '22'] })).toBe('NC');
    expect(contactKind({ pos: 1, description: '', connections: ['11', '12', '14'] })).toBe('CO');
    expect(contactKind({ pos: 1, description: '', connections: ['A1', 'A2'] })).toBeUndefined();
  });
});

describe('macro', () => {
  it('una macro salvata da un progetto si inserisce in un altro con sigle nuove e cavi propri', async () => {
    const { makeMacro } = await import('../src/model/clipboard');
    const src = exampleProject();
    const page = src.pages[0];
    // Partenza motore: salvamotore, contattore, morsetti, motore, fili e cavo
    const ids = page.elements.filter(e => (e.kind === 'symbol' && /Q1|K1|X1|M1/.test(e.tag)) || e.kind === 'cable' ||
      (e.kind === 'wire' && e.points.every(p => p.x >= 100 && p.x <= 124 && p.y >= 72))).map(e => e.id);
    const m = makeMacro(copyElements(src, page, ids), 'Avviamento diretto', 'Motori');
    expect(m.size.w).toBeGreaterThan(20);
    const dst = exampleProject();
    const res = pasteElements(dst, dst.pages[0].id, m.clip, 200, 0);
    const pasted = dst.pages[0].elements.filter(e => res.ids.includes(e.id));
    const tags = pasted.flatMap(e => (e.kind === 'symbol' ? [e.tag] : []));
    expect(tags).toContain('1Q2');
    // I contatti di potenza restano del contattore -2K1, che non fa parte della macro
    expect(tags).toContain('2K1');
    expect(tags).toContain('1M2');
    expect(tags.filter(t => t.startsWith('X1:'))).toEqual(['X1:5', 'X1:6', 'X1:7', 'X1:8']);
    expect(dst.cables!.map(c => c.tag)).toEqual(['1W1', '1W2']);
  });
});
