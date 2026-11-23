// Riquadro «Non montato»: le parti restano sullo schema ma non vanno in distinta, tabelle, targhette e liste
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { getSymbol, pinsWorld } from '../src/model/geometry';
import { notFitted, fittedProject } from '../src/model/notFitted';
import { projectReports } from '../src/model/reports';
import { partTables } from '../src/model/partTables';
import { derive } from '../src/model/derive';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { checkProject } from '../src/model/checks';
import type { SymbolInstance } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.parts = [
    { partNr: 'SIE.K', manufacturer: 'Siemens', orderNr: '3RT2015-1BB41', functionTemplates: [], attrs: {} },
    { partNr: 'FIN.40', manufacturer: 'Finder', orderNr: '40.52.9.024', functionTemplates: [], attrs: {} },
  ];
  st().loadProject(p);
  const put = (sym: string, x: number, y: number, tag: string) => { const e = st().placeSymbol(sym, { x, y }, 0)! as SymbolInstance; st().updateElement(e.id, { tag }); return e.id; };
  const k1 = put('coil', 60, 80, 'K1');
  const k5 = put('coil', 200, 80, 'K5');
  const k5c = put('no', 100, 140, 'K5');
  const t1 = put('terminal', 200, 40, 'X1:1');
  const t2 = put('terminal', 60, 40, 'X1:2');
  st().updateDevice(k1, { partNr: 'SIE.K' });
  st().updateDevice(k5, { partNr: 'FIN.40' });
  // Filo dal morsetto in basso di K5 verso destra (fuori dal riquadro) e filo da K1
  const el = (id: string) => st().project.pages[0].elements.find(e => e.id === id) as SymbolInstance;
  const pin = (id: string) => pinsWorld(el(id), getSymbol(el(id).symbolId)!).sort((a, b) => b.y - a.y)[0];
  const p5 = pin(k5), p1 = pin(k1);
  const w5 = st().addWire([{ x: p5.x, y: p5.y }, { x: p5.x + 60, y: p5.y }]).id;
  const w1 = st().addWire([{ x: p1.x, y: p1.y }, { x: p1.x - 30, y: p1.y }]).id;
  return { st, k1, k5, k5c, t1, t2, w5, w1 };
}

describe('riquadro «Non montato»', () => {
  it('dispositivo con la bobina nel riquadro: anche i contatti fuori e i fili collegati non sono montati', async () => {
    const { st, k1, k5, k5c, t1, t2, w5, w1 } = await store();
    st().setSelection([k5, t1]);
    st().noFitAroundSelection();
    const p = st().project;
    expect(p.pages[0].elements.filter(e => e.kind === 'nofit').length).toBe(1);
    const nf = notFitted(p);
    expect(nf.devices.has('K5')).toBe(true);
    for (const id of [k5, k5c, t1, w5]) expect(nf.ids.has(id)).toBe(true);
    for (const id of [k1, t2, w1]) expect(nf.ids.has(id)).toBe(false);
    expect([...nf.terminals]).toEqual(['X1:1']);
    // Copia per le liste senza le parti non montate; il progetto resta com'è
    const fp = fittedProject(p);
    expect(fp.pages[0].elements.some(e => e.id === k5 || e.id === w5)).toBe(false);
    expect(p.pages[0].elements.some(e => e.id === k5)).toBe(true);
  });

  it('distinta senza le parti non montate, morsetti in lista con la nota, tabelle materiali e controlli', async () => {
    const { st, k1, k5, t1 } = await store();
    st().setPartTable(k1, true); st().setPartTable(k5, true);
    expect(partTables(st().project).get(st().project.pages[0].id)!.length).toBe(2);
    st().setSelection([k5, t1]);
    st().noFitAroundSelection();
    const p = st().project;
    const tables = projectReports(p, []);
    const bom = tables.find(t => t.title === 'Distinta materiali')!;
    expect(bom.rows.some(r => r.join('|').includes('40.52.9.024'))).toBe(false);
    expect(bom.rows.some(r => r.join('|').includes('3RT2015-1BB41'))).toBe(true);
    const dev = tables.find(t => t.title === 'Lista dispositivi')!;
    expect(dev.rows.some(r => r[0].includes('K5'))).toBe(false);
    const term = tables.find(t => t.title === 'Lista morsetti')!;
    const row = (no: string) => term.rows.find(r => r[0] === 'X1' && r[1] === no)!;
    expect(row('1')[3]).toBe('Non montato');
    expect(row('2')[3]).not.toBe('Non montato');
    // Tabella materiali solo per K1
    const d = derive(p, []).pages.get(p.pages[0].id)!;
    expect(d.partTables?.map(t => t.instId)).toEqual([k1]);
    // Controlli: niente sugli elementi non montati
    const nf = notFitted(p);
    expect(checkProject(p, []).some(i => i.elementId && nf.ids.has(i.elementId))).toBe(false);
  });

  it('si toglie eliminandolo; nel testo delle pagine «nonmontato @x,y LxH»', async () => {
    const { st, k5 } = await store();
    st().setSelection([k5]);
    st().noFitAroundSelection();
    const area = st().project.pages[0].elements.find(e => e.kind === 'nofit')!;
    const txt = pagesToText(st().project);
    expect(txt).toMatch(/nonmontato @[\d.,]+ [\d.]+x[\d.]+/);
    const p2 = structuredClone(st().project);
    p2.pages[0].elements = p2.pages[0].elements.filter(e => e.kind !== 'nofit');
    const r = importPagesText(p2, txt);
    expect(r.errors ?? []).toEqual([]);
    const back = p2.pages.flatMap(pg => pg.elements).find(e => e.kind === 'nofit') as any;
    expect(back && [back.w, back.h]).toEqual([(area as any).w, (area as any).h]);
    st().setSelection([area.id]);
    st().deleteSelection();
    expect(notFitted(st().project).ids.size).toBe(0);
  });
});
