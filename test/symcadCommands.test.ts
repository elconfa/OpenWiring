// CAD dei simboli come AutoCAD: coordinate scritte, orto e polare, arco per tre punti, rotazione e
// specchio di un angolo qualsiasi; rotazioni ammesse; testi per rotazione; posizioni fisse
import { describe, it, expect } from 'vitest';
import { parsePoint, parseNumber, constrain, arcThrough, transformItems, cadAngle, CMD_ALIASES } from '../src/symcad/cad';
import { gripsOf, moveGrip, midGripsOf, insertVertex, removeVertex } from '../src/model/symbolEdit';
import { allowedRots, nextRot, fitRot } from '../src/model/rotations';
import { orientPlace, textPlace, autoTextPlace, placeableTexts, textOffset } from '../src/model/symbolTexts';
import { nextRail, plcSlot, railOf } from '../src/model/fixedPos';
import { terminalTextLayout } from '../src/model/terminalText';
import type { Page, Prim, SymbolDef } from '../src/model/types';

const sym = (prims: Prim[], extra: Partial<SymbolDef> = {}): SymbolDef => ({ id: 's', name: 's', category: '', letter: 'K', role: 'single', prims, pins: [], ...extra });

describe('riga di comando', () => {
  it('coordinate assolute, relative, polari e distanza diretta (y verso l\'alto come AutoCAD)', () => {
    expect(parsePoint('10,5')).toEqual({ x: 10, y: -5 });
    expect(parsePoint('@20,0', { x: 1, y: 1 })).toEqual({ x: 21, y: 1 });
    expect(parsePoint('@0,10', { x: 0, y: 0 })).toEqual({ x: 0, y: -10 });
    expect(parsePoint('@10<90', { x: 0, y: 0 })).toEqual({ x: 0, y: -10 });
    expect(parsePoint('@10<180', { x: 0, y: 0 })).toEqual({ x: -10, y: 0 });
    // Punto e virgola come separatore: la virgola è il decimale
    expect(parsePoint('2,5;7,5')).toEqual({ x: 2.5, y: -7.5 });
    // Distanza diretta verso il mouse
    expect(parsePoint('5', { x: 0, y: 0 }, { x: 0, y: 30 })).toEqual({ x: 0, y: 5 });
    expect(parsePoint('abc')).toBeUndefined();
    expect(parseNumber('2,5')).toBe(2.5);
    expect(CMD_ALIASES.l).toBe('line');
    expect(CMD_ALIASES.rec).toBe('rect');
    expect(CMD_ALIASES.specchia).toBe('mirror');
  });

  it('orto e puntamento polare', () => {
    expect(constrain({ x: 0, y: 0 }, { x: 10, y: 2 }, true, 0).p).toEqual({ x: 10, y: 0 });
    expect(constrain({ x: 0, y: 0 }, { x: 1, y: -9 }, true, 0).p).toEqual({ x: 0, y: -9 });
    // 43° → raggio a 45°
    const r = constrain({ x: 0, y: 0 }, { x: 10 * Math.cos(43 * Math.PI / 180), y: -10 * Math.sin(43 * Math.PI / 180) }, false, 45);
    expect(r.angle).toBe(45);
    expect(cadAngle({ x: 0, y: 0 }, r.p)).toBeCloseTo(45, 3);
    // 30° con passo 45: resta libero
    expect(constrain({ x: 0, y: 0 }, { x: 10, y: -5.77 }, false, 45).angle).toBeUndefined();
  });

  it('arco per tre punti', () => {
    const a = arcThrough({ x: -5, y: 0 }, { x: 0, y: -5 }, { x: 5, y: 0 })!;
    expect([a.cx, a.cy, a.r]).toEqual([0, 0, 5]);
    // Passa per il punto in alto (y = -5): angolo 270 nel sistema y verso il basso
    expect(a.a0).toBe(180);
    expect(a.a1).toBe(360);
    expect(arcThrough({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeUndefined();
  });

  it('rotazione e specchio di un angolo qualsiasi', () => {
    const s = sym([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'rect', x: 0, y: 0, w: 4, h: 2 }], { pins: [{ id: '1', x: 10, y: 0, dir: 'right', label: '1' }] });
    const items = [{ kind: 'prim' as const, i: 0 }, { kind: 'prim' as const, i: 1 }, { kind: 'pin' as const, i: 0 }];
    // 90° antiorari: la linea va verso l'alto, il punto di connessione guarda in alto
    const r = transformItems(s, items, { x: 0, y: 0 }, 90, false, 2);
    expect(r.prims[0]).toMatchObject({ x1: 0, y1: 0, x2: 0, y2: -10 });
    expect(r.prims[1].t).toBe('rect');
    expect(r.pins[0]).toMatchObject({ x: 0, y: -10, dir: 'up' });
    // 30°: il rettangolo diventa una polilinea chiusa
    const r30 = transformItems(s, items, { x: 0, y: 0 }, 30, false, 2);
    expect(r30.prims[1]).toMatchObject({ t: 'poly', closed: true });
    // Specchio sull'asse verticale per l'origine
    const m = transformItems(s, items, { x: 0, y: 0 }, 90, true, 2);
    expect(m.prims[0]).toMatchObject({ x2: -10, y2: 0 });
    expect(m.pins[0]).toMatchObject({ x: -10, dir: 'left' });
    // Arco: specchiato resta lo stesso semicerchio superiore
    const arc = sym([{ t: 'arc', cx: 0, cy: 0, r: 5, a0: 180, a1: 360 }]);
    const ma = transformItems(arc, [{ kind: 'prim', i: 0 }], { x: 0, y: 0 }, 90, true, 2).prims[0] as Extract<Prim, { t: 'arc' }>;
    expect([ma.a0 % 360, ma.a1 % 360]).toEqual([180, 0]);
  });

  it('maniglie: arco, cerchio, testo e vertici delle polilinee', () => {
    const arc: Prim = { t: 'arc', cx: 0, cy: 0, r: 5, a0: 180, a1: 360 };
    expect(gripsOf(arc)).toHaveLength(4);
    expect(moveGrip(arc, 2, { x: 0, y: -8 })).toMatchObject({ r: 8 });
    expect(moveGrip({ t: 'circle', cx: 0, cy: 0, r: 2 }, 1, { x: 3, y: 4 })).toMatchObject({ cx: 3, cy: 4, r: 2 });
    const pl: Extract<Prim, { t: 'poly' }> = { t: 'poly', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    expect(midGripsOf(pl)).toEqual([{ x: 5, y: 0 }, { x: 10, y: 5 }]);
    expect(insertVertex(pl, 0, { x: 5, y: -3 }).pts).toHaveLength(4);
    expect(removeVertex(pl, 1)!.pts).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(removeVertex({ ...pl, pts: pl.pts.slice(0, 2) }, 0)).toBeUndefined();
  });
});

describe('rotazioni ammesse e testi per rotazione', () => {
  it('R passa solo alle rotazioni ammesse', () => {
    expect(allowedRots(undefined)).toEqual([0, 90, 180, 270]);
    const s = { rotations: [0, 90] as (0 | 90 | 180 | 270)[] };
    expect(nextRot(s, 0)).toBe(90);
    expect(nextRot(s, 90)).toBe(0);
    expect(fitRot(s, 180)).toBe(0);
    expect(fitRot({ rotations: [90] }, 0)).toBe(90);
  });

  it('morsetto: posizione automatica come prima, posizione scelta per rotazione, specchio', () => {
    const term = sym([], { role: 'terminal', letter: 'X', pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '' }, { id: '2', x: 0, y: 8, dir: 'down', label: '' }] });
    expect(placeableTexts(term)).toEqual(['termStrip', 'termNum']);
    const inst = { x: 100, y: 50, rot: 90 as const, mirror: false };
    const auto = terminalTextLayout(inst, 'auto', 1.9);
    expect(autoTextPlace(inst, term, 'termNum')).toMatchObject({ x: auto.num.x, y: auto.num.y, anchor: auto.num.anchor });
    const own = { ...term, orientTexts: { 90: { termNum: { x: 3, y: 6, anchor: 'start' as const } } } };
    expect(textPlace(inst, own, 'termNum')).toEqual({ x: 103, y: 56, anchor: 'start' });
    // Le altre rotazioni restano automatiche
    expect(textPlace({ ...inst, rot: 0 }, own, 'termNum')).toEqual(autoTextPlace({ ...inst, rot: 0 }, own, 'termNum'));
    expect(orientPlace({ ...inst, mirror: true }, own, 'termNum')).toEqual({ x: 97, y: 56, anchor: 'end' });
  });

  it('testi bloccati nella posizione dell\'editor salvo impostazione del progetto', () => {
    const inst = { textOffsets: { tag: { x: 4, y: 2 }, contacts: { x: 0, y: 10 } } };
    expect(textOffset(inst, 'tag', undefined)).toEqual({ x: 0, y: 0 });
    expect(textOffset(inst, 'tag', true)).toEqual({ x: 4, y: 2 });
    // L'immagine dei contatti resta spostabile
    expect(textOffset(inst, 'contacts', false)).toEqual({ x: 0, y: 10 });
  });

  it('morsetto con posizione scelta nell\'editor: l\'orientamento segue «Testi dei morsetti» se non è scelto lì', () => {
    const term = sym([], { role: 'terminal', letter: 'X', pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: '' }, { id: '2', x: 0, y: 8, dir: 'down', label: '' }] });
    const inst = { x: 0, y: 0, rot: 0 as const, mirror: false };
    const own = { ...term, orientTexts: { 0: { termNum: { x: 3, y: 4, anchor: 'start' as const } } } };
    expect(textPlace(inst, own, 'termNum', { termDir: 'parallel' })).toMatchObject({ x: 3, y: 4, rot: -90 });
    expect(textPlace(inst, own, 'termNum', { termDir: 'auto' })!.rot).toBeUndefined();
    // Orizzontale scelto nell'editor: resta orizzontale
    const fixed = { ...term, orientTexts: { 0: { termNum: { x: 3, y: 4, anchor: 'start' as const, rot: 0 } } } };
    expect(textPlace(inst, fixed, 'termNum', { termDir: 'parallel' })!.rot).toBeFalsy();
  });

  it('le righe sotto la sigla seguono la sigla messa al suo posto', () => {
    const s = sym([], { tagPos: { x: -6, y: 4 }, orientTexts: { 0: { tag: { x: 5, y: -3, anchor: 'start' } } } });
    expect(textPlace({ x: 0, y: 0, rot: 0 }, s, 'lines')).toEqual({ x: 5, y: -3, anchor: 'start' });
  });
});

