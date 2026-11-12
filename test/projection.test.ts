// Pagine proiettate dei riquadri di altri quadri, posto della rappresentazione dei contatti e
// sigle dei cavi ripetute con la posizione
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { Project, SymbolInstance, Wire, Pt, Zone } from '../src/model/types';
import { derive } from '../src/model/derive';
import { createProjections, foreignZones } from '../src/model/projection';
import { foreignDevices } from '../src/model/network';
import { setContactPlace, contactPlaceOf, placeSideReps, representationOf } from '../src/model/pairs';
import { checkProject } from '../src/model/checks';

const S = (id: string, symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (id: string, ...pts: [number, number][]): Wire => ({ kind: 'wire', id, points: pts.map(([x, y]): Pt => ({ x, y })) });

/** Pagina 311 del +Q1 con un sensore del +Q2 chiuso nel riquadro +Q2; pagina 1001 del +Q2 */
function project(): Project {
  const p = emptyProject();
  p.panels = [{ id: 'q1', code: 'Q1', name: 'Quadro 1' }, { id: 'q2', code: 'Q2', name: 'Quadro 2' }] as Project['panels'];
  p.pages[0] = { ...p.pages[0], name: '311', title: 'PLC IN', panelId: 'q1', elements: [
    S('b1', 'pb_no', 60, 40, 'B1'), W('w1', [60, 56], [60, 100]), S('k', 'coil', 60, 100, 'K1'),
    { kind: 'zone', id: 'z', panelId: 'q2', x: 40, y: 30, w: 50, h: 30 } as Zone,
  ] };
  p.pages.push({ id: 'p2', name: '1001', title: 'QUADRO 2', type: 'multiline', elements: [], panelId: 'q2' });
  return p;
}

describe('pagine proiettate', () => {
  it('una pagina nel quadro del riquadro, dopo le sue pagine, una volta sola', () => {
    const p = project();
    expect(foreignZones(p).map(f => f.panel.code)).toEqual(['Q2']);
    const made = createProjections(p);
    expect(made).toHaveLength(1);
    expect(p.pages.map(x => x.name)).toEqual(['311', '1001', made[0].name]);
    expect(made[0]).toMatchObject({ panelId: 'q2', title: 'PLC IN', elements: [], projection: { pageId: p.pages[0].id, zoneId: 'z' } });
    expect(createProjections(p)).toHaveLength(0);
  });
  it('la pagina mostra il riquadro di origine e il riquadro rimanda alla pagina', () => {
    const p = project();
    const [pj] = createProjections(p);
    const d = derive(p);
    expect(d.pages.get(pj.id)!.projected?.zone.id).toBe('z');
    expect(d.pages.get(p.pages[0].id)!.zoneRefs?.get('z')?.name).toBe(pj.name);
  });
  it('senza il riquadro di origine la verifica propone di eliminare la pagina', () => {
    const p = project();
    const [pj] = createProjections(p);
    p.pages[0].elements = p.pages[0].elements.filter(e => e.kind !== 'zone');
    const i = checkProject(p).find(x => /pagina proiettata/.test(x.msg));
    expect(i?.fix).toMatchObject({ kind: 'deletePage', pageId: pj.id });
  });
  it('con la pagina proiettata il componente non è più segnalato come disegnato nel quadro sbagliato', () => {
    const p = project();
    p.panels![1].kind = 'Quadro elettrico';
    const before = foreignDevices(p).map(f => f.tag);
    createProjections(p);
    const after = foreignDevices(p).map(f => f.tag);
    expect(before).toContain('B1');
    expect(after).not.toContain('B1');
  });
});

describe('posto della rappresentazione dei contatti', () => {
  /** -1Q1 salvamotore con un NA sulla pagina 2 */
  function q(): Project {
    const p = emptyProject();
    p.pages[0].elements = [S('q', 'mpcb3', 100, 60, '1Q1')];
    p.pages.push({ id: 'p2', name: '2', title: '', type: 'multiline', elements: [S('na', 'no', 60, 60, '1Q1'), S('nc', 'nc', 80, 60, '1Q1')] });
    return p;
  }
  it('in fondo di serie; a fianco sulla linea del comando, uno dopo l\'altro', () => {
    const p = q();
    expect(contactPlaceOf(p, 'na')).toBe('bottom');
    setContactPlace(p, 'na', 'side'); setContactPlace(p, 'nc', 'side');
    placeSideReps(p);
    const a = representationOf(p, 'na')!, b = representationOf(p, 'nc')!;
    expect(a.page.id).toBe(p.pages[0].id);
    // Linea tratteggiata del salvamotore a y 7,75 dal suo punto
    expect(a.inst.y).toBeCloseTo(67.8, 1);
    expect(b.inst.y).toBeCloseTo(67.8, 1);
    expect(b.inst.x).toBeGreaterThan(a.inst.x);
    expect(contactPlaceOf(p, 'na')).toBe('side');
    // L'apparecchio si sposta: le rappresentazioni a fianco lo seguono
    (p.pages[0].elements[0] as SymbolInstance).y = 80;
    placeSideReps(p);
    expect(representationOf(p, 'na')!.inst.y).toBeCloseTo(87.8, 1);
  });
  it('libera verticale o orizzontale, e di nuovo in fondo toglie la rappresentazione', () => {
    const p = q();
    setContactPlace(p, 'na', 'free-h');
    expect(representationOf(p, 'na')!.inst.rot).toBe(90);
    expect(contactPlaceOf(p, 'na')).toBe('free-h');
    setContactPlace(p, 'na', 'free-v');
    expect(contactPlaceOf(p, 'na')).toBe('free-v');
    setContactPlace(p, 'na', 'bottom');
    expect(representationOf(p, 'na')).toBeUndefined();
  });
});

describe('sigle dei cavi ripetute', () => {
  it('l\'errore porta al secondo cavo', () => {
    const p = emptyProject();
    p.cables = [
      { id: 'c1', tag: 'W1', conductors: [], assign: {} },
      { id: 'c2', tag: 'W1', conductors: [], assign: {} },
    ] as unknown as Project['cables'];
    p.pages[0].elements = [
      { kind: 'cable', id: 'l1', cableId: 'c1', points: [{ x: 40, y: 50 }, { x: 80, y: 50 }] },
      { kind: 'cable', id: 'l2', cableId: 'c2', points: [{ x: 140, y: 50 }, { x: 180, y: 50 }] },
    ] as unknown as Project['pages'][number]['elements'];
    const e = checkProject(p).find(i => /usata da 2 cavi/.test(i.msg))!;
    expect(e).toBeDefined();
    expect(e.elementId).toBe('l2');
    expect(e.pageId).toBe(p.pages[0].id);
  });
});
