// Elenco delle foto del manuale (docs/manuale): per ognuna il codice che porta l'app nello stato
// giusto (eseguito nella pagina, con le funzioni di "prelude") e il ritaglio. Le zone dello schema
// sono in mm del foglio A3 (420 × 297). Il nome della foto è quello usato nei capitoli.
const { tutorialText } = require('./manual-tutorial.cjs');

const prelude = `
const E = window.__ecad, st = E.useStore.getState, A = E.actions;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const page = n => st().project.pages.find(p => p.name === String(n));
const go = n => st().setPage(page(n).id);
const zoom = (x, y, w, h) => window.dispatchEvent(new CustomEvent('elettrocad:zoom', { detail: { x, y, w, h } }));
const pageEls = () => st().project.pages.find(p => p.id === st().pageId).elements;
const select = (...tags) => st().setSelection(pageEls().filter(e => e.kind === 'symbol' && tags.includes(e.tag)).map(e => e.id));
const selectSym = (symbolId, tag) => st().setSelection(pageEls().filter(e => e.kind === 'symbol' && e.symbolId === symbolId && (!tag || e.tag === tag)).map(e => e.id).slice(0, 1));
const wireAt = (x, y) => pageEls().find(e => e.kind === 'wire' && e.points.some((p, i) => { const q = e.points[i + 1]; return q && Math.min(p.x, q.x) <= x && x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= y && y <= Math.max(p.y, q.y); }));
const btn = (scope, text) => [...document.querySelectorAll(scope)].find(b => b.textContent.trim().startsWith(text));
const click = (scope, text) => btn(scope, text)?.click();
const menu = async name => { btn('.menu-title', name).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await sleep(150); };
const example = () => st().loadProject(E.example.exampleProject());
const tutorial = text => { st().loadProject(E.store.emptyProject()); st().importText(text); st().setSelection([]); };
const treeOpen = label => { const row = [...document.querySelectorAll('.tree-row')].find(r => r.textContent.includes(label)); if (row && row.querySelector('.twisty')?.textContent === '▸') row.querySelector('.twisty').click(); };
// Numeri nei cerchietti per indicare le parti della finestra
const badge = (target, n, dx = 8, dy = 8) => {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'shot-badge';
  b.textContent = n;
  b.style.cssText = 'position:fixed;z-index:9999;width:26px;height:26px;border-radius:13px;background:#d1242f;color:#fff;font:700 15px/26px system-ui;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.4);left:' + (r.left + dx) + 'px;top:' + (r.top + dy) + 'px';
  document.body.appendChild(b);
};
// Solo il pannello delle proprietà, a tutta altezza (l'albero si nasconde)
const propsOnly = () => document.body.classList.add('shot-props');
const reset = () => {
  document.body.classList.remove('shot-props');
  document.body.classList.add('shot-nolog');
  document.querySelectorAll('.shot-badge').forEach(b => b.remove());
  document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  st().setDialog(null); st().setSelection([]); st().setHighlight(null); st().setTool({ kind: 'select' }); st().setView('schema');
  window.dispatchEvent(new Event('elettrocad:fit'));
};
`;

/** Eseguito una volta all'inizio: tema chiaro e foglio bianco, adatti alla stampa */
const init = `st().setTheme('light'); st().setSheet('white'); example();
  const css = document.createElement('style');
  css.textContent = 'body.shot-nolog .log, body.shot-nolog section.center > .panel-title { display: none !important }'
    + ' body.shot-props aside.left .tree, body.shot-props aside.left .tree-actions, body.shot-props aside.left > .panel-title:first-child { display: none !important }'
    + ' body.shot-props .props { overflow: visible !important; max-height: none !important; flex: none !important }';
  document.head.appendChild(css);
  document.body.classList.add('shot-nolog');`;

const CANVAS = 'svg.canvas';
const CENTER = 'section.center';
const PROPS = '.prop-table';
const MODAL = '.modal';
const T = n => JSON.stringify(tutorialText(n));