describe('posizioni fisse', () => {
  const page = (els: Page['elements'] = []): Page => ({ id: 'p', name: '1', type: 'multiline', elements: els } as Page);
  it('fili in alto e in basso, ognuno un passo dopo quelli già messi', () => {
    const s = { railTop: { y: 20, step: 4, x0: 24, x1: 404 } };
    expect(nextRail(page(), s, 'top')).toEqual([{ x: 24, y: 20 }, { x: 404, y: 20 }]);
    const w = (y: number) => ({ kind: 'wire' as const, id: `w${y}`, points: [{ x: 24, y }, { x: 404, y }] });
    expect(nextRail(page([w(20)]), s, 'top')![0].y).toBe(24);
    expect(nextRail(page([w(20), w(24)]), s, 'top')![0].y).toBe(28);
    // In basso con i successivi sopra
    // In basso di serie i successivi vanno sopra; scegliendo «sotto» vanno sotto
    expect(nextRail(page([w(236)]), {}, 'bottom')![0].y).toBe(232);
    expect(nextRail(page([w(236), w(232)]), {}, 'bottom')![0].y).toBe(228);
    expect(nextRail(page([w(236)]), { railBottom: { ...railOf({}, 'bottom'), up: false } }, 'bottom')![0].y).toBe(240);
  });
  it('punti I/O PLC sulla riga fissa', () => {
    expect(plcSlot({}, { x: 50, y: 70 })).toBeUndefined();
    const s = { plcRow: { y: 160, x0: 40, step: 16 } };
    expect(plcSlot(s, { x: 63, y: 20 })).toEqual({ x: 56, y: 160 });
    expect(plcSlot(s, { x: 0, y: 20 })).toEqual({ x: 40, y: 160 });
    // Le uscite stanno su un'altra riga, più in alto (di serie 60)
    expect(plcSlot(s, { x: 63, y: 20 }, 'DO')).toEqual({ x: 56, y: 60 });
    expect(plcSlot({ plcRow: { ...s.plcRow, yOut: 80 } }, { x: 63, y: 20 }, 'AO')).toEqual({ x: 56, y: 80 });
    expect(plcSlot(s, { x: 63, y: 20 }, 'DI')).toEqual({ x: 56, y: 160 });
  });
});
