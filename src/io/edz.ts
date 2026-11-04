// Import dei pacchetti EDZ (Eplan Data Portal). Un EDZ è un archivio 7z (a volte ZIP)
// con dati articolo XML, immagini, documenti e macro .ema. Le macro in formato XML
// (EplanPxfRoot) diventano simboli con il disegno del costruttore (vedi ema.ts); per le
// macro binarie o mancanti la grafica viene generata dal modello funzione dell'articolo.
import SevenZip from '7z-wasm';
import type { SevenZipModule } from '7z-wasm';
import type { Part, SymbolDef } from '../model/types';
import { emaToSymbols } from './ema';
import { parsePartsXml, pictureRef } from './eplanXml';
import { importDataPortalPage, isDataPortalPage } from './dataPortal';

export interface ArchiveFile { path: string; data: Uint8Array }

/**
 * Cosa prendere da un pacchetto oltre ai dati articolo (di serie tutto). Senza simboli gli articoli
 * restano col modello funzione (morsetti), da associare ai propri simboli; senza foto la libreria è
 * molto più leggera
 */
export interface EdzOptions { pictures?: boolean; symbols?: boolean }

export interface EdzResult {
  parts: Part[];
  files: string[];
  macros: string[];
  /** Simboli ricavati dalle macro .ema in XML (il primo di ogni macro è associato agli articoli) */
  symbols: SymbolDef[];
  /** Macro che non è stato possibile leggere (binarie o senza disegno schematico) */
  unreadMacros: string[];
  /** Per simbolo: simboli della libreria EPLAN ridisegnati con un nostro equivalente */
  redrawn: Record<string, string[]>;
  documents: ArchiveFile[];
  warnings: string[];
}

let wasmUrl: string | undefined;
/** Nel browser il file .wasm va servito da Vite; in Node viene trovato da solo */
export function setSevenZipWasmUrl(url: string) { wasmUrl = url; }

async function load(): Promise<SevenZipModule> {
  return SevenZip({
    print: () => {}, printErr: () => {},
    ...(wasmUrl ? { locateFile: () => wasmUrl! } : {}),
  });
}

export async function extractArchive(data: Uint8Array, name = 'archive.edz'): Promise<ArchiveFile[]> {
  const sz = await load();
  const archive = '/in/' + name.replace(/[^\w.-]/g, '_');
  sz.FS.mkdir('/in'); sz.FS.mkdir('/out');
  const s = sz.FS.open(archive, 'w+');
  sz.FS.write(s, data, 0, data.length);
  sz.FS.close(s);
  try {
    sz.callMain(['x', archive, '-o/out', '-y', '-bso0', '-bsp0']);
  } catch (e) {
    // callMain lancia ExitStatus anche in caso di successo con alcune build
    if (!(e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 0)) throw e;
  }
  const out: ArchiveFile[] = [];
  const walk = (dir: string) => {
    for (const n of sz.FS.readdir(dir)) {
      if (n === '.' || n === '..') continue;
      const p = `${dir}/${n}`;
      const st = sz.FS.stat(p);
      if (sz.FS.isDir(st.mode)) walk(p);
      else out.push({ path: p.slice('/out/'.length), data: sz.FS.readFile(p) as Uint8Array });
    }
  };
  walk('/out');
  return out;
}

const base = (p: string) => p.split(/[\\/]/).pop()!.toLowerCase();

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };

export function toDataUrl(f: ArchiveFile): string | undefined {
  const ext = base(f.path).split('.').pop() ?? '';
  const mime = MIME[ext];
  if (!mime) return undefined;
  let bin = '';
  for (let i = 0; i < f.data.length; i += 0x8000) bin += String.fromCharCode(...f.data.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export function decodeXml(data: Uint8Array): string {
  // UTF-16 con BOM è frequente negli export EPLAN
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data);
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data);
  return new TextDecoder('utf-8').decode(data);
}

export async function importEdz(data: Uint8Array, name: string, opts: EdzOptions = {}): Promise<EdzResult> {
  const files = await extractArchive(data, name);
  return importFromFiles(files, name, opts);
}

/**
 * Simbolo di morsetto per un articolo morsetto: funzioni EPLAN di categoria 100 (morsetto), oppure
 * gruppo prodotto Elettrotecnica ▸ Morsetti ▸ Morsetto. Terza cifra 3 = conduttore di protezione,
 * funzione del morsetto 1 = sezionabile, 4 = portafusibile.
 */
