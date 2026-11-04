// Testi sullo schema: testi del componente posizionabili e spostabili,
// testi dei morsetti, testi a capo nel riquadro
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import { derive } from '../src/model/derive';
import { textsUnderTag, type SymbolDef, type SymbolInstance } from '../src/model/types';
import { terminalTextLayout, terminalTextVertical } from '../src/model/terminalText';
import { textLines, textBounds } from '../src/model/textFlow';
import { pagesToText, importPagesText } from '../src/model/textFormat';

async function store() {
  const { useStore } = await import('../src/model/store');
  const st = useStore.getState;
  const p = emptyProject();
  p.settings.autoConnect = false;
  st().loadProject(p);
  return st;
}

describe('testi del componente', () => {
  it('i dati non posizionati vanno sotto la sigla solo se il simbolo non ha testi posizionati', () => {
    expect(textsUnderTag({})).toBe(true);
    expect(textsUnderTag({ fields: [{ f: 'description', x: 0, y: 0 }] })).toBe(false);
    // I testi PLC dei blocchetti I/O non contano
    expect(textsUnderTag({ fields: [{ f: 'plcAddress', x: 0, y: 0 }] })).toBe(true);
    expect(textsUnderTag({ fields: [{ f: 'description', x: 0, y: 0 }], textsUnderTag: true })).toBe(true);
  });
  it('con un testo posizionato gli altri dati non si scrivono sotto la sigla', async () => {
    const st = await store();
    const sym: SymbolDef = { id: 'user:prova', name: 'Prova', category: 'Prove', letter: 'B', role: 'single', prims: [], pins: [], tagPos: { x: -6, y: 4 }, fields: [{ f: 'techData', x: 4, y: 4 }] };
    st().project.customSymbols.push(sym);
    const a = st().placeSymbol('user:prova', { x: 40, y: 40 }, 0)!;
    st().updateDevice(a.id, { description: 'Fotocellula', techData: '24 V' });
    let d = derive(st().project).pages.get(st().pageId)!;
    expect(d.deviceLines.get(a.id)).toBeUndefined();
    expect(d.deviceFields.get(a.id)).toEqual({ techData: '24 V' });
    st().commit(p => { p.customSymbols[0].textsUnderTag = true; });
    d = derive(st().project).pages.get(st().pageId)!;
    expect(d.deviceLines.get(a.id)).toEqual(['Fotocellula']);
  });
  it('sigla e righe sotto la sigla si spostano a mano e tornano al loro posto', async () => {
    const st = await store();
    const a = st().placeSymbol('no', { x: 40, y: 40 }, 0)!;
    st().setTextOffset(a.id, 'tag', { x: -4, y: 2 });
    st().setTextOffset(a.id, 'lines', { x: 0, y: 6 });
    const e = () => st().project.pages[0].elements[0] as SymbolInstance;
    expect(e().textOffsets).toEqual({ tag: { x: -4, y: 2 }, lines: { x: 0, y: 6 } });
    st().setTextOffset(a.id, 'tag', undefined);
    expect(e().textOffsets).toEqual({ lines: { x: 0, y: 6 } });
    st().resetTextOffsets([a.id]);
    expect(e().textOffsets).toBeUndefined();
  });
});

describe('testi dei morsetti', () => {
  it('orizzontali, paralleli o perpendicolari al morsetto', () => {
    const v = { x: 40, y: 40, rot: 0 as const }, h = { x: 40, y: 40, rot: 90 as const };
    expect(terminalTextVertical(v, 'auto')).toBe(false);
    expect(terminalTextVertical(v, 'parallel')).toBe(true);
    expect(terminalTextVertical(h, 'parallel')).toBe(false);
    expect(terminalTextVertical(h, 'perpendicular')).toBe(true);
    // Morsetto verticale: numero a destra, morsettiera a sinistra
    const a = terminalTextLayout(v, 'auto');
    expect(a.num.x).toBeGreaterThan(40);
    expect(a.strip.x).toBeLessThan(40);
    const p = terminalTextLayout(v, 'parallel');
    expect(p.num.rot).toBe(-90);
    expect(p.num.x).toBeGreaterThan(40);
    expect(p.strip.x).toBeLessThan(40);
  });
  it('sigla della morsettiera mostrata o nascosta da sola', async () => {
    const st = await store();
    const t1 = st().placeSymbol('terminal', { x: 40, y: 40 }, 0, undefined, 'X1:1')!;
    const t2 = st().placeSymbol('terminal', { x: 60, y: 40 }, 0, undefined, 'X1:2')!;
    st().updateElement(t2.id, { show: { strip: true } });
    st().updateElement(t1.id, { show: { strip: false } });
    const d = derive(st().project).pages.get(st().pageId)!;
    expect(d.show?.get(t2.id)?.strip).toBe(true);
    expect(d.show?.get(t1.id)?.strip).toBe(false);
  });
});

describe('testo libero in un riquadro', () => {
  it('va a capo da solo a parole intere', () => {
    const t = { x: 10, y: 20, size: 2.5, text: 'Quadro elettrico di comando della linea di imballaggio', w: 30 };
    const l = textLines(t);
    expect(l.length).toBeGreaterThan(1);
    expect(l.join(' ')).toBe(t.text);
    expect(Math.max(...l.map(x => x.length))).toBeLessThanOrEqual(Math.floor(30 / (2.5 * 0.6)));
    expect(textBounds(t).x1).toBe(40);
    // Senza riquadro una riga sola
    expect(textLines({ ...t, w: undefined })).toEqual([t.text]);
  });
  it('la larghezza passa dal formato testo', () => {
    const p = emptyProject();
    p.pages[0].elements.push({ kind: 'text', id: 't1', x: 20, y: 30, text: 'Nota lunga', size: 3, w: 40 });
    const txt = pagesToText(p);
    expect(txt).toContain('l=40');
    const q = emptyProject();
    importPagesText(q, txt);
    expect(q.pages[0].elements.find(e => e.kind === 'text')).toMatchObject({ w: 40 });
  });
});
