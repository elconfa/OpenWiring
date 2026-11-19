// Cartella delle schede tecniche degli articoli (Documenti/OpenWiring/Articoli/Documenti). I PDF che
// stanno qui si salvano nell'articolo con il percorso relativo alla cartella (es. "Siemens/S7-1200.pdf"),
// così il progetto e la libreria funzionano su ogni computer che ha la stessa cartella. I percorsi
// assoluti (file collegati da fuori) restano come sono.
const path = require('node:path');
const fs = require('node:fs/promises');
const { docsDir } = require('./paths.cjs');

const CONFIG_KEY = 'partDocsDir';
/** Sottocartelle per tipo di documento (come DOC_KINDS in src/model/partDocs.ts) */
const SUBFOLDERS = ['Data Sheet', 'Dichiarazioni/CE', 'Dichiarazioni/UL', 'Dichiarazioni/Altre', 'Manuali'];
const isWeb = p => /^https?:\/\//i.test(p);
/** Percorso assoluto su Mac, Linux o Windows (anche se il programma gira su un altro sistema) */
const isAbs = p => path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p);

function register(ipcMain, app, dialog, shell, BrowserWindow) {
  const configFile = () => path.join(app.getPath('userData'), 'config.json');
  const readConfig = async () => { try { return JSON.parse(await fs.readFile(configFile(), 'utf8')); } catch { return {}; } };
  let dir;
  const getDir = async () => {
    if (!dir) dir = (await readConfig())[CONFIG_KEY] || path.join(docsDir(app), 'Articoli', 'Documenti');
    await fs.mkdir(dir, { recursive: true });
    for (const sub of SUBFOLDERS) await fs.mkdir(path.join(dir, ...sub.split('/')), { recursive: true }).catch(() => {});
    return dir;
  };
  /** Percorso sul disco di un documento: i relativi dentro la cartella (mai fuori) */
  const resolve = async p => {
    if (typeof p !== 'string' || !p || isWeb(p) || isAbs(p)) return p;
    const root = path.resolve(await getDir());
    const full = path.resolve(root, ...p.split(/[\\/]+/));
    if (!full.startsWith(root + path.sep)) throw new Error(`percorso non valido: ${p}`);
    return full;
  };

  ipcMain.handle('partdocs-dir', () => getDir());
  ipcMain.handle('partdocs-open', async () => { await shell.openPath(await getDir()); });
  ipcMain.handle('partdocs-choose', async ev => {
    const win = BrowserWindow.fromWebContents(ev.sender);
    const r = await dialog.showOpenDialog(win, { defaultPath: await getDir(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    dir = r.filePaths[0];
    await fs.mkdir(path.dirname(configFile()), { recursive: true });
    await fs.writeFile(configFile(), JSON.stringify({ ...(await readConfig()), [CONFIG_KEY]: dir }, null, 1));
    return dir;
  });
  /**
   * Copia nella cartella (nella sottocartella del tipo, subs) i PDF scelti da fuori; restituisce per ognuno il percorso relativo. Un file
   * con lo stesso nome e lo stesso contenuto si riusa, con contenuto diverso prende un numero (_2, _3…).
   */
  ipcMain.handle('partdocs-copy', async (ev, files, subs) => {
    const root = await getDir();
    const out = [];
    for (const [i, src] of (files ?? []).entries()) {
      if (typeof src !== 'string' || !/\.pdf$/i.test(src)) { out.push(null); continue; }
      // Sottocartella del tipo (solo quelle note); se manca, la cartella Documenti
      const sub = SUBFOLDERS.includes(subs?.[i]) ? subs[i] : '';
      const data = await fs.readFile(src);
      const ext = path.extname(src), base = path.basename(src, ext);
      let rel = null;
      for (let k = 1; !rel; k++) {
        const name = `${sub ? `${sub}/` : ''}${k === 1 ? `${base}${ext}` : `${base}_${k}${ext}`}`;
        const dest = path.join(root, ...name.split('/'));
        let old;
        try { old = await fs.readFile(dest); } catch { await fs.writeFile(dest, data); rel = name; break; }
        if (old.equals(data)) rel = name;
      }
      out.push(rel);
    }
    return out;
  });

  return { resolve };
}

module.exports = { register, isAbs };
