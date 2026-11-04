// EDZ grandi (centinaia di MB o più): non si leggono in memoria. Il processo edz-worker.cjs estrae
// in una cartella temporanea solo i file utili; l'interfaccia poi li legge a gruppi (edz-read) e alla
// fine la cartella si cancella (edz-close).
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

/** Da questa dimensione gli archivi scelti nel dialogo non si leggono in memoria */
const BIG = 150 * 1024 * 1024;
const isArchive = p => /\.(edz|zip|7z)$/i.test(p);

function register(ipcMain, utilityProcess, opened) {
  const open = new Map();
  ipcMain.handle('edz-open', async (ev, archive, opts = {}) => {
    if (!opened.has(archive)) throw new Error('file non scelto con il dialogo');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elettrocad-edz-'));
    const r = await new Promise(resolve => {
      const child = utilityProcess.fork(path.join(__dirname, 'edz-worker.cjs'), [], { serviceName: 'OpenWiring EDZ' });
      let done = false;
      child.on('message', m => { done = true; resolve(m); child.kill(); });
      child.on('exit', code => { if (!done) resolve({ ok: false, error: `estrazione interrotta (codice ${code})` }); });
      child.postMessage({ archive, outDir, pictures: opts.pictures !== false, symbols: opts.symbols !== false });
    });
    if (!r.ok) { await fs.rm(outDir, { recursive: true, force: true }); throw new Error(r.error); }
    const id = path.basename(outDir);
    open.set(id, outDir);
    // Dimensioni dei file estratti (l'elenco dell'archivio comprende anche quelli non estratti)
    const extracted = [];
    const walk = async (dir, rel) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const r2 = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(path.join(dir, e.name), r2);
        else extracted.push({ path: r2, size: (await fs.stat(path.join(dir, e.name))).size });
      }
    };
    await walk(outDir, '');
    return { id, files: extracted, all: r.files.map(f => f.path) };
  });
  ipcMain.handle('edz-read', async (ev, id, paths) => {
    const dir = open.get(id);
    if (!dir) throw new Error('archivio non aperto');
    const out = [];
    for (const rel of paths) {
      const p = path.resolve(dir, ...String(rel).split('/'));
      if (!p.startsWith(dir + path.sep)) continue;
      try { out.push({ path: rel, data: new Uint8Array(await fs.readFile(p)) }); } catch { /* file mancante */ }
    }
    return out;
  });
  ipcMain.handle('edz-close', async (ev, id) => {
    const dir = open.get(id);
    open.delete(id);
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });
}

module.exports = { register, BIG, isArchive };
