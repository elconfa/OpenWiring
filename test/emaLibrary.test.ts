// Simboli della libreria EPLAN ridisegnati dal tipo di funzione, punti di connessione sul bordo
// della cornice, morsetti senza macro
import { describe, it, expect } from 'vitest';
import { libKind, libraryDrawing, variantDir } from '../src/io/emaLibrary';
import { emaToSymbols, autoconnect } from '../src/io/ema';
import { terminalSymbol, importFromFiles } from '../src/io/edz';
import { benchPackage, emptyReport } from '../src/io/edzBench';
import type { Part } from '../src/model/types';

// Scatola nera 40×24 con due punti dell'apparecchio (variante A in alto, C in basso, 4 mm dentro la
// cornice) e un interruttore tripolare della libreria IEC (funzione 201: contatto NA)
const EMA = `<?xml version="1.0" encoding="utf-8" ?>
<EplanPxfRoot Name="T" Type="WindowMacro">
 <MacroVariant MacroFuncType="1" VariantId="0">
  <ESymLib Name="SPECIAL" ID="0"/><ESymLib Name="IEC_symbol" ID="1"/>
  <O4>
   <O17 A1="17/1" A1261="0" A1262="0" A1263="0"><S40x1201 A762="100/200"><S39x761 A751="1" A752="0" A753="0" A754="1"/></S40x1201>
    <S89x5 A411="305" A1651="0/-24" A1652="40/0"/></O17>
   <O17 A1="17/2" A185="L1" A1261="0" A1262="17" A1263="0" A1381="1302" A1382="1" A1383="1"><S40x1201 A762="108/196"/></O17>
   <O17 A1="17/3" A185="T1" A1261="0" A1262="17" A1263="2" A1381="1302" A1382="1" A1383="1"><S40x1201 A762="108/180"/></O17>
   <O17 A1="17/4" A185="1;2;3;4;5;6" A1261="1" A1262="1525" A1263="0" A1381="201" A1382="1" A1383="3"><S40x1201 A762="120/188"/></O17>
   <O17 A1="17/5" A185="5;6" A1261="1" A1262="9999" A1263="0" A1381="777" A1382="1" A1383="1"><S40x1201 A762="150/188"/></O17>
  </O4>
 </MacroVariant>
</EplanPxfRoot>`;

describe('simboli della libreria EPLAN ridisegnati', () => {
  it('tipo dal codice di funzione EPLAN e dalla numerazione', () => {
    expect(libKind('201.1.3')).toBe('NO');
    expect(libKind('202.1.0')).toBe('NC');
    expect(libKind('200.1.1')).toBe('coil');
    expect(libKind('600.1.1', ['21', '22'])).toBe('NC');
    expect(libKind('600.1.1', ['13', '14'])).toBe('NO');
    expect(libKind('100.6.1')).toBe('terminal');
    expect(libKind('1303.1.1')).toBeUndefined();
  });

  it('poli affiancati e varianti ruotate', () => {
    const a = libraryDrawing('201.1.3', ['1', '2', '3', '4'], 0)!;
    expect(a.pins).toEqual([
      { x: 0, y: -4, dir: 'up', label: '1' }, { x: 0, y: 4, dir: 'down', label: '2' },
      { x: 8, y: -4, dir: 'up', label: '3' }, { x: 8, y: 4, dir: 'down', label: '4' },
    ]);
    // Variante B: 90° in senso antiorario, il primo punto va a sinistra
    const b = libraryDrawing('200.1.1', ['A1', 'A2'], 1)!;
    expect(b.pins.map(p => `${p.label} ${p.x},${p.y} ${p.dir}`)).toEqual(['A1 -4,0 left', 'A2 4,0 right']);
    expect(variantDir('up', 2)).toBe('down');
    expect(variantDir('left', 4)).toBe('right');
  });

  it('macro: cornice, punti sul bordo, simbolo di libreria ridisegnato', () => {
    const [s] = emaToSymbols(EMA, 't', 'T');
    // Il simbolo di funzione sconosciuta (777) lascia la variante incompleta
    expect(s.librarySymbols).toBe(true);
    expect(s.redrawn).toEqual(['IEC_symbol 1525 (contatto NA)']);
    const pin = (l: string) => s.symbol.pins.filter(p => p.label === l).map(p => `${p.x},${p.y} ${p.dir}`);
    // L1 sul bordo superiore (y 200), T1 su quello inferiore (y 176); origine in L1
    expect(pin('L1')).toEqual(['0,0 up']);
    expect(pin('T1')).toEqual(['0,24 down']);
    // Poli del sezionatore attorno all'origine EPLAN (120/188): punti a ±4 mm, passo 8
    expect(pin('1')).toEqual(['12,8 up']);
    expect(pin('6')).toEqual(['28,16 down']);
    // Tratto dal bordo al punto EPLAN e cornice della scatola nera
    expect(s.symbol.prims).toContainEqual({ t: 'line', x1: 0, y1: 4, x2: 0, y2: 0 });
    expect(s.symbol.prims).toContainEqual({ t: 'rect', x: -8, y: 0, w: 40, h: 24 });
  });
});

