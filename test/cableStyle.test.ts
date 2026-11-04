// Linee dei cavi come in EPLAN: rappresentazione principale, testi, schermo ad asola con il suo collegamento
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { derive } from '../src/model/derive';
import { checkProject } from '../src/model/checks';
import { cableStyleOf, lineShow, shieldDims, shieldGeometry, SHIELD } from '../src/model/cableStyle';
import { listTextScale, drawingStyleOf } from '../src/model/drawingStyle';
import { stripTextOf, STRIP_TEXT } from '../src/model/terminals';
import type { Project, Wire, CableLine, Page } from '../src/model/types';

const wire = (id: string, pts: [number, number][]): Wire => ({ kind: 'wire', id, points: pts.map(([x, y]) => ({ x, y })) });
const line = (id: string, x0: number, x1: number, y: number, extra: Partial<CableLine> = {}): CableLine => ({ kind: 'cable', id, cableId: 'c1', points: [{ x: x0, y }, { x: x1, y }], ...extra });
const page = (id: string, name: string, elements: Page['elements']): Page => ({ id, name, title: '', type: 'multiline', elements });

function project(extra: Partial<CableLine> = {}): Project {
  const p = emptyProject();
  p.cables = [{ id: 'c1', tag: 'W1', type: 'FG16OR16', cross: '1,5', conductors: ['1', '2', '3'], assign: {}, shield: true }];
  p.pages = [
    page('a', '10', [wire('w1', [[40, 20], [40, 80]]), wire('w2', [[60, 20], [60, 80]]), line('l1', 30, 70, 50, extra)]),
    page('b', '20', [wire('w3', [[40, 20], [40, 80]]), line('l2', 30, 50, 50)]),
  ];
  return p;
}

describe('linee dei cavi', () => {
  it('la prima linea è la principale, le altre mostrano di serie solo la sigla', () => {
    const p = project();
    const d = derive(p);
    const m1 = d.pages.get('a')!.cableMarks!.get('l1')!, m2 = d.pages.get('b')!.cableMarks!.get('l2')!;
    expect([m1.main, m2.main]).toEqual([true, false]);
    const st = cableStyleOf(p);
    expect(lineShow(st, p.pages[0].elements[2] as CableLine, true).type).toBe(true);
    expect(lineShow(st, p.pages[1].elements[1] as CableLine, false)).toMatchObject({ tag: true, type: false, section: false });
  });

  it('la linea scelta come principale porta i dati; i testi scelti sulla linea vincono sullo stile', () => {
    const p = project();
    (p.pages[1].elements[1] as CableLine).main = true;
    const d = derive(p);
    expect(d.pages.get('a')!.cableMarks!.get('l1')!.main).toBe(false);
    expect(d.pages.get('b')!.cableMarks!.get('l2')!.main).toBe(true);
    expect(lineShow(cableStyleOf(p), { show: { type: true } }, false).type).toBe(true);
  });

  it('schermo: asola attorno ai conduttori e collegamento dalla fine; un filo lì toglie la terra e non è un capo libero', () => {
    const p = project();
    const g = shieldGeometry(p.pages[0].elements[2] as CableLine, [{ x: 40, y: 50 }, { x: 60, y: 50 }])!;
    expect([g.lo, g.hi]).toEqual([40 - SHIELD.margin, 60 + SHIELD.margin]);
    expect(g.lead!.to).toEqual({ x: 60 + SHIELD.margin - SHIELD.r, y: 50 + SHIELD.r + SHIELD.lead });
    expect(derive(p).pages.get('a')!.cableMarks!.get('l1')!.shieldWired).toBe(false);
    p.pages[0].elements.push(wire('wsh', [[g.lead!.to.x, g.lead!.to.y], [g.lead!.to.x, 90]]));
    expect(derive(p).pages.get('a')!.cableMarks!.get('l1')!.shieldWired).toBe(true);
    const free = checkProject(p).filter(i => i.elementId === 'wsh' && i.msg.startsWith('Filo con un estremo libero'));
    expect(free.map(i => i.msg)).toEqual(['Filo con un estremo libero in (62.3, 90)']);
    expect(shieldGeometry({ ...(p.pages[0].elements[2] as CableLine), shieldGround: 'none' }, [{ x: 40, y: 50 }])!.lead).toBeUndefined();
  });
});

