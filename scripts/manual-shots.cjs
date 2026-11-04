// Foto del manuale: apre l'app compilata (dist/) in una finestra fuori schermo, la porta negli
// stati descritti in manual-shots.list.cjs e salva le immagini in docs/manuale/img/<lingua>/.
//
//   npm run build && npx electron scripts/manual-shots.cjs [lingua] [nome-foto …]
//
// Il profilo dell'app è temporaneo: l'autosalvataggio e le librerie dell'utente non vengono toccati.
const { app, BrowserWindow, protocol, net } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const args = process.argv.slice(2).filter(a => !a.startsWith('-') && !a.endsWith('.cjs'));
const lang = args[0] && /^[a-z]{2}$/.test(args[0]) ? args.shift() : 'it';
const only = new Set(args);
const OUT = path.join(ROOT, 'docs', 'manuale', 'img', lang);

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'elettrocad-foto-')));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  protocol.handle('app', async req => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(DIST, rel));
    const res = await net.fetch(pathToFileURL(file).toString());
    if (file.endsWith('.mjs')) return new Response(res.body, { status: res.status, headers: { 'content-type': 'text/javascript' } });
    return res;
  });
  const win = new BrowserWindow({
    width: 1280, height: 820, show: false,
    webPreferences: { offscreen: { deviceScaleFactor: 2 }, preload: path.join(ROOT, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  await win.loadURL('app://elettrocad/index.html?shots=1');
  const js = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  for (let i = 0; i < 50 && !(await js('return !!window.__ecad')); i++) await sleep(100);
  await sleep(800);
  fs.mkdirSync(OUT, { recursive: true });
  const { prelude, init, shots } = require('./manual-shots.list.cjs');
  await js(`${prelude}\n${init}`);
  // Articoli di prova nella libreria (EDZ dei test: contattore e relè di sicurezza)
  const edz = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'esempio.edz')).toString('base64');
  await js(`${prelude}
    const r = await E.edz.importEdz(Uint8Array.from(atob('${edz}'), c => c.charCodeAt(0)), 'esempio.edz');
    if (r.symbols.length) st().addSymbolsToLibrary(r.symbols, '');
    st().addPartsToLibrary(r.parts, 'esempio.edz');`);
  await sleep(300);
  let n = 0;
  for (const s of shots) {
    if (only.size && !only.has(s.name)) continue;
    try {
      // Finestra più alta per i pannelli lunghi (proprietà del progetto)
      if (s.size) { win.setSize(s.size[0], s.size[1]); await sleep(400); }
      await js(`${prelude}\n${s.setup}`);
      await sleep(s.wait ?? 500);
      // Ritaglio: selettore CSS o rettangolo in pixel della finestra; senza, tutta la finestra
      let rect = s.rect;
      // Zona dello schema in mm: zoom e ritaglio esatto sulla zona
      if (s.area) {
        const [x, y, w, h] = s.area;
        await js(`window.dispatchEvent(new CustomEvent('elettrocad:zoom', { detail: { x: ${x}, y: ${y}, w: ${w}, h: ${h} } }));`);
        await sleep(300);
        rect = await js(`
          const svg = document.querySelector('svg.canvas'), m = svg.getScreenCTM(), b = svg.getBoundingClientRect();
          const p = (x, y) => { const q = svg.createSVGPoint(); q.x = x; q.y = y; return q.matrixTransform(m); };
          const a = p(${x}, ${y}), c = p(${x + w}, ${y + h});
          const x0 = Math.max(b.left, a.x), y0 = Math.max(b.top, a.y), x1 = Math.min(b.right, c.x), y1 = Math.min(b.bottom, c.y);
          return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };`);
      }
      // Più selettori: il rettangolo che li contiene tutti (es. titolo del menu e tendina)
      if (s.crop) rect = await js(`
        const rs = ${JSON.stringify([].concat(s.crop))}.map(q => document.querySelector(q)?.getBoundingClientRect()).filter(Boolean);
        if (!rs.length) return undefined;
        const p = ${s.pad ?? 0};
        const x0 = Math.max(0, Math.min(...rs.map(r => r.left)) - p), y0 = Math.max(0, Math.min(...rs.map(r => r.top)) - p);
        const x1 = Math.min(innerWidth, Math.max(...rs.map(r => r.right)) + p), y1 = Math.min(innerHeight, Math.max(...rs.map(r => r.bottom)) + p);
        return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };`);
      const img = await win.webContents.capturePage(rect);
      // Pannelli lunghi: divisi in più immagini alte al massimo "slice" punti (nome-1, nome-2…)
      const { width, height } = img.getSize();
      const k = rect ? width / rect.width : 2;
      if (s.slice && height > s.slice * k) {
        const h = Math.round(s.slice * k), parts = s.firstOnly ? 1 : Math.ceil(height / h);
        for (let i = 0; i < parts; i++) {
          const part = img.crop({ x: 0, y: i * h, width, height: Math.min(h, height - i * h) });
          fs.writeFileSync(path.join(OUT, `${s.name}${s.firstOnly ? '' : `-${i + 1}`}.png`), part.toPNG());
        }
      } else fs.writeFileSync(path.join(OUT, `${s.name}.png`), img.toPNG());
      await js(`${prelude}\n${s.cleanup ?? ''}\nreset();`);
      if (s.size) { win.setSize(1280, 820); await sleep(400); }
      n++;
      console.log('ok', s.name);
    } catch (e) {
      console.log('ERRORE', s.name, e.message);
    }
  }
  console.log(`${n} foto in ${path.relative(ROOT, OUT)}`);
  app.quit();
});