describe('collegamento automatico tra punti allineati', () => {
  it('unisce il punto rivolto in basso al più vicino sotto, rivolto in alto o senza direzione', () => {
    const lines: string[] = [];
    const n = autoconnect([
      { p: { x: 0, y: 40 }, dir: 'down' },
      { p: { x: 0, y: 20 }, dir: 'up' },
      { p: { x: 0, y: 10 }, dir: 'up' },
      { p: { x: 8, y: 40 }, dir: 'down' },
      { p: { x: 8, y: 16 } },
      // Già collegato dal costruttore, oppure punto dell'apparecchio sulla cornice: resta com'è
      { p: { x: 16, y: 40 }, dir: 'down' }, { p: { x: 16, y: 20 }, dir: 'up' },
      { p: { x: 24, y: 40 }, dir: 'down', frame: true }, { p: { x: 24, y: 20 }, dir: 'up' },
      // Rivolto dall'altra parte: non si collega
      { p: { x: 32, y: 40 }, dir: 'down' }, { p: { x: 32, y: 20 }, dir: 'down' },
    ], [{ a: { x: 16, y: 40 }, b: { x: 16, y: 44 } }], (a, b) => lines.push(`${a.x},${a.y}-${b.x},${b.y}`));
    expect(n).toBe(2);
    expect(lines).toEqual(['0,40-0,20', '8,40-8,16']);
  });
});

describe('morsetti senza macro', () => {
  const part = (cat: string, tf?: number): Part => ({ partNr: 'X', attrs: {}, functionTemplates: [{ pos: 1, description: '', connections: ['1', '2'], category: cat, ...(tf ? { terminalFunction: tf } : {}) }] });
  it('simbolo di morsetto dal tipo di funzione', () => {
    expect(terminalSymbol(part('100.6.1'))).toBe('terminal');
    expect(terminalSymbol(part('100.9.3'))).toBe('terminal_pe');
    expect(terminalSymbol(part('100.6.1', 1))).toBe('terminal_disc');
    expect(terminalSymbol(part('100.6.1', 4))).toBe('terminal_fuse');
    expect(terminalSymbol(part('201.1.1'))).toBeUndefined();
    expect(terminalSymbol({ partNr: 'Y', functionTemplates: [], attrs: { P_ARTICLE_PRODUCTTOPGROUP: '1', P_ARTICLE_PRODUCTGROUP: '3', P_ARTICLE_PRODUCTSUBGROUP: '4' } })).toBe('terminal');
  });

  it('import e banco: morsetto e accessorio', () => {
    const xml = `<?xml version="1.0"?><partsmanagement>
      <part P_ARTICLE_PARTNR="W.1" P_ARTICLE_DESCR1="Morsetto"><variant><functiontemplate connectionDesignation="1&#10;2" functiondefcategory="100" functiondefgroup="6" functiondefid="1" terminalfunction="4" pos="1"/></variant></part>
      <part P_ARTICLE_PARTNR="W.2" P_ARTICLE_DESCR1="Segnafili"><variant/></part>
    </partsmanagement>`;
    const files = [{ path: 'items/partxml/p.xml', data: new TextEncoder().encode(xml) }];
    const r = importFromFiles(files, 'w.edz');
    expect(r.parts.map(p => p.symbolId)).toEqual(['terminal_fuse', undefined]);
    const rep = emptyReport();
    benchPackage(files, 'w.edz', rep);
    expect(rep.items.map(i => i.status)).toEqual(['morsetto', 'accessorio']);
  });
});
