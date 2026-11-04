// Sequenza di cablaggio: ordine dei collegamenti per posizione, dai nodi a T con verso, scelto a mano,
// dai ripartitori; barra di terra; formato testo (nodo1=, ordine)
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { connections, computeNetlist } from '../src/model/netlist';
import { distSlots, distSymbol, newDistributor } from '../src/model/distributors';
import { pageTNodes, pinKey } from '../src/model/wiringOrder';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { bomReport, connectionReport } from '../src/model/reports';

async function threeCoils() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p0 = emptyProject();
  p0.settings.autoConnect = false;
  st().loadProject(p0);
  // -K1, -K2, -K3 con A1 a y 120; un filo da K1 a K3 sopra (y 100) e la discesa a T verso K2
  for (const x of [40, 80, 120]) st().placeSymbol('coil', { x, y: 120 }, 0);
  st().addWire([{ x: 40, y: 120 }, { x: 40, y: 100 }, { x: 120, y: 100 }, { x: 120, y: 120 }]);
  st().addWire([{ x: 80, y: 100 }, { x: 80, y: 120 }]);
  return st;
}

const pairs = (st: Awaited<ReturnType<typeof threeCoils>>) =>
  connections(computeNetlist(st().project), st().project).filter(c => c.from.endsWith(':A1')).map(c => `${c.from}>${c.to}`);

