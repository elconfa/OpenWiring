// Miniatura dell'isola I/O (punto 187): moduli in fila per slot, freccia sui moduli usati nella pagina
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { stationMiniDrawing, stationMiniBox, stationCards } from '../src/model/stationMini';
import { pagesToText, importPagesText } from '../src/model/textFormat';
import { FRAME } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.plc.cards = [];
  st().loadProject(p);
  return st;
}

describe('miniatura della stazione PLC', () => {
  it('moduli per slot, freccia sul modulo della pagina, in alto a destra, nel testo delle pagine', async () => {
    const st = await store();
    const a = st().addPlcCard('di16', 'IO1'), b = st().addPlcCard('do16', 'IO1'), c = st().addPlcCard('ai4', 'IO1');
    st().updatePlcCard(a.id, { slot: 4 }); st().updatePlcCard(b.id, { slot: 2 }); st().updatePlcCard(c.id, { slot: 3 });
    expect(stationCards(st().project, 'IO1').map(x => x.tag)).toEqual([b.tag, c.tag, a.tag]);
    // Un gruppo di ingressi della scheda a nella pagina
    const g = st().placeSymbol('plc_grp_di1', { x: 40, y: 80 }, 0)!;
    st().updatePlcGroup(g.plcGroup!.id, { tag: a.tag, first: 0 });
    st().insertBlock('station');
    const blk = st().project.pages[0].elements.find(e => e.kind === 'block')! as any;
    const box = stationMiniBox(st().project, blk);
    expect(box.x1).toBeCloseTo(FRAME.right - 4, 5);
    const d = stationMiniDrawing(st().project, blk);
    expect(d.station).toBe('IO1');
    expect(d.rects.length).toBe(4); // testa + 3 moduli
    expect(d.rects.map(r => !!r.used)).toEqual([false, false, false, true]);
    expect(d.arrows.length).toBe(1);
    expect(d.texts.some(t => t.s.startsWith(`-${a.tag}`) && t.s.includes('DI16'))).toBe(true);
    // Testo delle pagine
    const txt = pagesToText(st().project);
    expect(txt).toMatch(/blocco stazione @/);
    const p2 = structuredClone(st().project);
    p2.pages[0].elements = p2.pages[0].elements.filter(e => e.kind !== 'block');
    expect(importPagesText(p2, txt).errors ?? []).toEqual([]);
    expect(p2.pages[0].elements.filter(e => e.kind === 'block').map((e: any) => e.block)).toEqual(['station']);
  });
});
