// Rinomina di morsettiere e numeri dei morsetti dalla vista Morsettiere
import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/project';
import type { Project, SymbolInstance } from '../src/model/types';
import { addSpares, addJumper, renameTerminals, renameStrip, stripRows, syncStripPages, allStrips } from '../src/model/terminals';

const T = (tag: string, x: number): SymbolInstance =>
  ({ kind: 'symbol', id: `${tag}-${x}`, symbolId: 'terminal', x, y: 40, rot: 0, tag, pinLabels: {}, autoPins: true });
const tags = (p: Project) => p.pages.flatMap(pg => pg.elements.map(e => (e.kind === 'symbol' ? e.tag : '')));

describe('numeri dei morsetti', () => {
  it('riserve 10 e 11 diventano 10A e 10B', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:9', 40)];
    addSpares(p, 'X1', 2, '10', 'W.ZDK');
    expect(renameTerminals(p, 'X1', new Map([['10', '10A'], ['11', '10b']]))).toBe('');
    expect(stripRows(p, 'X1').map(r => `${r.no}${r.spare ? 'R' : ''}`)).toEqual(['9', '10AR', '10BR']);
    expect(p.terminalStrips!.X1.spareParts).toEqual({ '10A': 'W.ZDK', '10B': 'W.ZDK' });
  });
  it('15A e 15B diventano 18A e 18B: cambiano anche lo schema e i ponticelli', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:15A', 40), T('X1:15B', 48), T('X1:16', 56)];
    addJumper(p, 'X1', ['15A', '16'], 'fixed');
    expect(renameTerminals(p, 'X1', new Map([['15A', '18A'], ['15B', '18B']]))).toBe('');
    expect(tags(p)).toEqual(['X1:18A', 'X1:18B', 'X1:16']);
    expect(p.terminalStrips!.X1.jumpers[0].terminals).toEqual(['16', '18A']);
  });
  it('rifiuta numeri già usati o ripetuti, scambi permessi', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:1', 40), T('X1:2', 48)];
    expect(renameTerminals(p, 'X1', new Map([['1', '2']]))).not.toBe('');
    expect(renameTerminals(p, 'X1', new Map([['1', '5'], ['2', '5']]))).not.toBe('');
    expect(tags(p)).toEqual(['X1:1', 'X1:2']);
    expect(renameTerminals(p, 'X1', new Map([['1', '2'], ['2', '1']]))).toBe('');
    expect(tags(p)).toEqual(['X1:2', 'X1:1']);
  });
});

describe('nome della morsettiera', () => {
  it('cambia schema, pagine della morsettiera e layout', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:1', 40), T('X1:2', 48)];
    p.pages[0].layout = { items: [{ id: 'l', kind: 'strip', x: 0, y: 0, w: 10, h: 10, ref: 'X1' }] } as unknown as NonNullable<Project['pages'][number]['layout']>;
    syncStripPages(p);
    expect(renameStrip(p, 'X1', 'X5')).toEqual([]);
    expect(tags(p)).toEqual(['X5:1', 'X5:2']);
    expect(p.pages.filter(pg => pg.type === 'strip').map(pg => [pg.strip, pg.title])).toEqual([['X5', 'Morsettiera -X5']]);
    expect(p.pages[0].layout!.items[0].ref).toBe('X5');
  });
  it('si unisce a una morsettiera che esiste se i numeri non si sovrappongono', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:1', 40), T('X2:1', 48), T('X2:2', 56)];
    expect(renameStrip(p, 'X2', 'X1')).toEqual(['1']);
    expect(tags(p)).toEqual(['X1:1', 'X2:1', 'X2:2']);
    p.pages[0].elements = [T('X1:1', 40), T('X2:5', 48)];
    expect(renameStrip(p, 'X2', 'X1')).toEqual([]);
    expect(allStrips(p)).toEqual(['X1']);
  });
});
