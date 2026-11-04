import { describe, it, expect } from 'vitest';
import { ductNet, ductRoute, wireArea, ductCapacity } from '../src/model/ductRoute';
import type { Layout } from '../src/model/types';

// Canalina verticale a sinistra (x 0–40) e due orizzontali (y 0–40 e y 400–440) che la toccano
const layout: Layout = { plate: { w: 800, h: 1000 }, items: [
  { id: 'v', kind: 'duct', x: 0, y: 0, w: 40, h: 1000, label: '40x60' },
  { id: 'h1', kind: 'duct', x: 40, y: 0, w: 720, h: 40, label: '40x60' },
  { id: 'h2', kind: 'duct', x: 40, y: 400, w: 720, h: 40, label: '60x80' },
] };

describe('percorso dei fili nelle canaline', () => {
  const net = ductNet(layout)!;
  it('stessa canalina: esce, la segue, rientra', () => {
    const r = ductRoute(net, { x: 100, y: 80 }, { x: 500, y: 80 });
    // 60 per entrare nella canalina in alto (y 20), 400 lungo, 60 per uscire
    expect(r.length).toBe(520);
    expect([...r.ducts].map(d => d.id)).toEqual(['h1']);
  });
  it('tra due canaline orizzontali passa dalla verticale', () => {
    const r = ductRoute(net, { x: 500, y: 80 }, { x: 500, y: 360 });
    // Dal punto in alto alla canalina h1 (60), a sinistra fino alla verticale, giù, a destra fino a 500, su (40)
    expect(r.length).toBeGreaterThan(800);
    expect(new Set([...r.ducts].map(d => d.id))).toEqual(new Set(['h1', 'v', 'h2']));
  });
  it('sezione dei fili e delle canaline', () => {
    expect(wireArea('1,5')).toBeCloseTo(Math.PI * 9 / 4);
    expect(wireArea()).toBeCloseTo(Math.PI * 9 / 4);
    expect(ductCapacity(layout.items[2])).toBe(4800);
  });
});
