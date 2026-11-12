// Proprietà mostrate o nascoste sullo schema (interruttore mostra/nascondi)
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { SymbolInstance, Wire } from '../src/model/types';
import { derive } from '../src/model/derive';
import { symShown } from '../src/model/visibility';

const S = (id: string, symbolId: string, x: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id, symbolId, x, y: 60, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });

describe('mostra/nascondi sullo schema', () => {
  it('dati del dispositivo: predefiniti, nascosti e aggiunti sotto la sigla', () => {
    const p = emptyProject();
    p.pages[0].elements = [S('k', 'coil', 60, '1K1', { description: 'Pompa', techData: '24 V DC', orderNr: 'ABC123' })];
    const lines = () => derive(p).pages.get(p.pages[0].id)!.deviceLines.get('k');
    expect(lines()).toEqual(['Pompa', '24 V DC']);
    (p.pages[0].elements[0] as SymbolInstance).show = { description: false, orderNr: true };
    expect(lines()).toEqual(['24 V DC', 'ABC123']);
  });
  it('sigla, funzione e luogo nascosti', () => {
    const p = emptyProject();
    p.pages[0].elements = [S('k', 'coil', 60, '1K1', { func: 'A1', loc: 'Q1', show: { func: false } })];
    expect(derive(p).pages.get(p.pages[0].id)!.designations.get('k')).toBe('+Q1-1K1');
    (p.pages[0].elements[0] as SymbolInstance).show = { tag: false };
    expect(derive(p).pages.get(p.pages[0].id)!.designations.get('k')).toBe('');
  });
  it('vale per tutti gli elementi del dispositivo; rimando con il solo numero di pagina', () => {
    const p = emptyProject();
    p.pages[0].elements = [S('k', 'coil', 60, '1K1', { show: { pins: false } }), S('c', 'no', 100, '1K1'), S('r', 'link', 200, 'R1', { show: { tag: false } })];
    const show = derive(p).pages.get(p.pages[0].id)!.show!;
    expect(show.get('c')?.pins).toBe(false);
    expect(show.get('r')).toEqual({ tag: false });
    expect(symShown(show.get('r'), 'refs')).toBe(true);
  });
  it('numero, sezione e colore del filo', () => {
    const p = emptyProject();
    const w: Wire = { kind: 'wire', id: 'w', points: [{ x: 60, y: 76 }, { x: 60, y: 120 }], cross: '1,5', color: 'BU' };
    p.pages[0].elements = [S('k', 'coil', 60, '1K1'), w];
    p.settings = { ...p.settings!, showWireData: true };
    // Sulla lineetta obliqua (predefinito): il numero resta da solo
    const tick = () => derive(p).pages.get(p.pages[0].id)!.wireTicks?.get('w');
    expect(tick()).toBe('BU 1,5');
    w.show = { color: false };
    expect(tick()).toBe('1,5');
    delete w.show;
    p.settings = { ...p.settings!, wireDataTick: false };
    const label = () => derive(p).pages.get(p.pages[0].id)!.wireNumbers.get('w');
    expect(label()).toMatch(/^\S+ {2}1,5 mm² BU$/);
    w.show = { number: false, color: false };
    expect(label()).toBe('1,5 mm²');
    w.show = { number: false, cross: false, color: false };
    expect(label()).toBeUndefined();
  });
  it('fili corti senza numero, salvo scelta sul filo', () => {
    const p = emptyProject();
    const short: Wire = { kind: 'wire', id: 'w', points: [{ x: 60, y: 76 }, { x: 60, y: 82 }] };
    const long: Wire = { kind: 'wire', id: 'l', points: [{ x: 100, y: 76 }, { x: 100, y: 120 }] };
    p.pages[0].elements = [S('k', 'coil', 60, '1K1'), S('k2', 'coil', 100, '1K2'), short, long];
    const labels = () => { const m = derive(p).pages.get(p.pages[0].id)!.wireNumbers; return [m.has('w'), m.has('l')]; };
    expect(labels()).toEqual([true, true]);
    p.settings = { ...p.settings!, wireNoMinLength: 10 };
    expect(labels()).toEqual([false, true]);
    // Mostrato a mano sul filo
    short.show = { number: true };
    expect(labels()).toEqual([true, true]);
  });
});
