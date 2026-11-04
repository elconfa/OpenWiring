// Libreria articoli in un database SQLite (Documenti/OpenWiring/Articoli/articoli.sqlite), con il
// modulo sqlite di Node incluso in Electron (niente moduli nativi da compilare per Windows).
// L'interfaccia tiene in memoria solo la parte leggera di ogni articolo (codice, descrizioni,
// costruttore, modello funzione…): gli attributi originali dell'XML e le foto restano nel
// database e si leggono quando servono. Le foto si vedono con l'indirizzo ecad-foto://part/<codice>.
const path = require('node:path');
const { docsDir } = require('./paths.cjs');
const fs = require('node:fs');

const FORMAT = 'elettrocad-articoli';
const SCHEMA = `
  create table if not exists meta(k text primary key, v text);
  create table if not exists parts(
    id integer primary key,
    partNr text not null unique,
    data text not null,
    attrs text not null default '{}',
    manufacturer text, productGroup text, source text,
    updated integer not null
  );
  create table if not exists pictures(partNr text primary key, mime text not null, data blob not null, v integer not null);
`;

/** Testo indicizzato per la ricerca: campi principali e valori degli attributi */
const searchText = (p, attrs) => [p.partNr, p.typeNr, p.orderNr, p.manufacturer, p.supplier, p.descr1, p.descr2, p.productGroup, p.note, p.source, ...Object.values(attrs)]
  .filter(Boolean).join(' ');

/** Ricerca a testo completo: ogni parola è l'inizio di una parola dell'articolo */
function ftsQuery(q) {
  const words = String(q).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.length ? words.map(w => `"${w}"*`).join(' AND ') : '';
}

function decodeDataUrl(s) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(s);
  if (!m) return undefined;
  return { mime: m[1], data: m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8') };
}

class PartsDb {
  constructor(file) {
    const { DatabaseSync } = require('node:sqlite');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Cartella o file arrivati in sola lettura (es. da uno zip fatto su Windows, estratto su Mac):
    // SQLite scrive il giornale accanto al database, quindi si ridà la scrittura al proprietario
    for (const p of [path.dirname(file), file, `${file}-wal`, `${file}-shm`]) {
      try { const st = fs.statSync(p); if (!(st.mode & 0o200)) fs.chmodSync(p, st.mode | 0o200); } catch { /* non ancora creato */ }
    }
    this.file = file;
    this.db = new DatabaseSync(file);
    // auto_vacuum vale per i database nuovi: lo spazio delle foto eliminate torna al disco
    this.db.exec('pragma auto_vacuum = incremental');
    this.db.exec('pragma journal_mode = wal; pragma synchronous = normal; pragma foreign_keys = on;');
    this.db.exec(SCHEMA);
    this.db.exec(`create virtual table if not exists search using fts5(text, content='', contentless_delete=1, tokenize="unicode61 remove_diacritics 2")`);
    this.db.prepare('insert or ignore into meta(k, v) values (?, ?)').run('format', FORMAT);
    this.db.prepare('insert or ignore into meta(k, v) values (?, ?)').run('version', '1');
    this.q = {
      get: this.db.prepare('select id, attrs from parts where partNr = ?'),
      insert: this.db.prepare('insert into parts(partNr, data, attrs, manufacturer, productGroup, source, updated) values (?, ?, ?, ?, ?, ?, ?)'),
      update: this.db.prepare('update parts set data = ?, attrs = ?, manufacturer = ?, productGroup = ?, source = ?, updated = ? where id = ?'),
      del: this.db.prepare('delete from parts where id = ?'),
      ftsDel: this.db.prepare('delete from search where rowid = ?'),
      ftsIns: this.db.prepare('insert into search(rowid, text) values (?, ?)'),
      picPut: this.db.prepare('insert or replace into pictures(partNr, mime, data, v) values (?, ?, ?, ?)'),
      picDel: this.db.prepare('delete from pictures where partNr = ?'),
      picGet: this.db.prepare('select mime, data, v from pictures where partNr = ?'),
      picV: this.db.prepare('select v from pictures where partNr = ?'),
      row: this.db.prepare('select p.partNr, p.data, p.attrs, f.v from parts p left join pictures f on f.partNr = p.partNr where p.partNr = ?'),
    };
  }

  close() { try { this.db.close(); } catch { /* già chiuso */ } }

