// Processo principale Electron: finestra, menu e dialoghi file nativi.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol, net, safeStorage, utilityProcess } = require('electron');
const ai = require('./ai.cjs');
const symlib = require('./symlib.cjs');
const partsdb = require('./partsdb.cjs');
const edzbig = require('./edzbig.cjs');
const { migrateUserData } = require('./paths.cjs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const DEV = (process.env.OPENWIRING_DEV ?? process.env.ELETTROCAD_DEV) === '1';
const WIN = process.platform === 'win32';
const DIST = path.join(__dirname, '..', 'dist');
migrateUserData(app);

// Protocollo app:// per servire l'interfaccia compilata (fetch del .wasm di 7-Zip incluso)
// ecad-foto:// per le foto degli articoli, lette dal database solo quando si vedono
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'ecad-foto', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 950, title: 'OpenWiring',
    // Windows 11: barra del titolo integrata nella barra dei comandi, con i pulsanti di sistema
    // disegnati da Windows sopra (colori aggiornati dall'interfaccia con il tema, 'title-bar')
    ...(WIN ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f8f9fb', symbolColor: '#1b1f24', height: 32 }, backgroundColor: '#eef0f3' } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (DEV) win.loadURL('http://localhost:5179');
  else win.loadURL('app://elettrocad/index.html');
  const external = ({ url }) => { if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; };
  // Riquadri staccati (Simboli, Proprietà…): finestre vuote riempite dall'interfaccia, da portare
  // anche sul secondo monitor; i collegamenti si aprono nel browser
  win.webContents.setWindowOpenHandler(d => (d.url === 'about:blank' && d.frameName.startsWith('ecad-panel-')
    ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, minWidth: 200, minHeight: 120 } }
    : external(d)));
  win.webContents.on('did-create-window', child => {
    child.setMenu(null);
    child.webContents.setWindowOpenHandler(external);
  });
  // Chiudendo OpenWiring si chiudono anche le finestre dei riquadri
  win.on('closed', () => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.close(); });
  // Prima di chiudere l'interfaccia chiede, per ogni progetto non salvato, Salva / Cancella / Annulla;
  // se l'interfaccia è bloccata o non risponde la finestra si chiude lo stesso (resta il recupero)
  let stuck = false;
  win.webContents.on('unresponsive', () => { stuck = true; });
  win.webContents.on('responsive', () => { stuck = false; });
  win.webContents.on('render-process-gone', () => { stuck = true; });
  win.on('close', e => {
    if (closeConfirmed.has(win.webContents.id) || stuck || win.webContents.isCrashed?.()) return;
    e.preventDefault();
    win.webContents.send('close-request');
  });
}

// Chiusura confermata dall'interfaccia (tutti i progetti salvati o lasciati senza salvare)
const closeConfirmed = new Set();
let quitting = false;
app.on('before-quit', () => { quitting = true; });
ipcMain.on('close-confirmed', e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  closeConfirmed.add(e.sender.id);
  win.close();
  if (quitting) app.quit();
});
ipcMain.on('close-cancelled', () => { quitting = false; });

// File scelti dall'utente nei dialoghi: solo accanto a questi si cercano le macro EPLAN
const opened = new Set();

/**
 * Cartelle dei dialoghi, per tipo: progetti (.ecad), file da importare, file esportati. I dialoghi
 * ripartono dall'ultima cartella usata; senza, dalla cartella predefinita scelta nelle impostazioni,
 * altrimenti da Documenti. Salvate in folders.json nella cartella dei dati dell'app.
 */
const FOLDER_KINDS = ['projects', 'import', 'export'];
const foldersFile = () => path.join(app.getPath('userData'), 'folders.json');
let folders;
async function loadFolders() {
  if (folders) return folders;
  try { folders = JSON.parse(await fs.readFile(foldersFile(), 'utf8')); } catch { folders = {}; }
  folders.defaults ??= {}; folders.last ??= {};
  return folders;
}
const saveFolders = () => fs.writeFile(foldersFile(), JSON.stringify(folders, null, 1)).catch(() => {});
const kindOf = (filters, saving) => ((filters ?? []).some(f => (f.extensions ?? []).includes('ecad')) ? 'projects' : saving ? 'export' : 'import');
async function startFolder(kind) {
  const f = await loadFolders();
  return f.last[kind] || f.defaults[kind] || app.getPath('documents');
}
async function remember(kind, file) {
  const f = await loadFolders();
  f.last[kind] = path.dirname(file);
  await saveFolders();
}

