// App desktop: i cartigli personali vivono anche nella cartella Documenti/OpenWiring/Cartigli (un file
// .ectb per cartiglio). All'avvio si legge la cartella; ogni modifica della libreria dei cartigli scrive o
// elimina i file; i file aggiunti o tolti da fuori (Finder, Esplora risorse, copia da un collega) si ricaricano.
import { useStore } from '../model/store';
import { kvSet } from '../io/storage';
import { loadTitleBlockFiles, titleBlockFileText, titleBlockRelPath } from '../io/titleBlockFolder';
import type { TitleBlockTemplate } from '../model/types';
import { tx } from '../i18n/ui';

/** Ultimo contenuto scritto o letto per ogni cartiglio */
let written = new Map<string, { rel: string; text: string; name: string }>();
let applying = false;
let queue: Promise<unknown> = Promise.resolve();
const run = (f: () => Promise<unknown>) => { queue = queue.then(f).catch(e => useStore.getState().logMsg(tx('Cartella dei cartigli: {0}', (e as Error).message ?? e), 'error')); return queue; };

async function push(list: TitleBlockTemplate[]) {
  const b = window.elettro!;
  const files: { rel: string; text: string }[] = [], removes: string[] = [];
  const ids = new Set(list.map(t => t.id));
  for (const [id, w] of written) if (!ids.has(id)) { removes.push(w.rel); written.delete(id); }
  const taken = new Set([...written.values()].map(w => w.rel.toLowerCase()));
  for (const t of list) {
    const text = titleBlockFileText(t), w = written.get(t.id);
    // Il file resta dov'è finché il nome non cambia (anche se rinominato a mano)
    let rel = w && w.name === t.name ? w.rel : undefined;
    if (!rel) {
      if (w) taken.delete(w.rel.toLowerCase());
      rel = titleBlockRelPath(t, r => taken.has(r.toLowerCase()));
    }
    if (!w || w.text !== text || w.rel !== rel) {
      files.push({ rel, text });
      if (w && w.rel !== rel) removes.push(w.rel);
    }
    taken.add(rel.toLowerCase());
    written.set(t.id, { rel, text, name: t.name });
  }
  const writing = new Set(files.map(f => f.rel));
  if (files.length || removes.length) await b.tblibWrite!(files, removes.filter(r => !writing.has(r)));
}

async function reload(first: boolean) {
  const b = window.elettro!;
  if (!first) await push(useStore.getState().tbLibrary);
  const r = await b.tblibRead!();
  const st = useStore.getState();
  const loaded = loadTitleBlockFiles(r.files);
  for (const e of loaded.errors) st.logMsg(tx('Cartella dei cartigli: {0}', e), 'warn');
  written = new Map(loaded.list.map(t => [t.id, { rel: loaded.paths.get(t.id)!, text: titleBlockFileText(t), name: t.name }]));
  let list = loaded.list;
  // Al primo avvio i cartigli già nella libreria del programma e non ancora nella cartella vi vengono copiati
  if (first) {
    const extra = st.tbLibrary.filter(t => !written.has(t.id));
    if (extra.length) {
      list = [...list, ...extra];
      await push(list);
      st.logMsg(tx('{0} cartigli personali copiati nella cartella {1}', extra.length, r.dir));
    }
  }
  applying = true;
  try { useStore.setState({ tbLibrary: list, tbDir: r.dir }); } finally { applying = false; }
  void kvSet('titleBlocks', list);
}

let started = false;
/** Da chiamare una volta all'avvio, dopo aver caricato la libreria salvata */
export async function startTitleBlockFolder() {
  const b = window.elettro;
  if (started || !b?.tblibRead || !b.tblibWrite) return;
  started = true;
  await run(() => reload(true));
  useStore.subscribe((s, prev) => {
    if (applying || s.tbLibrary === prev.tbLibrary) return;
    void run(() => push(useStore.getState().tbLibrary));
  });
  b.onTblibChanged?.(() => void run(() => reload(false)));
}

/** Apre la cartella dei cartigli nel Finder o in Esplora risorse */
export const openTitleBlockFolder = () => void window.elettro?.tblibOpen?.();

/** Sceglie un'altra cartella (es. condivisa in rete) e ne legge i cartigli */
export async function chooseTitleBlockFolder() {
  const b = window.elettro;
  if (!b?.tblibChoose) return;
  const dir = await b.tblibChoose();
  if (dir) await run(() => reload(true));
}
