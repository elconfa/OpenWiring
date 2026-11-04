import { describe, it, expect } from 'vitest';
import { emptyProject } from '../src/model/store';
import type { SymbolInstance } from '../src/model/types';
import { uid } from '../src/model/geometry';
import { parseCaedex, parseCaedexCodes, planWmc, applyWmc, exportCaedex, parseIaxNames } from '../src/io/wmc';
import { stripRows, stripData } from '../src/model/terminals';

const T = (tag: string, x: number): SymbolInstance => ({ kind: 'symbol', id: uid('s'), symbolId: 'terminal', x, y: 100, rot: 0, tag, pinLabels: {}, autoPins: true });

// CAEdex come lo esporta WMC: guida, fermo con il nome, morsetti con le targhette, ponticello, piastre
let n = 0;
const ids: string[] = [];
const entry = (type: string, attrs: string, kids = '') => { const id = String(n++); ids.push(id); return { id, xml: `<Entry id="${id}" type="${type}">${attrs}${kids}</Entry>` }; };
const at = (k: string, v: string, tok?: string) => `<Attribute name="${k}" value="${v}"${tok ? ` tokenId="${tok}"` : ''} />`;
function caedex(): string {
  n = 0;
  const parts: string[] = [];
  const add = (e: { id: string; xml: string }) => { parts.push(e.xml); return e.id; };
  const mark = (t: string) => add(entry('Marker', at('.text', t, 'MP_01.01') + at('.code', '1112910000')));
  const bridge = add(entry('Bridge', at('.code', '1527570000') + at('.productType', 'Cross-connector')));
  const rail: string[] = [];
  const term = (code: string, type: string, texts: string[], b = false) => {
    const kids = texts.map((t, i) => `<ChildRef id="${mark(t)}" tokenId="MM_01.0${i + 1}" />`).join('') + (b ? `<ChildRef id="${bridge}" tokenId="EB_01.01" />` : '');
    const lv = texts.map((_, i) => at('DEFpattr520813107600', String(i + 1), `MM_01.0${i + 1}`)).join('') + (b ? at('DEFpattr520813107600', '1', 'EB_01.01') : '');
    rail.push(add(entry('Terminal', lv + at('.code', code) + at('.productType', type), kids)));
  };
  term('1991920000', 'End bracket', ['X1']);
  term('1521850000', 'Feed-through terminal', ['1'], true);
  term('1521850000', 'Feed-through terminal', ['2'], true);
  rail.push(add(entry('Separator', at('.code', '1514400000') + at('.productType', 'Partition plate'))));
  term('1521680000', 'PE terminal', ['3']);
  term('1521850000', 'Feed-through terminal', ['4']);
  rail.push(add(entry('Separator', at('.code', '1514400000') + at('.productType', 'End plate'))));
  term('1991920000', 'End bracket', ['X9']);
  term('1547610000', 'Double-tier terminal', ['1B', '1A'].reverse());
  term('1991920000', 'End bracket', []);
  const r = add(entry('Rail', at('.name', 'DP_Q1') + rail.map((id, i) => `<ChildRef id="${id}" tokenId="MA_01.01-FL01#${i}" />`).join('')));
  void r;
  return `<?xml version="1.0" encoding="utf-8"?><CAEdex projectName="P">${parts.join('')}</CAEdex>`;
}

describe('scambio con Weidmüller Configurator (CAEdex)', () => {
  it('legge guide, morsettiere, targhette, ponticelli e separatori', () => {
    const s = parseCaedex(caedex());
    expect(s.map(x => x.name)).toEqual(['X1', 'X9']);
    expect(s[0].terminals.map(t => t.nos.join('/'))).toEqual(['1', '2', '3', '4']);
    expect(s[0].terminals[1].sepAfter).toBe('1514400000');
    expect(s[0].terminals[0].bridges).toEqual([{ id: '0', level: 0 }]);
    expect(s[1].terminals[0].nos).toEqual(['1A', '1B']);
  });
  it('abbina ai morsetti del progetto e crea le morsettiere nuove come riserve', () => {
    const p = emptyProject();
    p.pages[0].elements = [T('X1:1', 40), T('X1:2', 48)];
    const plans = planWmc(p, parseCaedex(caedex()));
    expect(plans.map(x => [x.strip, x.status, x.added])).toEqual([['X1', 'match', 2], ['X9', 'new', 1]]);
    const r = applyWmc(p, plans, [], { '1521850000': 'A2C 2.5', '1527570000': 'ZQV 2.5N/3' });
    expect(r).toMatchObject({ strips: 1, created: 1, spares: 4, jumpers: 1 });
    const d = stripData(p, 'X1');
    expect(d.partNr).toBe('A2C 2.5');
    expect(d.jumpers.map(j => j.terminals)).toEqual([['1', '2']]);
    expect(d.jumperPartNr).toBe('ZQV 2.5N/3');
    expect(d.separators).toEqual(['2']);
    expect(d.endPlatePartNr).toBe('1514400000');
    expect(stripRows(p, 'X1').map(x => x.no + (x.spare ? 'r' : ''))).toEqual(['1', '2', '3r', '4r']);
    expect(d.spareParts).toEqual({ 3: '1521680000' });
    expect(stripRows(p, 'X9').map(x => x.no)).toEqual(['1A', '1B']);
    // Esportazione: si rilegge uguale
    const out = exportCaedex(p);
    expect(out.problems).toEqual([]);
    const back = parseCaedex(out.xml);
    expect(back.find(x => x.name === 'X1')!.terminals.map(t => t.nos.join('/'))).toEqual(['1', '2', '3', '4']);
    expect(back.find(x => x.name === 'X1')!.terminals[0].bridges.length).toBe(1);
  });
  it('codici degli accessori: imparati dal file, nessun pezzo senza codice Weidmüller', () => {
    const codes = parseCaedexCodes(caedex());
    expect(codes).toMatchObject({ endBracket: '1991920000', marker: { 1521850000: '1112910000' }, endPlate: { 1521850000: '1514400000' } });
    const p = emptyProject();
    p.pages[0].elements = [T('X1:1', 40), T('X1:2', 48)];
    applyWmc(p, planWmc(p, parseCaedex(caedex())));
    p.settings.wmcCodes = codes;
    // Un morsetto con un articolo non Weidmüller resta fuori, ed è segnalato
    p.parts.push({ partNr: '563930', functionTemplates: [], attrs: {} } as never);
    stripData(p, 'X1');
    p.pages[0].elements.push(T('X1:5', 80));
    (p.pages[0].elements[2] as SymbolInstance).partNr = '563930';
    const { xml, problems } = exportCaedex(p);
    expect(problems).toEqual(['-X1:5: articolo 563930 senza codice Weidmüller, non esportato']);
    expect(xml).not.toMatch(/name=".code" value=""/);
    expect(xml).toContain('tokenId="ME_01.01#');
    expect(xml).toContain('"Terminal marker"');
  });
  it('nomi degli articoli dai file iax', () => {
    expect(parseIaxNames('<Part id="1" articleNumber="1547610000"><Attribute name=".materialShortName" value="A2T 2.5" tokenId=""/></Part>')).toEqual({ 1547610000: 'A2T 2.5' });
  });
});
