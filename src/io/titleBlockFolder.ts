// Cartigli personali come file: uno per cartiglio (.ectb, JSON) nella cartella Documenti/OpenWiring/Cartigli,
// accanto a Simboli e Articoli. Si copiano tra installazioni, si mandano a un collega, si importano ed esportano.
import type { TitleBlockTemplate } from '../model/types';
import { safeName } from './symbolFolder';

export const TB_EXT = '.ectb';
const FORMAT = 'openwiring-cartiglio';

/** Contenuto del file di un cartiglio (i modelli inclusi diventano copie personali) */
export function titleBlockFileText(t: TitleBlockTemplate): string {
  const { builtin: _b, ...rest } = t;
  return JSON.stringify({ format: FORMAT, version: 1, ...rest }, null, 1) + '\n';
}

/** Cartiglio letto da un file .ectb; errore se non lo è */
export function titleBlockFromText(text: string, fileName = ''): TitleBlockTemplate {
  const j = JSON.parse(text) as Partial<TitleBlockTemplate> & { format?: string; version?: number };
  if (j.format !== FORMAT || !Array.isArray(j.prims)) throw new Error('non è un cartiglio OpenWiring');
  const { format: _f, version: _v, builtin: _b, ...t } = j;
  const name = t.name || fileName.split('/').pop()!.replace(/\.ectb$/i, '') || 'Cartiglio';
  return { ...t, id: t.id || `tb-file-${safeName(name)}`, name, prims: t.prims! } as TitleBlockTemplate;
}

/** Nome del file del cartiglio; se è già occupato da un altro si aggiunge un numero */
export function titleBlockRelPath(t: TitleBlockTemplate, taken: (rel: string) => boolean): string {
  const base = safeName(t.name, 'cartiglio');
  for (let n = 1; ; n++) {
    const rel = `${base}${n > 1 ? ` (${n})` : ''}${TB_EXT}`;
    if (!taken(rel)) return rel;
  }
}

/** Cartigli letti dalla cartella, con il file di ognuno; due file con lo stesso id: il secondo prende un id suo */
export function loadTitleBlockFiles(files: { rel: string; text: string }[]): { list: TitleBlockTemplate[]; paths: Map<string, string>; errors: string[] } {
  const list: TitleBlockTemplate[] = [], paths = new Map<string, string>(), errors: string[] = [];
  for (const f of [...files].sort((a, b) => a.rel.localeCompare(b.rel))) {
    try {
      const t = titleBlockFromText(f.text, f.rel);
      if (paths.has(t.id)) t.id = `tb-file-${safeName(f.rel)}`;
      paths.set(t.id, f.rel);
      list.push(t);
    } catch (e) {
      errors.push(`${f.rel}: ${(e as Error).message}`);
    }
  }
  return { list, paths, errors };
}
