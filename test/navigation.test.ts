import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { SymbolInstance, Wire, Pt } from '../src/model/types';
import { readableText, uid } from '../src/model/geometry';
import { structureTree } from '../src/model/structure';
import { computeNetlist, potentialOf } from '../src/model/netlist';
import { printDocument } from '../src/io/print';
import { DEFAULT_PDF_OPTIONS } from '../src/io/pdfOptions';

const S = (symbolId: string, x: number, y: number, tag: string, extra: Partial<SymbolInstance> = {}): SymbolInstance =>
  ({ kind: 'symbol', id: uid('s'), symbolId, x, y, rot: 0, tag, pinLabels: {}, autoPins: true, ...extra });
const W = (...pts: [number, number][]): Wire => ({ kind: 'wire', id: uid('w'), points: pts.map(([x, y]): Pt => ({ x, y })) });
const inst = (rot: SymbolInstance['rot'], mirror = false) => ({ x: 100, y: 100, rot, mirror });
const txt = { t: 'text' as const, x: 4, y: 0, s: 'M', size: 2.5, anchor: 'start' as const };

describe('testi dei simboli sempre leggibili', () => {
  it('senza rotazione il testo resta com\'è', () => {
    expect(readableText(inst(0), txt)).toEqual({ x: 104, y: 100, rot: 0, anchor: 'start' });
  });
  it('a 180° non è capovolto: stessa zona, allineamento invertito', () => {
    const r = readableText(inst(180), txt);
    expect(r.rot).toBe(0);
    expect(r.anchor).toBe('end');
    expect(r.x).toBeCloseTo(96);
    // Il corpo del testo stava sotto il punto: la linea di base scende
    expect(r.y).toBeGreaterThan(100);
  });
  it('a 90° si legge dal basso verso l\'alto (-90°)', () => {
    expect(readableText(inst(90), txt).rot).toBe(-90);
    expect(readableText(inst(270), txt).rot).toBe(-90);
  });
  it('specchiato non è scritto al contrario', () => {
    const r = readableText(inst(0, true), txt);
    expect(r.rot).toBe(0);
    expect(r.anchor).toBe('end');
    expect(r.x).toBe(96);
    expect(r.y).toBe(100);
  });
});

describe('struttura =Impianto +Luogo', () => {
  it('raggruppa per funzione e luogo, senza codice in fondo', () => {
    const p = emptyProject();
    p.pages[0].elements = [
      S('coil', 40, 100, '1K1', { func: 'A1', loc: 'Q1' }), S('coil', 80, 100, '1K2', { func: 'A1', loc: 'P1' }),
      S('coil', 120, 100, '1K3'), S('no', 160, 60, '1K1'), S('terminal', 200, 100, 'X1:1'),
    ];
    const t = structureTree(p);
    expect(t.map(f => f.func)).toEqual(['A1', '']);
    expect(t[0].locs.map(l => [l.loc, l.devices.map(d => d.tag)])).toEqual([['P1', ['1K2']], ['Q1', ['1K1']]]);
    // Le morsettiere non sono nella struttura
    expect(t[1].locs[0].devices.map(d => d.tag)).toEqual(['1K3']);
  });
});

describe('potenziale evidenziato', () => {
  it('segue il conduttore oltre il morsetto e trova le pagine', () => {
    const p = emptyProject();
    p.pages.push({ ...structuredClone(p.pages[0]), id: 'pg2', name: '2', elements: [] });
    const a = W([40, 60], [80, 60]), b = W([80, 68], [80, 100]);
    p.pages[0].elements = [S('terminal', 80, 60, 'X1:1'), a, b, S('link', 40, 60, 'L+', { rot: 90 })];
    const c = W([40, 60], [100, 60]);
    p.pages[1].elements = [S('link_in', 40, 60, 'L+', { rot: 270 }), c];
    const nl = computeNetlist(p);
    const pot = potentialOf(p, nl, b.id)!;
    expect(pot.wireIds.has(a.id)).toBe(true);
    expect(pot.wireIds.has(b.id)).toBe(true);
    expect(pot.wireIds.has(c.id)).toBe(true);
    expect(pot.pageIds).toEqual([p.pages[0].id, "pg2"]);
  });
});

describe('stampa', () => {
  it('una pagina A3 per foglio', () => {
    const p = emptyProject();
    p.pages.push({ ...structuredClone(p.pages[0]), id: 'pg2', name: '2' });
    const { html, pages } = printDocument(p, [], { ...DEFAULT_PDF_OPTIONS, pages: 'all' });
    expect(pages).toBe(2);
    expect(html).toContain('size: A3 landscape');
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
  });
});

describe('modifica in blocco e rinomina', () => {
  it('aggiorna più dispositivi in un passo e rinomina con i contatti', async () => {
    const { useStore } = await import('../src/model/store');
    const st = useStore.getState;
    const p = emptyProject();
    const k1 = S('coil', 40, 100, '1K1'), k2 = S('coil', 80, 100, '1K2'), c = S('no', 120, 60, '1K1');
    p.pages[0].elements = [k1, k2, c];
    st().loadProject(p);
    st().updateDevices([{ instId: k1.id, patch: { description: 'Pompa' } }, { instId: k2.id, patch: { description: 'Pompa' } }]);
    expect(st().past.length).toBe(1);
    const els = () => st().project.pages[0].elements as SymbolInstance[];
    expect(els().filter(e => e.description === 'Pompa')).toHaveLength(2);
    expect(st().renameDevice('1K1', '1K2')).toBe(false);
    expect(st().renameDevice('1K1', '-5K1')).toBe(true);
    expect(els().map(e => e.tag)).toEqual(['5K1', '1K2', '5K1']);
  });
});
