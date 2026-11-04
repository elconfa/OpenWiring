import { describe, it, expect } from 'vitest';
import { symbolsFromFolder, isSymbolFile } from '../src/io/symbolImport';
import { symbolFileText } from '../src/io/symbolFolder';
import { symbolTree } from '../src/model/symbolTree';

const elmt = (uuid: string, name: string) => `<definition type="element" link_type="simple" width="20" height="40" hotspot_x="10" hotspot_y="20">
  <uuid uuid="{${uuid}}"/>
  <names><name lang="en">${name}</name></names>
  <description>
    <line x1="0" y1="-20" x2="0" y2="20"/>
    <terminal x="0" y="-20" orientation="n"/>
    <terminal x="0" y="20" orientation="s"/>
  </description>
</definition>`;

const dirXml = `<qet-directory><names><name lang="en">Coils</name><name lang="it">Bobine</name></names></qet-directory>`;

describe('import di una cartella di simboli', () => {
  it('le sottocartelle diventano i rami dell\'albero', () => {
    const ecsym = symbolFileText({ id: 'my-1', name: 'Mio', letter: 'K', role: 'single', category: 'x', prims: [], pins: [] });
    const r = symbolsFromFolder('Simboli', [
      { rel: 'Contatti/NA/a.elmt', text: elmt('00000000-0000-0000-0000-00000000000a', 'Contatto A') },
      { rel: 'Contatti/NC/b.elmt', text: elmt('00000000-0000-0000-0000-00000000000b', 'Contatto B') },
      { rel: '10_coils/qet_directory', text: dirXml },
      { rel: '10_coils/c.elmt', text: elmt('00000000-0000-0000-0000-00000000000c', 'Bobina') },
      { rel: 'radice.elmt', text: elmt('00000000-0000-0000-0000-00000000000d', 'In radice') },
      { rel: 'Miei/mio.ecsym', text: ecsym },
      { rel: 'Rotti/x.elmt', text: '<non xml' },
    ], 'it');
    const cat = Object.fromEntries(r.symbols.map(s => [s.name, s.category]));
    expect(cat['Contatto A']).toBe('Simboli / Contatti / NA');
    expect(cat['Contatto B']).toBe('Simboli / Contatti / NC');
    expect(cat['Bobina']).toBe('Simboli / Bobine');
    expect(cat['In radice']).toBe('Simboli');
    expect(cat['Mio']).toBe('Simboli / Miei');
    expect(r.errors).toEqual(['Rotti/x.elmt: nessun simbolo leggibile']);
    expect(r.folders).toBe(5);
    const tree = symbolTree(r.symbols);
    expect(tree.map(n => n.name)).toEqual(['Simboli']);
    expect(tree[0].children.map(n => n.name)).toEqual(['Bobine', 'Contatti', 'Miei']);
    expect(tree[0].children[1].children.map(n => n.name)).toEqual(['NA', 'NC']);
  });
  it('legge solo i file di simboli', () => {
    expect(isSymbolFile('a/b.elmt')).toBe(true);
    expect(isSymbolFile('a/qet_directory')).toBe(true);
    expect(isSymbolFile('a/b.dxf')).toBe(false);
  });
});