describe('misure dello schermo', () => {
  it('altezza dello stile, poi della linea; di serie cresce con i nomi orizzontali dei conduttori', () => {
    const p = project();
    expect(shieldDims(cableStyleOf(p)).r).toBe(SHIELD.r);
    p.settings.cableStyle = { condSize: 3.5 };
    expect(shieldDims(cableStyleOf(p)).r).toBeCloseTo(3.4);
    expect(shieldDims(cableStyleOf(p), { condDir: 'v' }).r).toBe(SHIELD.r);
    p.settings.cableStyle = { shieldHeight: 8, shieldMargin: 2 };
    const d = shieldDims(cableStyleOf(p));
    expect(d.r).toBe(4);
    expect(d.margin).toBe(4.5);
    expect(shieldDims(cableStyleOf(p), { shieldHeight: 3 }).r).toBe(1.5);
    const g = shieldGeometry(p.pages[0].elements[2] as CableLine, [{ x: 40, y: 50 }], d)!;
    expect(g.lead!.to).toEqual({ x: 40 + 4.5 - 4, y: 50 + 4 + SHIELD.lead });
    // Il punto di connessione nella linea derivata segue l'altezza scelta
    expect(derive(p).pages.get('a')!.cableMarks!.get('l1')!.shieldLead!.y).toBeCloseTo(50 + 4 + SHIELD.lead);
  });
});

describe('testi delle liste', () => {
  it('la scala vale per i caratteri delle morsettiere e dei disegni, non per l\'altezza delle righe', () => {
    const p = emptyProject();
    p.settings.listTextScale = 150;
    expect(listTextScale(p)).toBe(1.5);
    expect(stripTextOf(p).textSize).toBeCloseTo(STRIP_TEXT.textSize * 1.5);
    expect(stripTextOf(p).rowH).toBe(STRIP_TEXT.rowH);
    const s = drawingStyleOf(p, 'cable');
    expect(s.titleSize).toBeCloseTo(6);
    expect(s.rowH).toBe(4.4);
  });

  it('stile comune a tutte le liste: vale finché la lista non sceglie un valore suo', async () => {
    const { reportStyleOf, ALL_LISTS, ownReportStyle } = await import('../src/model/reportStyle');
    const p = emptyProject();
    p.settings.reportStyles = { [ALL_LISTS]: { textSize: 3, zebra: '#eee', title: 'non comune', columns: { A: { hidden: true } } }, 'Lista cavi': { textSize: 2.5 } };
    expect(reportStyleOf(p, 'Lista cavi')).toMatchObject({ textSize: 2.5, zebra: '#eee' });
    expect(reportStyleOf(p, 'Lista cavi').title).toBeUndefined();
    expect(reportStyleOf(p, 'Distinta materiali').columns).toBeUndefined();
    expect(ownReportStyle(p, 'Distinta materiali')).toEqual({});
  });

  it('larghezze scelte delle colonne dei disegni', () => {
    const p = emptyProject();
    p.settings.drawingStyles = { cable: { widths: { note: 20 }, hide: ['loc'] } };
    const s = drawingStyleOf(p, 'cable');
    expect(s.width('note')).toBe(20);
    expect(s.show('loc')).toBe(false);
  });
});

describe('conduttori fissati', () => {
  it('un filo nuovo su una pagina precedente prende il primo libero senza spostare gli altri', async () => {
    const { useStore } = await import('../src/model/store');
    const { cableInfos } = await import('../src/model/cables');
    const st = useStore.getState;
    const p = emptyProject();
    p.cables = [{ id: 'c1', tag: 'W1', conductors: ['1', '2', '3', '4'], assign: {} }];
    p.pages = [
      page('a', '10', [wire('w1', [[40, 20], [40, 80]]), line('l1', 30, 70, 50)]),
      page('b', '20', [wire('w2', [[40, 20], [40, 80]]), wire('w3', [[60, 20], [60, 80]]), line('l2', 30, 70, 50)]),
    ];
    st().loadProject(p);
    const names = () => Object.fromEntries(cableInfos(st().project)[0].conductors.map(k => [k.wire.id, k.name]));
    // Prima modifica: si fissano i conduttori come sono (in ordine di pagina)
    st().commit(() => {});
    expect(names()).toEqual({ w1: '1', w2: '2', w3: '3' });
    // Filo nuovo sulla prima pagina, attraversato dalla linea del cavo: prende il 4, gli altri restano
    st().commit(q => { q.pages[0].elements.push(wire('w4', [[60, 20], [60, 80]])); });
    expect(names()).toEqual({ w1: '1', w4: '4', w2: '2', w3: '3' });
    // Tolto un filo, il suo conduttore torna libero e gli altri non cambiano
    st().commit(q => { q.pages[1].elements = q.pages[1].elements.filter(e => e.id !== 'w2'); });
    expect(names()).toEqual({ w1: '1', w4: '4', w3: '3' });
    // Riassegna in ordine: da capo, in ordine di pagina
    st().reassignConductors(['c1']);
    expect(names()).toEqual({ w1: '1', w4: '2', w3: '3' });
  });
});