export function terminalSymbol(p: Part): string | undefined {
  const fts = p.functionTemplates.filter(f => f.category?.startsWith('100.'));
  const group = [p.attrs.P_ARTICLE_PRODUCTTOPGROUP, p.attrs.P_ARTICLE_PRODUCTGROUP, p.attrs.P_ARTICLE_PRODUCTSUBGROUP].join('/');
  if (!fts.length && group !== '1/3/4') return undefined;
  if (p.functionTemplates.some(f => f.category && !f.category.startsWith('100.'))) return undefined;
  if (fts.some(f => f.terminalFunction === 4)) return 'terminal_fuse';
  if (fts.some(f => f.terminalFunction === 1)) return 'terminal_disc';
  if (fts.length && fts.every(f => f.category!.split('.')[2] === '3')) return 'terminal_pe';
  return 'terminal';
}

/** Articoli dei file XML di dati articolo */
function partsFromXml(files: ArchiveFile[], name: string, parts: Part[], warnings: string[]) {
  for (const f of files) {
    if (!/\.xml$/i.test(f.path)) continue;
    const text = decodeXml(f.data);
    if (!/P_ARTICLE_PARTNR/i.test(text)) continue;
    const r = parsePartsXml(text, `${name}/${f.path}`);
    parts.push(...r.parts);
    warnings.push(...r.warnings);
  }
}

/** Macro richiamate dagli articoli (schema, non 3D), come nomi di file */
const macroRefs = (p: Part) => [p.attrs.P_ARTICLE_GROUPSYMBOLMACRO, p.macro].filter((r): r is string => !!r && !/_3d\.ema$/i.test(r));

export function importFromFiles(files: ArchiveFile[], name: string, opts: EdzOptions = {}): EdzResult {
  const warnings: string[] = [];
  const parts: Part[] = [];
  partsFromXml(files, name, parts, warnings);
  const byName = new Map(files.map(f => [base(f.path), f]));
  if (opts.pictures !== false) for (const p of parts) {
    const ref = pictureRef(p);
    const img = ref ? byName.get(base(ref)) : undefined;
    if (img) p.picture = toDataUrl(img);
  }
  return finishImport(parts, warnings, files, name, files.map(f => f.path), opts);
}

/**
 * EDZ grande estratto su disco (app desktop): gli XML e le macro si leggono a gruppi, le foto no
 * (pictures: articolo → file della foto, da leggere poi a gruppi mentre gli articoli vanno nella libreria)
 */
export async function importExtracted(files: { path: string; size: number }[], all: string[], read: (paths: string[]) => Promise<ArchiveFile[]>, name: string,
  progress?: (msg: string) => void, opts: EdzOptions = {}): Promise<EdzResult & { pictures: Map<string, string> }> {
  const inBatches = async (list: { path: string; size: number }[], job: (f: ArchiveFile[]) => void) => {
    let batch: string[] = [], size = 0;
    const go = async () => { if (batch.length) job(await read(batch)); batch = []; size = 0; };
    for (const f of list) { batch.push(f.path); size += f.size; if (size > 32_000_000 || batch.length >= 500) await go(); }
    await go();
  };
  const warnings: string[] = [];
  const parts: Part[] = [];
  const xml = files.filter(f => /\.xml$/i.test(f.path));
  progress?.(`${name}: lettura di ${xml.length} file di dati articolo…`);
  await inBatches(xml, f => partsFromXml(f, name, parts, warnings));
  const pictures = new Map<string, string>();
  if (!parts.length) {
    // Senza dati articolo: pagine del Data Portal o solo macro, come per gli archivi piccoli
    const rest = files.filter(f => /\.(html?|em[as])$/i.test(f.path) && f.size < 8_000_000);
    return { ...importFromFiles(await read(rest.map(f => f.path)), name, opts), pictures };
  }
  const byName = new Map(files.map(f => [base(f.path), f]));
  if (opts.pictures !== false) for (const p of parts) {
    const ref = pictureRef(p);
    const img = ref ? byName.get(base(ref)) : undefined;
    if (img && MIME[base(img.path).split('.').pop() ?? '']) pictures.set(p.partNr, img.path);
  }
  // Macro nell'ordine in cui servono, lette a gruppi poco prima (ognuna si usa una volta sola)
  const out = newMacroOut();
  if (opts.symbols === false) return { ...finishImport(parts, warnings, [], name, all, opts, out), pictures };
  const order: { path: string; size: number }[] = [];
  const seen = new Set<string>();
  for (const p of parts) for (const ref of macroRefs(p)) {
    const f = byName.get(base(ref));
    if (f && f.size < 8_000_000 && !seen.has(f.path)) { seen.add(f.path); order.push(f); }
  }
  progress?.(`${name}: ${parts.length} articoli; lettura di ${order.length} macro…`);
  const index = new Map(order.map((f, i) => [f.path, i]));
  const cache = new Map<string, ArchiveFile>();
  let next = 0;
  const it = macroSymbols(parts, warnings, out.symbols, out.redrawn, out.readMacros);
  for (let r = it.next(); !r.done;) {
    const f = byName.get(r.value);
    if (f && f.size < 8_000_000 && !cache.has(f.path)) {
      // Gruppo successivo (fino a ~64 MB) a partire dalla prima macro non ancora letta
      const batch: string[] = [];
      let size = 0;
      while (next < order.length && (size < 64_000_000 || !batch.length)) { if (!cache.has(order[next].path)) { batch.push(order[next].path); size += order[next].size; } next++; }
      if (!batch.includes(f.path)) batch.push(f.path);
      for (const x of await read(batch)) cache.set(x.path, x);
    }
    const data = f ? cache.get(f.path) : undefined;
    if (f) {
      cache.delete(f.path);
      // Macro saltate (l'articolo aveva già il disegno da un'altra): si tolgono dalla memoria; se
      // servissero più avanti si rileggono
      const i = index.get(f.path) ?? 0;
      for (const k of cache.keys()) if ((index.get(k) ?? 0) < i) cache.delete(k);
    }
    r = it.next(data);
  }
  return { ...finishImport(parts, warnings, [], name, all, opts, out), pictures };
}

