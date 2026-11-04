// Una sola libreria dei simboli: la libreria personale. Il progetto tiene una copia dei simboli che
// usa (il file .ecad resta completo su un altro computer), ma la copia non si modifica a parte:
// all'apertura si confronta con la libreria e l'utente sceglie quale versione tenere.
// Qui anche i simboli eliminati (cartella «Eliminare», non più usabili finché non si spostano di
// nuovo nell'albero) e l'unificazione dei doppioni.
import type { Project, SymbolDef } from './types';

/** Categoria (e cartella) dei simboli eliminati dalla libreria personale */
export const DELETED_CATEGORY = 'Eliminare';
const DELETED_RE = new RegExp(`^${DELETED_CATEGORY}(\\s*/\\s*|$)`);

export const isDeletedSymbol = (s?: Pick<SymbolDef, 'category'>) => !!s && DELETED_RE.test(s.category.trim());
/** Categoria del simbolo eliminato: dentro «Eliminare», con il percorso da cui veniva */
export const deletedCategory = (category: string) => (category.trim() ? `${DELETED_CATEGORY} / ${category.trim()}` : DELETED_CATEGORY);
/** Percorso da cui veniva un simbolo eliminato (proposto per rimetterlo nell'albero) */
export const originalCategory = (category: string) => category.trim().replace(DELETED_RE, '');

/** Dati che non cambiano l'aspetto né i collegamenti del simbolo */
const IGNORED = new Set(['id', 'name', 'category', 'source', 'replaces', 'textDef', 'hidden', 'aliases', 'description']);

const canon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, canon(x)]));
  }
  return v;
};

/** Impronta del simbolo: disegno, punti di connessione, testi e dati per lo schema (non nome e cartella) */
export function symbolPrint(s: SymbolDef): string {
  return JSON.stringify(canon(Object.fromEntries(Object.entries(s).filter(([k]) => !IGNORED.has(k)))));
}

/** Gli stessi punti di connessione nello stesso posto */
export function samePins(a: SymbolDef, b: SymbolDef): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) < 0.01;
  return a.pins.length === b.pins.length && a.pins.every((p, i) => p.id === b.pins[i].id && near(p.x, b.pins[i].x) && near(p.y, b.pins[i].y));
}

/** Indice della libreria: per id, per alias (doppioni unificati) e per simbolo di base sostituito */
export function libraryIndex(library: SymbolDef[]) {
  const byId = new Map<string, SymbolDef>(), byAlias = new Map<string, SymbolDef>(), byReplaces = new Map<string, SymbolDef>();
  for (const s of library) {
    byId.set(s.id, s);
    if (isDeletedSymbol(s)) continue;
    for (const a of s.aliases ?? []) byAlias.set(a, s);
    if (s.replaces) byReplaces.set(s.replaces, s);
  }
  /** Versione della libreria di un simbolo: stesso id (se non eliminato), poi l'alias, poi la copia dello stesso simbolo di base */
  return (s: Pick<SymbolDef, 'id' | 'replaces'>): SymbolDef | undefined => {
    const own = byId.get(s.id);
    if (own && !isDeletedSymbol(own)) return own;
    return byAlias.get(s.id) ?? (s.replaces ? byReplaces.get(s.replaces) : undefined) ?? own;
  };
}

export type SymbolDiff =
  /** Diverso dalla libreria */
  | { kind: 'changed'; project: SymbolDef; library: SymbolDef; uses: number; pinsChanged: boolean }
  /** Solo nel progetto (es. progetto ricevuto da altri) */
  | { kind: 'onlyProject'; project: SymbolDef; uses: number }
  /** Uguale a un simbolo della libreria con un altro id (doppione unificato): si collega da solo */
  | { kind: 'relink'; project: SymbolDef; library: SymbolDef; uses: number };

export type SymbolChoice = 'library' | 'project' | 'toLibrary' | 'add' | 'onlyProject';

/** Quante volte il progetto usa il simbolo (elementi dello schema e articoli) */
function usesOf(p: Project): Map<string, number> {
  const m = new Map<string, number>();
  const add = (id?: string) => { if (id) m.set(id, (m.get(id) ?? 0) + 1); };
  for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol') add(e.symbolId);
  for (const x of p.parts) add(x.symbolId);
  return m;
}

/** Simboli generati dal programma (scatole nere degli articoli, distributori) o scritti nel formato testo */
const generated = (s: SymbolDef) => s.id.startsWith('bb:') || s.id.startsWith('dist:') || !!s.textDef || !!s.hidden;

/**
 * Simboli del progetto da confrontare con la libreria personale. Restano fuori quelli non usati,
 * quelli eliminati dalla libreria e quelli che l'utente ha già scelto di tenere così (finché la
 * versione della libreria non cambia di nuovo).
 */
export function compareWithLibrary(p: Project, library: SymbolDef[]): SymbolDiff[] {
  const find = libraryIndex(library);
  const uses = usesOf(p);
  const keep = p.symbolKeep ?? {};
  const out: SymbolDiff[] = [];
  for (const s of p.customSymbols) {
    const n = uses.get(s.id) ?? 0;
    if (!n) continue;
    const lib = find(s);
    if (lib && isDeletedSymbol(lib)) continue;
    if (lib) {
      const print = symbolPrint(lib);
      if (print === symbolPrint(s)) { if (lib.id !== s.id) out.push({ kind: 'relink', project: s, library: lib, uses: n }); continue; }
      if (keep[s.id] === print) continue;
      out.push({ kind: 'changed', project: s, library: lib, uses: n, pinsChanged: !samePins(s, lib) });
    } else if (!generated(s) && keep[s.id] !== '') out.push({ kind: 'onlyProject', project: s, uses: n });
  }
  return out;
}