describe('sequenza di cablaggio', () => {
  it('per posizione, dai nodi a T con verso e scelta a mano', async () => {
    const st = await threeCoils();
    const tags = st().project.pages[0].elements.filter(e => e.kind === 'symbol').map(e => (e.kind === 'symbol' ? e.tag : ''));
    const [k1, k2, k3] = tags.map(t => `-${t}:A1`);
    expect(pairs(st)).toEqual([`${k1}>${k2}`, `${k2}>${k3}`]);
    expect(connections(computeNetlist(st().project), st().project)[0].seq).toBe('position');

    // Gambo verso sinistra: K2 si collega a K1, la linea passante va da K1 a K3
    const pageId = st().project.pages[0].id;
    st().setTNode(pageId, { x: 80, y: 100 }, 'left');
    expect(pageTNodes(st().project.pages[0])).toMatchObject([{ stem: 'down', join: 'left' }]);
    expect(pairs(st)).toEqual([`${k2}>${k1}`, `${k1}>${k3}`]);
    // Verso destra: K1 → K3 → K2
    st().setTNode(pageId, { x: 80, y: 100 }, 'right');
    expect(pairs(st)).toEqual([`${k1}>${k3}`, `${k3}>${k2}`]);
    expect(connections(computeNetlist(st().project), st().project)[0].seq).toBe('tnode');
    // Senza verso: di nuovo per posizione
    st().setTNode(pageId, { x: 80, y: 100 }, undefined);
    expect(st().project.pages[0].elements.some(e => e.kind === 'wire' && e.tNode)).toBe(false);
    expect(pairs(st)).toEqual([`${k1}>${k2}`, `${k2}>${k3}`]);

    // Ordine scelto a mano: vince sui nodi a T
    st().setTNode(pageId, { x: 80, y: 100 }, 'left');
    const net = computeNetlist(st().project).nets.find(n => n.pins.length === 3)!;
    const byRef = new Map(net.pins.map(p => [`-${p.ref}`, pinKey(p)]));
    st().setWireOrder(net.pins.map(pinKey), [byRef.get(k3)!, byRef.get(k1)!, byRef.get(k2)!]);
    expect(pairs(st)).toEqual([`${k3}>${k1}`, `${k1}>${k2}`]);
    expect(connections(computeNetlist(st().project), st().project)[0].seq).toBe('manual');
    // Lista connessioni: colonna Sequenza e il filo di ogni riga (tasto destro nella vista Liste)
    const rep = connectionReport(st().project);
    const col = rep.columns.indexOf('Sequenza');
    const rowK = rep.rows.findIndex(r => r[3] === k3);
    expect(rep.rows[rowK][col]).toBe('ordine scelto a mano');
    expect(computeNetlist(st().project).wireNet.get(rep.wires![rowK]!)?.pins).toHaveLength(3);

    // Formato testo: verso del nodo e ordine tornano uguali
    const text = pagesToText(st().project);
    expect(text).toMatch(/nodo1=sinistra/);
    expect(text).toContain(`ordine ${k3} ${k1} ${k2}`);
    const p2 = structuredClone(st().project);
    const r = importPagesText(p2, text);
    expect(r.errors).toEqual([]);
    expect(p2.wireOrders).toHaveLength(1);
    expect(pageTNodes(p2.pages[0])).toMatchObject([{ join: 'left' }]);
    const again = connections(computeNetlist(p2), p2).filter(c => c.from.endsWith(':A1')).map(c => `${c.from}>${c.to}`);
    expect(again).toEqual([`${k3}>${k1}`, `${k1}>${k2}`]);

    // Automatico: l'ordine scelto a mano sparisce, resta il nodo a T
    st().setWireOrder(net.pins.map(pinKey), null);
    expect(st().project.wireOrders).toBeUndefined();
    expect(pairs(st)).toEqual([`${k2}>${k1}`, `${k1}>${k3}`]);
  });

  it('nodi a T in tutte le direzioni: barra in alto, barra in basso, linea verticale a destra e a sinistra', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    // Tre teleruttori a y 120 (A1 in alto a 120, A2 in basso a 136); linea passante e gambo per ogni caso
    const cases: { name: string; wires: { x: number; y: number }[][]; node: { x: number; y: number }; stem: string; through: string[] }[] = [
      // Barra sopra (gambo in basso), come i fili dall'alto
      { name: 'sopra', wires: [[{ x: 40, y: 120 }, { x: 40, y: 100 }, { x: 120, y: 100 }, { x: 120, y: 120 }], [{ x: 80, y: 100 }, { x: 80, y: 120 }]], node: { x: 80, y: 100 }, stem: 'down', through: ['left', 'right'] },
      // Barra sotto (gambo in alto), come i fili dal basso, sugli A2
      { name: 'sotto', wires: [[{ x: 40, y: 136 }, { x: 40, y: 160 }, { x: 120, y: 160 }, { x: 120, y: 136 }], [{ x: 80, y: 160 }, { x: 80, y: 136 }]], node: { x: 80, y: 160 }, stem: 'up', through: ['left', 'right'] },
    ];
    for (const c of cases) {
      const p0 = emptyProject();
      p0.settings.autoConnect = false;
      st().loadProject(p0);
      for (const x of [40, 80, 120]) st().placeSymbol('coil', { x, y: 120 }, 0);
      for (const w of c.wires) st().addWire(w);
      const pageId = st().project.pages[0].id;
      for (const join of c.through as ('left' | 'right')[]) {
        st().setTNode(pageId, c.node, join);
        const t = pageTNodes(st().project.pages[0]);
        expect(t, c.name).toMatchObject([{ stem: c.stem, join }]);
        expect(connections(computeNetlist(st().project), st().project).find(x => x.seq)?.seq, c.name).toBe('tnode');
      }
    }
    // Linea passante verticale con il gambo a destra o a sinistra: tre punti uno sotto l'altro
    for (const side of [1, -1]) {
      const p0 = emptyProject();
      p0.settings.autoConnect = false;
      st().loadProject(p0);
      // Morsetti sulla linea verticale x 100 (y 60 e 140) e un teleruttore di fianco a y 100
      const cx = 100 + side * 40;
      st().placeSymbol('coil', { x: cx, y: 100 }, 0);
      st().placeSymbol('coil', { x: 160, y: 40 }, 0);
      st().placeSymbol('coil', { x: 160, y: 160 }, 0);
      // Dal K2 (A1 a 160,40) giù lungo x 100 fino al K3 (A1 a 160,160), gambo da (100,100) verso K1:A1
      st().addWire([{ x: 160, y: 40 }, { x: 160, y: 30 }, { x: 100, y: 30 }, { x: 100, y: 150 }, { x: 160, y: 150 }, { x: 160, y: 160 }]);
      st().addWire([{ x: 100, y: 100 }, { x: 100 + side * 20, y: 100 }, { x: 100 + side * 20, y: 90 }, { x: cx, y: 90 }, { x: cx, y: 100 }]);
      const pageId = st().project.pages[0].id;
      const tags = st().project.pages[0].elements.flatMap(e => (e.kind === 'symbol' ? [`-${e.tag}:A1`] : []));
      for (const join of ['up', 'down'] as const) {
        st().setTNode(pageId, { x: 100, y: 100 }, join);
        expect(pageTNodes(st().project.pages[0])).toMatchObject([{ stem: side > 0 ? 'right' : 'left', join }]);
        const ps = connections(computeNetlist(st().project), st().project).filter(x => x.seq).map(x => [x.from, x.to].sort().join('~'));
        // Gambo verso l'alto: K1 con K2 (in alto); verso il basso: K1 con K3
        expect(ps).toContain([tags[0], tags[join === 'up' ? 1 : 2]].sort().join('~'));
        expect(ps).toContain([tags[1], tags[2]].sort().join('~'));
      }
    }
  });

  it('ripartitore: fili a stella dal foro, in catena con l\'ordine scelto', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p0 = emptyProject();
    p0.settings.autoConnect = false;
    st().loadProject(p0);
    const id = st().addDistributor('bar');
    st().updateDistributor(id, { groups: [{ name: 'L1', outs: ['10'] }] });
    st().placeDistGroup(id);
    const t = st().tool;
    if (t.kind === 'place') st().placeSymbol(t.symbolId, { x: 100, y: 40 }, 0, undefined, t.tag);
    for (const x of [100, 140]) st().placeSymbol('coil', { x, y: 120 }, 0);
    st().addWire([{ x: 100, y: 52 }, { x: 100, y: 120 }]);
    st().addWire([{ x: 100, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 120 }]);
    const hole = () => distSlots(st().project).find(s => s.k === 0)!;
    expect(hole().wires).toHaveLength(2);
    const conns = () => connections(computeNetlist(st().project), st().project).filter(c => c.seq).map(c => `${c.from}>${c.to}`);
    expect(conns().every(c => c.startsWith('-Q50:L1.1>'))).toBe(true);
    // Dal foro a K1, poi da K1 a K2: sul foro resta un filo solo
    const net = computeNetlist(st().project).nets.find(n => n.pins.some(p => p.ref === 'Q50:L1.1'))!;
    const order = [...net.pins].sort((a, b) => a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    const hub = net.pins.find(p => p.ref === 'Q50:L1.1')!;
    st().setWireOrder(net.pins.map(pinKey), [hub, ...order.filter(p => p !== hub)].map(pinKey));
    expect(hole().wires).toHaveLength(1);
    expect(conns()).toHaveLength(2);
    expect(conns()[1].startsWith('-Q50')).toBe(false);
  });

  it('barra di terra: sigla PE, un foro per uscita, testo e distinta', () => {
    const p = emptyProject();
    const d = newDistributor(p, 'earth');
    expect(d).toMatchObject({ tag: 'PE1', kind: 'earth', groups: [{ name: 'PE' }] });
    expect(d.groups[0].outs).toHaveLength(10);
    const s = distSymbol(d, 0);
    expect(s.name).toBe('Barra di terra -PE1 PE');
    expect(s.prims.filter(x => x.t === 'circle')).toHaveLength(10);
    expect(s.pins.map(x => x.label).slice(0, 3)).toEqual(['PE', 'PE.1', 'PE.2']);
    d.partNr = 'PE-BAR-10';
    d.description = 'Barra di terra 10 fori M6';
    p.distributors = [d];
    const text = pagesToText(p);
    expect(text).toContain('ripartitore -PE1 tipo=terra');
    const p2 = emptyProject();
    expect(importPagesText(p2, text).errors).toEqual([]);
    expect(p2.distributors?.[0]).toMatchObject({ tag: 'PE1', kind: 'earth', partNr: 'PE-BAR-10' });
    expect(bomReport(p).rows.some(r => r.includes('PE-BAR-10'))).toBe(true);
  });
});

