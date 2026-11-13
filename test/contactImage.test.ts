// Immagine dei contatti con i simboli, contatti di riserva dell'articolo, una sola rappresentazione
// per contatto, linea del comando verso le rappresentazioni e lineetta della sezione sui fili
import { describe, it, expect } from 'vitest';
import { emptyProject, useStore } from '../src/model/store';
import type { Project, SymbolInstance, Wire, Pt } from '../src/model/types';
import { derive } from '../src/model/derive';
import { newRepresentation } from '../src/model/pairs';
import { contactImageRows, rowGeometry, stackRows } from '../src/model/contactImage';
import { tickPoint, distanceAlong, pointAlong, ticksOnLine } from '../src/model/wireTicks';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { getSymbol } from '../src/model/geometry';

const S = (id: string, symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (id: string, ...pts: [number, number][]): Wire => ({ kind: 'wire', id, points: pts.map(([x, y]): Pt => ({ x, y })) });

/** -2K1: bobina con articolo (4 poli di potenza, 13-14, 21-22), poli 1..6 e un NA disegnati */
function project(): Project {
  const p = emptyProject();
  p.parts.push({
    partNr: 'K', attrs: {},
    functionTemplates: [
      { pos: 1, description: 'Bobina', connections: ['A1', 'A2'] },
      { pos: 2, description: '', connections: ['1', '2'] }, { pos: 3, description: '', connections: ['3', '4'] },
      { pos: 4, description: '', connections: ['5', '6'] }, { pos: 5, description: '', connections: ['7', '8'] },
      { pos: 6, description: '', connections: ['13', '14'], category: '201' }, { pos: 7, description: '', connections: ['21', '22'], category: '202' },
    ],
  });
  p.pages[0].elements = [
    S('k', 'coil', 60, 140, '2K1', { partNr: 'K' }),
    S('pw', 'contactor3', 100, 60, '2K1'),
    S('na', 'no', 140, 60, '2K1'),
  ];
  return p;
}

describe('immagine dei contatti con i simboli', () => {
  it('poli di potenza uno per riga, contatti in ordine e riserve dell\'articolo senza rimando', () => {
    const p = project();
    const xr = derive(p).pages.get(p.pages[0].id)!.xrefs.get('k')!;
    const rows = contactImageRows(xr.contacts!);
    expect(rows.map(r => r.labels.join('-'))).toEqual(['1-2', '3-4', '5-6', '7-8', '13-14', '21-22']);
    // 7-8 e 21-22 sono di riserva: senza posizione
    expect(rows.filter(r => !r.location).map(r => r.labels.join('-'))).toEqual(['7-8', '21-22']);
    expect(rows.find(r => r.labels[0] === '21')!.kind).toBe('NC');
  });
  it('morsetto 1 a destra e 2 a sinistra, righe una sotto l\'altra senza sovrapporsi', () => {
    const p = project();
    const xr = derive(p).pages.get(p.pages[0].id)!.xrefs.get('k')!;
    const rows = contactImageRows(xr.contacts!);
    const g = rowGeometry(rows[0], 0.36, 1.5);
    const one = g.labels.find(l => l.text === '1')!, two = g.labels.find(l => l.text === '2')!;
    expect(one.x).toBeGreaterThan(two.x);
    const geo = rows.map(r => rowGeometry(r, 0.36, 1.5));
    const st = stackRows(geo);
    for (let i = 1; i < st.ys.length; i++) expect(st.ys[i] - geo[i].up).toBeGreaterThan(st.ys[i - 1] + geo[i - 1].down);
  });
  it('un contatto con la rappresentazione accanto non compare anche nell\'immagine', () => {
    const p = project();
    const na = p.pages[0].elements[2] as SymbolInstance;
    p.pages[0].elements.push(newRepresentation(na, 'rep', 90, 140, 0));
    const xr = derive(p).pages.get(p.pages[0].id)!.xrefs.get('k')!;
    expect(xr.contacts!.some(c => c.id === 'na')).toBe(false);
    // Neppure come riserva: i suoi morsetti sono usati
    expect(xr.contacts!.some(c => c.labels === '13-14')).toBe(false);
  });
  it('una sola rappresentazione per contatto: la nuova prende il posto della vecchia', () => {
    useStore.setState({ project: project() });
    const st = useStore.getState;
    st().setPage(st().project.pages[0].id);
    st().placeRepresentation('na', { x: 90, y: 140 }, 0);
    st().placeRepresentation('na', { x: 200, y: 140 }, 0);
    const reps = st().project.pages.flatMap(pg => pg.elements).filter(e => e.kind === 'symbol' && e.pairOf === 'na') as SymbolInstance[];
    expect(reps.map(r => r.x)).toEqual([200]);
  });
  it('la verifica segnala una seconda rappresentazione dello stesso contatto', async () => {
    const { checkProject } = await import('../src/model/checks');
    const p = project();
    const na = p.pages[0].elements[2] as SymbolInstance;
    p.pages[0].elements.push(newRepresentation(na, 'r1', 90, 140, 0), newRepresentation(na, 'r2', 200, 140, 0));
    const i = checkProject(p).filter(x => /altra rappresentazione/.test(x.msg));
    expect(i).toHaveLength(1);
    expect(i[0].fix).toMatchObject({ kind: 'deleteElement', id: 'r2' });
  });
  it('linea tratteggiata del comando dall\'apparecchio alla rappresentazione accanto', () => {
    const p = project();
    const na = p.pages[0].elements[2] as SymbolInstance;
    p.pages[0].elements.push(newRepresentation(na, 'rep', 90, 148, 0));
    const lines = derive(p).pages.get(p.pages[0].id)!.pairLines;
    expect(lines).toHaveLength(1);
    expect(lines![0].y).toBe(148);
    expect(lines![0].x2).toBe(90);
    // Fuori dall'altezza della bobina: nessuna linea
    (p.pages[0].elements[3] as SymbolInstance).y = 200;
    expect(derive(p).pages.get(p.pages[0].id)!.pairLines ?? []).toHaveLength(0);
  });
  it('la rappresentazione ridotta è il simbolo vero in scala, centrato sul punto scelto', async () => {
    const { pairCompactBounds } = await import('../src/model/geometry');
    const sym = getSymbol('no', emptyProject())!;
    const b = pairCompactBounds({ x: 50, y: 50, rot: 0 }, sym);
    expect(b.y1 - b.y0).toBeCloseTo(16 * 0.6 + 1.6, 5);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(50, 5);
  });
});

describe('lineetta della sezione', () => {
  const pts: Pt[] = [{ x: 100, y: 40 }, { x: 100, y: 80 }];
  it('con il numero filo sul filo verticale la lineetta va sotto il numero, senza toccarlo', () => {
    const p = tickPoint(pts, undefined, { x: 99.3, y: 60 }, 2.2, 5)!;
    expect(p.vertical).toBe(true);
    expect(p.y).toBeCloseTo(60 + 2.2 + 1.2, 5);
  });
  it('posizione scelta: distanza lungo il filo, anche oltre un angolo', () => {
    const l: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }];
    expect(pointAlong(l, 15)).toMatchObject({ x: 10, y: 5, vertical: true });
    expect(distanceAlong(l, { x: 12, y: 5 })).toBeCloseTo(15, 5);
    expect(tickPoint(l, 15)).toMatchObject({ x: 10, y: 5 });
  });
  it('sezione e colore sulla lineetta (predefinito) o accanto al numero', () => {
    const p = emptyProject();
    p.pages[0].elements = [S('a', 'coil', 60, 40, '1K1'), S('b', 'coil', 60, 100, '1K2'), { ...W('w', [60, 56], [60, 100]), cross: '2,5', color: 'BK' }];
    let pd = derive(p).pages.get(p.pages[0].id)!;
    expect(pd.wireTicks?.get('w')).toBe('BK 2,5');
    expect(pd.wireNumbers.get('w') ?? '').not.toMatch(/2,5/);
    p.settings = { ...p.settings!, wireDataTick: false };
    pd = derive(p).pages.get(p.pages[0].id)!;
    expect(pd.wireTicks?.has('w')).toBe(false);
    expect(pd.wireNumbers.get('w')).toMatch(/2,5 mm² BK/);
  });
  it('allineate con una linea: la lineetta va dove la linea attraversa il filo', () => {
    const wires = [
      { id: 'a', points: [{ x: 60, y: 40 }, { x: 60, y: 100 }] },
      { id: 'b', points: [{ x: 80, y: 100 }, { x: 80, y: 30 }] },
      { id: 'c', points: [{ x: 40, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 90 }] },
      { id: 'd', points: [{ x: 200, y: 40 }, { x: 200, y: 100 }] },
    ];
    const r = ticksOnLine(wires, { x: 50, y: 70 }, { x: 120, y: 70 });
    expect([...r.entries()]).toEqual([['a', 30], ['b', 30], ['c', 110]]);
    expect(tickPoint(wires[2].points, r.get('c'))).toMatchObject({ x: 100, y: 70 });
  });
  it('formato testo: lineetta=', () => {
    const p = emptyProject();
    p.pages[0].elements = [{ ...W('w', [60, 56], [60, 100]), cross: '2,5', tickAt: 12.5 }];
    const t = pagesToText(p);
    expect(t).toMatch(/lineetta=12[.,]5/);
    const q = emptyProject();
    expect(importPagesText(q, t).errors).toEqual([]);
    expect((q.pages[0].elements.find(e => e.kind === 'wire') as Wire).tickAt).toBe(12.5);
  });
});
