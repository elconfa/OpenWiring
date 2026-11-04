// Cartella della libreria dei simboli: un file .ecsym per simbolo, sottocartelle = categorie.
// Il processo principale legge, scrive ed elimina i file e avvisa l'interfaccia quando la cartella
// cambia dall'esterno (Finder, Esplora risorse, copia da un'altra installazione).
const path = require('node:path');
const { docsDir } = require('./paths.cjs');
const fs = require('node:fs/promises');
const { watch } = require('node:fs');

const EXT = '.ecsym';

function register(ipcMain, app, dialog, shell, BrowserWindow) {
  const configFile = () => path.join(app.getPath('userData'), 'config.json');
  const readConfig = async () => { try { return JSON.parse(await fs.readFile(configFile(), 'utf8')); } catch { return {}; } };
  const defaultDir = () => path.join(docsDir(app), 'Simboli');
  let dir;
  let watcher;
  const getDir = async () => {
    if (!dir) dir = (await readConfig()).symbolDir || defaultDir();
    await fs.mkdir(dir, { recursive: true });
    return dir;
  };
  /** Percorso relativo dentro la cartella (mai fuori), con le barre "/" */
  const inside = (root, rel) => {
    const p = path.resolve(root, ...String(rel).split('/'));
    if (!p.startsWith(path.resolve(root) + path.sep) || !p.endsWith(EXT)) throw new Error(`percorso non valido: ${rel}`);
    return p;
  };
  const walk = async (root, sub = '') => {
    const out = [];
    let entries = [];
    try { entries = await fs.readdir(path.join(root, sub), { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...await walk(root, rel));
      else if (e.name.toLowerCase().endsWith(EXT)) out.push({ rel, text: await fs.readFile(path.join(root, rel), 'utf8') });
    }
    return out;
  };
  // Impronta della cartella (file, dimensioni, date): su Windows anche la sola lettura dei file
  // genera eventi, e senza questo controllo la cartella si ricaricherebbe di continuo sostituendo
  // i simboli appena creati nel programma
  const signature = async (root, sub = '') => {
    let entries = [];
    try { entries = await fs.readdir(path.join(root, sub), { withFileTypes: true }); } catch { return ''; }
    let out = '';
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) out += await signature(root, rel);
      else if (e.name.toLowerCase().endsWith(EXT)) {
        try { const st = await fs.stat(path.join(root, rel)); out += `${rel}|${st.size}|${st.mtimeMs}\n`; } catch { /* file appena tolto */ }
      }
    }
    return out;
  };
  let known = '';
  const startWatch = (root, sender) => {
    watcher?.close();
    let t;
    try {
      watcher = watch(root, { recursive: true }, () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const sig = await signature(root);
          if (sig === known || sender.isDestroyed()) return;
          known = sig;
          sender.send('symlib-changed');
        }, 400);
      });
    } catch { watcher = undefined; }
  };

  ipcMain.handle('symlib-read', async ev => {
    const root = await getDir();
    startWatch(root, ev.sender);
    known = await signature(root);
    return { dir: root, files: await walk(root) };
  });
  // File e cartelle arrivati in sola lettura (es. da uno zip fatto su Windows, dove l'attributo non
  // conta, estratto su Mac): il programma ne ridà la scrittura al proprietario e riprova
  const unlock = async (root, p) => {
    const base = path.resolve(root);
    try { const st = await fs.stat(p); if (!(st.mode & 0o200)) await fs.chmod(p, st.mode | 0o200); } catch { /* non ancora creato */ }
    for (let d = path.dirname(p); d === base || d.startsWith(base + path.sep); d = path.dirname(d)) {
      try { const st = await fs.stat(d); if (!(st.mode & 0o200)) await fs.chmod(d, st.mode | 0o700); } catch { /* non ancora creata */ }
      if (d === base) break;
    }
  };
  const retry = async (root, p, job) => {
    try { return await job(); } catch (e) {
      if (e?.code !== 'EACCES' && e?.code !== 'EPERM') throw e;
      await unlock(root, p);
      return job();
    }
  };
  ipcMain.handle('symlib-write', async (ev, files, removes) => {
    const root = await getDir();
    for (const f of files ?? []) {
      const p = inside(root, f.rel);
      await retry(root, p, async () => {
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, f.text, 'utf8');
      });
    }
    for (const rel of removes ?? []) {
      const p = inside(root, rel);
      await retry(root, p, () => fs.rm(p, { force: true }));
      // Le sottocartelle rimaste vuote si tolgono
      for (let d = path.dirname(p); d.startsWith(path.resolve(root) + path.sep); d = path.dirname(d)) {
        try { await fs.rmdir(d); } catch { break; }
      }
    }
    // Le modifiche fatte dal programma non si segnalano come modifiche esterne
    known = await signature(root);
    return true;
  });
  ipcMain.handle('symlib-open', async () => { await shell.openPath(await getDir()); });
  ipcMain.handle('symlib-choose', async ev => {
    const win = BrowserWindow.fromWebContents(ev.sender);
    const r = await dialog.showOpenDialog(win, { defaultPath: await getDir(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    dir = r.filePaths[0];
    await fs.mkdir(path.dirname(configFile()), { recursive: true });
    await fs.writeFile(configFile(), JSON.stringify({ ...(await readConfig()), symbolDir: dir }, null, 1));
    return dir;
  });
}

module.exports = { register };
