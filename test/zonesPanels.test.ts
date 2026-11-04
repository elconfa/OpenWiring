import { describe, it, expect } from 'vitest';
import { exampleProject } from '../src/model/example';
import { buildDevices } from '../src/model/devices';
import { devicePanels, orderedPanels, panelLabel, panelAncestors } from '../src/model/network';
import { findPartInProject } from '../src/model/partSearch';
import { checkProject } from '../src/model/checks';

describe('riquadro di luogo sugli schemi e sottoquadri', () => {
  it('i dispositivi dentro il riquadro prendono il luogo', () => {
    const p = exampleProject();
    const d = [...buildDevices(p).values()].find(x => x.main)!;
    for (const e of d.elements) e.inst.loc = undefined;
    const m = d.main!;
    p.panels = [...(p.panels ?? []), { id: 'pz', code: 'P9', name: 'Pulsantiera' }];
    m.page.elements.unshift({ kind: 'zone', id: 'z1', panelId: 'pz', x: m.inst.x - 5, y: m.inst.y - 5, w: 10, h: 10 });
    expect(devicePanels(p).get(d.tag)?.code).toBe('P9');
  });

  it('sottoquadri: ordine dell\'albero ed etichetta con il luogo che li contiene', () => {
    const panels = [{ id: 'a', code: 'QE', name: '' }, { id: 'b', code: 'P1', name: 'Pulsantiera', parentId: 'a' }, { id: 'c', code: 'BM', name: '' }];
    expect(orderedPanels(panels).map(p => p.code)).toEqual(['QE', 'P1', 'BM']);
    expect(panelLabel(panels[1], panels)).toBe('+QE › +P1  Pulsantiera');
    // Un ciclo non blocca
    const loop = [{ id: 'x', code: 'X', name: '', parentId: 'y' }, { id: 'y', code: 'Y', name: '', parentId: 'x' }];
    expect(panelAncestors(loop[0], loop).length).toBeLessThan(3);
    expect(orderedPanels(loop)).toHaveLength(2);
  });
});

describe('ricerca dell\'articolo e correzioni dei controlli', () => {
  it('trova i dispositivi con l\'articolo', () => {
    const p = exampleProject();
    const pg = p.pages.find(x => x.elements.some(e => e.kind === 'symbol' && e.tag))!;
    const el = pg.elements.find(e => e.kind === 'symbol' && e.tag)!;
    if (el.kind !== 'symbol') throw new Error();
    el.partNr = 'SIE.3RT2015-1BB41';
    const hits = findPartInProject(p, '3rt2015');
    expect(hits.some(h => h.elementId === el.id)).toBe(true);
    expect(findPartInProject(p, 'nessuno-xyz')).toEqual([]);
  });

  it('simbolo doppio: correzione «Elimina il doppione»', async () => {
    const p = exampleProject();
    const pg = p.pages.find(x => x.elements.some(e => e.kind === 'symbol' && e.tag))!;
    const el = pg.elements.find(e => e.kind === 'symbol' && e.tag)!;
    pg.elements.push({ ...structuredClone(el), id: 'dup1' });
    const issue = checkProject(p).find(i => i.fix?.kind === 'deleteElement');
    expect(issue?.fix).toBeTruthy();
    const { useStore } = await import('../src/model/store');
    useStore.getState().loadProject(p);
    useStore.getState().applyFixes([issue!.fix!]);
    expect(checkProject(useStore.getState().project).some(i => i.fix?.kind === 'deleteElement')).toBe(false);
  });
});
