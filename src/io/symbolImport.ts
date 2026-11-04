// Import di una cartella di simboli con tutte le sottocartelle: componenti QElectroTech (.elmt e
// progetti .qet) e simboli OpenWiring (.ecsym). Le sottocartelle diventano i rami dell'albero della
// libreria: "Simboli/Contatti/NA/x.elmt" → categoria "Simboli / Contatti / NA".
// Nelle collezioni QElectroTech la cartella ha un file qet_directory con il nome tradotto.
import type { SymbolDef } from '../model/types';
import { parseQetXml } from './qet';
import { symbolFromFile } from './symbolFolder';

export interface FolderFile { rel: string; text: string }

/** File letti dall'import della cartella */
export const isSymbolFile = (rel: string) => /\.(elmt|qet|ecsym)$/i.test(rel) || /(^|\/)qet_directory$/i.test(rel);

/** Nome della cartella nel file qet_directory: nella lingua scelta, poi italiano, inglese, il primo */
export function qetDirectoryName(xml: string, lang: string): string | undefined {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return undefined;
  const names = Array.from(doc.getElementsByTagName('name')).map(n => ({ lang: n.getAttribute('lang') ?? '', text: (n.textContent ?? '').trim() })).filter(n => n.text);
  for (const l of [lang, 'it', 'en']) {
    const hit = names.find(n => n.lang === l);
    if (hit) return hit.text;
  }
  return names[0]?.text;
}

/** Parte del percorso della categoria: senza "/" (separa i rami dell'albero) */
const part = (s: string) => s.replace(/\s*\/\s*/g, '-').trim();

export interface FolderResult { symbols: SymbolDef[]; errors: string[]; folders: number }

/**
 * Simboli di una cartella e delle sottocartelle. root è il nome della cartella scelta (primo ramo
 * dell'albero), rel i percorsi dei file dentro la cartella con le barre "/".
 */
export function symbolsFromFolder(root: string, files: FolderFile[], lang = 'it'): FolderResult {
  const r = folderReader(root, files, lang);
  for (const f of r.files) r.read(f);
  return r.result();
}

/** Come symbolsFromFolder, a blocchi: l'interfaccia resta viva con le collezioni grandi (migliaia di file) */
export async function symbolsFromFolderAsync(root: string, files: FolderFile[], lang = 'it', progress?: (done: number, total: number) => void): Promise<FolderResult> {
  const r = folderReader(root, files, lang);
  for (let i = 0; i < r.files.length; i++) {
    r.read(r.files[i]);
    if (i % 300 === 299) { progress?.(i + 1, r.files.length); await new Promise(res => setTimeout(res, 0)); }
  }
  return r.result();
}

function folderReader(root: string, files: FolderFile[], lang: string) {
  const dirName = new Map<string, string>();
  for (const f of files) {
    if (!/(^|\/)qet_directory$/i.test(f.rel)) continue;
    const name = qetDirectoryName(f.text, lang);
    if (name) dirName.set(f.rel.split('/').slice(0, -1).join('/'), name);
  }
  const categoryOf = (rel: string) => {
    const dirs = rel.split('/').slice(0, -1);
    return [root, ...dirs.map((d, i) => dirName.get(dirs.slice(0, i + 1).join('/')) ?? d)].map(part).filter(Boolean).join(' / ');
  };
  const symbols: SymbolDef[] = [], errors: string[] = [];
  const folders = new Set<string>();
  const read = (f: FolderFile) => {
    const cat = categoryOf(f.rel);
    try {
      let found: SymbolDef[] = [];
      if (/\.elmt$/i.test(f.rel)) found = parseQetXml(f.text, f.rel).map(s => ({ ...s, category: cat }));
      else if (/\.qet$/i.test(f.rel)) {
        // Progetto QElectroTech: un ramo col nome del file, e sotto le sue cartelle di elementi
        const proj = `${cat} / ${part(f.rel.split('/').pop()!.replace(/\.qet$/i, ''))}`;
        found = parseQetXml(f.text, f.rel).map(s => {
          const inner = s.category.replace(/^QET \/ ?/, '');
          return { ...s, category: inner && inner !== 'importati' ? `${proj} / ${part(inner)}` : proj };
        });
      } else if (/\.ecsym$/i.test(f.rel)) {
        const s = symbolFromFile(f.rel, f.text);
        found = [{ ...s, id: s.id.startsWith('file:') ? `file:${root}/${f.rel}` : s.id, category: cat }];
      } else return;
      if (!found.length) errors.push(`${f.rel}: nessun simbolo leggibile`);
      for (const s of found) { symbols.push(s); folders.add(s.category); }
    } catch (e) {
      errors.push(`${f.rel}: ${(e as Error).message}`);
    }
  };
  return {
    files: [...files].sort((a, b) => a.rel.localeCompare(b.rel)),
    read,
    result: (): FolderResult => ({ symbols, errors, folders: folders.size }),
  };
}
