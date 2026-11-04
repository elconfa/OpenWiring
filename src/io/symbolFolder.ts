// Libreria dei simboli in una cartella: un file .ecsym (JSON) per simbolo, le sottocartelle sono le
// categorie della libreria. Così i simboli si copiano tra installazioni, si eliminano o si
// raggruppano dal Finder/Esplora risorse, e un agente IA con il terminale li trova nel catalogo.
// Usato dall'app desktop (vedi symbolFolderSync.ts) e dalla riga di comando.
import type { SymbolDef } from '../model/types';

export const SYMBOL_EXT = '.ecsym';
/** Categoria dei simboli messi direttamente nella cartella principale */
export const ROOT_CATEGORY = 'Simboli personali';
const ROOT_NAMES = new Set([ROOT_CATEGORY.toLowerCase(), 'personal symbols', 'symboles personnels', 'eigene symbole', 'símbolos personales']);

export interface SymbolFile { rel: string; text: string }

/** Nomi che Windows non accetta per file e cartelle */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Nome di file o cartella che si legge uguale su macOS, Windows e Linux: solo lettere e cifre
 * semplici, spazi e pochi segni. Le lettere accentate perdono l'accento (macOS e Windows le
 * scrivono in modo diverso e su un altro sistema si vedono caratteri strani), gli altri segni
 * diventano "-".
 */
export function safeName(s: string, fallback = 'simbolo'): string {
  let n = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ßæœøł]/gi, c => {
      const t = ({ ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l' } as Record<string, string>)[c.toLowerCase()] ?? c;
      return c === c.toLowerCase() ? t : t.toUpperCase();
    })
    .replace(/[µΩ°±²³]/g, c => ({ µ: 'u', Ω: 'Ohm', '°': 'gradi', '±': '+-', '²': '2', '³': '3' } as Record<string, string>)[c] ?? '')
    .replace(/[^A-Za-z0-9 _.,()+&'=-]+/g, '-')
    .replace(/\s+/g, ' ').replace(/-{2,}/g, '-').replace(/^[ .-]+|[ .-]+$/g, '').slice(0, 80).trim();
  if (!n) n = fallback;
  return RESERVED.test(n) ? `${n}_` : n;
}

/**
 * Sottocartella di una categoria: "Contattori / ACTI9" → "Contattori/ACTI9", e anche
 * "Macro EPLAN / ETA" → "Macro EPLAN/ETA"; quella personale → cartella principale
 */
export function dirOfCategory(category: string): string {
  if (!category.trim() || ROOT_NAMES.has(category.trim().toLowerCase())) return '';
  return category.split(/\s*[/·]\s*/).filter(Boolean).map(c => safeName(c, 'gruppo')).join('/');
}

/** Percorso di un file con nomi di cartelle e file validi ovunque (per sistemare i file vecchi) */
export function safeRel(rel: string): string {
  const parts = rel.split('/');
  const file = parts.pop()!.replace(/\.ecsym$/i, '');
  // Le vecchie cartelle "Macro EPLAN · SE" diventano "Macro EPLAN/SE", come le categorie nuove
  const dirs = parts.flatMap(p => p.split(/\s*·\s*/)).filter(Boolean);
  return [...dirs.map(p => safeName(p, 'gruppo')), safeName(file) + SYMBOL_EXT].join('/');
}

export function categoryOfRel(rel: string): string {
  const parts = rel.split('/').slice(0, -1);
  return parts.length ? parts.join(' / ') : ROOT_CATEGORY;
}

/** Contenuto del file: il simbolo senza la categoria, che viene dalla cartella */
export function symbolFileText(sym: SymbolDef): string {
  const { category: _c, textDef: _t, ...rest } = sym;
  return JSON.stringify({ format: 'elettrocad-simbolo', version: 1, ...rest }, null, 1) + '\n';
}

/** Percorso del file del simbolo; se è già occupato da un altro simbolo si aggiunge un numero */
export function symbolRelPath(sym: SymbolDef, taken: (rel: string) => boolean): string {
  const dir = dirOfCategory(sym.category);
  const base = safeName(sym.name);
  for (let n = 1; ; n++) {
    const rel = `${dir ? `${dir}/` : ''}${base}${n > 1 ? ` (${n})` : ''}${SYMBOL_EXT}`;
    // macOS e Windows non distinguono maiuscole e minuscole: chi controlla confronta in minuscolo
    if (!taken(rel)) return rel;
  }
}

export function symbolFromFile(rel: string, text: string): SymbolDef {
  const j = JSON.parse(text) as Partial<SymbolDef> & { format?: string };
  if (j.format !== 'elettrocad-simbolo' || !Array.isArray(j.prims) || !Array.isArray(j.pins)) throw new Error('non è un simbolo OpenWiring');
  const { format: _f, version: _v, ...sym } = j as SymbolDef & { format: string; version: number };
  const name = sym.name || rel.split('/').pop()!.replace(/\.ecsym$/i, '');
  return { ...sym, id: sym.id || `file:${rel}`, name, letter: sym.letter ?? '', role: sym.role ?? 'single', category: categoryOfRel(rel) };
}

export interface LoadedFolder { symbols: SymbolDef[]; paths: Map<string, string>; errors: string[] }

/**
 * Simboli letti dalla cartella. Un file copiato a mano ha lo stesso id dell'originale: la copia
 * prende un id suo, derivato dal percorso, così i due restano simboli diversi.
 */
export function loadSymbolFiles(files: SymbolFile[]): LoadedFolder {
  const symbols: SymbolDef[] = [], paths = new Map<string, string>(), errors: string[] = [];
  for (const f of [...files].sort((a, b) => a.rel.localeCompare(b.rel))) {
    try {
      const s = symbolFromFile(f.rel, f.text);
      if (paths.has(s.id)) s.id = `file:${f.rel}`;
      paths.set(s.id, f.rel);
      symbols.push(s);
    } catch (e) {
      errors.push(`${f.rel}: ${(e as Error).message}`);
    }
  }
  return { symbols, paths, errors };
}