describe('articoli mancanti', () => {
  it('articolo del ripartitore copiato nel progetto; avviso per gli articoli che non sono da nessuna parte', async () => {
    const { useStore } = await import('../src/model/store');
    const { checkProject } = await import('../src/model/checks');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    useStore.setState({ library: [{ partNr: 'CEM.DB100', manufacturer: 'Cembre', orderNr: 'DB100-6/4', descr1: 'Ripartitore' } as never] });
    const id = st().addDistributor('bar');
    st().updateDistributor(id, { partNr: 'CEM.DB100' });
    expect(st().project.parts.map(p => p.partNr)).toContain('CEM.DB100');
    // Su un altro computer, senza libreria: l'articolo c'è ancora (copia nel progetto)
    expect(checkProject(st().project, []).filter(i => i.kind === 'Articoli')).toEqual([]);
    // Un codice che non è da nessuna parte: avviso con il punto in cui è usato
    st().placeSymbol('coil', { x: 100, y: 100 }, 0);
    const k = st().project.pages[0].elements.find(e => e.kind === 'symbol')!;
    st().updateElement(k.id, { partNr: 'NON.ESISTE' });
    const w = checkProject(st().project, []).filter(i => i.kind === 'Articoli');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ level: 'warn', elementId: k.id });
    expect(w[0].msg).toContain('NON.ESISTE');
  });
});