// Colori dei pulsanti di sistema nella barra del titolo integrata (tema chiaro o scuro)
ipcMain.on('title-bar', (ev, c) => {
  const w = BrowserWindow.fromWebContents(ev.sender);
  if (!WIN || !w || typeof w.setTitleBarOverlay !== 'function' || !c) return;
  try { w.setTitleBarOverlay({ color: String(c.color), symbolColor: String(c.symbol), height: Number(c.height) || 32 }); } catch { /* finestra senza barra integrata */ }
});

ipcMain.handle('folders-get', async () => {
  const f = await loadFolders();
  return { defaults: { ...f.defaults }, last: { ...f.last }, documents: app.getPath('documents') };
});
// Cartella predefinita nuova: i dialoghi di quel tipo ripartono da lì
ipcMain.handle('folders-set', async (ev, kind, dir) => {
  if (!FOLDER_KINDS.includes(kind)) return false;
  const f = await loadFolders();
  if (dir) f.defaults[kind] = String(dir); else delete f.defaults[kind];
  delete f.last[kind];
  await saveFolders();
  return true;
});
ipcMain.handle('folders-choose', async (ev, kind) => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showOpenDialog(win, { defaultPath: await startFolder(kind), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});

ipcMain.handle('open-file', async (ev, filters, multi) => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const kind = kindOf(filters, false);
  const r = await dialog.showOpenDialog(win, { defaultPath: await startFolder(kind), filters, properties: multi ? ['openFile', 'multiSelections'] : ['openFile'] });
  if (r.canceled) return [];
  if (r.filePaths[0]) await remember(kind, r.filePaths[0]);
  r.filePaths.forEach(p => opened.add(p));
  // Gli archivi molto grandi (EDZ di un intero costruttore) non si leggono: si estraggono a parte (edzbig.cjs)
  return Promise.all(r.filePaths.map(async p => {
    const size = (await fs.stat(p)).size;
    if (edzbig.isArchive(p) && size > edzbig.BIG) return { name: path.basename(p), path: p, size, data: new Uint8Array(0), big: true };
    return { name: path.basename(p), path: p, data: new Uint8Array(await fs.readFile(p)) };
  }));
});
edzbig.register(ipcMain, utilityProcess, opened);

// Ricerca di un articolo nei progetti: i file .ecad di una cartella e delle sottocartelle (fino a 5
// livelli, al massimo 1000 file; le copie di sicurezza no)
ipcMain.handle('scan-projects', async (ev, dir) => {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) return [];
  const out = [];
  const walk = async (d, depth) => {
    if (depth > 5 || out.length >= 1000) return;
    let items;
    try { items = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (out.length >= 1000) return;
      if (it.name.startsWith('.') || it.name === 'node_modules' || it.name === 'Backup OpenWiring' || it.name === 'Backup ElettroCAD') continue;
      const p = path.join(d, it.name);
      if (it.isDirectory()) await walk(p, depth + 1);
      else if (/\.ecad$/i.test(it.name)) out.push(p);
    }
  };
  await walk(dir, 0);
  return out;
});

// Import dei simboli da una cartella: i file di simboli della cartella scelta e delle sottocartelle
// (fino a 15 livelli, al massimo 50000 file), con i percorsi relativi
ipcMain.handle('symbols-folder', async ev => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showOpenDialog(win, { defaultPath: await startFolder('import'), properties: ['openDirectory'] });
  const dir = r.filePaths[0];
  if (r.canceled || !dir) return null;
  await remember('import', path.join(dir, '-'));
  const files = [];
  const walk = async (sub, depth) => {
    if (depth > 15 || files.length >= 50000) return;
    let items;
    try { items = await fs.readdir(path.join(dir, sub), { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.name.startsWith('.') || files.length >= 50000) continue;
      const rel = sub ? `${sub}/${it.name}` : it.name;
      if (it.isDirectory()) await walk(rel, depth + 1);
      else if (/\.(elmt|qet|ecsym)$/i.test(it.name) || it.name === 'qet_directory') {
        try { files.push({ rel, text: await fs.readFile(path.join(dir, rel), 'utf8') }); } catch { /* file non leggibile */ }
      }
    }
  };
  await walk('', 0);
  return { name: path.basename(dir), files };
});

// Export DWG con il convertitore gratuito ODA File Converter (installato dall'utente): OpenWiring
// scrive i DXF in una cartella temporanea e il convertitore li trasforma in DWG
const ODA_PATHS = process.platform === 'win32' ? [] : process.platform === 'darwin'
  ? ['/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter']
  : ['/usr/bin/ODAFileConverter', '/usr/local/bin/ODAFileConverter'];