/** Il progetto usa il simbolo to al posto di from (schema, articoli, copia nel progetto) */
export function remapSymbol(p: Project, fromId: string, to: SymbolDef) {
  for (const pg of p.pages) for (const e of pg.elements) if (e.kind === 'symbol' && e.symbolId === fromId) e.symbolId = to.id;
  for (const x of p.parts) if (x.symbolId === fromId) x.symbolId = to.id;
  const copy = structuredClone(to);
  const i = p.customSymbols.findIndex(x => x.id === fromId);
  p.customSymbols = p.customSymbols.filter(x => x.id !== fromId && x.id !== to.id);
  p.customSymbols.splice(i < 0 ? p.customSymbols.length : Math.min(i, p.customSymbols.length), 0, copy);
  if (p.symbolKeep) { delete p.symbolKeep[fromId]; delete p.symbolKeep[to.id]; }
}

/**
 * Applica le scelte dell'utente al progetto; restituisce i simboli da scrivere nella libreria
 * personale («porta in libreria» e «aggiungi alla libreria»). I «relink» si applicano sempre.
 */
export function applySymbolChoices(p: Project, diffs: SymbolDiff[], choices: Record<string, SymbolChoice>): SymbolDef[] {
  const toLibrary: SymbolDef[] = [];
  const keep = { ...(p.symbolKeep ?? {}) };
  p.symbolKeep = keep;
  for (const d of diffs) {
    const id = d.project.id;
    if (d.kind === 'relink') { remapSymbol(p, id, d.library); continue; }
    const c = choices[id];
    if (d.kind === 'changed') {
      if (c === 'library') remapSymbol(p, id, d.library);
      else if (c === 'project') keep[id] = symbolPrint(d.library);
      else if (c === 'toLibrary') {
        // La versione del progetto prende il posto di quella della libreria (stesso id, nome e cartella della libreria)
        const { textDef: _t, ...rest } = structuredClone(d.project);
        const next: SymbolDef = { ...rest, id: d.library.id, name: d.library.name, category: d.library.category, ...(d.library.aliases ? { aliases: d.library.aliases } : {}), ...(d.library.replaces ? { replaces: d.library.replaces } : {}) };
        toLibrary.push(next);
        remapSymbol(p, id, next);
      }
    } else if (d.kind === 'onlyProject') {
      if (c === 'add') toLibrary.push(structuredClone(d.project));
      else if (c === 'onlyProject') keep[id] = '';
    }
  }
  if (!Object.keys(p.symbolKeep).length) delete p.symbolKeep;
  return toLibrary;
}

/** Scelta proposta: la libreria per i simboli diversi, l'aggiunta alla libreria per quelli solo nel progetto */
export const defaultChoice = (d: SymbolDiff): SymbolChoice => (d.kind === 'onlyProject' ? 'add' : 'library');

/** Gruppo di possibili doppioni nella libreria personale */
export interface DupGroup {
  symbols: SymbolDef[];
  /** Tutti con lo stesso disegno (doppioni sicuri); altrimenti solo con lo stesso nome */
  identical: boolean;
}

/** Nome senza il numero aggiunto alle copie: «Bobina (2)» → «bobina» */
const baseName = (s: string) => s.trim().toLowerCase().replace(/\s*\(\d+\)$/, '').replace(/\s+/g, ' ');

/**
 * Simboli della libreria che sembrano lo stesso: stesso disegno, oppure stesso nome (a meno del
 * numero delle copie) e stessa lettera. I simboli eliminati e le copie dei simboli di base no.
 */
export function duplicateGroups(library: SymbolDef[]): DupGroup[] {
  const live = library.filter(s => !isDeletedSymbol(s) && !s.replaces && !s.hidden);
  const parent = live.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const join = (key: Map<string, number>, k: string, i: number) => {
    const j = key.get(k);
    if (j === undefined) key.set(k, i); else parent[root(i)] = root(j);
  };
  const prints = live.map(symbolPrint);
  const byPrint = new Map<string, number>(), byName = new Map<string, number>();
  live.forEach((s, i) => { join(byPrint, prints[i], i); join(byName, `${baseName(s.name)}|${s.letter}`, i); });
  const groups = new Map<number, number[]>();
  live.forEach((_, i) => { const r = root(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
  return [...groups.values()].filter(g => g.length > 1).map(g => ({
    symbols: g.map(i => live[i]),
    identical: g.every(i => prints[i] === prints[g[0]]),
  })).sort((a, b) => Number(b.identical) - Number(a.identical) || a.symbols[0].name.localeCompare(b.symbols[0].name));
}

/**
 * Unifica i doppioni: il simbolo tenuto ricorda gli id degli altri (alias, così anche i progetti non
 * aperti passano a lui quando si aprono), gli altri vanno nella cartella «Eliminare».
 */
export function mergeSymbols(keep: SymbolDef, others: SymbolDef[]): { kept: SymbolDef; removed: SymbolDef[] } {
  const aliases = [...new Set([...(keep.aliases ?? []), ...others.flatMap(o => [o.id, ...(o.aliases ?? [])])])].filter(a => a !== keep.id);
  return {
    kept: { ...keep, aliases },
    removed: others.map(o => ({ ...o, category: deletedCategory(o.category), aliases: undefined })),
  };
}
