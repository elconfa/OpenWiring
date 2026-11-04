// Cartelle dell'utente. Fino alla 1.23 il programma si chiamava ElettroCAD: chi lo aggiorna continua a
// usare la cartella Documenti/ElettroCAD (simboli e articoli) e ritrova le impostazioni.
const path = require('node:path');
const fs = require('node:fs');

const OLD = ['ElettroCAD', 'elettrocad'];

/** Documenti/OpenWiring, oppure Documenti/ElettroCAD se c'è già e la nuova non esiste */
function docsDir(app) {
  const docs = app.getPath('documents');
  const dir = path.join(docs, 'OpenWiring');
  const old = path.join(docs, 'ElettroCAD');
  return !fs.existsSync(dir) && fs.existsSync(old) ? old : dir;
}

/** Al primo avvio copia le impostazioni della vecchia ElettroCAD (preferenze, progetti recenti, chiavi) */
function migrateUserData(app) {
  const dir = app.getPath('userData');
  if (fs.existsSync(dir)) return;
  for (const name of OLD) {
    const old = path.join(app.getPath('appData'), name);
    if (old === dir || !fs.existsSync(old)) continue;
    try {
      fs.cpSync(old, dir, { recursive: true, filter: src => !/Singleton(Lock|Socket|Cookie)$/.test(src) });
    } catch { /* si riparte da impostazioni vuote */ }
    return;
  }
}

module.exports = { docsDir, migrateUserData };
