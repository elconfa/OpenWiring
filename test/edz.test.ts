import { describe, it, expect } from 'vitest';
import SevenZip from '7z-wasm';
import { importEdz } from '../src/io/edz';
import { parsePartsXml, pickLanguage, exportPartsXml } from '../src/io/eplanXml';
import { blackBoxFromPart } from '../src/model/symbols';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<partsmanagement>
  <part P_ARTICLE_PARTNR="SIE.3RT2015-1BB41" P_ARTICLE_TYPENR="3RT2015-1BB41" P_ARTICLE_MANUFACTURER="SIE"
        P_ARTICLE_DESCR1="de_DE@Schütz;it_IT@Contattore 3 kW;en_US@Contactor;" P_ARTICLE_WIDTH="45,0"
        P_ARTICLE_PICTUREFILE="$(MD_IMG)\\SIE\\3RT2015.png">
    <variant>
      <functiontemplate pos="1" description="it_IT@Bobina;" connectiondesignation="A1¶A2"/>
      <functiontemplate pos="2" connectiondesignation="1¶2"/>
      <functiontemplate pos="3" connectiondesignation="3¶4"/>
      <functiontemplate pos="4" connectiondesignation="5¶6"/>
      <functiontemplate pos="5" connectiondesignation="13¶14"/>
    </variant>
  </part>
</partsmanagement>`;

async function makeEdz(): Promise<Uint8Array> {
  const sz = await SevenZip({ print: () => {}, printErr: () => {} });
  sz.FS.mkdir('/src'); sz.FS.mkdir('/src/items'); sz.FS.mkdir('/src/images');
  sz.FS.writeFile('/src/items/part.xml', XML);
  sz.FS.writeFile('/src/images/3RT2015.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  sz.FS.writeFile('/src/items/macro.ema', new Uint8Array([1, 2, 3]));
  sz.FS.chdir('/src');
  sz.callMain(['a', '-t7z', '/pkg.edz', 'items', 'images']);
  return sz.FS.readFile('/pkg.edz') as Uint8Array;
}

describe('EPLAN XML', () => {
  it('sceglie la lingua', () => {
    expect(pickLanguage('de_DE@Schütz;it_IT@Contattore;')).toBe('Contattore');
    expect(pickLanguage('testo semplice')).toBe('testo semplice');
  });
  it('legge articoli e modello funzione', () => {
    const { parts } = parsePartsXml(XML);
    expect(parts).toHaveLength(1);
    const p = parts[0];
    expect(p.descr1).toBe('Contattore 3 kW');
    expect(p.width).toBe(45);
    expect(p.functionTemplates.map(f => f.connections)).toEqual([['A1', 'A2'], ['1', '2'], ['3', '4'], ['5', '6'], ['13', '14']]);
    const bb = blackBoxFromPart(p);
    expect(bb.pins.map(x => x.label)).toEqual(['A1', '1', '3', '5', '13', 'A2', '2', '4', '6', '14']);
    expect(bb.letter).toBe('K');
  });
  it('round-trip export/import', () => {
    const { parts } = parsePartsXml(XML);
    const again = parsePartsXml(exportPartsXml(parts)).parts[0];
    expect(again.partNr).toBe(parts[0].partNr);
    expect(again.functionTemplates.length).toBe(5);
  });
  it('legge un XML articoli scritto a mano (relè di sicurezza DEMO)', async () => {
    const fs = await import('node:fs');
    const txt = fs.readFileSync(process.cwd() + '/test/fixtures/DEMO-SR3_articolo.xml', 'utf8');
    const { parts } = parsePartsXml(txt);
    expect(parts[0].partNr).toBe('DEMO.SR3-24');
  });
});

describe('EDZ', () => {
  it('estrae un archivio 7z e importa articolo e immagine', async () => {
    const r = await importEdz(await makeEdz(), 'test.edz');
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].picture?.startsWith('data:image/png;base64,')).toBe(true);
    expect(r.macros).toEqual(['items/macro.ema']);
  });
});

describe('EDZ con punti di connessione singoli (come i moduli di sicurezza Pizzato CS MP)', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><partsmanagement><part P_ARTICLE_PARTNR="PIZ.TEST" P_ARTICLE_TYPENR="CS TEST" P_ARTICLE_WIDTH="90" P_ARTICLE_HEIGHT="110.5"><variant>
    <functiontemplate functiondefcategory="301" pos="1"/>
    <functiontemplate connectiondescription="+24Vdc" connectionDesignation="A1" pos="2"/>
    <functiontemplate connectiondescription="0Vdc" connectionDesignation="A2" pos="3"/>
    ${Array.from({ length: 20 }, (_, i) => `<functiontemplate connectiondescription="DI" connectionDesignation="I${i + 11}" pos="${i + 4}"/>`).join('')}
    <functiontemplate connectiondescription="DOS (PNP)" connectionDesignation="OS1" pos="30"/>
    <functiontemplate connectiondescription="Test" connectionDesignation="T01" pos="31"/>
  </variant></part></partsmanagement>`;
  it('legge la descrizione del punto e mette 0 V e uscite in basso con passo 4 mm', () => {
    const p = parsePartsXml(xml, 'x.xml').parts[0];
    expect(p.functionTemplates[1]).toMatchObject({ description: '+24Vdc', connections: ['A1'] });
    expect([p.width, p.height]).toEqual([90, 110.5]);
    const bb = blackBoxFromPart(p);
    const down = bb.pins.filter(x => x.dir === 'down').map(x => x.label);
    expect(down).toEqual(['A2', 'OS1', 'T01']);
    expect(bb.pins.filter(x => x.dir === 'up')).toHaveLength(21);
    expect(bb.pins[1].x - bb.pins[0].x).toBe(4);
  });
});

describe('scatola nera: contatti NA e NC', () => {
  // Lama del contatto NA verso sinistra, del NC verso destra (vedi noContact/ncContact)
  const blades = (prims: ReturnType<typeof blackBoxFromPart>['prims'], x: number) => prims
    .filter(q => q.t === 'line' && q.x1 === x && q.x2 !== x && q.y2 < q.y1)
    .map(q => (q.t === 'line' && q.x2 < x ? 'NO' : 'NC'));
  it('i poli principali 1-2 … 7-8 di un contattore sono NA, anche senza tipo di funzione', () => {
    const fts = [['A1', 'A2'], ['1', '2'], ['3', '4'], ['5', '6'], ['7', '8']];
    for (const withCat of [true, false]) {
      const bb = blackBoxFromPart({ partNr: 'SE.A9C21134', attrs: {}, functionTemplates: fts.map((c, i) => ({ pos: i + 1, description: '', connections: c, category: withCat ? (i ? '201.1.3' : '200.1.6') : undefined })) });
      expect([8, 16, 24, 32].map(x => blades(bb.prims, x)).flat()).toEqual(['NO', 'NO', 'NO', 'NO']);
    }
  });
  it('gli ausiliari seguono la numerazione, il tipo di funzione EPLAN prevale', () => {
    const bb = blackBoxFromPart({ partNr: 'X', attrs: {}, functionTemplates: [
      { pos: 1, description: '', connections: ['13', '14'] }, { pos: 2, description: '', connections: ['21', '22'] }, { pos: 3, description: '', connections: ['5', '6'], category: '202.1.1' }] });
    expect([0, 8, 16].map(x => blades(bb.prims, x)).flat()).toEqual(['NO', 'NC', 'NC']);
  });
});
