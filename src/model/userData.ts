// Dati dell'utente da portare su un'altra installazione (File ▸ Esporta / Importa ▸ Dati utente):
// libreria articoli completa, simboli propri, macro, modelli di progetto, cartigli personalizzati e
// preferiti, in un solo file JSON. A differenza dell'XML degli articoli non si perde niente
// (simbolo associato, immagine, prezzo, proprietà definite dall'utente, dati dei CSV).
// Anche i profili di impostazioni, compreso quello per i progetti nuovi.
import type { Part, SymbolDef, TitleBlockTemplate } from './types';
import type { Macro } from './clipboard';
import type { ProjectTemplate } from './templates';
import type { SettingsProfile } from './settingsProfiles';
import type { SymbolFunction } from './symbolFunctions';
import { tn } from '../i18n/ui';

export const USER_DATA_FORMAT = 'elettrocad-dati-utente';

export interface UserData {
  format: typeof USER_DATA_FORMAT;
  version: 1;
  /** Data e versione del programma che ha scritto il file */
  exported: string;
  app?: string;
  library: Part[];
  symbols: SymbolDef[];
  macros: Macro[];
  templates: ProjectTemplate[];
  titleBlocks: TitleBlockTemplate[];
  favorites: string[];
  /** Profili di impostazioni (Impostazioni ▸ Profili); assenti nei file delle versioni prima della 2.1.4 */
  profiles: SettingsProfile[];
  /** Funzioni dei simboli aggiunte dall'utente */
  functions?: SymbolFunction[];
}

export type UserDataKind = 'library' | 'symbols' | 'macros' | 'templates' | 'titleBlocks' | 'profiles' | 'functions';
export const USER_DATA_KINDS: { key: UserDataKind; name: string }[] = [
  { key: 'library', name: tn('articoli') },
  { key: 'symbols', name: tn('simboli') },
  { key: 'macros', name: tn('macro') },
  { key: 'templates', name: tn('modelli di progetto') },
  { key: 'titleBlocks', name: tn('cartigli') },
  { key: 'profiles', name: tn('profili di impostazioni') },
  { key: 'functions', name: tn('funzioni dei simboli') },
];

export function makeUserData(d: Omit<UserData, 'format' | 'version' | 'exported' | 'profiles'> & { profiles?: SettingsProfile[] }, now = new Date()): UserData {
  return { format: USER_DATA_FORMAT, version: 1, exported: now.toISOString(), profiles: [], ...structuredClone(d) };
}

/** Legge il file; errore in italiano se non è un file di dati utente */
export function parseUserData(text: string): { data?: UserData; error?: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: tn('Il file non è un file di dati utente di OpenWiring (JSON non valido)') }; }
  const o = raw as Partial<UserData>;
  if (!o || o.format !== USER_DATA_FORMAT) return { error: tn('Il file non è un file di dati utente di OpenWiring') };
  if ((o.version ?? 0) > 1) return { error: tn('Il file è stato scritto da una versione più recente di OpenWiring: aggiorna il programma') };
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);
  return {
    data: {
      format: USER_DATA_FORMAT, version: 1, exported: String(o.exported ?? ''), app: o.app,
      library: list<Part>(o.library).filter(p => p && typeof p.partNr === 'string' && p.partNr.trim())
        .map(p => ({ ...p, functionTemplates: p.functionTemplates ?? [], attrs: p.attrs ?? {} })),
      symbols: list<SymbolDef>(o.symbols).filter(s => s && typeof s.id === 'string' && Array.isArray(s.pins)),
      macros: list<Macro>(o.macros).filter(m => m && typeof m.id === 'string' && m.clip),
      templates: list<ProjectTemplate>(o.templates).filter(t => t && typeof t.id === 'string' && t.project),
      titleBlocks: list<TitleBlockTemplate>(o.titleBlocks).filter(t => t && typeof t.id === 'string' && Array.isArray(t.prims)),
      favorites: list<string>(o.favorites).filter(x => typeof x === 'string'),
      functions: list<SymbolFunction>(o.functions).filter(f => f && typeof f.id === 'string' && typeof f.name === 'string'),
      profiles: list<SettingsProfile>(o.profiles).filter(p => p && typeof p.id === 'string' && Array.isArray(p.parts) && p.settings),
    },
  };
}

const keyOf: Record<UserDataKind, (x: never) => string> = {
  library: (p: Part) => p.partNr,
  symbols: (s: SymbolDef) => s.id,
  macros: (m: Macro) => m.id,
  templates: (t: ProjectTemplate) => t.id,
  titleBlocks: (t: TitleBlockTemplate) => t.id,
  profiles: (p: SettingsProfile) => p.id,
  functions: (f: SymbolFunction) => f.id,
};

export interface MergeCount { added: number; replaced: number; kept: number; same: number }
type Lists = Omit<Pick<UserData, UserDataKind | 'favorites'>, 'profiles' | 'functions'> & { profiles?: SettingsProfile[]; functions?: SymbolFunction[] };

/** Elementi del file con la stessa chiave di uno già presente ma contenuto diverso */
export function userDataConflicts(cur: Lists, add: Lists): number {
  let n = 0;
  for (const { key } of USER_DATA_KINDS) {
    const k = keyOf[key] as (x: unknown) => string;
    const have = new Map(((cur[key] ?? []) as unknown[]).map(x => [k(x), JSON.stringify(x)]));
    for (const x of (add[key] ?? []) as unknown[]) {
      const h = have.get(k(x));
      if (h !== undefined && h !== JSON.stringify(x)) n++;
    }
  }
  return n;
}

/**
 * Unisce i dati del file a quelli presenti: gli elementi nuovi si aggiungono; per quelli già presenti
 * e diversi vince il file se overwrite, altrimenti restano i propri. I preferiti si sommano.
 */
export function mergeUserData(cur: Lists, add: Lists, overwrite: boolean): { result: Lists; counts: Record<UserDataKind, MergeCount> } {
  const result = { ...cur } as Lists;
  const counts = {} as Record<UserDataKind, MergeCount>;
  for (const { key } of USER_DATA_KINDS) {
    const k = keyOf[key] as (x: unknown) => string;
    const map = new Map(((cur[key] ?? []) as unknown[]).map(x => [k(x), x]));
    const c: MergeCount = { added: 0, replaced: 0, kept: 0, same: 0 };
    for (const x of (add[key] ?? []) as unknown[]) {
      const old = map.get(k(x));
      if (old === undefined) { map.set(k(x), x); c.added++; }
      else if (JSON.stringify(old) === JSON.stringify(x)) c.same++;
      else if (overwrite) { map.set(k(x), x); c.replaced++; }
      else c.kept++;
    }
    (result as Record<string, unknown>)[key] = [...map.values()];
    counts[key] = c;
  }
  result.favorites = [...new Set([...cur.favorites, ...add.favorites])];
  // Un solo profilo per i progetti nuovi: resta quello di qui; se qui non c'è, vale quello del file
  const def = (cur.profiles ?? []).find(p => p.isDefault)?.id ?? (result.profiles ?? []).find(p => p.isDefault)?.id;
  result.profiles = (result.profiles ?? []).map(p => (!!p.isDefault === (p.id === def) ? p : { ...p, isDefault: p.id === def || undefined }));
  return { result, counts };
}
