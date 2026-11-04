// Simboli composti: un simbolo esistente inserito come sola grafica in un altro
import { describe, it, expect } from 'vitest';
import { BUILTIN_SYMBOLS } from '../src/model/symbols';
import { symbolAsGraphic, pasteClip, rotateClip, clipOrigin } from '../src/model/symbolEdit';
import type { SymbolDef } from '../src/model/types';

const empty: SymbolDef = { id: 'nuovo', name: 'Nuovo', category: 'Prova', letter: 'K', role: 'single', prims: [], pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '1' }] };

describe('simboli composti', () => {
  it('la grafica del simbolo entra spostata nel punto scelto, senza i suoi punti di connessione', () => {
    const coil = BUILTIN_SYMBOLS.find(s => s.id === 'coil')!;
    const clip = symbolAsGraphic(coil);
    expect(clip.pins).toEqual([]);
    expect(clipOrigin(clip)).toEqual({ x: 0, y: 0 });
    const r = pasteClip(empty, clip, 12, 8);
    expect(r.sym.pins).toEqual(empty.pins);
    expect(r.sym.prims).toHaveLength(coil.prims.length);
    expect(r.items.every(it => it.kind === 'prim')).toBe(true);
    const first = coil.prims[0], moved = r.sym.prims[0];
    if (first.t === 'line' && moved.t === 'line') expect([moved.x1, moved.y1]).toEqual([first.x1 + 12, first.y1 + 8]);
    // L'originale non cambia
    expect(coil.prims[0]).toEqual(BUILTIN_SYMBOLS.find(s => s.id === 'coil')!.prims[0]);
  });
  it('ruotando la grafica da inserire ruota anche la sua origine, che resta sulla griglia', () => {
    const clip = symbolAsGraphic(BUILTIN_SYMBOLS.find(s => s.id === 'no')!);
    const r = rotateClip(clip, 4);
    expect(r.pins).toEqual([]);
    expect(r.origin!.x % 4).toBe(0);
    expect(r.origin!.y % 4).toBe(0);
    expect(r.origin).not.toEqual(undefined);
  });
});
