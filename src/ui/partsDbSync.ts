// App desktop: la libreria articoli sta nel database SQLite (electron/partsdb.cjs). In memoria resta
// solo la parte leggera di ogni articolo (lite): codice, descrizioni, costruttore, modello funzione,
// simbolo… Gli attributi originali e le foto si leggono dal database quando servono (scheda
// dell'articolo, esportazioni, copia nel progetto). Le modifiche della libreria nello store si
// scrivono nel database da sole, come per la cartella dei simboli.
import { useEffect, useState } from 'react';
import { useStore, setLibraryInDb } from '../model/store';
import { kvGet, kvSet } from '../io/storage';
import type { Part } from '../model/types';
import { repairPartCables } from '../model/cables';
import { tx } from '../i18n/ui';

const bridge = () => {
  const b = window.elettro;
  return b?.partsList && b.partsPut && b.partsRemove && b.partsGet ? b : undefined;
};

let inDb = false;
/** La libreria articoli è nel database (app desktop avviata) */
export const partsInDb = () => inDb;

let queue: Promise<unknown> = Promise.resolve();
const run = (job: () => Promise<unknown>) => (queue = queue.then(job).catch(e =>
  useStore.getState().logMsg(tx('Libreria articoli: {0}', (e as Error).message ?? String(e)), 'error')));
/** Attende che le modifiche della libreria siano tutte nel database */
export const flushParts = () => queue;

/** Ultimo stato scritto nel database, per articolo: si scrivono solo gli articoli cambiati */
let saved = new Map<string, Part>();
let applying = false;
const CHUNK = 200;
const MAX_SIDE = 512;

const blobToDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});

/** Foto grandi rimpicciolite (lato massimo 512 px, WebP): bastano per la scheda e le liste */
export async function shrinkPicture(url: string): Promise<string> {
  if (!url.startsWith('data:image/') || url.startsWith('data:image/svg') || url.length < 80_000) return url;
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const out = await blobToDataUrl(await c.convertToBlob({ type: 'image/webp', quality: 0.85 }));
    return out.length < url.length ? out : url;
  } catch {
    return url;
  }
}

/** Sostituisce nello store gli articoli appena scritti con la loro versione leggera */
function swap(sent: Part[], lites: Part[]) {
  const by = new Map(sent.map((p, i) => [p.partNr, [p, lites[i]] as const]));
  let n = 0;
  const library = useStore.getState().library.map(p => {
    const e = by.get(p.partNr);
    // Un articolo cambiato di nuovo nel frattempo resta com'è (si riscrive al giro dopo)
    if (!e || e[0] !== p || !e[1]) return p;
    n++;
    saved.set(p.partNr, e[1]);
    return e[1];
  });
  if (!n) return;
  applying = true;
  try { useStore.setState({ library }); } finally { applying = false; }
}

async function push(lib: Part[]) {
  const b = bridge()!;
  const seen = new Set<string>();
  const changed: Part[] = [];
  for (const p of lib) { seen.add(p.partNr); if (saved.get(p.partNr) !== p) changed.push(p); }
  const removed = [...saved.keys()].filter(k => !seen.has(k));
  saved = new Map(lib.map(p => [p.partNr, p]));
  if (removed.length) await b.partsRemove!(removed);
  for (let i = 0; i < changed.length; i += CHUNK) {
    const chunk = changed.slice(i, i + CHUNK);
    const send = await Promise.all(chunk.map(async p => (p.picture?.startsWith('data:') ? { ...p, picture: await shrinkPicture(p.picture) } : p)));
    swap(chunk, await b.partsPut!(send));
  }
}

/** Articolo completo: i dati del database con sopra le modifiche ancora in memoria */
function merge(full: Part | undefined, p: Part): Part {
  const { lite: _l, attrs, picture, ...rest } = p;
  const keep = (a: Record<string, string>) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== ''));
  if (!full) return { ...rest, attrs: keep(attrs), ...(picture && !picture.startsWith('ecad-foto:') ? { picture } : {}) };
  return { ...full, ...rest, attrs: keep({ ...full.attrs, ...attrs }), ...(full.picture ? { picture: full.picture } : {}) };
}

/**
 * Gli articoli leggeri della lista diventano completi (attributi, e foto come data URL se
 * richiesta): per esportare o copiare gli articoli fuori dalla libreria
 */
export async function withFullParts(parts: Part[], pictures: boolean): Promise<Part[]> {
  if (parts.some(p => p.lite)) await queue;
  return readFull(parts, pictures);
}

