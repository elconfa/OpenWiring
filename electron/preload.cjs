// Ponte sicuro tra l'interfaccia e il sistema: dialoghi dei file e assistenti IA.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('elettro', {
  openFile: (filters, multi) => ipcRenderer.invoke('open-file', filters, multi),
  readProject: file => ipcRenderer.invoke('read-project', file),
  scanProjects: dir => ipcRenderer.invoke('scan-projects', dir),
  // Import dei simboli di una cartella con le sottocartelle
  symbolsFolder: () => ipcRenderer.invoke('symbols-folder'),
  // Export DWG con ODA File Converter
  dwgFind: () => ipcRenderer.invoke('dwg-find'),
  dwgExport: (conv, files, name, single) => ipcRenderer.invoke('dwg-export', conv, files, name, single),
  saveFile: (defaultName, data, filters, path, backupKeep) => ipcRenderer.invoke('save-file', defaultName, data, filters, path, backupKeep),
  saveFolder: (folderName, files) => ipcRenderer.invoke('save-folder', folderName, files),
  choosePaths: filters => ipcRenderer.invoke('choose-paths', filters),
  openPath: target => ipcRenderer.invoke('open-path', target),
  readDoc: file => ipcRenderer.invoke('read-doc', file),
  // Cartelle dei dialoghi: predefinite (impostazioni) e ultime usate
  foldersGet: () => ipcRenderer.invoke('folders-get'),
  foldersSet: (kind, dir) => ipcRenderer.invoke('folders-set', kind, dir),
  foldersChoose: kind => ipcRenderer.invoke('folders-choose', kind),
  // Macro EPLAN richiamata da un file di dati articolo aperto con il dialogo
  readMacro: (from, ref) => ipcRenderer.invoke('read-macro', from, ref),
  // Cartella della libreria dei simboli (un file .ecsym per simbolo)
  symlibRead: () => ipcRenderer.invoke('symlib-read'),
  symlibWrite: (files, removes) => ipcRenderer.invoke('symlib-write', files, removes),
  symlibOpen: () => ipcRenderer.invoke('symlib-open'),
  symlibChoose: () => ipcRenderer.invoke('symlib-choose'),
  // Chiusura della finestra: l'interfaccia chiede dei progetti non salvati e poi conferma o annulla
  onCloseRequest: cb => { const h = () => cb(); ipcRenderer.on('close-request', h); return () => ipcRenderer.removeListener('close-request', h); },
  confirmClose: () => ipcRenderer.send('close-confirmed'),
  cancelClose: () => ipcRenderer.send('close-cancelled'),
  onSymlibChanged: cb => { const h = () => cb(); ipcRenderer.on('symlib-changed', h); return () => ipcRenderer.removeListener('symlib-changed', h); },
  // EDZ grandi: estratti su disco da un processo a parte, letti a gruppi
  edzOpen: (archive, opts) => ipcRenderer.invoke('edz-open', archive, opts),
  edzRead: (id, paths) => ipcRenderer.invoke('edz-read', id, paths),
  edzClose: id => ipcRenderer.invoke('edz-close', id),
  // Libreria articoli nel database SQLite (Documenti/OpenWiring/Articoli/articoli.sqlite)
  partsList: () => ipcRenderer.invoke('parts-list'),
  partsPut: parts => ipcRenderer.invoke('parts-put', parts),
  partsRemove: partNrs => ipcRenderer.invoke('parts-remove', partNrs),
  partsGet: (partNrs, pictures) => ipcRenderer.invoke('parts-get', partNrs, pictures),
  partsSearch: (q, limit) => ipcRenderer.invoke('parts-search', q, limit),
  partsOpen: () => ipcRenderer.invoke('parts-open'),
  partsExport: (partNrs, name) => ipcRenderer.invoke('parts-export', partNrs, name),
  partsImport: () => ipcRenderer.invoke('parts-import'),
  // Assistenti IA: richieste HTTP alle API (senza limiti CORS), CLI degli account, chiavi cifrate
  aiHttp: req => ipcRenderer.invoke('ai-http', req),
  aiCli: req => ipcRenderer.invoke('ai-cli', req),
  aiCliCheck: provider => ipcRenderer.invoke('ai-cli-check', provider),
  aiCancel: id => ipcRenderer.invoke('ai-cancel', id),
  encrypt: text => ipcRenderer.invoke('secret-encrypt', text),
  decrypt: data => ipcRenderer.invoke('secret-decrypt', data),
  // Colori dei pulsanti di sistema nella barra del titolo integrata (Windows)
  titleBar: colors => ipcRenderer.send('title-bar', colors),
});
