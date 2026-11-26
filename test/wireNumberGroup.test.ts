// Numero filo scritto a mano su un tratto qualunque: vale per tutto il conduttore, anche attraverso i
// morsetti (prima valeva solo se si partiva dal tratto più in alto, gli altri tenevano il numero vecchio)
import { describe, expect, it } from 'vitest';
import { exampleProject } from '../src/model/example';
import { computeNetlist, lockWireNumbers } from '../src/model/netlist';

describe('numero filo a mano', () => {
  it('su un tratto dopo il morsetto vale per tutto il gruppo', async () => {
    const { useStore } = await import('../src/model/store');
    const p = exampleProject();
    lockWireNumbers(p);
    useStore.setState({ project: p, past: [], future: [] });
    const nl = computeNetlist(p);
    // Conduttore che attraversa un morsetto: due reti con fili nello stesso gruppo
    const groups = new Map<string, typeof nl.nets>();
    for (const n of nl.nets) if (n.wires.length) groups.set(n.group, [...(groups.get(n.group) ?? []), n]);
    const g = [...groups.values()].find(l => l.length > 1)!;
    expect(g).toBeTruthy();
    for (const n of [...g].reverse()) {
      const w = n.wires[n.wires.length - 1].wire;
      useStore.setState({ pageId: n.wires[0].pageId });
      useStore.getState().setWireNumber(w.id, `T${n.id.length}`);
      const after = computeNetlist(useStore.getState().project);
      const nums = g.map(m => after.nets.find(x => x.id === m.id)?.wireNo);
      expect(new Set(nums)).toEqual(new Set([`T${n.id.length}`]));
    }
    // Senza morsetti: un tratto qualunque della rete
    const single = [...groups.values()].find(l => l.length === 1 && l[0].wires.length > 1 && !l[0].links?.length && !l[0].named)![0];
    useStore.getState().setWireNumber(single.wires[single.wires.length - 1].wire.id, 'S1');
    expect(computeNetlist(useStore.getState().project).nets.find(x => x.id === single.id)?.wireNo).toBe('S1');
  });
});