  tx(fn) {
    this.db.exec('begin');
    try { const r = fn(); this.db.exec('commit'); return r; } catch (e) { this.db.exec('rollback'); throw e; }
  }

  /** Articolo leggero per l'interfaccia */
  lite(partNr, data, v) {
    const p = typeof data === 'string' ? JSON.parse(data) : data;
    const out = { ...p, partNr, attrs: {}, lite: true };
    if (v) out.picture = `ecad-foto://part/${encodeURIComponent(partNr)}?v=${v}`; else delete out.picture;
    return out;
  }

  list() {
    return this.db.prepare('select p.partNr, p.data, f.v from parts p left join pictures f on f.partNr = p.partNr order by p.partNr').all()
      .map(r => this.lite(r.partNr, r.data, r.v));
  }

  count() { return this.db.prepare('select count(*) n from parts').get().n; }

  /**
   * Scrive gli articoli. Un articolo completo sostituisce attributi e foto; uno leggero (lite)
   * aggiunge i suoi attributi a quelli salvati (un valore vuoto toglie l'attributo) e la foto
   * resta quella del database se non ne arriva una nuova.
   */
  put(parts) {
    const now = Date.now();
    return this.tx(() => parts.map(p => {
      const cur = this.q.get.get(p.partNr);
      let attrs = p.attrs ?? {};
      if (p.lite && cur) attrs = { ...JSON.parse(cur.attrs), ...attrs };
      attrs = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== '' && v !== undefined && v !== null));
      const { attrs: _a, picture, lite: _l, ...rest } = p;
      const data = JSON.stringify(rest);
      const args = [JSON.stringify(attrs), p.manufacturer ?? null, p.productGroup ?? null, p.source ?? null, now];
      let id;
      if (cur) { this.q.update.run(data, ...args, cur.id); id = cur.id; this.q.ftsDel.run(id); }
      else id = Number(this.q.insert.run(p.partNr, data, ...args).lastInsertRowid);
      this.q.ftsIns.run(id, searchText(p, attrs));
      if (typeof picture === 'string' && picture.startsWith('data:')) {
        const img = decodeDataUrl(picture);
        if (img) this.q.picPut.run(p.partNr, img.mime, img.data, now);
      } else if (!picture) this.q.picDel.run(p.partNr);
      return this.lite(p.partNr, data, this.q.picV.get(p.partNr)?.v);
    }));
  }

  remove(partNrs) {
    const n = this.tx(() => {
      let n = 0;
      for (const nr of partNrs) {
        const cur = this.q.get.get(nr);
        if (!cur) continue;
        this.q.ftsDel.run(cur.id);
        this.q.del.run(cur.id);
        this.q.picDel.run(nr);
        n++;
      }
      return n;
    });
    if (n) this.db.exec('pragma incremental_vacuum');
    return n;
  }

  /** Articoli completi (attributi; foto come data URL se richiesta) */
  get(partNrs, pictures) {
    const out = [];
    for (const nr of partNrs) {
      const r = this.q.row.get(nr);
      if (!r) continue;
      const p = { ...JSON.parse(r.data), partNr: r.partNr, attrs: JSON.parse(r.attrs) };
      if (r.v && pictures) {
        const f = this.q.picGet.get(nr);
        p.picture = `data:${f.mime};base64,${Buffer.from(f.data).toString('base64')}`;
      } else if (r.v) p.picture = `ecad-foto://part/${encodeURIComponent(nr)}?v=${r.v}`;
      out.push(p);
    }
    return out;
  }

  picture(partNr) { return this.q.picGet.get(partNr); }

  search(q, limit = 100000) {
    const m = ftsQuery(q);
    if (!m) return [];
    return this.db.prepare('select p.partNr from search s join parts p on p.id = s.rowid where search match ? limit ?').all(m, limit).map(r => r.partNr);
  }

  /** Copia degli articoli scelti (con foto e attributi) in un altro file SQLite */
  exportTo(file, partNrs) {
    fs.rmSync(file, { force: true });
    const out = new PartsDb(file);
    try {
      const rows = this.db.prepare('select partNr, data, attrs, manufacturer, productGroup, source, updated from parts where partNr = ?');
      out.tx(() => {
        for (const nr of partNrs) {
          const r = rows.get(nr);
          if (!r) continue;
          const id = Number(out.q.insert.run(r.partNr, r.data, r.attrs, r.manufacturer, r.productGroup, r.source, r.updated).lastInsertRowid);
          out.q.ftsIns.run(id, searchText({ ...JSON.parse(r.data), partNr: r.partNr }, JSON.parse(r.attrs)));
          const f = this.q.picGet.get(nr);
          if (f) out.q.picPut.run(nr, f.mime, f.data, f.v);
        }
      });
      return out.count();
    } finally { out.close(); }
  }

  /** Articoli da un altro file della libreria: quelli con lo stesso codice si sostituiscono */
  importFrom(file) {
    const { DatabaseSync } = require('node:sqlite');
    // In sola lettura: il file scelto non si modifica (e se non è una libreria non si tocca)
    const src = new DatabaseSync(file, { readOnly: true });
    try {
      let fmt;
      try { fmt = src.prepare("select v from meta where k = 'format'").get()?.v; } catch { /* non è un database di OpenWiring */ }
      if (fmt !== FORMAT) throw new Error('non è una libreria articoli di OpenWiring');
      const pic = src.prepare('select mime, data from pictures where partNr = ?');
      let added = 0, replaced = 0;
      const nrs = [];
      const now = Date.now();
      this.tx(() => {
        for (const r of src.prepare('select partNr, data, attrs, manufacturer, productGroup, source from parts').iterate()) {
          const cur = this.q.get.get(r.partNr);
          const args = [r.attrs, r.manufacturer, r.productGroup, r.source, now];
          let id;
          if (cur) { this.q.update.run(r.data, ...args, cur.id); id = cur.id; this.q.ftsDel.run(id); replaced++; }
          else { id = Number(this.q.insert.run(r.partNr, r.data, ...args).lastInsertRowid); added++; }
          this.q.ftsIns.run(id, searchText({ ...JSON.parse(r.data), partNr: r.partNr }, JSON.parse(r.attrs)));
          const f = pic.get(r.partNr);
          if (f) this.q.picPut.run(r.partNr, f.mime, f.data, now); else this.q.picDel.run(r.partNr);
          nrs.push(r.partNr);
        }
      });
      return { added, replaced, parts: nrs.map(nr => { const r = this.q.row.get(nr); return this.lite(nr, r.data, r.v); }) };
    } finally { src.close(); }
  }
}

