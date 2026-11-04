import { describe, it, expect } from 'vitest';
import { emaToSymbols, pickLang } from '../src/io/ema';
import { importFromFiles } from '../src/io/edz';
import { blackBoxFromPart } from '../src/model/symbols';
import { parsePartsXml } from '../src/io/eplanXml';

// Macro EPLAN sintetica nello stesso formato delle macro dei costruttori (EplanPxfRoot):
// variante 0 completa (potenza + comando), variante 1 solo potenza, variante 2 di montaggio
const EMA = `<?xml version="1.0" encoding="utf-8" ?>
<EplanPxfRoot Name="TEST" Type="WindowMacro">
 <MacroVariant MacroFuncType="1" VariantId="0" ReferencePoint="40/252/0">
  <O4><P49 P1500="Allpolig"/>
   <O26>
    <O37 A685="40/252"><S40x1201 A762="20/256"><S39x761 A751="1" A752="0" A753="0" A754="1"/></S40x1201><S89x5 A411="308" A1651="0/-88" A1652="96/0"/></O37>
    <O89 A411="100" A1651="36/196" A1652="60/240"/>
    <O31 A411="100" A415="L" A531="40/248" A532="40/240"/>
    <O31 A411="100" A415="1" A531="44/220" A532="56/220"/>
    <O30 A501="96/196" A511="de_DE@HERSTELLER;??_??@COSTRUTTORE;"><S54x505 A961="3.5" A962="1.5707963267949" A965="16385"/></O30>
    <O5 A1="5/1"><S32x5 A553="0" A554="6.28318530717959" A555="4/-4" A556="1/0"/><S34x5 A621="0/0;2/2;4/0"/></O5>
    <O144 R9="5/1"><S40x1201 A762="44/230"><S39x761 A751="1" A752="0" A753="0" A754="1"/></S40x1201></O144>
    <O17 A185="1/L1"><S40x1201 A762="40/248"/></O17>
    <O17 A185="2/T1"><S40x1201 A762="40/176"/></O17>
    <O17 A185="A1"><S40x1201 A762="72/248"/></O17>
    <O17 A185="A2"><S40x1201 A762="72/176"/></O17>
   </O26>
  </O4>
 </MacroVariant>
 <MacroVariant MacroFuncType="1" VariantId="1" ReferencePoint="40/252/0">
  <O4><O26><O31 A531="40/248" A532="40/176"/><O31 A531="36/240" A532="44/240"/><O17 A185="1/L1"><S40x1201 A762="40/248"/></O17><O17 A185="2/T1"><S40x1201 A762="40/176"/></O17></O26></O4>
 </MacroVariant>
 <MacroVariant MacroFuncType="6" VariantId="0"><O4><O26><O31 A531="0/0" A532="10/0"/></O26></O4></MacroVariant>
</EplanPxfRoot>`;

describe('macro EPLAN (.ema) in XML', () => {
  it('sceglie la lingua dei testi', () => {
    expect(pickLang('de_DE@Start;it_IT@Avvio;')).toBe('Avvio');
    expect(pickLang('??_??@SIEMENS;')).toBe('SIEMENS');
  });
  it('trasforma le varianti schematiche in simboli con il disegno del costruttore', () => {
    const [full, power] = emaToSymbols(EMA, 'ema_test', 'TEST 1');
    expect(emaToSymbols(EMA, 'x', 'x')).toHaveLength(2); // la variante di montaggio (tipo 6) è esclusa
    // Origine nel primo punto in alto a sinistra, y verso il basso: ingressi in alto, uscite in basso
    expect(full.symbol.pins.map(p => `${p.label} ${p.x},${p.y} ${p.dir}`)).toEqual(['1/L1 0,0 up', '2/T1 0,72 down', 'A1 32,0 up', 'A2 32,72 down']);
    const prims = full.symbol.prims;
    expect(prims).toContainEqual({ t: 'line', x1: 0, y1: 0, x2: 0, y2: 8 });
    expect(prims).toContainEqual({ t: 'line', x1: 4, y1: 28, x2: 16, y2: 28, dash: true });
    expect(prims).toContainEqual({ t: 'rect', x: -4, y: 8, w: 24, h: 44 });
    // Cornice della scatola nera tratteggiata, blocco grafico interno spostato nella sua posizione
    expect(prims.some(p => p.t === 'poly' && p.closed && p.dash)).toBe(true);
    expect(prims).toContainEqual({ t: 'circle', cx: 8, cy: 22, r: 1 });
    expect(prims).toContainEqual({ t: 'poly', pts: [{ x: 4, y: 18 }, { x: 6, y: 16 }, { x: 8, y: 18 }] });
    expect(prims).toContainEqual({ t: 'text', x: 56, y: 52, s: 'COSTRUTTORE', size: 2.98, anchor: 'middle', rot: -90 });
    expect(power.symbol.id).toBe('ema_test~2');
    expect(power.pins).toEqual(['1/L1', '2/T1']);
  });
  it('import EDZ: l\'articolo usa la variante che copre più morsetti', () => {
    const part = `<?xml version="1.0" encoding="utf-8"?><partsmanagement><part P_ARTICLE_PARTNR="TST.1" P_ARTICLE_TYPENR="TEST 1" P_ARTICLE_CODELETTER="Q" P_ARTICLE_GROUPSYMBOLMACRO="$(MD_MACROS)\\Test\\test.ema"><variant>
      <functiontemplate connectionDesignation="1/L1" pos="1"/><functiontemplate connectionDesignation="2/T1" pos="2"/>
      <functiontemplate connectionDesignation="A1" pos="3"/><functiontemplate connectionDesignation="A2" pos="4"/></variant></part></partsmanagement>`;
    const enc = new TextEncoder();
    const r = importFromFiles([{ path: 'items/partxml/p.xml', data: enc.encode(part) }, { path: 'items/macro/Test/test.ema', data: enc.encode(EMA) }], 'test.edz');
    expect(r.parts[0].symbolId).toBe('ema_test');
    expect(r.symbols.map(s => `${s.id} ${s.letter}`)).toEqual(['ema_test Q', 'ema_test~2 Q']);
    expect(r.unreadMacros).toEqual([]);
  });
});

