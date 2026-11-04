import { describe, it, expect } from 'vitest';
import { resizeZone, zoneLeader, zoneLabelBox, leaderLine } from '../src/model/leaders';
import type { Zone } from '../src/model/types';

const z: Zone = { kind: 'zone', id: 'z', panelId: 'p', x: 100, y: 50, w: 80, h: 40 };

describe('riquadro di luogo e righini', () => {
  it('le maniglie ridimensionano tenendo fermo il lato opposto, almeno 8 mm', () => {
    expect(resizeZone(z, 'se', { x: 200, y: 120 })).toEqual({ x: 100, y: 50, w: 100, h: 70 });
    expect(resizeZone(z, 'w', { x: 90, y: 0 })).toEqual({ x: 90, y: 50, w: 90, h: 40 });
    expect(resizeZone(z, 'n', { x: 0, y: 200 })).toEqual({ x: 100, y: 82, w: 80, h: 8 });
  });
  it('righino solo con la scritta spostata, dal bordo alla scritta', () => {
    expect(zoneLeader(z, zoneLabelBox(z, '+Q1.2', 2.8, true).box)).toBeUndefined();
    const moved = { ...z, label: { x: -30, y: 20 } };
    const l = zoneLeader(moved, zoneLabelBox(moved, '+Q1.2', 2.8, true).box)!;
    expect(l[0]).toEqual({ x: 100, y: expect.any(Number) });
    expect(l[1].x).toBeLessThan(100);
  });
  it('nessun righino se la scritta tocca già il punto', () => {
    expect(leaderLine({ x: 1, y: 1 }, { x0: 0, y0: 0, x1: 5, y1: 2 })).toBeUndefined();
  });
});
