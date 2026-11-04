// Il cavo segue il suo articolo: se l'articolo cambia (es. da conduttori numerati a colorati) i cavi che lo usano prendono i conduttori nuovi
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { checkProject } from '../src/model/checks';
import { cableInfos } from '../src/model/cables';
import type { Part, Wire, CableLine, Page } from '../src/model/types';

const wire = (id: string, x: number): Wire => ({ kind: 'wire', id, points: [{ x, y: 20 }, { x, y: 80 }] });
const line: CableLine = { kind: 'cable', id: 'l1', cableId: 'c1', points: [{ x: 30, y: 50 }, { x: 90, y: 50 }] };
const part = (conductors: string[], marking: 'numbers' | 'colors'): Part => ({ partNr: 'K3', functionTemplates: [], attrs: {}, typeNr: 'CAVO 3x1', cable: { marking, conductors, cross: '1' } });

describe('cavo e articolo', () => {
  it('articolo cambiato da numeri a colori: il cavo prende i colori, i fili restano sul conduttore nella stessa posizione', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p = emptyProject();
    p.parts = [part(['1', '2', '3'], 'numbers')];
    p.cables = [{ id: 'c1', tag: 'W1', partNr: 'K3', conductors: ['1', '2', '3'], marking: 'numbers', assign: { w2: '3' } }];
    p.pages = [{ id: 'a', name: '10', title: '', type: 'multiline', elements: [wire('w1', 40), wire('w2', 60), line] } as Page];
    st().loadProject(p);
    st().commit(() => {});
    st().savePart('K3', { cable: { marking: 'colors', conductors: ['BN', 'BU', 'GY'], cross: '1' } });
    const c = st().project.cables![0];
    expect(c.conductors).toEqual(['BN', 'BU', 'GY']);
    expect(c.marking).toBe('colors');
    const names = Object.fromEntries(cableInfos(st().project)[0].conductors.map(k => [k.wire.id, k.name]));
    expect(names).toEqual({ w1: 'BN', w2: 'GY' });
  });

  it('progetto già salvato con cavo e articolo diversi: avviso con la correzione', () => {
    const p = emptyProject();
    p.parts = [part(['BN', 'BU', 'GY'], 'colors')];
    p.cables = [{ id: 'c1', tag: 'W1', partNr: 'K3', conductors: ['1', '2', '3'], assign: {} }];
    const i = checkProject(p).find(x => x.fix?.kind === 'cableFromPart');
    expect(i?.msg).toContain('-W1');
  });
});
