import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { exampleProject } from '../src/model/example';
import { placeWireLabels, labelBox, linkTextLayout, labelNear } from '../src/model/wireLabels';
import { moveWithWires } from '../src/model/wireEdit';
import { derive } from '../src/model/derive';
import { getSymbol, instanceBounds } from '../src/model/geometry';
import type { Wire } from '../src/model/types';

describe('posizione dei numeri filo', () => {
  it('non finisce su un filo che incrocia né sotto un componente', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    pg.elements.push(
      { kind: 'wire', id: 'a', points: [{ x: 100, y: 20 }, { x: 100, y: 100 }] },
      { kind: 'wire', id: 'b', points: [{ x: 80, y: 60 }, { x: 120, y: 60 }] },
      { kind: 'symbol', id: 'k', symbolId: 'coil', x: 98, y: 66, rot: 0, tag: '1K1', pinLabels: {}, autoPins: true },
    );
    const pos = placeWireLabels(p, pg, new Map([['a', '1.01']]));
    const box = labelBox(pos.get('a')![0], '1.01');
    expect(box.y1 < 60 || box.y0 > 60).toBe(true);
    const kb = instanceBounds(pg.elements[2] as never, getSymbol('coil')!);
    expect(box.x1 <= kb.x0 || box.x0 >= kb.x1 || box.y1 <= kb.y0 || box.y0 >= kb.y1).toBe(true);
  });
  it('nello schema di esempio nessun numero filo tocca un altro filo', () => {
    const p = exampleProject();
    const d = derive(p);
    for (const pg of p.pages) {
      const pd = d.pages.get(pg.id)!;
      const wires = pg.elements.filter((e): e is Wire => e.kind === 'wire');
      for (const w of wires) {
        const pos = pd.wireLabelPos?.get(w.id)?.[0], text = pd.wireNumbers.get(w.id);
        if (!pos || !text) continue;
        const b = labelBox(pos, text);
        for (const o of wires) for (let i = 0; i < o.points.length - 1; i++) {
          const s = o.points[i], e = o.points[i + 1];
          if (o === w && (Math.abs(s.x - e.x) < 0.01 ? Math.abs(s.x - pos.x) < 3 : Math.abs(s.y - pos.y) < 3)) continue;
          const hit = Math.max(s.x, e.x) > b.x0 && Math.min(s.x, e.x) < b.x1 && Math.max(s.y, e.y) > b.y0 && Math.min(s.y, e.y) < b.y1;
          expect(hit, `pag. ${pg.name} filo ${text}`).toBe(false);
        }
      }
    }
  });
  it('i testi dei rimandi: nome dal lato del filo, pagine di fianco alla punta', () => {
    // Freccia verso sinistra sul bordo: il testo va a destra dell'attacco
    const left = linkTextLayout({ x: 28, y: 24, rot: 90 });
    expect(left.name.anchor).toBe('start');
    expect(left.name.x).toBeGreaterThan(28);
    const right = linkTextLayout({ x: 300, y: 152, rot: 270 });
    expect(right.name.anchor).toBe('end');
    expect(right.name.x).toBeLessThan(300);
    expect(right.refs.anchor).toBe('start');
    expect(right.refs.x).toBeGreaterThan(303.6);
    expect(left.refs.x).toBeLessThan(24.4);
  });
});

describe('numeri filo messi a mano', () => {
  it('più numeri sullo stesso filo, nelle posizioni scelte; seguono il filo spostato', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    const w: Wire = { kind: 'wire', id: 'a', points: [{ x: 100, y: 20 }, { x: 100, y: 100 }], labels: [{ x: 98, y: 30, vertical: true }, { x: 120, y: 90, vertical: true }] };
    pg.elements.push(w, { kind: 'wire', id: 'b', points: [{ x: 60, y: 50 }, { x: 160, y: 50 }] });
    const pos = placeWireLabels(p, pg, new Map([['a', '1.01'], ['b', '1.02']]));
    // Restano dove sono lungo il filo e dal loro lato, alla distanza della posizione automatica
    expect(pos.get('a')).toEqual([{ x: 99.3, y: 30, vertical: true }, { x: 102.1, y: 90, vertical: true }]);
    // Il numero automatico dell'altro filo evita quelli messi a mano
    const bb = labelBox(pos.get('b')![0], '1.02');
    for (const l of pos.get('a')!) {
      const lb = labelBox(l, '1.01');
      expect(bb.x1 <= lb.x0 || bb.x0 >= lb.x1 || bb.y1 <= lb.y0 || bb.y0 >= lb.y1).toBe(true);
    }
    moveWithWires(p, pg, new Set(['a']), 8, 4);
    expect(w.labels![0]).toEqual({ x: 106, y: 34, vertical: true });
  });
  it('cambiando l\'altezza del testo i numeri messi a mano si riportano alla distanza giusta', () => {
    const p = emptyProject();
    const pg = p.pages[0];
    const w: Wire = { kind: 'wire', id: 'a', points: [{ x: 20, y: 40 }, { x: 120, y: 40 }], labels: [{ x: 60, y: 42.3, vertical: false }, { x: 80, y: 39.2, vertical: false }] };
    pg.elements.push(w);
    const pos = placeWireLabels(p, pg, new Map([['a', '1.01']]), new Map(), new Map(), [], new Map([['a', 4]]));
    // Sotto: linea di base a 0,5 mm + altezza; sopra: 0,8 mm dal filo
    expect(pos.get('a')).toEqual([{ x: 60, y: 44.5, vertical: false }, { x: 80, y: 39.2, vertical: false }]);
  });
  it('un numero spostato resta sopra o sotto il filo, alla distanza automatica, con passo di 2 mm', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 60, y: 40 }];
    // Tratto verticale: a destra o a sinistra secondo dove si lascia
    expect(labelNear(pts, { x: 3, y: 12.7 })).toEqual({ x: 2.1, y: 12, vertical: true });
    expect(labelNear(pts, { x: -2, y: 13.2 })).toEqual({ x: -0.7, y: 14, vertical: true });
    // Tratto orizzontale: sotto o sopra, come nella posizione automatica
    expect(labelNear(pts, { x: 33.33, y: 44 })).toEqual({ x: 34, y: 42.3, vertical: false });
    expect(labelNear(pts, { x: 30.9, y: 37 })).toEqual({ x: 30, y: 39.2, vertical: false });
    // Oltre la fine del tratto resta sul tratto; con un'altezza maggiore la distanza dal filo è la stessa
    expect(labelNear(pts, { x: 75, y: 37 })).toEqual({ x: 60, y: 39.2, vertical: false });
    expect(labelNear(pts, { x: 30, y: 45 }, 3)).toEqual({ x: 30, y: 43.5, vertical: false });
  });
  it('rimando su un filo verticale: nome e pagina scritti dal basso verso l\'alto', () => {
    const down = linkTextLayout({ x: 100, y: 100, rot: 0 });
    expect(down.name).toMatchObject({ rot: -90, anchor: 'start' });
    expect(down.name.y).toBeLessThan(100);
    expect(down.refs).toMatchObject({ rot: -90, anchor: 'end' });
    expect(down.refs.y).toBeGreaterThan(103.6);
    const up = linkTextLayout({ x: 100, y: 100, rot: 180 });
    expect(up.name).toMatchObject({ rot: -90, anchor: 'end' });
    expect(up.refs.y).toBeLessThan(96.4);
    expect('rot' in linkTextLayout({ x: 100, y: 100, rot: 90 }).name).toBe(false);
  });
});
