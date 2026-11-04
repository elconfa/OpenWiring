// Banco di prova EDZ: esito per articolo, simboli della libreria EPLAN richiamati, controlli del simbolo
import { describe, it, expect } from 'vitest';
import { benchPackage, emptyReport, finishReport, symbolChecks } from '../src/io/edzBench';
import { benchHtml } from '../src/io/benchHtml';
import { emaInfo } from '../src/io/ema';
import type { SymbolDef } from '../src/model/types';

const enc = new TextEncoder();
const part = (nr: string, macro?: string) =>
  `<part P_ARTICLE_PARTNR="${nr}" P_ARTICLE_DESCR1="it_IT@Articolo ${nr}&lt;/script&gt;;"${macro ? ` P_ARTICLE_GROUPSYMBOLMACRO="$(MD_MACROS)\\Test\\${macro}"` : ''}><variant>
   <functiontemplate connectionDesignation="1" pos="1"/><functiontemplate connectionDesignation="2" pos="2"/></variant></part>`;
// Interruttore disegnato con il simbolo n. 1525 della libreria IEC di EPLAN, non incluso nella macro
const LIB_EMA = `<?xml version="1.0" encoding="utf-8" ?>
<EplanPxfRoot Name="LIB" Type="WindowMacro">
 <ESymLib Name="SPECIAL" ID="0" /><ESymLib Name="IEC_symbol" ID="1" />
 <MacroVariant MacroFuncType="1" VariantId="0"><O4><O26>
  <O17 A1="17/1" A185="1;2" A186="L1;T1" A1261="1" A1262="1525" A1263="6"><S40x1201 A762="64/256"/></O17>
  <O17 A1="17/2" A1261="0" A1262="12"/>
 </O26></O4></MacroVariant>
 <MacroVariant MacroFuncType="4" VariantId="0"><O4/></MacroVariant>
</EplanPxfRoot>`;

describe('banco di prova EDZ', () => {
  it('riepilogo della macro: varianti per tipo e simboli di libreria', () => {
    const i = emaInfo(LIB_EMA);
    expect(i.variantTypes).toEqual({ 1: 1, 4: 1 });
    expect(i.libraryRefs).toEqual([
      { lib: 'IEC_symbol', num: '1525', variant: '6', pins: ['1', '2'], names: ['L1', 'T1'], category: '', multi: true },
      { lib: 'SPECIAL', num: '12', variant: '0', pins: [], names: [], category: '', multi: false },
    ]);
  });

  it('esito di ogni articolo e simboli di libreria da ridisegnare', () => {
    const xml = `<?xml version="1.0"?><partsmanagement>${part('T.LIB', 'lib.ema')}${part('T.ASSENTE', 'manca.ema')}${part('T.NESSUNA')}</partsmanagement>`;
    const r = emptyReport();
    benchPackage([{ path: 'items/partxml/p.xml', data: enc.encode(xml) }, { path: 'items/macro/Test/lib.ema', data: enc.encode(LIB_EMA) }], 'prova.edz', r);
    finishReport(r);
    expect(r.items.map(i => `${i.partNr} ${i.status}`)).toEqual(['T.LIB libreria', 'T.ASSENTE macro-assente', 'T.NESSUNA senza-macro']);
    expect(r.items[0].reason).toBe('IEC_symbol 1525 (funzione ?)');
    expect(r.counts).toMatchObject({ libreria: 1, 'macro-assente': 1, 'senza-macro': 1, ok: 0 });
    expect(r.libraryRefs.map(l => `${l.lib} ${l.num} ${l.refs}`)).toEqual(['IEC_symbol 1525 1', 'SPECIAL 12 1']);
    expect(r.variantTypes).toEqual({ 1: 1, 4: 1 });
    expect(r.packages).toEqual([{ name: 'prova.edz', files: 2, parts: 3, macros: 1, warnings: 0 }]);
    // La pagina porta i dati senza che un testo dell'articolo chiuda lo script
    const html = benchHtml(r);
    expect(html).toContain('IEC_symbol');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it('controlli del simbolo: fuori griglia, sovrapposti, non collegati al disegno', () => {
    const sym: SymbolDef = {
      id: 's', name: 's', category: '', letter: 'A', role: 'single',
      prims: [{ t: 'rect', x: 0, y: 4, w: 8, h: 8 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 4 }],
      pins: [{ id: '1', x: 0, y: 0, dir: 'up', label: 'A1' }, { id: '2', x: 8, y: 14, dir: 'down', label: 'A2' },
        { id: '3', x: 0, y: 0, dir: 'up', label: 'A3' }, { id: '4', x: 3, y: 12, dir: 'down', label: 'A4' }],
    };
    expect(symbolChecks(sym)).toEqual({ offGrid: ['A2', 'A4'], overlapping: ['A1=A3'], isolated: ['A2'], size: { w: 8, h: 14 } });
  });
});
