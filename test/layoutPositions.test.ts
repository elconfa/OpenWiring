// Numeri di posizione nel layout del quadro e legenda (punto 174)
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { newLayoutPage, numberPositions, positionRows, readingOrder, balloons, layoutOf, layoutProblems } from '../src/model/layout';
import { projectReports, POSITIONS_TITLE } from '../src/model/reports';
import type { LayoutItem, Project } from '../src/model/types';

const dev = (ref: string, x: number, y: number): LayoutItem => ({ id: `L${ref}`, kind: 'device', ref, x, y, w: 45, h: 80 });

function project(): Project {
  const p = emptyProject();
  const plate = newLayoutPage(p); plate.title = 'Piastra';
  plate.layout!.items = [
    { id: 'r1', kind: 'rail', x: 40, y: 60, w: 700, h: 35 },
    dev('2K1', 200, 40), dev('1Q1', 60, 38), dev('3K1', 120, 300), dev('2K2', 250, 42),
  ];
  p.pages.push(plate);
  const door = newLayoutPage(p); door.title = 'Porta'; door.name = String(Number(plate.name) + 1);
  door.layout!.items = [dev('1S1', 50, 50), dev('1H1', 120, 50)];
  p.pages.push(door);
  return p;
}

describe('numeri di posizione del layout', () => {
  it('ordine di lettura per file, numeri continui tra le pagine del luogo, poi solo i nuovi', () => {
    const p = project();
    const plate = p.pages[p.pages.length - 2], door = p.pages[p.pages.length - 1];
    expect(readingOrder(plate.layout!.items).map(i => i.ref)).toEqual(['1Q1', '2K1', '2K2', '3K1']);
    expect(numberPositions(p, plate.id)).toBe(6);
    const pos = (pg: typeof plate) => Object.fromEntries(pg.layout!.items.filter(i => i.ref).map(i => [i.ref, i.pos]));
    expect(pos(plate)).toEqual({ '1Q1': 1, '2K1': 2, '2K2': 3, '3K1': 4 });
    expect(pos(door)).toEqual({ '1S1': 5, '1H1': 6 });
    // Un apparecchio nuovo prende il numero dopo l'ultimo; gli altri restano
    plate.layout!.items.push(dev('1F1', 10, 40));
    expect(numberPositions(p, door.id)).toBe(1);
    expect(pos(plate)['1F1']).toBe(7);
    expect(pos(plate)['1Q1']).toBe(1);
    // Rinumera: tutti da capo
    numberPositions(p, plate.id, true);
    expect(pos(plate)).toMatchObject({ '1F1': 1, '1Q1': 2 });
    // Legenda per zona
    const rows = positionRows(p);
    expect(rows.map(r => `${r.pos} ${r.tag} ${r.zone}`).slice(-2)).toEqual(['6 1S1 Porta', '7 1H1 Porta']);
    const t = projectReports(p).find(x => x.title === POSITIONS_TITLE)!;
    expect(t.rows[0].slice(0, 3)).toEqual(['1', expect.any(String), '-1F1']);
    // Bollini sulla pagina; nascosti con balloons = false
    expect(balloons(layoutOf(plate)).length).toBe(5);
    plate.layout!.balloons = false;
    expect(balloons(layoutOf(plate)).length).toBe(0);
  });

  it('numero doppio nello stesso luogo: segnalato nei controlli del layout', () => {
    const p = project();
    const plate = p.pages[p.pages.length - 2];
    numberPositions(p, plate.id);
    plate.layout!.items.find(i => i.ref === '2K2')!.pos = 1;
    expect(layoutProblems(p).some(i => i.msg.includes('1') && i.msg.includes('-1Q1') && i.msg.includes('-2K2'))).toBe(true);
  });
});
