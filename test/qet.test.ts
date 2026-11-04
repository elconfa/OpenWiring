import { describe, it, expect } from 'vitest';
import { parseQetXml, categoryFromPath } from '../src/io/qet';

// Elementi scritti per i test nel formato QElectroTech (non provengono dalla collezione ufficiale)
const COIL = `<definition type="element" link_type="master" width="40" height="60" hotspot_x="20" hotspot_y="30">
  <uuid uuid="{11111111-0000-0000-0000-000000000001}"/>
  <names><name lang="en">Test coil</name><name lang="it">Bobina di prova</name></names>
  <kindInformations><kindInformation name="type">coil</kindInformation></kindInformations>
  <description>
    <rect x="-10" y="-6" width="20" height="12" style="line-style:normal;filling:none"/>
    <line x1="0" y1="-20" x2="0" y2="-6"/>
    <line x1="0" y1="6" x2="0" y2="20"/>
    <dynamic_text x="15" y="-5" text_from="ElementInfo"><text></text><info_name>label</info_name></dynamic_text>
    <dynamic_text x="2" y="-18" text_from="UserText"><text>A1</text></dynamic_text>
    <terminal x="0" y="-20" orientation="n" name="A1"/>
    <terminal x="0" y="20" orientation="s" name="A2"/>
  </description>
</definition>`;

const NC = `<definition type="element" link_type="slave" width="20" height="60" hotspot_x="10" hotspot_y="30">
  <names><name lang="en">Test NC contact</name></names>
  <kindInformations><kindInformation name="type">simple</kindInformation><kindInformation name="state">NC</kindInformation></kindInformations>
  <description>
    <polygon x1="0" y1="-20" x2="0" y2="-10" x3="6" y3="-10" closed="false"/>
    <arc x="-5" y="-5" width="10" height="10" start="0" angle="90"/>
    <circle x="-2" y="-2" diameter="4" style="filling:black"/>
    <ellipse x="-4" y="10" width="8" height="4"/>
    <terminal x="0" y="-20" orientation="n"/>
    <terminal x="0" y="20" orientation="s"/>
  </description>
</definition>`;

describe('import componenti QElectroTech', () => {
  it('bobina: scala 10 px = 4 mm, morsetti, ruolo principale e nome italiano', () => {
    const [s] = parseQetXml(COIL, 'collection/310_relays/01_coils/test_coil.elmt');
    expect(s.name).toBe('Bobina di prova');
    expect(s.category).toBe('QET / coils');
    expect([s.role, s.letter]).toEqual(['main', 'K']);
    expect(s.pins.map(p => [p.label, p.x, p.y, p.dir])).toEqual([['A1', 0, -8, 'up'], ['A2', 0, 8, 'down']]);
    expect(s.prims[0]).toEqual({ t: 'rect', x: -4, y: -2.4, w: 8, h: 4.8, fill: false });
    // Il testo fisso "A1" non viene duplicato: il nome del morsetto lo scrive OpenWiring
    expect(s.prims.some(p => p.t === 'text')).toBe(false);
    expect(s.tagPos).toEqual({ x: 6, y: 0.5 });
    expect(s.id).toBe('qet:11111111-0000-0000-0000-000000000001');
  });
  it('contatto NC: ruolo secondario, numerazione 11/12, forme convertite', () => {
    const [s] = parseQetXml(NC, 'x/01_auxiliary_contacts/nc.elmt');
    expect([s.role, s.contact]).toEqual(['aux', 'NC']);
    expect(s.pins.map(p => p.label)).toEqual(['11', '12']);
    expect(s.prims.map(p => p.t)).toEqual(['poly', 'arc', 'circle', 'ellipse']);
    // Arco Qt 0°→90° antiorario = da -90° a 0° in senso orario a schermo
    expect(s.prims[1]).toMatchObject({ t: 'arc', a0: -90, a1: -0, r: 2 });
    expect(s.prims[2]).toMatchObject({ t: 'circle', fill: true, r: 0.8 });
  });
  it('elementi incorporati in un progetto .qet', () => {
    const qet = `<project><collection><category name="import"><category name="relays"><element name="c.elmt">${COIL}</element><element name="n.elmt">${NC}</element></category></category></collection></project>`;
    const syms = parseQetXml(qet, 'impianto.qet');
    expect(syms.map(s => s.category)).toEqual(['QET / relays', 'QET / relays']);
  });
  it('categoria dalla cartella', () => {
    expect(categoryFromPath('10_electric/130_terminals_terminal_strips/x.elmt')).toBe('QET / terminals terminal strips');
  });
  it('un simbolo importato usato in un progetto viene copiato nel progetto', async () => {
    const { useStore, emptyProject } = await import('../src/model/store');
    const st = useStore.getState;
    st().loadProject(emptyProject());
    const [coil] = parseQetXml(COIL, 'a/01_coils/c.elmt');
    st().addSymbolsToLibrary([coil], 'test');
    const inst = st().placeSymbol(coil.id, { x: 100, y: 100 }, 0)!;
    expect(inst.tag).toBe('1K1');
    expect(st().project.customSymbols.map(x => x.id)).toEqual([coil.id]);
    // Articolo con simbolo associato: si inserisce con quel simbolo
    st().addPartsToLibrary([{ partNr: 'R.1', functionTemplates: [], attrs: {}, symbolId: coil.id }], 'test');
    st().startPlacePart('R.1');
    expect(st().tool).toEqual({ kind: 'place', symbolId: coil.id, rot: 0, partNr: 'R.1' });
  });
});

describe('QElectroTech: protezioni e griglia', () => {
  const elmt = (name: string, link: string, type: string, terms: string) => `<definition type="element" width="60" height="60" hotspot_x="30" hotspot_y="30" link_type="${link}">
    <uuid uuid="{00000000-0000-0000-0000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}}"/>
    <names><name lang="it">${name}</name></names>
    <kindInformations><kindInformation name="type">${type}</kindInformation></kindInformations>
    <description><rect x="-10" y="-15" width="20" height="30"/>${terms}</description></definition>`;
  it('interruttori Q, relè termici F, bobine K', () => {
    const t = '<terminal x="0" y="-21" orientation="n"/><terminal x="0" y="21" orientation="s"/>';
    expect(parseQetXml(elmt('Int. Aut. Magneto-termico 1P', 'master', 'protection', t))[0].letter).toBe('Q');
    expect(parseQetXml(elmt('Relè termico', 'master', 'protection', t))[0].letter).toBe('F');
    expect(parseQetXml(elmt('Bobina', 'master', 'coil', t))[0].letter).toBe('K');
  });
  it('i morsetti fuori griglia vengono portati sulla griglia di 4 mm', () => {
    const s = parseQetXml(elmt('Relè termico', 'master', 'protection', '<terminal x="0" y="-21" orientation="n"/><terminal x="0" y="21" orientation="s"/><terminal x="10" y="-21" orientation="n"/>'))[0];
    for (const p of s.pins) { expect(Math.abs(p.x % 4)).toBe(0); expect(Math.abs(p.y % 4)).toBe(0); }
  });
});