function register(ipcMain, app, dialog, shell, BrowserWindow, protocol) {
  const dir = () => path.join(docsDir(app), 'Articoli');
  let db;
  const open = () => (db ??= new PartsDb(path.join(dir(), 'articoli.sqlite')));
  app.on('will-quit', () => db?.close());

  protocol.handle('ecad-foto', req => {
    const u = new URL(req.url);
    const f = open().picture(decodeURIComponent(u.pathname.slice(1)));
    if (!f) return new Response('', { status: 404 });
    return new Response(Buffer.from(f.data), { headers: { 'content-type': f.mime, 'cache-control': 'max-age=31536000' } });
  });

  ipcMain.handle('parts-list', () => ({ file: open().file, parts: open().list() }));
  ipcMain.handle('parts-put', (ev, parts) => open().put(parts));
  ipcMain.handle('parts-remove', (ev, partNrs) => open().remove(partNrs));
  ipcMain.handle('parts-get', (ev, partNrs, pictures) => open().get(partNrs, pictures));
  ipcMain.handle('parts-search', (ev, q, limit) => open().search(q, limit));
  ipcMain.handle('parts-open', () => shell.showItemInFolder(open().file));
  const FILTER = [{ name: 'Libreria articoli OpenWiring (SQLite)', extensions: ['sqlite'] }];
  ipcMain.handle('parts-export', async (ev, partNrs, name) => {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(ev.sender), { defaultPath: path.join(app.getPath('documents'), name), filters: FILTER });
    if (r.canceled || !r.filePath) return null;
    if (path.resolve(r.filePath) === path.resolve(open().file)) throw new Error('scegli un file diverso dalla libreria in uso');
    return { file: r.filePath, count: open().exportTo(r.filePath, partNrs) };
  });
  ipcMain.handle('parts-import', async ev => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(ev.sender), { filters: FILTER, properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (path.resolve(r.filePaths[0]) === path.resolve(open().file)) throw new Error('è la libreria già in uso');
    return { file: r.filePaths[0], ...open().importFrom(r.filePaths[0]) };
  });
}

module.exports = { register, PartsDb, ftsQuery };
