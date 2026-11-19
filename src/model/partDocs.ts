// Schede tecniche e documenti degli articoli (punto 87 b): documenti scelti dall'utente (file PDF sul
// disco o indirizzi web) e quelli che arrivano con i dati EPLAN (indirizzi negli attributi). Il loro
// elenco è una lista del progetto; i PDF sul disco si possono allegare in fondo al PDF dello schema.
import type { Part, PartDoc, Project } from './types';
import { bomReport, type Table } from './reports';
import { partsIndex } from './devices';
import { isDocLink } from '../io/commercialCsv';

export const DOCS_TITLE = 'Elenco documenti allegati';

export const isWebDoc = (path: string) => /^https?:\/\//i.test(path);
export const isPdfDoc = (path: string) => !isWebDoc(path) && /\.pdf$/i.test(path);

/** Percorso assoluto (Mac, Linux, Windows o cartella di rete); gli altri sono relativi alla cartella Documenti */
export const isAbsPath = (path: string) => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path);
/** Documento sul disco con percorso relativo alla cartella Documenti degli articoli */
export const isRelDoc = (path: string) => !!path && !isWebDoc(path) && !isAbsPath(path);

/**
 * Percorso relativo alla cartella (con le barre "/") se il file sta dentro, altrimenti null.
 * Su Windows le lettere maiuscole e minuscole dei percorsi non contano.
 */
export function relToFolder(folder: string, file: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const win = /^[A-Za-z]:|^\\\\/.test(folder);
  const f = norm(folder), p = norm(file);
  const same = win ? p.toLowerCase().startsWith(`${f.toLowerCase()}/`) : p.startsWith(`${f}/`);
  return same ? p.slice(f.length + 1) : null;
}

/** Nome del file di un percorso (con / o \) */
export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Documenti dei dati EPLAN dell'articolo (indirizzo sulla prima riga dell'attributo) */
export function edzDocs(part: Part): PartDoc[] {
  const links = [...new Set(Object.entries(part.attrs ?? {}).filter(([k, v]) => (isDocLink(k) || /^P_ARTICLE_EXTERNAL_DOCUMENT/i.test(k)) && v)
    .map(([, v]) => v.split(/\r?\n/)[0].trim()).filter(Boolean))];
  return links.map(path => ({ name: isWebDoc(path) ? 'Documento del costruttore' : fileName(path), path }));
}

/** Tutti i documenti dell'articolo: prima quelli scelti, poi quelli dei dati EPLAN non già presenti */
export function partDocuments(part: Part): PartDoc[] {
  const own = part.docs ?? [];
  return [...own, ...edzDocs(part).filter(d => !own.some(o => o.path === d.path))];
}

export interface UsedDoc { partNr: string; descr: string; tags: string; doc: PartDoc }

/** Documenti degli articoli usati nel progetto, nell'ordine della distinta */
export function usedDocuments(project: Project, library: Part[] = []): UsedDoc[] {
  const parts = partsIndex(project, library);
  const out: UsedDoc[] = [];
  for (const r of bomReport(project, library).rows) {
    const part = parts.get(r[2]);
    if (!part) continue;
    for (const doc of partDocuments(part)) out.push({ partNr: part.partNr, descr: part.descr1 ?? r[4] ?? '', tags: r[7] ?? '', doc });
  }
  return out;
}

/** Lista «Elenco documenti allegati»: articolo, descrizione, documento, file o indirizzo, sigle */
export function documentsReport(project: Project, library: Part[] = []): Table {
  const rows = usedDocuments(project, library).map(u => [u.partNr, u.descr, u.doc.name, isWebDoc(u.doc.path) ? u.doc.path : fileName(u.doc.path), u.tags]);
  return { title: DOCS_TITLE, columns: ['Articolo', 'Descrizione', 'Documento', 'File o indirizzo', 'Sigle'], rows };
}