/**
 * Macro del costruttore: prima quella del simbolo (schema), poi quella generale se non è 3D.
 * Generatore: chiede una per volta le macro che servono (yield nome del file → contenuto), così
 * gli archivi in memoria le danno subito e quelli estratti su disco le leggono a gruppi.
 */
interface MacroOut { symbols: SymbolDef[]; redrawn: Record<string, string[]>; readMacros: Set<string> }
const newMacroOut = (): MacroOut => ({ symbols: [], redrawn: {}, readMacros: new Set() });

function* macroSymbols(parts: Part[], warnings: string[], symbols: SymbolDef[], redrawn: Record<string, string[]>, readMacros: Set<string>): Generator<string, void, ArchiveFile | undefined> {
  const done = new Map<string, SymbolDef | undefined>();
  for (const p of parts) {
    for (const ref of macroRefs(p)) {
      const key = base(ref);
      if (!done.has(key)) {
        const f: ArchiveFile | undefined = yield key;
        let sym: SymbolDef | undefined;
        if (f && f.data.length < 8_000_000) {
          try {
            const id = `ema_${key.replace(/\.em[as]$/i, '').replace(/[^\w-]/g, '_')}`;
            // Varianti utilizzabili: con il disegno e senza simboli della libreria EPLAN mancanti
            // structuredClone: i testi dei simboli sono pezzi dell'XML della macro e lo terrebbero
            // tutto in memoria (con migliaia di macro, gigabyte); copiati diventano indipendenti
            const list = structuredClone(emaToSymbols(decodeXml(f.data), id, p.typeNr || p.partNr, `Macro EPLAN / ${p.manufacturer || 'costruttore'}`)
              .filter(x => !x.librarySymbols && x.pins.length && x.symbol.prims.length > 1));
            const wanted = [...new Set(p.functionTemplates.flatMap(t => t.connections).filter(Boolean))];
            const cover = (x: typeof list[number]) => (wanted.length ? wanted.filter(w => x.pins.includes(w)).length / wanted.length : 1);
            // La variante associata all'articolo è quella che copre più morsetti (poi la più disegnata)
            const best = [...list].sort((a, b) => cover(b) - cover(a) || b.symbol.prims.length - a.symbol.prims.length)[0];
            if (best && cover(best) >= 0.5) {
              for (const x of list) x.symbol.letter = p.attrs.P_ARTICLE_CODELETTER || x.symbol.letter || 'A';
              best.symbol.name = p.typeNr || p.partNr;
              symbols.push(best.symbol, ...list.filter(x => x !== best).map(x => x.symbol));
              for (const x of list) if (x.redrawn.length) redrawn[x.symbol.id] = x.redrawn;
              sym = best.symbol;
              readMacros.add(f.path);
            }
          } catch (e) {
            warnings.push(`${key}: macro non leggibile (${(e as Error).message})`);
          }
        }
        done.set(key, sym);
      }
      const sym = done.get(key);
      if (sym) {
        p.symbolId = sym.id;
        const missing = p.functionTemplates.flatMap(f => f.connections).filter(c => c && !sym.pins.some(q => q.label === c));
        if (missing.length) warnings.push(`${p.partNr}: il disegno del costruttore non comprende i morsetti ${[...new Set(missing)].slice(0, 8).join(', ')}; disegnali con un altro simbolo con la stessa sigla (es. un contatto in scambio con pin="1=95;2=96;3=98")`);
        break;
      }
    }
  }
}

