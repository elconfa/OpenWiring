// App desktop: la libreria dei simboli vive nella cartella scelta (un file .ecsym per simbolo,
// sottocartelle = categorie). All'avvio si legge la cartella; ogni modifica della libreria scrive o
// elimina i file; le modifiche fatte da fuori (Finder, copia da un'altra installazione) si ricaricano.
import { useStore } from '../model/store';
import { setLibrarySymbols } from '../model/geometry';
import { kvSet } from '../io/storage';
import { loadSymbolFiles, safeRel, symbolFileText, symbolRelPath, SYMBOL_EXT, type SymbolFile } from '../io/symbolFolder';
import type { SymbolDef } from '../model/types';
import { tx } from '../i18n/ui';

/** Ultimo contenuto scritto o letto per ogni simbolo */
let written = new Map<string, { rel: string; text: string; name: string; category: string }>();
let applying = false;
let queue: Promise<unknown> = Promise.resolve();
const run = (f: () => Promise<unknown>) => { queue = queue.then(f).catch(e => useStore.getState().logMsg(tx('Cartella dei simboli: {0}', (e as Error).message ?? e), 'error')); return queue; };

const sorted = (list: SymbolDef[]) => [...list].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

async function push(lib: SymbolDef[]) {
  const b = window.elettro!;
  const files: SymbolFile[] = [], removes: string[] = [];
  const ids = new Set(lib.map(s => s.id));
  for (const [id, w] of written) if (!ids.has(id)) { removes.push(w.rel); written.delete(id); }
  // In minuscolo: macOS e Windows non distinguono "Rele" da "rele"
  const taken = new Set([...written.values()].map(w => w.rel.toLowerCase()));
  for (const s of lib) {
    const text = symbolFileText(s), w = written.get(s.id);
    // Il file resta dov'è finché nome e categoria non cambiano (anche se rinominato a mano)
    let rel = w && w.name === s.name && w.category === s.category ? w.rel : undefined;
    if (!rel) {
      if (w) taken.delete(w.rel.toLowerCase());
      rel = symbolRelPath(s, r => taken.has(r.toLowerCase()));
    }
    if (!w || w.text !== text || w.rel !== rel) {
      files.push({ rel, text });
      if (w && w.rel !== rel) removes.push(w.rel);
    }
    taken.add(rel.toLowerCase());
    written.set(s.id, { rel, text, name: s.name, category: s.category });
  }
  const writing = new Set(files.map(f => f.rel));
  if (files.length || removes.length) await b.symlibWrite!(files, removes.filter(r => !writing.has(r)));
}

async function reload(first: boolean) {
  const b = window.elettro!;
  // Prima si scrivono i simboli creati o modificati nel programma e non ancora salvati: la cartella
  // letta subito dopo li contiene già e non li toglie dalla libreria
  if (!first) await push(useStore.getState().symbolLibrary);
  const before = useStore.getState().symbolLibrary;
  const r = await b.symlibRead!();
  const st = useStore.getState();
  // Un simbolo salvato mentre si leggeva la cartella: prima lo si scrive, poi si rilegge
  if (!first && st.symbolLibrary !== before) { void run(() => reload(false)); return; }
  // Primo avvio con la cartella: i simboli già nella libreria dell'app vi vengono copiati
  if (first && !r.files.length && st.symbolLibrary.length) {
    useStore.setState({ symbolDir: r.dir });
    written = new Map();
    await push(st.symbolLibrary);
    st.logMsg(tx('{0} simboli della libreria copiati nella cartella {1}', st.symbolLibrary.length, r.dir));
    return;
  }
  // Cartelle e file con caratteri che non si leggono bene su un altro sistema (accenti, "·"…):
  // si rinominano una volta sola
  const renamed = await tidyNames(r.files);
  const loaded = loadSymbolFiles(renamed);
  for (const e of loaded.errors) st.logMsg(tx('Cartella dei simboli: {0}', e), 'warn');
  written = new Map(loaded.symbols.map(s => [s.id, { rel: loaded.paths.get(s.id)!, text: symbolFileText(s), name: s.name, category: s.category }]));
  const symbolLibrary = sorted(loaded.symbols);
  applying = true;
  try {
    setLibrarySymbols(symbolLibrary);
    useStore.setState({ symbolLibrary, symbolDir: r.dir });
  } finally { applying = false; }
  void kvSet('symbols', symbolLibrary);
}

async function tidyNames(files: SymbolFile[]): Promise<SymbolFile[]> {
  const taken = new Set(files.map(f => f.rel.toLowerCase()));
  const moves: { from: string; to: string; text: string }[] = [];
  const out = files.map(f => {
    const want = safeRel(f.rel);
    if (want === f.rel) return f;
    let to = want;
    for (let n = 2; taken.has(to.toLowerCase()) && to.toLowerCase() !== f.rel.toLowerCase(); n++) to = want.replace(/\.ecsym$/, ` (${n})${SYMBOL_EXT}`);
    taken.delete(f.rel.toLowerCase());
    taken.add(to.toLowerCase());
    moves.push({ from: f.rel, to, text: f.text });
    return { rel: to, text: f.text };
  });
  if (moves.length) {
    // Prima si scrivono i nuovi, poi si tolgono i vecchi: se la scrittura non riesce non si perde nulla
    await window.elettro!.symlibWrite!(moves.map(m => ({ rel: m.to, text: m.text })), []);
    await window.elettro!.symlibWrite!([], moves.map(m => m.from));
    useStore.getState().logMsg(tx('Cartella dei simboli: {0} file o cartelle rinominati con caratteri validi su Mac e Windows', moves.length));
  }
  return out;
}

let started = false;
/** Da chiamare una volta all'avvio, dopo aver caricato la libreria salvata */
export async function startSymbolFolder() {
  const b = window.elettro;
  if (started || !b?.symlibRead || !b.symlibWrite) return;
  started = true;
  await run(() => reload(true));
  useStore.subscribe((s, prev) => {
    if (applying || s.symbolLibrary === prev.symbolLibrary) return;
    // Si scrive la libreria com'è quando tocca a questa scrittura, non com'era quando è stata chiesta
    void run(() => push(useStore.getState().symbolLibrary));
  });
  b.onSymlibChanged?.(() => void run(() => reload(false)));
}

/** Sceglie un'altra cartella e ne legge i simboli */
export async function chooseSymbolFolder() {
  const b = window.elettro;
  if (!b?.symlibChoose) return;
  const dir = await b.symlibChoose();
  if (dir) await run(() => reload(true));
}
