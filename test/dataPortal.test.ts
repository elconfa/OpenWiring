// Pagina dell'articolo salvata dall'EPLAN Data Portal: simbolo dall'anteprima SVG della macro
import { describe, it, expect } from 'vitest';
import { importDataPortalPage, isDataPortalPage } from '../src/io/dataPortal';
import { importFromFiles } from '../src/io/edz';

// Struttura come nelle pagine reali: y verso l'alto con la matrice iniziale, un gruppo per punto
// di connessione ("=+-A1:L1") con cerchietto e tratto, cornice tratteggiata, riquadro della macro
// con l'intestazione, terra PE con la sola scritta nel suo gruppo
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60">
 <title>MAC_Schneider%20Electric%5CDRIVES%5CTEST.emav0r1</title>
 <g transform="matrix(1,0,0,-1,-56,230)">
  <defs><style type="text/css">
.P0{stroke: rgb(0,0,0); stroke-width: 0.25; stroke-dasharray: none; fill: none}
.P6{stroke: rgb(0,0,255); stroke-width: 0.25; stroke-dasharray: 2,2; fill: none}
text.F6{fill: rgb(0,0,0); font-size: 2.2356px; text-anchor: middle}
text.F9{fill: rgb(0,0,255); font-size: 3.105px; text-anchor: end}
text.F1{fill: rgb(0,0,255); font-size: 3.105px; text-anchor: start}
  </style></defs>
  <g>
   <text class="F1" transform="translate(56 227) scale(1, -1)">Intestazione della macro</text>
   <path class="P0" d="M 56 176 H 120 V 220 H 56 Z"></path>
  </g>
  <path class="P0" d="M 64 196 H 112"></path>
  <path class="P0" d="M 106 180 V 183 A 2 2 0 0 1 106 187"></path>
  <g><title>=+-A1:L1</title><desc>Symbol</desc><g>
   <text class="F6" transform="translate(72 200.6) scale(1, -1)">L1</text>
   <circle class="P0" cx="72" cy="204" r="1"></circle><path class="P0" d="M 72 205 V 208"></path></g></g>
  <g><title>=+-A1:L2</title><desc>Symbol</desc><g>
   <circle class="P0" cx="80" cy="204" r="1"></circle><path class="P0" d="M 80 205 V 208"></path></g></g>
  <g><title>=+-A1:U</title><desc>Symbol</desc><g>
   <circle class="P0" cx="72" cy="184" r="1"></circle><path class="P0" d="M 72 183 V 180"></path></g></g>
  <g><title>=+-A1:PE</title><desc>Symbol</desc><g><text class="F6" transform="translate(105.5 183) scale(1, -1)">PE</text></g></g>
  <g><title>=+-A1</title><desc>Symbol</desc><g>
   <text class="F9" transform="translate(62.5 204) scale(1, -1)">-A1</text>
   <path class="P6" d="M 64 180 H 112 V 208 H 64 Z"></path></g></g>
 </g>
</svg>`;
const PAGE = `<!doctype html><html><head><title>EPLAN Data Portal - SE.TEST1</title>
<link rel="stylesheet" href="styles.css"><script>alert(1)</script></head><body>
<div>Vista dettagliata</div><div>${SVG}</div>
<dl><dt>Numero articolo </dt><dd>SE.TEST1</dd><dt>Produttore </dt><dd>Schneider Electric</dd>
<dt>Numero tipo </dt><dd>Lexium32</dd><dt>Numero d'ordine </dt><dd>TEST1</dd>
<dt>Descrizione </dt><dd><span>IT_IT</span>Servoazionamento di prova &amp; 7 kW</dd></dl></body></html>`;

describe('pagina del Data Portal', () => {
  it('articolo dai campi e simbolo dall\'anteprima dello schema', () => {
    expect(isDataPortalPage(PAGE)).toBe(true);
    const r = importDataPortalPage(PAGE, 'pagina.html');
    expect(r.warnings).toEqual([]);
    expect(r.parts[0]).toMatchObject({ partNr: 'SE.TEST1', manufacturer: 'Schneider Electric', typeNr: 'Lexium32', orderNr: 'TEST1', descr1: 'Servoazionamento di prova & 7 kW', symbolId: 'dp_se_test1' });
    const s = r.symbols[0];
    expect(s).toMatchObject({ name: 'Lexium32 TEST1', category: 'Macro EPLAN / Schneider Electric' });
    // Punti all'estremo del tratto, origine sul primo in alto a sinistra, sulla griglia di 4 mm
    expect(s.pins.map(p => [p.label, p.x, p.y, p.dir])).toEqual([
      ['L1', 0, 0, 'up'], ['L2', 8, 0, 'up'], ['U', 0, 28, 'down'], ['PE', 34, 28, 'down'],
    ]);
    const texts = s.prims.filter(p => p.t === 'text').map(p => (p.t === 'text' ? p.s : ''));
    // Intestazione della macro, sigla "-A1" e designazioni dei punti li scrive OpenWiring
    expect(texts).toEqual([]);
    expect(s.tagPos).toEqual({ x: -9.5, y: 4 });
    // Cornice tratteggiata del dispositivo; l'arco diventa una polilinea
    expect(s.prims.some(p => p.t === 'poly' && p.dash && p.closed)).toBe(true);
    expect(s.prims.some(p => p.t === 'poly' && !p.closed && p.pts.length > 3)).toBe(true);
  });
  it('anche dentro uno zip, senza dati XML', () => {
    const r = importFromFiles([{ path: 'x/pagina.html', data: new TextEncoder().encode(PAGE) }], 'x.zip');
    expect(r.parts.map(p => p.partNr)).toEqual(['SE.TEST1']);
    expect(r.symbols).toHaveLength(1);
  });
});