/** Simboli dalle macro, morsetti e avvisi: comune agli archivi in memoria e a quelli estratti */
function finishImport(parts: Part[], warnings: string[], files: ArchiveFile[], name: string, all: string[], opts: EdzOptions, pre?: MacroOut): EdzResult {
  const byName = new Map(files.map(f => [base(f.path), f]));
  // Pagina dell'articolo salvata dall'EPLAN Data Portal (macro non scaricabile): simbolo dall'anteprima
  if (!parts.length) {
    const pages = files.filter(f => /\.html?$/i.test(f.path)).map(f => ({ f, html: decodeXml(f.data) })).filter(x => isDataPortalPage(x.html));
    if (pages.length) {
      const res = pages.map(x => importDataPortalPage(x.html, x.f.path.split(/[\\/]/).pop()!));
      return {
        parts: res.flatMap(r => r.parts), files: files.map(f => f.path), macros: [], symbols: res.flatMap(r => r.symbols),
        unreadMacros: [], redrawn: {}, documents: [], warnings: res.flatMap(r => r.warnings),
      };
    }
  }
  // Solo macro, senza dati articolo: ogni macro diventa un simbolo della libreria
  const symbols = opts.symbols !== false;
  if (!parts.length && files.some(f => /\.em[as]$/i.test(f.path))) {
    if (symbols) return macrosOnly(files);
    warnings.push(`${name}: l'archivio contiene solo macro di schema; per importarle come simboli attiva «simboli dalle macro» nella vista Articoli`);
  } else if (!parts.length) warnings.push(`${name}: nessun dato articolo trovato nell'archivio`);
  const macros = all.filter(f => /\.(ema|ems|emp)$/i.test(f));
  const documents = all.filter(f => /\.(pdf|dxf|dwg|stp|step)$/i.test(f)).map(f => ({ path: f, data: new Uint8Array(0) }));
  const out = pre ?? newMacroOut();
  if (!pre && symbols) {
    const it = macroSymbols(parts, warnings, out.symbols, out.redrawn, out.readMacros);
    for (let r = it.next(); !r.done; r = it.next(byName.get(r.value)));
  }
  // Morsetti senza macro (EPLAN li disegna con i suoi simboli di morsetto): il nostro simbolo di morsetto
  for (const p of parts) {
    if (p.symbolId) continue;
    const t = terminalSymbol(p);
    if (t) p.symbolId = t;
  }
  for (const p of parts) {
    if (!p.symbolId && !p.functionTemplates.length) warnings.push(`${p.partNr}: nessun modello funzione, la scatola nera avrà 2 morsetti generici`);
  }
  const unreadMacros = symbols ? macros.filter(m => !out.readMacros.has(m) && !/_3d\.ema$/i.test(m)) : [];
  return { parts, files: all, macros, symbols: out.symbols, unreadMacros, redrawn: out.redrawn, documents, warnings };
}

/**
 * Macro scelte da sole (.ema finestra, .ems simbolo): il disegno del costruttore va nella libreria
 * come simbolo, con il nome del file. La lettera di sigla si cambia poi nell'editor.
 */
function macrosOnly(files: ArchiveFile[]): EdzResult {
  const symbols: SymbolDef[] = [], redrawn: Record<string, string[]> = {}, warnings: string[] = [], unread: string[] = [];
  const macros = files.filter(f => /\.em[as]$/i.test(f.path) && !/_3d\.ema$/i.test(f.path));
  for (const f of macros) {
    const file = f.path.split(/[\\/]/).pop()!.replace(/\.em[as]$/i, '');
    // Il costruttore è il prefisso del nome nei codici EPLAN ("ETA.REX12D-…" → ETA)
    const maker = /^([A-Za-z]{2,6})\./.exec(file)?.[1];
    try {
      if (f.data.length >= 8_000_000) throw new Error('oltre 8 MB');
      const list = structuredClone(emaToSymbols(decodeXml(f.data), `ema_${file.toLowerCase().replace(/[^\w-]/g, '_')}`, file, `Macro EPLAN / ${maker ?? 'macro'}`)
        .filter(x => !x.librarySymbols && x.pins.length && x.symbol.prims.length > 1));
      if (!list.length) { unread.push(f.path); warnings.push(`${file}: la macro non ha un disegno di schema utilizzabile`); continue; }
      for (const x of list) {
        x.symbol.letter = x.symbol.letter || 'A';
        symbols.push(x.symbol);
        if (x.redrawn.length) redrawn[x.symbol.id] = x.redrawn;
      }
    } catch (e) {
      unread.push(f.path);
      warnings.push(`${file}: macro non leggibile (${(e as Error).message})`);
    }
  }
  return { parts: [], files: files.map(f => f.path), macros: macros.map(f => f.path), symbols, unreadMacros: unread, redrawn, documents: [], warnings };
}