/** Come withFullParts, senza attendere la coda (per i lavori che sono già nella coda) */
async function readFull(parts: Part[], pictures: boolean): Promise<Part[]> {
  const b = bridge();
  const lites = parts.filter(p => p.lite);
  if (!b || !lites.length) return parts;
  const full = new Map<string, Part>();
  for (let i = 0; i < lites.length; i += 500) {
    for (const f of await b.partsGet!(lites.slice(i, i + 500).map(p => p.partNr), pictures)) full.set(f.partNr, f);
  }
  return parts.map(p => (p.lite ? merge(full.get(p.partNr), p) : p));
}

/** Nel progetto vanno copie complete degli articoli (con la foto), non quelle leggere */
async function hydrate() {
  const lites = useStore.getState().project.parts.filter(p => p.lite);
  if (!lites.length) return;
  const full = new Map((await readFull(lites, true)).map(p => [p.partNr, p]));
  const s = useStore.getState();
  if (!s.project.parts.some(p => p.lite)) return;
  useStore.setState({ project: { ...s.project, parts: s.project.parts.map(p => (p.lite ? full.get(p.partNr) ?? merge(undefined, p) : p)) } });
}

/** Articoli scritti nel database da un'altra strada (import di un file della libreria) */
export function applyFromDb(lites: Part[]) {
  const by = new Map(lites.map(p => [p.partNr, p]));
  for (const p of lites) saved.set(p.partNr, p);
  const cur = useStore.getState().library;
  const library = [...cur.filter(p => !by.has(p.partNr)), ...lites].sort((a, b) => a.partNr.localeCompare(b.partNr));
  applying = true;
  try { useStore.setState({ library }); } finally { applying = false; }
}

/** Ricerca a testo completo nel database (anche negli attributi): codici degli articoli trovati */
export async function searchPartsDb(q: string): Promise<Set<string> | undefined> {
  const b = window.elettro;
  if (!inDb || !b?.partsSearch || !q.trim()) return undefined;
  await queue;
  return new Set(await b.partsSearch(q));
}

const fullCache = new WeakMap<Part, Part>();
/** Articolo completo per le schede (attributi dal database); finché non arriva, quello leggero */
export function useFullPart<T extends Part>(part: T | undefined): T | undefined {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!part?.lite || fullCache.has(part)) return;
    let live = true;
    // Lo stesso oggetto a ogni disegno (le schede ripartono quando l'articolo cambia)
    void withFullParts([part], false).then(([f]) => { fullCache.set(part, { ...part, ...f, lite: undefined }); if (live) redraw(n => n + 1); });
    return () => { live = false; };
  }, [part]);
  if (!part?.lite) return part;
  return (fullCache.get(part) as T | undefined) ?? part;
}

let started = false;
/**
 * Da chiamare all'avvio, prima di restoreLibrary: apre il database e, la prima volta, ci sposta la
 * libreria salvata finora nell'archivio del browser
 */
export async function startPartsDb(): Promise<boolean> {
  const b = bridge();
  if (started || !b) return false;
  started = true;
  let parts: Part[];
  try { parts = (await b.partsList!()).parts; } catch (e) {
    useStore.getState().logMsg(tx('Database degli articoli non disponibile ({0}): la libreria resta nell\'archivio interno', (e as Error).message ?? String(e)), 'warn');
    return false;
  }
  inDb = true;
  setLibraryInDb();
  saved = new Map(parts.map(p => [p.partNr, p]));
  // La libreria dell'archivio del browser passa nel database. Si cancella solo alla fine: se il
  // programma si chiude a metà, al prossimo avvio si riprendono gli articoli che mancano
  const old = await kvGet<Part[]>('library');
  const missing = old?.filter(p => !saved.has(p.partNr)) ?? [];
  const library = missing.length ? [...parts, ...missing].sort((a, b) => a.partNr.localeCompare(b.partNr)) : parts;
  applying = true;
  try { useStore.setState({ library }); } finally { applying = false; }
  // Da qui ogni modifica della libreria va nel database (anche durante lo spostamento)
  useStore.subscribe((s, prev) => {
    if (!applying && s.library !== prev.library) void run(() => push(useStore.getState().library));
    if (s.project.parts !== prev.project.parts && s.project.parts.some(p => p.lite)) void run(hydrate);
  });
  // Articoli cavo con i colori scritti come numeri: corretti e riscritti nel database
  const fixed = repairPartCables(useStore.getState().library);
  if (fixed) useStore.setState({ library: fixed });
  if (missing.length) await run(() => push(useStore.getState().library));
  if (old?.length) {
    const n = (await b.partsList!()).parts.length;
    if (n >= parts.length + missing.length) {
      await kvSet('library', []);
      if (missing.length) useStore.getState().logMsg(tx('Libreria articoli spostata nel database: {0} articoli', missing.length));
    }
  }
  // Articoli leggeri finiti nel progetto prima dell'avvio della sincronizzazione
  void run(hydrate);
  return true;
}