describe('scatola nera di ripiego', () => {
  const bb = (fts: string) => blackBoxFromPart(parsePartsXml(`<?xml version="1.0"?><partsmanagement><part P_ARTICLE_PARTNR="X.1" P_ARTICLE_TYPENR="X1"><variant>${fts}</variant></part></partsmanagement>`).parts[0]);
  it('ingressi in alto e uscite in basso dalla numerazione, uno sotto l\'altro', () => {
    const s = bb(['1/L1', '2/T1', '3/L2', '4/T2', 'A1', 'A2'].map((d, i) => `<functiontemplate connectionDesignation="${d}" functiondefcategory="1302" pos="${i + 1}"/>`).join('')
      + '<functiontemplate connectionDesignation="96&#10;95&#10;98" connectiondescription="&#10;Errore&#10;" functiondefcategory="203" pos="9"/>');
    const at = (l: string) => { const p = s.pins.find(x => x.label === l)!; return `${p.x} ${p.dir}`; };
    expect(['1/L1', '2/T1', '3/L2', '4/T2', 'A1', 'A2', '95', '96', '98'].map(at)).toEqual(['16 up', '16 down', '24 up', '24 down', '32 up', '32 down', '0 up', '0 down', '8 down']);
  });
  it('sezionatore a 3 poli: contatti disegnati con il collegamento meccanico', () => {
    const s = bb('<functiontemplate connectionDesignation="1&#10;2&#10;3&#10;4&#10;5&#10;6" connectiondescription="L1&#10;T1&#10;L2&#10;T2&#10;L3&#10;T3" functiondefcategory="600" pos="1"/>');
    expect(s.pins.map(p => `${p.label}${p.dir === 'up' ? '↑' : '↓'}${p.x}`)).toEqual(['1↑0', '3↑8', '5↑16', '2↓0', '4↓8', '6↓16']);
    expect(s.prims.filter(p => p.t === 'line' && p.dash)).toHaveLength(1);
  });
});

describe('macro scelte da sole', () => {
  it('senza dati articolo ogni macro (.ema o .ems) diventa un simbolo della libreria', () => {
    const enc = new TextEncoder();
    // Punto dell'apparecchio senza designazione: il nome viene dalla descrizione
    const ems = EMA.replace('<O17 A185="A2">', '<O17 A186="2.2" A1261="0" A1381="1302">').replace('Type="WindowMacro">', 'Type="WindowMacro"><ESymLib Name="SPECIAL" ID="0"/>');
    const r = importFromFiles([{ path: 'macro/ETA.REX-TEST.ems', data: enc.encode(ems) }], 'macro');
    expect(r.parts).toEqual([]);
    expect(r.symbols[0]).toMatchObject({ id: 'ema_eta_rex-test', name: 'ETA.REX-TEST', category: 'Macro EPLAN / ETA', letter: 'A' });
    expect(r.symbols[0].pins.map(p => p.label)).toEqual(expect.arrayContaining(['1/L1', '2.2']));
  });
});
