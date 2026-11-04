// Rimandi tra pagine: una partenza collegata a un solo arrivo, anche con nomi ripetuti
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { Project, SymbolInstance, Element } from '../src/model/types';
import { linkPartners, freeLinksFor, pairLinks } from '../src/model/links';
import { computeNetlist } from '../src/model/netlist';
import { copyElements, pasteElements } from '../src/model/clipboard';
import { checkProject } from '../src/model/checks';
import { pagesToText, importPagesText } from '../src/model/textFormat';

const link = (id: string, tag: string, x: number, incoming = false, linkTo?: string): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId: incoming ? 'link_in' : 'link', x, y: 40, rot: 0, tag, pinLabels: {}, autoPins: true, ...(linkTo !== undefined ? { linkTo } : {}) });
const res = (id: string, tag: string, x: number): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId: 'coil', x, y: 40, rot: 0, tag, pinLabels: {}, autoPins: true });

function project(page1: Element[], page2: Element[]): Project {
  const p = emptyProject();
  p.pages[0].elements = page1;
  p.pages.push({ ...structuredClone(p.pages[0]), id: 'pg2', name: '2', title: 'Seconda', elements: page2 });
  return p;
}
const partnersOf = (p: Project, id: string) => linkPartners(p).get(id)!.map(e => e.inst.id).sort();