const shots = [
  // ---- 02 Interfaccia --------------------------------------------------------------------
  {
    name: 'interfaccia',
    setup: `document.body.classList.remove('shot-nolog'); go(1); await sleep(300);
      badge('.menubar', 1, 560, 4); badge('.toolbar', 2, 1100, 14); badge('.tree', 3, 230, 30);
      badge([...document.querySelectorAll('.left .panel-title')][1], 4, 90, 0); badge(${JSON.stringify(CANVAS)}, 5, 40, 40);
      badge('.right', 6, 150, 40); badge('.log', 7, 800, 4); badge('.statusbar', 8, 820, -2); badge('.tb-tabs', 9, -30, 0);`,
  },
  { name: 'menu-file', setup: `await menu('File');`, crop: ['.menu-title.open', '.menu-drop'], pad: 6 },
  { name: 'menu-progetto', setup: `await menu('Progetto');`, crop: ['.menu-title.open', '.menu-drop'], pad: 6 },
  { name: 'barra-strumenti', setup: ``, crop: '.toolbar' },
  { name: 'albero', setup: ``, crop: '.tree' },
  { name: 'libreria-simboli', setup: `['coil', 'mpcb3', 'lamp'].forEach(id => st().toggleFavorite(id)); await sleep(200);`, crop: 'aside.right', cleanup: `E.useStore.setState({ favorites: [] });` },
  { name: 'menu-contestuale', setup: `go(2); await sleep(200); select('2S2');
      const svg = document.querySelector('svg.canvas'); const r = svg.getBoundingClientRect();
      svg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, clientX: r.left + 300, clientY: r.top + 260 }));
      svg.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, clientX: r.left + 300, clientY: r.top + 260 }));`,
    crop: '.ctx-menu', pad: 6 },

  // ---- 03 Il primo progetto (tutorial) ---------------------------------------------------
  ...[1, 2, 3, 4].map(n => ({ name: `tutorial-${n}`, setup: `tutorial(${T(n)}); await sleep(300);`, area: [14, 14, 150, 230] })),
  { name: 'tutorial-proprieta', setup: `tutorial(${T(4)}); await sleep(200); propsOnly(); selectSym('coil');`, crop: PROPS },
  { name: 'tutorial-verifica', setup: `tutorial(${T(2)}); await sleep(200); A.openReport('checks');`, crop: CENTER },
  { name: 'tutorial-pagina', setup: `tutorial(${T(4)}); await sleep(300);`, area: [-2, -2, 424, 301], cleanup: `example();` },

  // ---- 04 Progetto e pagine --------------------------------------------------------------
  { name: 'proprieta-progetto', setup: `propsOnly(); A.showProjectProps(); await sleep(300);`, crop: PROPS, size: [1280, 2400], slice: 620 },
  { name: 'proprieta-pagina', setup: `propsOnly(); go(2);`, crop: PROPS, size: [1280, 1300], slice: 330, firstOnly: true },
  { name: 'menu-inserisci', setup: `await menu('Inserisci');`, crop: ['.menu-title.open', '.menu-drop'], pad: 6 },
  { name: 'copertina', setup: `st().addCoverPage(); await sleep(300);`, area: [-2, -2, 424, 301], cleanup: `example();` },
  { name: 'cartiglio', setup: `go(1); await sleep(200);`, area: [14, 248, 400, 50] },

  // ---- 05 Disegnare lo schema ------------------------------------------------------------
  { name: 'potenziali', setup: `go(1); await sleep(200);`, area: [16, 22, 110, 42] },
  { name: 'partenza-motore', setup: `go(1); await sleep(200);`, area: [62, 28, 110, 172] },
  { name: 'giunzioni', setup: `go(2); await sleep(200);`, area: [40, 60, 70, 60] },
  { name: 'rimandi', setup: `go(1); await sleep(200);`, area: [248, 138, 75, 36] },
  { name: 'filo-selezionato', setup: `go(2); await sleep(200); const w = wireAt(60, 120); if (w) st().setSelection([w.id]);`, area: [30, 60, 90, 110] },

  // ---- 06 Sigle, riferimenti incrociati, numeri filo -------------------------------------
  { name: 'contatti-bobina', setup: `go(2); await sleep(200);`, area: [20, 228, 70, 34] },
  { name: 'rimando-contatto', setup: `go(2); await sleep(200);`, area: [70, 62, 125, 42] },
  { name: 'proprieta-dispositivo', setup: `go(2); await sleep(200); propsOnly(); selectSym('coil', '2K1');`, crop: PROPS },
  { name: 'proprieta-filo', setup: `go(2); await sleep(200); const w = wireAt(60, 120); if (w) st().setSelection([w.id]); propsOnly();`, crop: PROPS },
  { name: 'numeri-filo', setup: `go(1); await sleep(200);`, area: [90, 90, 60, 60] },
  { name: 'potenziale-evidenziato', setup: `go(2); await sleep(200); const w = wireAt(60, 120); if (w) st().setHighlight(w.id); await sleep(200);` },

  // ---- 07 Dispositivi e articoli ---------------------------------------------------------
  { name: 'navigatore-dispositivi', setup: `st().setView('devices');`, crop: CENTER },
  { name: 'struttura', setup: `treeOpen('Struttura'); await sleep(200); treeOpen('Pagine'); const t = [...document.querySelectorAll('.tree-row')].find(r => r.textContent.includes('Struttura')); t?.scrollIntoView();`, crop: '.tree' },
  { name: 'articoli', setup: `st().setView('parts'); await sleep(300); document.querySelector('.parts-list tbody tr')?.click(); await sleep(200);`, crop: CENTER },

  // ---- 08 Morsettiere --------------------------------------------------------------------
  { name: 'morsettiere', setup: `st().setStripSel('X1'); st().setView('terminals');`, crop: CENTER },
  { name: 'morsetti-schema', setup: `go(1); await sleep(200);`, area: [88, 125, 50, 30] },
  { name: 'schema-morsettiera', setup: `st().syncStripPages(); await sleep(200); const p = st().project.pages.find(x => x.type === 'strip'); st().setPage(p.id); await sleep(300);`, area: [18, 8, 280, 100], cleanup: `example();` },

  // ---- 09 Cavi ---------------------------------------------------------------------------
  { name: 'cavo', setup: `go(1); await sleep(200);`, area: [70, 128, 80, 35] },
  { name: 'lista-cavi', setup: `A.openReport('Lista cavi');`, crop: CENTER },

  // ---- 10 PLC ----------------------------------------------------------------------------
  { name: 'vista-plc', setup: `st().setView('plc');`, crop: CENTER },
  { name: 'punti-io', setup: `go(3); await sleep(200);`, area: [38, 30, 150, 95] },
  { name: 'panoramica-plc', setup: `go(4); await sleep(300);`, area: [18, 8, 300, 200] },

  // ---- 11 Reti, luoghi, unifilare --------------------------------------------------------
  { name: 'schema-rete', setup: `go(5); await sleep(300);`, area: [20, 30, 390, 210] },
  { name: 'unifilare', setup: `go(6); await sleep(300);`, area: [90, 25, 200, 165] },

  // ---- 12 Layout del quadro --------------------------------------------------------------
  { name: 'layout', setup: `st().addLayoutPage(); await sleep(200); st().autoLayout(st().pageId); await sleep(400);`, crop: CENTER, cleanup: `example();` },

  // ---- 13 Macro, simboli, cartigli -------------------------------------------------------
  { name: 'editor-simboli', setup: `st().openSymbolEditor(E.symbols.BUILTIN_SYMBOLS.find(x => x.id === 'mpcb3')); await sleep(300);`, crop: CENTER },
  { name: 'editor-cartiglio', setup: `st().openTitleBlockEditor(E.titleBlocks.templateFor(st().project)); await sleep(300);`, crop: CENTER },

  // ---- 14 Liste e pagine automatiche -----------------------------------------------------
  { name: 'liste', setup: `A.openReport('Distinta materiali');`, crop: CENTER },
  { name: 'lista-acquisto', setup: `A.openReport("Lista d'acquisto");`, crop: CENTER },
  { name: 'pagine-automatiche', setup: `st().setDialog('reportPages');`, crop: MODAL, pad: 2 },
  { name: 'pagina-lista', setup: `st().updateSettings({ reportPages: ['Lista dispositivi'] }); st().syncReportPages(); await sleep(200); const p = st().project.pages.find(x => x.type === 'report'); st().setPage(p.id); await sleep(300);`, area: [18, 8, 300, 140], cleanup: `example();` },

  // ---- 15 Verifica, ricerca, revisioni ---------------------------------------------------
  { name: 'controlli', setup: `A.openReport('checks');`, crop: CENTER },
  { name: 'cerca', setup: `st().setDialog('search'); await sleep(200); const i = document.querySelector('.search-modal input'); if (i) { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(i, 'pompa'); i.dispatchEvent(new Event('input', { bubbles: true })); }`, crop: MODAL, pad: 2 },

  // ---- 16 Lingue -------------------------------------------------------------------------
  { name: 'traduzioni', setup: `A.openReport('translations');`, crop: CENTER },
  { name: 'schema-inglese', setup: `st().setLanguages({ display: 'en', second: 'it' }); go(2); await sleep(300);`, area: [20, 20, 200, 120], cleanup: `st().setLanguages({ display: 'it', second: undefined });` },

  // ---- 17 Assistente IA ------------------------------------------------------------------
  { name: 'assistente-ia', setup: `go(2); st().setDialog('ai'); await sleep(400);`, crop: '.ai-panel', pad: 2 },
  { name: 'profili-ia', setup: `st().setDialog('aiSettings'); await sleep(400);`, crop: MODAL, pad: 2 },
  { name: 'testo-ia', setup: `go(2); st().setDialog('text'); await sleep(200); click('.modal button', 'Esporta in testo'); await sleep(200);`, crop: MODAL, pad: 2 },

  // ---- 18 Import ed export ---------------------------------------------------------------
  { name: 'export-pdf', setup: `st().setDialog('pdf');`, crop: MODAL, pad: 2 },
  { name: 'stampa', setup: `st().setDialog('print');`, crop: MODAL, pad: 2 },
  { name: 'etichette', setup: `st().setDialog('labels');`, crop: MODAL, pad: 2 },
];

module.exports = { prelude, init, shots };
