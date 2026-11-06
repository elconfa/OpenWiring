// Cavi di rete disegnati in più tratti uniti dai rimandi (es. -300W1 dalla CPU della pagina 300 allo
// switch della pagina 400): sono un cavo solo, con una sigla sola
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { busCableRows, allCableTags, assignBusCableTags, unifyBusCableTags } from '../src/model/network';
import { checkProject } from '../src/model/checks';
import { derive } from '../src/model/derive';
import { useStore } from '../src/model/store';
import type { Project, Wire, SymbolInstance, Page } from '../src/model/types';

const sym = (id: string, symbolId: string, tag: string, x: number, y: number, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, tag, x, y, rot: 0, pinLabels: {}, ...extra } as SymbolInstance);
const bus = (id: string, pts: [number, number][], tag?: string): Wire => ({ kind: 'wire', id, bus: 'Profinet', points: pts.map(([x, y]) => ({ x, y })), ...(tag ? { busCable: { tag } } : {}) });
const page = (id: string, name: string, elements: Page['elements']): Page => ({ id, name, title: '', type: 'multiline', elements });

function project(secondTag?: string): Project {
  const p = emptyProject();
  p.pages = [
    // CPU (bobina usata come nodo: pin A1 in 100,100) → rimando di partenza in 40,100
    page('p300', '300', [sym('cpu', 'coil', '300CPU1', 100, 100), sym('l1', 'link', '300W1', 40, 100, { linkTo: 'l2' }), bus('w1', [[100, 100], [40, 100]], '300W1')]),
    // rimando di arrivo in 40,60 → switch in 100,60
    page('p400', '400', [sym('sw', 'coil', '400A1', 100, 60), sym('l2', 'link_in', '300W1', 40, 60, { linkTo: 'l1' }), bus('w2', [[40, 60], [100, 60]], secondTag)]),
  ];
  return p;
}

describe('cavi di rete con i rimandi', () => {
  it('due tratti uniti dai rimandi sono un cavo solo: una riga, nessun errore di sigla doppia', () => {
    const p = project('300W1');
    const rows = busCableRows(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].tag).toBe('300W1');
    expect(rows[0].wires.map(w => w.id).sort()).toEqual(['w1', 'w2']);
    expect([rows[0].a?.el.inst.tag, rows[0].b?.el.inst.tag].sort()).toEqual(['300CPU1', '400A1']);
    expect(allCableTags(p)).toEqual(['300W1']);
    expect(checkProject(p).some(i => i.msg.includes('300W1') && i.level === 'error')).toBe(false);
  });

  it('il tratto nuovo disegnato dal rimando prende la sigla del cavo', () => {
    const p = project();
    (p.pages[0].elements[2] as Wire).busCable = { tag: '300W1', type: 'Profinet tipo C', length: 5 };
    expect(assignBusCableTags(p)).toBe(1);
    expect((p.pages[1].elements[2] as Wire).busCable).toEqual({ tag: '300W1', type: 'Profinet tipo C', length: 5 });
  });

  it('sigle diverse sui tratti dello stesso cavo: avviso', () => {
    const p = project('400W9');
    expect(busCableRows(p)[0].otherTags).toEqual(['400W9']);
    expect(checkProject(p).some(i => i.level === 'warn' && i.msg.includes('-300W1') && i.msg.includes('-400W9'))).toBe(true);
  });

  it('la correzione mette la sigla del tratto sulla prima pagina su tutti i tratti', () => {
    const p = project('400W9');
    const issue = checkProject(p).find(i => i.fix?.kind === 'busCableTag')!;
    expect(issue.fix).toMatchObject({ tag: '300W1', wireIds: expect.arrayContaining(['w1', 'w2']) });
    useStore.getState().loadProject(p);
    useStore.getState().applyFixes([issue.fix!]);
    const w2 = useStore.getState().project.pages[1].elements.find(e => e.id === 'w2') as Wire;
    expect(w2.busCable?.tag).toBe('300W1');
  });

  it('rimandi abbinati dopo: il tratto con la sigla automatica prende quella del cavo', () => {
    const p = project('400W9');
    (p.pages[1].elements[2] as Wire).busCable!.auto = true;
    expect(unifyBusCableTags(p)).toBe(1);
    expect((p.pages[1].elements[2] as Wire).busCable?.tag).toBe('300W1');
    // Sigla scritta dall'utente: resta (c'è l'avviso con la correzione)
    const q = project('400W9');
    expect(unifyBusCableTags(q)).toBe(0);
    // Anche a ogni modifica del progetto
    const r = project('400W9');
    (r.pages[1].elements[2] as Wire).busCable!.auto = true;
    useStore.getState().loadProject(r);
    useStore.getState().commit(() => {});
    const w2 = useStore.getState().project.pages[1].elements.find(e => e.id === 'w2') as Wire;
    expect(w2.busCable?.tag).toBe('300W1');
  });

  it('la sigla del cavo non si ripete accanto a un rimando con lo stesso nome; ha un occhio suo', () => {
    const p = project('300W1');
    const shown = (q: Project) => derive(q).cableTagShown;
    expect(shown(p).size).toBe(0);
    // Rimando con un altro nome: la sigla si scrive
    (p.pages[1].elements[1] as SymbolInstance).tag = 'R1';
    expect([...shown(p)]).toEqual(['w2']);
    expect(derive(p).pages.get('p400')!.wireNumbers.get('w2')).toContain('-300W1');
    // Occhio della sigla spento, o occhio del numero filo spento: niente sigla
    (p.pages[1].elements[2] as Wire).show = { cable: false };
    expect(shown(p).size).toBe(0);
    (p.pages[1].elements[2] as Wire).show = { number: false };
    expect(derive(p).pages.get('p400')!.wireNumbers.get('w2')).toBeUndefined();
    // Occhio della sigla acceso: si scrive anche accanto al rimando con lo stesso nome
    (p.pages[0].elements[2] as Wire).show = { cable: true };
    expect(shown(p).has('w1')).toBe(true);
  });

  it('due cavi distinti con la stessa sigla restano un errore', () => {
    const p = project('300W1');
    // Senza abbinamento i rimandi non uniscono i tratti (nomi diversi, nessun linkTo)
    (p.pages[1].elements[1] as SymbolInstance).tag = 'XX';
    (p.pages[1].elements[1] as SymbolInstance).linkTo = undefined;
    (p.pages[0].elements[1] as SymbolInstance).linkTo = undefined;
    expect(checkProject(p).some(i => i.level === 'error' && i.msg.includes('-300W1'))).toBe(true);
  });
});
