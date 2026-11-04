// Colore e altezza dei testi, posizione delle designazioni dei morsetti
import { describe, it, expect } from 'vitest';
import { textStylesOf } from '../src/model/types';
import { pinLabelPlace } from '../src/model/geometry';
import { exampleProject } from '../src/model/example';
import { derive } from '../src/model/derive';

describe('testi sullo schema', () => {
  it('predefiniti e scelte del progetto', () => {
    const d = textStylesOf({});
    expect(d.wireNo).toEqual({ color: '#0b5cad', size: 1.8 });
    const s = textStylesOf({ textStyles: { tag: { color: '#cc0000' }, wireNo: { size: 2.5 } } });
    expect(s.tag).toEqual({ color: '#cc0000', size: 2.6 });
    expect(s.wireNo).toEqual({ color: '#0b5cad', size: 2.5 });
  });
  it('un numero filo più alto resta alla stessa distanza dal filo nella posizione automatica', () => {
    const p = exampleProject();
    const pg = p.pages[1];
    const before = derive(p).pages.get(pg.id)!.wireLabelPos!;
    p.settings = { ...p.settings!, textStyles: { wireNo: { size: 3 } } };
    const after = derive(p).pages.get(pg.id)!;
    expect(after.textStyles!.wireNo.size).toBe(3);
    expect(after.wireLabelPos!.size).toBe(before.size);
  });
});

describe('posizione della designazione dei morsetti', () => {
  const pin = { id: '1', x: 0, y: 0, dir: 'up' as const, label: 'A1' };
  it('automatica secondo la direzione del filo', () => {
    expect(pinLabelPlace({ x: 10, y: 10, rot: 0 }, pin)).toEqual({ x: 10.8, y: 12.6, anchor: 'start' });
  });
  it('negli angoli scelti; a sinistra il testo finisce sul punto', () => {
    const at = { x: 10, y: 10, rot: 0 as const };
    expect(pinLabelPlace(at, { ...pin, labelPos: 'tl' })).toEqual({ x: 9.2, y: 9.4, anchor: 'end' });
    expect(pinLabelPlace(at, { ...pin, labelPos: 'tr' })).toEqual({ x: 10.8, y: 9.4, anchor: 'start' });
    expect(pinLabelPlace(at, { ...pin, labelPos: 'bl' })).toMatchObject({ x: 9.2, anchor: 'end' });
    expect(pinLabelPlace(at, { ...pin, labelPos: 'br' }).y).toBeCloseTo(12.4);
    // Simbolo specchiato: la sinistra del disegno va a destra e il testo si allinea di conseguenza
    expect(pinLabelPlace({ ...at, mirror: true }, { ...pin, labelPos: 'tl' })).toMatchObject({ x: 10.8, anchor: 'start' });
  });
});