describe('rimandi', () => {
  it('stesso nome, coppie diverse: ogni partenza va solo al suo arrivo', () => {
    // Due conduttori diversi con il rimando chiamato "1.02" (numero filo ripetuto)
    // Ogni rimando tocca il morsetto di una bobina (stesso punto): così si vede il conduttore
    const p = project([link('a1', '1.02', 40, false, 'b1'), link('a2', '1.02', 80, false, 'b2'), res('ka1', 'K1', 40), res('ka2', 'K2', 80)],
      [link('b1', '1.02', 40, true, 'a1'), link('b2', '1.02', 80, true, 'a2'), res('kb1', 'K3', 40), res('kb2', 'K4', 80)]);
    expect(partnersOf(p, 'a1')).toEqual(['b1']);
    expect(partnersOf(p, 'b2')).toEqual(['a2']);
    const nl = computeNetlist(p);
    const netOf = (id: string) => nl.nets.find(n => n.pins.some(q => q.el.inst.id === id && q.pinId === '1'))!.id;
    expect(netOf('ka1')).toBe(netOf('kb1'));
    expect(netOf('ka1')).not.toBe(netOf('ka2'));
    expect(netOf('ka2')).toBe(netOf('kb2'));
  });
  it('progetti precedenti (senza abbinamento): per nome, come prima', () => {
    const p = project([link('a', 'R1', 40), res('r', 'R9', 100)], [link('b', 'R1', 40, true), link('c', 'R2', 80, true)]);
    expect(partnersOf(p, 'a')).toEqual(['b']);
    expect(partnersOf(p, 'c')).toEqual([]);
  });
  it('solo partenza con arrivo: mai due partenze o due arrivi, anche per nome', () => {
    // Per nome: due partenze e un arrivo "R1" → la prima partenza con l'arrivo, l'altra resta libera
    const p = project([link('a', 'R1', 40), link('a2', 'R1', 80)], [link('b', 'R1', 40, true), link('c', 'R2', 40), link('d', 'R2', 80)]);
    expect(partnersOf(p, 'b')).toEqual(['a']);
    expect(partnersOf(p, 'a2')).toEqual([]);
    expect(partnersOf(p, 'c')).toEqual([]);
    // Abbinamento scritto tra due partenze (file modificato a mano): non vale
    const q = project([link('a', '5', 40, false, 'b')], [link('b', '5', 40, false, 'a')]);
    expect(partnersOf(q, 'a')).toEqual([]);
    // pairLinks rifiuta due rimandi dello stesso verso
    pairLinks(q, 'a', 'b');
    expect(partnersOf(q, 'a')).toEqual([]);
  });
  it('il filo collegato a un rimando prende il nome del rimando come numero', () => {
    const w1: Element = { kind: 'wire', id: 'w1', points: [{ x: 10, y: 40 }, { x: 40, y: 40 }], number: '1.07' };
    const w2: Element = { kind: 'wire', id: 'w2', points: [{ x: 40, y: 40 }, { x: 90, y: 40 }] };
    const p = project([link('a', 'MOT1', 40, false, 'b'), w1], [link('b', 'MOT1', 40, true, 'a'), w2]);
    const nl = computeNetlist(p);
    expect(nl.wireNet.get('w1')!.wireNo).toBe('MOT1');
    expect(nl.wireNet.get('w2')!.wireNo).toBe('MOT1');
    // Rinominato il rimando, il numero segue
    (p.pages[0].elements[0] as SymbolInstance).tag = 'MOT2';
    (p.pages[1].elements[0] as SymbolInstance).tag = 'MOT2';
    expect(computeNetlist(p).wireNet.get('w2')!.wireNo).toBe('MOT2');
  });
  it('elenco dei liberi: verso opposto, senza corrispondente, prima quelli con lo stesso nome', () => {
    const p = project([link('a', '5', 40, false, '-'), link('x', '7', 80, false, ''), link('y', '5', 120, false, 'z')],
      [link('b', '5', 40, true, '-'), link('z', '5', 80, true, 'y'), link('w', '9', 120, true, '')]);
    expect(freeLinksFor(p, 'b').map(e => e.inst.id)).toEqual(['a', 'x']);
    expect(freeLinksFor(p, 'a').map(e => e.inst.id)).toEqual(['b', 'w']);
  });
  it('collegare prende il nome, lascia il vecchio corrispondente; la voce vuota scollega', () => {
    const p = project([link('a', '5', 40, false, 'b'), link('x', '7', 80, false, '')], [link('b', '5', 40, true, 'a')]);
    pairLinks(p, 'x', 'b');
    const el = (id: string) => p.pages.flatMap(pg => pg.elements).find(e => e.id === id) as SymbolInstance;
    expect([el('x').linkTo, el('b').linkTo, el('a').linkTo, el('x').tag]).toEqual(['b', 'x', '', '5']);
    // «a» è rimasta una partenza senza arrivo: in attesa
    expect(checkProject(p).filter(m => /partenza in attesa/.test(m.msg)).length).toBe(1);
    pairLinks(p, 'x', '');
    // La voce vuota: senza corrispondente per scelta («-»), nemmeno per nome
    expect([el('x').linkTo, el('b').linkTo]).toEqual(['-', '']);
  });
  it('rimandi non abbinati con lo stesso nome (incollati o messi senza scegliere): si abbinano per nome', () => {
    // Catena 1 → 2 → 3 con gli arrivi e le partenze senza abbinamento: ogni arrivo con la partenza della pagina prima
    const p = project([link('o1', 'PE', 40, false, '')], [link('i2', 'PE', 40, true, ''), link('o2', 'PE', 80, false, '')]);
    p.pages.push({ id: 'p3', name: '3', title: '', type: 'multiline', elements: [link('i3', 'PE', 40, true, '') as Element] });
    expect(partnersOf(p, 'i2')).toEqual(['o1']);
    expect(partnersOf(p, 'i3')).toEqual(['o2']);
    // Il rimando lasciato senza corrispondente per scelta resta libero
    (p.pages[2].elements[0] as SymbolInstance).linkTo = '-';
    expect(partnersOf(p, 'i3')).toEqual([]);
  });
  it('copia e incolla: la coppia copiata insieme resta unita, il rimando copiato da solo è libero', () => {
    const p = project([link('a', '5', 40, false, 'b'), link('b', '5', 80, true, 'a')], []);
    const pg = p.pages[0];
    const both = pasteElements(p, pg.id, copyElements(p, pg, ['a', 'b']), 0, 20).ids;
    const one = pasteElements(p, pg.id, copyElements(p, pg, ['a']), 0, 40).ids;
    const el = (id: string) => pg.elements.find(e => e.id === id) as SymbolInstance;
    expect(el(both[0]).linkTo).toBe(both[1]);
    expect(el(both[1]).linkTo).toBe(both[0]);
    expect(el(one[0]).linkTo).toBe('');
    // L'originale non cambia
    expect(el('a').linkTo).toBe('b');
  });
});