async function findOda() {
  for (const p of ODA_PATHS) { try { await fs.access(p); return p; } catch { /* non c'è */ } }
  if (process.platform === 'win32') {
    for (const base of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const dir = path.join(base, 'ODA');
      let items = [];
      try { items = await fs.readdir(dir); } catch { continue; }
      for (const it of items.filter(n => /^ODAFileConverter/i.test(n)).sort().reverse()) {
        const exe = path.join(dir, it, 'ODAFileConverter.exe');
        try { await fs.access(exe); return exe; } catch { /* non c'è */ }
      }
    }
  }
  return null;
}
ipcMain.handle('dwg-find', () => findOda());
ipcMain.handle('dwg-export', async (ev, conv, files, name, single) => {
  const exe = conv || await findOda();
  if (!exe || !/odafileconverter(\.exe)?$/i.test(path.basename(exe))) return { error: 'converter' };
  try { await fs.access(exe); } catch { return { error: 'converter' }; }
  const win = BrowserWindow.fromWebContents(ev.sender);
  let target;
  if (single) {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(await startFolder('export'), `${name}.dwg`), filters: [{ name: 'DWG', extensions: ['dwg'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    target = r.filePath;
  } else {
    const r = await dialog.showOpenDialog(win, { defaultPath: await startFolder('export'), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    target = path.join(r.filePaths[0], `${name}_DWG`);
    await fs.mkdir(target, { recursive: true });
  }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'elettrocad-dwg-'));
  const inDir = path.join(tmp, 'dxf'), outDir = path.join(tmp, 'dwg');
  await fs.mkdir(inDir); await fs.mkdir(outDir);
  try {
    for (const f of files) await fs.writeFile(path.join(inDir, path.basename(f.name)), f.data);
    await new Promise((resolve, reject) => {
      require('node:child_process').execFile(exe, [inDir, outDir, 'ACAD2018', 'DWG', '0', '1', '*.DXF'], { timeout: 180000, windowsHide: true }, err => (err ? reject(err) : resolve()));
    });
    const out = (await fs.readdir(outDir)).filter(n => /\.dwg$/i.test(n));
    if (!out.length) return { error: 'empty' };
    if (single) await fs.copyFile(path.join(outDir, out[0]), target);
    else for (const n of out) await fs.copyFile(path.join(outDir, n), path.join(target, n));
    return { path: target, count: out.length };
  } catch (e) {
    return { error: String(e && e.message || e) };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});

// Progetti recenti (schermata iniziale): si riapre un file .ecad dal percorso; null se non c'è più
ipcMain.handle('read-project', async (ev, p) => {
  if (typeof p !== 'string' || !/\.ecad$/i.test(p) || !path.isAbsolute(p)) return null;
  try { return { name: path.basename(p), path: p, data: new Uint8Array(await fs.readFile(p)) }; } catch { return null; }
});

/**
 * Macro EPLAN (.ema finestra, .ems simbolo) richiamata da un file di dati articolo aperto dall'utente:
 * "$(MD_MACROS)\Costruttore\x.ema" si cerca nella cartella macro del pacchetto estratto (…/items/macro/…),
 * nelle cartelle sopra il file, accanto al file e nelle cartelle vicine (es. xml_Artikel → ems_Makros).
 */
ipcMain.handle('read-macro', async (ev, from, ref) => {
  if (!opened.has(from) || typeof ref !== 'string') return null;
  const rel = ref.replace(/^\$\([^)]*\)[\\/]?/, '').split(/[\\/]+/).filter(Boolean);
  if (!rel.length || !/\.em[as]$/i.test(rel[rel.length - 1]) || rel.includes('..')) return null;
  const tries = [];
  let dir = path.dirname(from);
  for (let i = 0; i < 4; i++) {
    tries.push([dir, path.join(dir, 'macro', ...rel)], [dir, path.join(dir, ...rel)]);
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  tries.push([path.dirname(from), path.join(path.dirname(from), rel[rel.length - 1])]);
  // Cartelle accanto a quella del file, come nei pacchetti dei costruttori con XML e macro separati
  const parent = path.dirname(path.dirname(from));
  try {
    for (const e of await fs.readdir(parent, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.')) tries.push([parent, path.join(parent, e.name, rel[rel.length - 1])]);
    }
  } catch { /* cartella non leggibile */ }
  for (const [root, p] of tries) {
    if (!path.resolve(p).startsWith(path.resolve(root) + path.sep)) continue;
    try { return { name: path.basename(p), data: new Uint8Array(await fs.readFile(p)) }; } catch { /* prossimo */ }
  }
  return null;
});

/**
 * Copie di sicurezza di un progetto: prima di sovrascriverlo, il file com'era va nella cartella
 * «Backup OpenWiring» accanto, con data e ora nel nome; restano le ultime «keep» copie di quel file.
 */
async function backupProject(target, keep) {
  if (!(keep > 0) || !/\.ecad$/i.test(target)) return;
  try { await fs.access(target); } catch { return; }
  const dir = path.join(path.dirname(target), 'Backup OpenWiring');
  const base = path.basename(target, path.extname(target));
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(target, path.join(dir, `${base}_${stamp}.ecad`));
  const mine = (await fs.readdir(dir)).filter(f => f.startsWith(`${base}_`) && /_\d{8}-\d{6}\.ecad$/.test(f)).sort();
  for (const f of mine.slice(0, Math.max(0, mine.length - keep))) await fs.unlink(path.join(dir, f)).catch(() => {});
}

ipcMain.handle('save-file', async (ev, defaultName, data, filters, existing, backupKeep) => {
  let target = existing;
  if (!target) {
    const win = BrowserWindow.fromWebContents(ev.sender);
    const kind = kindOf(filters, true);
    const name = path.isAbsolute(defaultName) ? defaultName : path.join(await startFolder(kind), defaultName);
    const r = await dialog.showSaveDialog(win, { defaultPath: name, filters });
    if (r.canceled || !r.filePath) return undefined;
    target = r.filePath;
    await remember(kind, target);
  }
  await backupProject(target, backupKeep).catch(() => {});
  // Scrittura sicura: prima un file temporaneo, poi lo scambio (un arresto a metà non rovina il file)
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, Buffer.from(data));
  // Su Windows lo scambio può fallire se il file è aperto da un altro programma (antivirus, sincronizzazione)
  try { await fs.rename(tmp, target); } catch { await fs.writeFile(target, Buffer.from(data)); await fs.unlink(tmp).catch(() => {}); }
  return target;
});

// Schede tecniche degli articoli: si sceglie il file (solo il percorso, non si legge), si apre con
// il programma predefinito, e si legge per allegarla al PDF (solo file PDF)
ipcMain.handle('choose-paths', async (ev, filters) => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showOpenDialog(win, { defaultPath: await startFolder('import'), filters, properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return [];
  if (r.filePaths[0]) await remember('import', r.filePaths[0]);
  return r.filePaths;
});
ipcMain.handle('open-path', async (ev, target) => {
  if (/^https?:\/\//i.test(target)) { await shell.openExternal(target); return ''; }
  // Solo documenti: un percorso a un programma non viene eseguito
  if (!/\.(pdf|docx?|xlsx?|od[ts]|txt|rtf|png|jpe?g|dxf|dwg|stp|step|zip|html?)$/i.test(target)) return 'tipo di file non ammesso';
  return shell.openPath(target);
});
ipcMain.handle('read-doc', async (ev, file) => {
  if (!/\.pdf$/i.test(file)) throw new Error('solo file PDF');
  try { return new Uint8Array(await fs.readFile(file)); } catch { return undefined; }
});

// Cartella di file (es. pacchetto di rilascio «Rilascio_B»): si sceglie dove crearla, se esiste già
// si aggiunge un numero; restituisce il percorso della cartella creata
ipcMain.handle('save-folder', async (ev, folderName, files) => {
  const win = BrowserWindow.fromWebContents(ev.sender);
  const r = await dialog.showOpenDialog(win, { title: folderName, defaultPath: await startFolder('export'), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return undefined;
  const parent = r.filePaths[0];
  let dest = path.join(parent, folderName);
  for (let n = 2; await fs.stat(dest).then(() => true, () => false); n++) dest = path.join(parent, `${folderName} (${n})`);
  await fs.mkdir(dest, { recursive: true });
  for (const f of files) await fs.writeFile(path.join(dest, path.basename(f.name)), Buffer.from(f.data));
  await remember('export', path.join(parent, 'x'));
  return dest;
});

ai.register(ipcMain, net, safeStorage);
symlib.register(ipcMain, app, dialog, shell, BrowserWindow);

app.whenReady().then(() => {
  partsdb.register(ipcMain, app, dialog, shell, BrowserWindow, protocol);
  protocol.handle('app', async req => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    // I moduli .mjs (es. il worker di pdf.js) devono arrivare come JavaScript
    if (file.endsWith('.mjs')) return new Response(res.body, { status: res.status, headers: { 'content-type': 'text/javascript' } });
    return res;
  });
  // I menu dei comandi sono nella finestra (barra dei menu dell'app). Su macOS resta il menu
  // di sistema minimo (Esci, Modifica per copia/incolla nei campi, Finestra); su Windows e
  // Linux il menu predefinito di Electron si toglie per non avere due barre dei menu.
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]) : null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
