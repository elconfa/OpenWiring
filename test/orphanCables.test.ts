// Cavi senza più linee nello schema: escono dall'elenco cavi (la sigla si può riusare senza doppioni)
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { checkProject } from '../src/model/checks';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  st().loadProject(emptyProject());
  return st;
}
const lines = (st: any) => st().project.pages.flatMap((pg: any) => pg.elements).filter((e: any) => e.kind === 'cable');

describe('cavi senza linee', () => {
  it('tolta l\'ultima linea il cavo esce dall\'elenco; Annulla lo riporta; con altre linee resta', async () => {
    const st = await store();
    st().addCableLine({ x: 50, y: 50 }, { x: 50, y: 90 });
    const id = st().project.cables![0].id, tag = st().project.cables![0].tag;
    st().addCableLine({ x: 150, y: 50 }, { x: 150, y: 90 }, id);
    const [a, b] = lines(st);
    st().setSelection([a.id]); st().deleteSelection();
    expect(st().project.cables!.map(c => c.id)).toEqual([id]);
    st().setSelection([b.id]); st().deleteSelection();
    expect(st().project.cables ?? []).toEqual([]);
    // Stessa sigla su un cavo nuovo: nessun doppione
    st().addCableLine({ x: 80, y: 50 }, { x: 80, y: 90 });
    st().updateCable(st().project.cables![0].id, { tag });
    expect(checkProject(st().project, []).some(i => i.msg.includes(`-${tag}`) && i.level === 'error')).toBe(false);
    // Annulla: torna il cavo tolto insieme alla linea, in un passo solo
    st().undo(); st().undo(); st().undo();
    expect(st().project.cables!.map(c => c.id)).toEqual([id]);
    expect(lines(st).length).toBe(1);
  });

  it('progetti vecchi: il cavo rimasto senza linee con la stessa sigla si toglie dal controllo', async () => {
    const st = await store();
    st().addCableLine({ x: 50, y: 50 }, { x: 50, y: 90 });
    const c = st().project.cables![0];
    const p = structuredClone(st().project);
    p.cables!.unshift({ ...structuredClone(c), id: 'vecchio' });
    st().loadProject(p);
    const issue = checkProject(st().project, []).find(i => i.fix?.kind === 'deleteCable' && i.level === 'error')!;
    expect(issue.msg).toContain(`-${c.tag}`);
    st().applyFixes([issue.fix!]);
    expect(st().project.cables!.map(x => x.id)).toEqual([c.id]);
  });
});