describe('controlli dei rimandi e segnalazioni verificate', () => {
  const msgs = (p: Project) => checkProject(p).filter(m => m.kind === 'Rimandi').map(m => `${m.level}:${m.msg}`);
  it('nome uguale con maiuscole diverse: errore che indica l\'altro rimando', () => {
    const p = project([link('a', 'A1130.1A', 40, false, '')], [link('b', 'A1130.1a', 40, true, '')]);
    expect(msgs(p).filter(m => m.startsWith('error') && /maiuscole diverse/.test(m)).length).toBe(2);
  });
  it('partenza in fondo alla catena: solo informazione', () => {
    // 1 → 2 abbinati, poi sulla pagina 2 la stessa barra esce con un'altra partenza che non va da nessuna parte
    const w: Element = { kind: 'wire', id: 'w', points: [{ x: 40, y: 40 }, { x: 120, y: 40 }] };
    const p = project([link('a', 'L1', 40, false, 'b')], [link('b', 'L1', 40, true, 'a'), w, link('c', 'L1', 120, false, '')]);
    expect(msgs(p)).toEqual(['info:Rimando "L1" in fondo alla catena: il conduttore non prosegue su altre pagine']);
  });
  it('solo partenze libere con lo stesso nome: forse un verso sbagliato', () => {
    const p = project([link('a', 'X', 40, false, '-')], [link('b', 'X', 40, false, '-')]);
    expect(msgs(p).every(m => /solo partenze libere/.test(m))).toBe(true);
  });
  it('«Verificato» toglie la segnalazione dai conteggi e si può riattivare', async () => {
    const { useStore } = await import('../src/model/store');
    const { acceptedOf, issueKey } = await import('../src/model/checks');
    const st = useStore.getState;
    st().loadProject(project([link('a', 'Z9', 40, false, '-')], []));
    const i = checkProject(st().project).find(m => m.kind === 'Rimandi')!;
    st().acceptIssues([issueKey(i)], 'prosegue in campo', true);
    expect(acceptedOf(st().project, i)?.note).toBe('prosegue in campo');
    st().acceptIssues([issueKey(i)], undefined, false);
    expect(acceptedOf(st().project, i)).toBeUndefined();
  });
});

describe('rimandi a stella e in attesa', () => {
  const el = (p: Project, id: string) => p.pages.flatMap(pg => pg.elements).find(e => e.id === id) as SymbolInstance;
  it('la partenza a stella si collega a tutti gli arrivi con lo stesso nome, non a quelli lasciati soli', () => {
    const p = project([{ ...link('s', '24V', 40), linkStar: true }, link('o', '24V', 80, false, 'i1')],
      [link('i1', '24V', 40, true, 'o'), link('i2', '24V', 80, true, ''), link('i3', '24V', 120, true, '-'), link('i4', '24V', 160, true)]);
    expect(partnersOf(p, 's')).toEqual(['i2', 'i4']);
    expect(partnersOf(p, 'i2')).toEqual(['s']);
    // L'arrivo abbinato a un'altra partenza resta suo
    expect(partnersOf(p, 'i1')).toEqual(['o']);
    expect(partnersOf(p, 'i3')).toEqual([]);
    // La stella resta tra le partenze libere per un arrivo; scelta, solo l'arrivo scrive il collegamento
    expect(freeLinksFor(p, 'i3').map(e => e.inst.id)).toEqual(['s']);
    pairLinks(p, 'i3', 's');
    expect([el(p, 'i3').linkTo, el(p, 's').linkTo]).toEqual(['s', undefined]);
    expect(partnersOf(p, 's')).toEqual(['i2', 'i3', 'i4']);
    // Tolta la stella torna una partenza normale (con un solo arrivo, per nome)
    el(p, 's').linkStar = undefined;
    expect(partnersOf(p, 's').length).toBe(1);
  });
  it('un arrivo prima della partenza in attesa si collega quando la partenza prende il suo nome', () => {
    const p = project([link('i', '7.03', 40, true, '')], [link('o', '9.01', 40, false, '')]);
    expect(partnersOf(p, 'i')).toEqual([]);
    expect(freeLinksFor(p, 'o').map(e => e.inst.id)).toEqual(['i']);
    pairLinks(p, 'o', 'i');
    expect([el(p, 'o').tag, partnersOf(p, 'o')]).toEqual(['7.03', ['i']]);
    // Di nuovo in attesa: si scollega e il corrispondente resta libero
    pairLinks(p, 'o', '?');
    expect([el(p, 'o').linkTo, el(p, 'i').linkTo]).toEqual(['', '']);
  });
  it('formato testo: la parola «stella» sulla partenza', () => {
    const p = project([{ ...link('s', '24V', 40), linkStar: true }], [link('i', '24V', 40, true)]);
    const t = pagesToText(p);
    expect(t).toMatch(/simbolo link 24V @40,40 .*stella/);
    const q = emptyProject();
    expect(importPagesText(q, t).errors).toEqual([]);
    expect(q.pages.flatMap(pg => pg.elements).some(e => e.kind === 'symbol' && e.linkStar)).toBe(true);
  });
  it('controlli: in attesa è un avviso, la stella viene proposta per un arrivo in più', () => {
    const p = project([link('o', 'L+', 40, false, 'a')], [link('a', 'L+', 40, true, 'o'), link('b', 'L+', 80, true, '')]);
    const i = checkProject(p).find(m => m.kind === 'Rimandi')!;
    expect(i).toMatchObject({ level: 'warn', fix: { kind: 'linkStar', id: 'o' } });
    el(p, 'o').linkStar = true;
    expect(checkProject(p).filter(m => m.kind === 'Rimandi')).toEqual([]);
  });
});
