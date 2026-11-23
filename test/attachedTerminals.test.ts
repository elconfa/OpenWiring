// Morsetti e pin dei connettori appoggiati sui punti di connessione di un simbolo: spostando il simbolo lo seguono
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { getSymbol, pinsWorld } from '../src/model/geometry';
import type { SymbolInstance } from '../src/model/types';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  st().loadProject(emptyProject());
  return st;
}
const at = (st: any, id: string) => { const e = st().project.pages[0].elements.find((x: any) => x.id === id); return { x: e.x, y: e.y }; };

describe('morsetti appoggiati sui simboli', () => {
  it('spostando il simbolo il pin del connettore appoggiato lo segue, con il filo; spostato da solo si stacca', async () => {
    const st = await store();
    const k = st().placeSymbol('coil', { x: 80, y: 80 }, 0)!;
    const top = pinsWorld(k, getSymbol('coil')!).sort((a, b) => a.y - b.y)[0];
    // Pin di presa con il punto in basso sul morsetto in alto della bobina
    const x = st().placeSymbol('conn_female', { x: top.x, y: top.y - 8 }, 0)! as SymbolInstance;
    const xp = pinsWorld(x, getSymbol('conn_female')!).sort((a, b) => a.y - b.y);
    expect(xp[1].x).toBe(top.x); expect(xp[1].y).toBe(top.y);
    const w = st().addWire([{ x: xp[0].x, y: xp[0].y }, { x: xp[0].x, y: xp[0].y - 20 }]);
    const x0 = at(st, x.id);
    st().setSelection([k.id]);
    st().moveSelection(0, 40);
    expect(at(st, k.id)).toEqual({ x: 80, y: 120 });
    expect(at(st, x.id)).toEqual({ x: x0.x, y: x0.y + 40 });
    // Il filo sopra il pin lo segue (il suo estremo sul pin si sposta)
    const wire = st().project.pages[0].elements.find((e: any) => e.id === w.id) as any;
    expect(wire.points.some((q: any) => q.x === xp[0].x && q.y === xp[0].y + 40)).toBe(true);
    // Spostato da solo, il pin si stacca e la bobina resta
    st().setSelection([x.id]);
    st().moveSelection(40, 0);
    expect(at(st, k.id)).toEqual({ x: 80, y: 120 });
    expect(at(st, x.id)).toEqual({ x: x0.x + 40, y: x0.y + 40 });
  });
});
